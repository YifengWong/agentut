import { describe, it, expect } from 'vitest';
import { buildPrompt, parseResponse, MalformedResponseError } from '../../../src/suggest/generator/prompt.js';
import type { DistilledSession } from '../../../src/distiller/types.js';

function makeDistilledSession(overrides: Partial<DistilledSession> = {}): DistilledSession {
  return {
    workingDirectory: '/test/project',
    title: 'Test Session',
    steps: [
      {
        index: 1,
        userInput: 'Create hello.txt',
        reasoning: 'User wants to create a file.',
        toolCalls: [
          {
            toolName: 'write',
            status: 'completed',
            input: { filePath: '/test/hello.txt', content: 'Hello World' },
            output: 'Wrote file successfully.'
          }
        ],
        assistantResponse: '文件创建成功',
        fileChanges: [{ path: 'hello.txt', status: 'added' }]
      }
    ],
    ...overrides
  };
}

describe('buildPrompt', () => {
  it('should include working directory in prompt', () => {
    const session = makeDistilledSession({ workingDirectory: '/my/project' });
    const prompt = buildPrompt(session);
    expect(prompt).toContain('/my/project');
  });

  it('should include all step user inputs', () => {
    const session = makeDistilledSession({
      steps: [
        { index: 1, userInput: 'First input', toolCalls: [], fileChanges: [] },
        { index: 2, userInput: 'Second input', toolCalls: [], fileChanges: [] }
      ]
    });
    const prompt = buildPrompt(session);
    expect(prompt).toContain('First input');
    expect(prompt).toContain('Second input');
  });

  it('should include tool call details', () => {
    const session = makeDistilledSession();
    const prompt = buildPrompt(session);
    expect(prompt).toContain('write');
    expect(prompt).toContain('completed');
  });

  it('should include reasoning if present', () => {
    const session = makeDistilledSession();
    const prompt = buildPrompt(session);
    expect(prompt).toContain('User wants to create a file');
  });

  it('should include assistant response if present', () => {
    const session = makeDistilledSession();
    const prompt = buildPrompt(session);
    expect(prompt).toContain('文件创建成功');
  });

  it('should include available assertion types', () => {
    const session = makeDistilledSession();
    const prompt = buildPrompt(session);
    expect(prompt).toContain('should_call_tool');
    expect(prompt).toContain('should_produce_file');
    expect(prompt).toContain('file_content_contains');
    expect(prompt).toContain('response_contains');
    expect(prompt).toContain('exec_command');
    expect(prompt).toContain('judged_by');
  });

  it('should include output format instructions', () => {
    const session = makeDistilledSession();
    const prompt = buildPrompt(session);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('"name"');
    expect(prompt).toContain('"scenarios"');
    expect(prompt).toContain('"steps"');
    expect(prompt).toContain('"expected"');
  });

  it('should handle step with no tool calls', () => {
    const session = makeDistilledSession({
      steps: [{ index: 1, userInput: 'Just chatting', toolCalls: [], fileChanges: [] }]
    });
    const prompt = buildPrompt(session);
    expect(prompt).toContain('Just chatting');
  });

  it('should handle step with error tool call', () => {
    const session = makeDistilledSession({
      steps: [{
        index: 1,
        userInput: 'Do something',
        toolCalls: [{ toolName: 'write', status: 'error', input: {}, error: 'Permission denied' }],
        fileChanges: []
      }]
    });
    const prompt = buildPrompt(session);
    expect(prompt).toContain('error');
    expect(prompt).toContain('Permission denied');
  });

  it('should handle empty steps', () => {
    const session = makeDistilledSession({ steps: [] });
    const prompt = buildPrompt(session);
    expect(prompt).toContain('Test Session');
  });

  it('should handle missing optional fields gracefully', () => {
    const session = makeDistilledSession({
      steps: [{
        index: 1,
        userInput: 'Simple input',
        toolCalls: [],
        fileChanges: []
      }]
    });
    const prompt = buildPrompt(session);
    expect(prompt).toContain('Simple input');
    // Should NOT crash on missing reasoning/response
  });
});

describe('parseResponse', () => {
  it('should parse valid JSON response', () => {
    const response = JSON.stringify({
      name: 'test-suite',
      description: 'A test suite',
      scenarios: [{
        name: 'scenario-1',
        steps: [{
          input: 'Create file',
          expected: [
            { should_call_tool: 'write' },
            { should_produce_file: 'hello.txt' }
          ]
        }]
      }]
    });

    const result = parseResponse(response);
    expect(result.name).toBe('test-suite');
    expect(result.description).toBe('A test suite');
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].steps).toHaveLength(1);
    expect(result.scenarios[0].steps[0].input).toBe('Create file');
    expect(result.scenarios[0].steps[0].expected).toHaveLength(2);
  });

  it('should handle response with markdown code block wrapping', () => {
    const inner = JSON.stringify({
      name: 'test-suite',
      description: '',
      scenarios: [{ name: 's1', steps: [] }]
    });
    const response = '```json\n' + inner + '\n```';
    const result = parseResponse(response);
    expect(result.name).toBe('test-suite');
  });

  it('should handle response with leading/trailing whitespace', () => {
    const response = '\n\n  ' + JSON.stringify({
      name: 'test-suite',
      description: '',
      scenarios: [{ name: 's1', steps: [] }]
    }) + '\n  ';

    const result = parseResponse(response);
    expect(result.name).toBe('test-suite');
  });

  it('should throw MalformedResponseError for invalid JSON', () => {
    expect(() => parseResponse('not valid json'))
      .toThrow(MalformedResponseError);
    expect(() => parseResponse('not valid json'))
      .toThrow('Failed to parse LLM response as JSON');
  });

  it('should throw MalformedResponseError for JSON without name field', () => {
    const response = JSON.stringify({ scenarios: [] });
    expect(() => parseResponse(response))
      .toThrow(MalformedResponseError);
    expect(() => parseResponse(response))
      .toThrow('Missing required field: name');
  });

  it('should throw MalformedResponseError for JSON without scenarios field', () => {
    const response = JSON.stringify({ name: 'test' });
    expect(() => parseResponse(response))
      .toThrow(MalformedResponseError);
    expect(() => parseResponse(response))
      .toThrow('Missing required field: scenarios');
  });

  it('should throw MalformedResponseError when scenarios is not an array', () => {
    const response = JSON.stringify({ name: 'test', scenarios: 'not-array' });
    expect(() => parseResponse(response))
      .toThrow(MalformedResponseError);
    expect(() => parseResponse(response))
      .toThrow('scenarios must be an array');
  });

  it('should throw MalformedResponseError for scenario without name', () => {
    const response = JSON.stringify({
      name: 'test',
      scenarios: [{ steps: [] }]
    });
    expect(() => parseResponse(response))
      .toThrow('Scenario at index 0 is missing required field: name');
  });

  it('should throw MalformedResponseError for scenario without steps', () => {
    const response = JSON.stringify({
      name: 'test',
      scenarios: [{ name: 's1' }]
    });
    expect(() => parseResponse(response))
      .toThrow('Scenario "s1" is missing required field: steps');
  });

  it('should throw MalformedResponseError for step without input', () => {
    const response = JSON.stringify({
      name: 'test',
      scenarios: [{ name: 's1', steps: [{ expected: [] }] }]
    });
    expect(() => parseResponse(response))
      .toThrow('Step at index 0 in scenario "s1" is missing required field: input');
  });

  it('should throw MalformedResponseError for step without expected', () => {
    const response = JSON.stringify({
      name: 'test',
      scenarios: [{ name: 's1', steps: [{ input: 'hi' }] }]
    });
    expect(() => parseResponse(response))
      .toThrow('missing required field: expected');
  });

  it('should handle empty string gracefully', () => {
    expect(() => parseResponse('')).toThrow(MalformedResponseError);
  });

  it('should handle JSON with null values', () => {
    const response = JSON.stringify({
      name: null,
      scenarios: []
    });
    expect(() => parseResponse(response)).toThrow(MalformedResponseError);
  });

  it('should handle valid response without description', () => {
    const response = JSON.stringify({
      name: 'minimal-test',
      scenarios: [{ name: 's1', steps: [{ input: 'hi', expected: [] }] }]
    });
    const result = parseResponse(response);
    expect(result.name).toBe('minimal-test');
    expect(result.description).toBeUndefined();
  });
});
