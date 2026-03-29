import { describe, it, expect } from 'vitest';
import { analyzeSession, generateYamlFromAnalysis } from '../../src/parser/session.js';
import type { ExportedSession } from '../../src/types/index.js';

function createMockSession(overrides: Partial<ExportedSession> = {}): ExportedSession {
  return {
    info: {
      id: 'ses_test123',
      slug: 'test-session',
      projectID: 'global',
      directory: '/test/project',
      title: 'Test Session',
      version: '1.0.0',
      summary: {
        additions: 0,
        deletions: 0,
        files: 0
      },
      time: {
        created: Date.now(),
        updated: Date.now()
      }
    },
    messages: [],
    ...overrides
  };
}

describe('analyzeSession', () => {
  it('should extract user inputs from session', () => {
    const session = createMockSession({
      messages: [
        {
          info: {
            role: 'user',
            time: { created: Date.now() },
            id: 'msg_1',
            sessionID: 'ses_test123'
          },
          parts: [
            { type: 'text', text: 'Create a file', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        },
        {
          info: {
            role: 'user',
            time: { created: Date.now() },
            id: 'msg_2',
            sessionID: 'ses_test123'
          },
          parts: [
            { type: 'text', text: 'Modify the file', id: 'p2', sessionID: 'ses_test123', messageID: 'msg_2' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.inputs).toHaveLength(2);
    expect(analysis.inputs[0]).toBe('Create a file');
    expect(analysis.inputs[1]).toBe('Modify the file');
  });

  it('should extract tool calls from assistant messages', () => {
    const session = createMockSession({
      messages: [
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_1', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Create a file', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        },
        {
          info: { role: 'assistant', time: { created: Date.now() }, id: 'msg_2', sessionID: 'ses_test123' },
          parts: [
            { type: 'tool_call', tool_name: 'Write', id: 'p2', sessionID: 'ses_test123', messageID: 'msg_2' },
            { type: 'tool_call', tool_name: 'Read', id: 'p3', sessionID: 'ses_test123', messageID: 'msg_2' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.toolCallsByInput.get(0)).toEqual(['Write', 'Read']);
  });

  it('should extract file changes from summary', () => {
    const session = createMockSession({
      info: {
        ...createMockSession().info,
        summary: {
          additions: 10,
          deletions: 5,
          files: 2,
          diffs: [
            { path: 'src/index.ts', additions: 10, deletions: 5 },
            { path: 'src/utils.ts', additions: 0, deletions: 0 }
          ]
        }
      }
    });

    const analysis = analyzeSession(session);
    expect(analysis.fileChanges).toHaveLength(2);
    expect(analysis.fileChanges).toContain('src/index.ts');
    expect(analysis.fileChanges).toContain('src/utils.ts');
  });

  it('should return empty arrays for empty session', () => {
    const session = createMockSession();
    const analysis = analyzeSession(session);

    expect(analysis.inputs).toHaveLength(0);
    expect(analysis.toolCallsByInput.size).toBe(0);
    expect(analysis.fileChanges).toHaveLength(0);
  });

  it('should handle session with only user messages', () => {
    const session = createMockSession({
      messages: [
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_1', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Hello', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.inputs).toEqual(['Hello']);
    expect(analysis.toolCallsByInput.get(0)).toEqual([]);
  });

  it('should extract working directory', () => {
    const session = createMockSession({
      info: {
        ...createMockSession().info,
        directory: '/home/user/project'
      }
    });

    const analysis = analyzeSession(session);
    expect(analysis.workingDirectory).toBe('/home/user/project');
  });

  it('should handle complex nested message structure', () => {
    const session = createMockSession({
      messages: [
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_1', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Input 1', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        },
        {
          info: { role: 'assistant', time: { created: Date.now() }, id: 'msg_2', sessionID: 'ses_test123' },
          parts: [
            { type: 'step-start', id: 'p2', sessionID: 'ses_test123', messageID: 'msg_2' },
            { type: 'tool_call', tool_name: 'Write', id: 'p3', sessionID: 'ses_test123', messageID: 'msg_2' },
            { type: 'tool_result', tool_output: 'done', id: 'p4', sessionID: 'ses_test123', messageID: 'msg_2' }
          ]
        },
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_3', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Input 2', id: 'p5', sessionID: 'ses_test123', messageID: 'msg_3' }
          ]
        },
        {
          info: { role: 'assistant', time: { created: Date.now() }, id: 'msg_4', sessionID: 'ses_test123' },
          parts: [
            { type: 'tool_call', tool_name: 'Edit', id: 'p6', sessionID: 'ses_test123', messageID: 'msg_4' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.inputs).toEqual(['Input 1', 'Input 2']);
    expect(analysis.toolCallsByInput.get(0)).toEqual(['Write']);
    expect(analysis.toolCallsByInput.get(1)).toEqual(['Edit']);
  });
});

describe('generateYamlFromAnalysis', () => {
  it('should generate valid YAML test suite', () => {
    const analysis = {
      inputs: ['Create hello.txt'],
      toolCallsByInput: new Map([[0, ['Write']]]),
      fileChanges: ['hello.txt'],
      workingDirectory: '/test/project'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.name).toBe('suggested-test');
    expect(yaml.scenarios).toHaveLength(1);
    expect(yaml.scenarios[0].steps).toHaveLength(1);
    expect(yaml.scenarios[0].steps[0].input).toBe('Create hello.txt');
  });

  it('should add tool call assertions to each step', () => {
    const analysis = {
      inputs: ['Create file', 'Modify file'],
      toolCallsByInput: new Map([[0, ['Write']], [1, ['Edit']]]),
      fileChanges: ['test.txt'],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.scenarios[0].steps[0].expected).toContainEqual({ should_call_tool: 'Write' });
    expect(yaml.scenarios[0].steps[1].expected).toContainEqual({ should_call_tool: 'Edit' });
  });

  it('should add file changes to last step', () => {
    const analysis = {
      inputs: ['Create file', 'Modify file'],
      toolCallsByInput: new Map([[0, ['Write']], [1, ['Edit']]]),
      fileChanges: ['test.txt', 'config.json'],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    const lastStep = yaml.scenarios[0].steps[1];
    expect(lastStep.expected).toContainEqual({ should_produce_file: 'test.txt' });
    expect(lastStep.expected).toContainEqual({ should_produce_file: 'config.json' });
  });

  it('should handle empty inputs', () => {
    const analysis = {
      inputs: [],
      toolCallsByInput: new Map(),
      fileChanges: [],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.scenarios[0].steps).toHaveLength(0);
  });

  it('should handle inputs without tool calls', () => {
    const analysis = {
      inputs: ['What is this?'],
      toolCallsByInput: new Map([[0, []]]),
      fileChanges: [],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.scenarios[0].steps[0].expected).toHaveLength(0);
  });
});