import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAssertions } from '../../../src/suggest/generator/llm-generator.js';
import type { DistilledSession } from '../../../src/distiller/types.js';

function makeSession(steps: DistilledSession['steps'] = []): DistilledSession {
  return {
    workingDirectory: '/test/project',
    title: 'Test Session',
    steps
  };
}

describe('generateAssertions', () => {
  let mockRunner: { run: ReturnType<typeof vi.fn>; runnerType: string };

  beforeEach(() => {
    mockRunner = {
      run: vi.fn(),
      runnerType: 'opencode'
    };
  });

  it('should call runner.run with constructed prompt', async () => {
    const responseJson = JSON.stringify({
      name: 'test-suite', description: '',
      scenarios: [{ name: 's1', steps: [{ input: 'h', expected: [] }] }]
    });
    mockRunner.run.mockReturnValue({
      outputs: [{ type: 'text', part: { text: responseJson } }],
      sessionId: 'ses_gen'
    });

    const session = makeSession([
      { index: 1, userInput: 'Create file', toolCalls: [], fileChanges: [] }
    ]);

    await generateAssertions(session, mockRunner as any, {});
    expect(mockRunner.run).toHaveBeenCalledTimes(1);
    const callArgs = mockRunner.run.mock.calls[0][0];
    expect(callArgs.input).toContain('Create file');
    expect(callArgs.input).toContain('should_call_tool');
    expect(callArgs.timeout).toBeGreaterThanOrEqual(120000);
  });

  it('should extract JSON response from runner output', async () => {
    const responseJson = JSON.stringify({
      name: 'test-suite', description: 'desc',
      scenarios: [{
        name: 's1',
        steps: [{ input: 'Create file', expected: [{ should_call_tool: 'write' }] }]
      }]
    });

    mockRunner.run.mockReturnValue({
      outputs: [
        { type: 'text', part: { text: responseJson } }
      ],
      sessionId: 'ses_gen'
    });

    const result = await generateAssertions(session, mockRunner as any, {});
    expect(result.name).toBe('test-suite');
    expect(result.scenarios).toHaveLength(1);
  });

  it('should handle runner output with mixed part types interleaved', async () => {
    const responseJson = JSON.stringify({
      name: 'test', description: '',
      scenarios: [{ name: 's1', steps: [{ input: 'hi', expected: [] }] }]
    });

    mockRunner.run.mockReturnValue({
      outputs: [
        { type: 'step_start' },
        { type: 'text', part: { text: '' } },
        { type: 'text', part: { text: responseJson } },
        { type: 'step_finish' }
      ],
      sessionId: 'ses_gen'
    });

    const result = await generateAssertions(session, mockRunner as any, {});
    expect(result.name).toBe('test');
  });

  it('should reject with MalformedResponseError on invalid JSON from LLM', async () => {
    mockRunner.run.mockReturnValue({
      outputs: [
        { type: 'text', part: { text: 'This is not valid JSON, just random text from the model' } }
      ],
      sessionId: 'ses_gen'
    });

    const session = makeSession([
      { index: 1, userInput: 'Hi', toolCalls: [], fileChanges: [] }
    ]);

    await expect(generateAssertions(session, mockRunner as any, {}))
      .rejects.toThrow('Failed to parse LLM response as JSON');
  });

  it('should reject when runner produces no text output', async () => {
    mockRunner.run.mockReturnValue({
      outputs: [
        { type: 'step_start' },
        { type: 'step_finish' }
      ],
      sessionId: 'ses_gen'
    });

    const session = makeSession([
      { index: 1, userInput: 'Hi', toolCalls: [], fileChanges: [] }
    ]);

    await expect(generateAssertions(session, mockRunner as any, {}))
      .rejects.toThrow('No text output from LLM');
  });

  it('should reject on runner execution error', async () => {
    mockRunner.run.mockImplementation(() => {
      throw new Error('Runner execution failed');
    });

    const session = makeSession([
      { index: 1, userInput: 'Hi', toolCalls: [], fileChanges: [] }
    ]);

    await expect(generateAssertions(session, mockRunner as any, {}))
      .rejects.toThrow('Runner execution failed');
  });

  it('should apply model/agent overrides to runner options', async () => {
    const responseJson = JSON.stringify({
      name: 't', description: '',
      scenarios: [{ name: 's', steps: [{ input: 'h', expected: [] }] }]
    });
    mockRunner.run.mockReturnValue({
      outputs: [{ type: 'text', part: { text: responseJson } }],
      sessionId: 'ses_gen'
    });

    const session = makeSession([
      { index: 1, userInput: 'Hi', toolCalls: [], fileChanges: [] }
    ]);

    await generateAssertions(session, mockRunner as any, { model: 'custom/model', agent: 'plan' });
    const callArgs = mockRunner.run.mock.calls[0][0];
    expect(callArgs.model).toBe('custom/model');
    expect(callArgs.agent).toBe('plan');
  });

  it('should not set model/agent when no overrides provided', async () => {
    const responseJson = JSON.stringify({
      name: 't', description: '',
      scenarios: [{ name: 's', steps: [{ input: 'h', expected: [] }] }]
    });
    mockRunner.run.mockReturnValue({
      outputs: [{ type: 'text', part: { text: responseJson } }],
      sessionId: 'ses_gen'
    });

    const session = makeSession([
      { index: 1, userInput: 'Hi', toolCalls: [], fileChanges: [] }
    ]);

    await generateAssertions(session, mockRunner as any, {});
    const callArgs = mockRunner.run.mock.calls[0][0];
    expect(callArgs.model).toBeUndefined();
    expect(callArgs.agent).toBe('plan');  // default agent for safe text output
  });
});

const session = makeSession([
  { index: 1, userInput: 'Hi', toolCalls: [], fileChanges: [] }
]);
