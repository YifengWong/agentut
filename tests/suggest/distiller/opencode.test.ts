import { describe, it, expect } from 'vitest';
import { OpenCodeDistiller } from '../../../src/suggest/distiller/opencode.js';
import type { ExportedSession } from '../../../src/types/index.js';

function makeSession(overrides: Partial<ExportedSession> = {}): ExportedSession {
  return {
    info: {
      id: 'ses_test123', slug: 'test-session', projectID: 'global',
      directory: '/test/project', title: 'Test Session', version: '1.0.0',
      summary: { additions: 0, deletions: 0, files: 0 },
      time: { created: Date.now(), updated: Date.now() }
    },
    messages: [],
    ...overrides
  } as unknown as ExportedSession;
}

function makeUserMsg(text: string, diffs?: Array<{ file: string; before: string; after: string; additions: number; deletions: number; status: string }>) {
  return {
    info: {
      role: 'user' as const, time: { created: Date.now() },
      id: 'msg_user', sessionID: 'ses_test123',
      summary: diffs ? { diffs, additions: 0, deletions: 0, files: 0 } : undefined
    },
    parts: [{ type: 'text' as const, text, id: 'prt_text', sessionID: 'ses_test123', messageID: 'msg_user' }]
  };
}

function makeAssistantMsg(parts: unknown[]) {
  return {
    info: { role: 'assistant' as const, time: { created: Date.now(), completed: Date.now() }, id: 'msg_asst', sessionID: 'ses_test123' },
    parts
  };
}

function makeToolPart(tool: string, status: 'completed' | 'error', input: Record<string, unknown>, output?: string, error?: string) {
  return {
    type: 'tool', tool, callID: 'call_123',
    state: { status, input, output: output || '', error },
    id: 'prt_tool', sessionID: 'ses_test123', messageID: 'msg_asst'
  };
}

describe('OpenCodeDistiller', () => {
  const distiller = new OpenCodeDistiller();

  it('should have runnerType "opencode"', () => {
    expect(distiller.runnerType).toBe('opencode');
  });

  it('should extract working directory and title', () => {
    const session = makeSession();
    const result = distiller.distill(session);
    expect(result.workingDirectory).toBe('/test/project');
    expect(result.title).toBe('Test Session');
  });

  it('should extract user inputs and strip outer quotes', () => {
    const session = makeSession({
      messages: [makeUserMsg('"Create a file with content"')]
    });
    const result = distiller.distill(session);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].userInput).toBe('Create a file with content');
  });

  it('should extract tool calls from assistant messages with type="tool"', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Create file'),
        makeAssistantMsg([
          makeToolPart('write', 'completed', { filePath: '/test/hello.txt', content: 'Hello' }, 'Wrote file successfully.')
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].toolCalls).toHaveLength(1);
    expect(result.steps[0].toolCalls[0].toolName).toBe('write');
    expect(result.steps[0].toolCalls[0].status).toBe('completed');
    expect(result.steps[0].toolCalls[0].input).toEqual({ filePath: '/test/hello.txt', content: 'Hello' });
    expect(result.steps[0].toolCalls[0].output).toBe('Wrote file successfully.');
  });

  it('should replace skill output with "[Loaded skill: xxx]"', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Use skill'),
        makeAssistantMsg([
          makeToolPart('skill', 'completed', { name: 'create-text-file' }, '<skill_content>...very long skill content...</skill_content>')
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].toolCalls[0].output).toBe('[Loaded skill: create-text-file]');
  });

  it('should truncate tool output to 500 characters', () => {
    const longOutput = 'A'.repeat(1000);
    const session = makeSession({
      messages: [
        makeUserMsg('Run command'),
        makeAssistantMsg([
          makeToolPart('bash', 'completed', { command: 'cat file.txt' }, longOutput)
        ])
      ]
    });
    const result = distiller.distill(session);
    const output = result.steps[0].toolCalls[0].output!;
    expect(output.length).toBeLessThanOrEqual(503);
    expect(output).toContain('...');
  });

  it('should extract reasoning text (first 200 chars)', () => {
    const reasoningText = 'R'.repeat(500);
    const session = makeSession({
      messages: [
        makeUserMsg('Do something'),
        makeAssistantMsg([
          { type: 'reasoning', text: reasoningText, id: 'prt_reason', sessionID: 'ses_test123', messageID: 'msg_asst' },
          makeToolPart('write', 'completed', {}, 'done')
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].reasoning).toBeDefined();
    expect(result.steps[0].reasoning!.length).toBeLessThanOrEqual(203);
  });

  it('should extract assistant text response', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Hi'),
        makeAssistantMsg([
          { type: 'text', text: '文件创建成功！', id: 'prt_text', sessionID: 'ses_test123', messageID: 'msg_asst' }
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].assistantResponse).toBe('文件创建成功！');
  });

  it('should skip empty assistant text responses', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Hi'),
        makeAssistantMsg([
          { type: 'text', text: '', id: 'prt_text', sessionID: 'ses_test123', messageID: 'msg_asst' },
          makeToolPart('write', 'completed', {}, 'done'),
          { type: 'text', text: 'Done!', id: 'prt_text2', sessionID: 'ses_test123', messageID: 'msg_asst' }
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].assistantResponse).toBe('Done!');
  });

  it('should extract file changes from message summaries', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Create file', [
          { file: 'hello.txt', before: '', after: 'Hello', additions: 1, deletions: 0, status: 'added' }
        ]),
        makeAssistantMsg([
          makeToolPart('write', 'completed', { filePath: 'hello.txt' }, 'done')
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].fileChanges).toHaveLength(1);
    expect(result.steps[0].fileChanges[0]).toEqual({ path: 'hello.txt', status: 'added' });
  });

  it('should handle multi-turn conversation correctly', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Create file'),
        makeAssistantMsg([
          makeToolPart('write', 'completed', { filePath: 'a.txt' }, 'ok')
        ]),
        makeUserMsg('Read file'),
        makeAssistantMsg([
          makeToolPart('read', 'completed', { filePath: 'a.txt' }, 'content here')
        ]),
        makeUserMsg('Modify file'),
        makeAssistantMsg([
          makeToolPart('edit', 'completed', { filePath: 'a.txt' }, 'ok'),
          makeToolPart('bash', 'completed', { command: 'ls' }, 'a.txt')
        ])
      ]
    });

    const result = distiller.distill(session);
    expect(result.steps).toHaveLength(3);

    expect(result.steps[0].index).toBe(1);
    expect(result.steps[0].userInput).toBe('Create file');
    expect(result.steps[0].toolCalls).toHaveLength(1);
    expect(result.steps[0].toolCalls[0].toolName).toBe('write');

    expect(result.steps[1].index).toBe(2);
    expect(result.steps[1].userInput).toBe('Read file');
    expect(result.steps[1].toolCalls).toHaveLength(1);
    expect(result.steps[1].toolCalls[0].toolName).toBe('read');

    expect(result.steps[2].index).toBe(3);
    expect(result.steps[2].userInput).toBe('Modify file');
    expect(result.steps[2].toolCalls).toHaveLength(2);
    expect(result.steps[2].toolCalls[0].toolName).toBe('edit');
    expect(result.steps[2].toolCalls[1].toolName).toBe('bash');
  });

  it('should handle empty session', () => {
    const session = makeSession({ messages: [] });
    const result = distiller.distill(session);
    expect(result.steps).toHaveLength(0);
  });

  it('should handle session with only user messages (no assistant response)', () => {
    const session = makeSession({
      messages: [makeUserMsg('Hello')]
    });
    const result = distiller.distill(session);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].toolCalls).toHaveLength(0);
    expect(result.steps[0].assistantResponse).toBeUndefined();
  });

  it('should handle tool call with error status', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Do something'),
        makeAssistantMsg([
          makeToolPart('write', 'error', { filePath: '/bad/path' }, undefined, 'Permission denied')
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].toolCalls[0].status).toBe('error');
    expect(result.steps[0].toolCalls[0].error).toBe('Permission denied');
  });

  it('should filter out step-start, step-finish, and patch parts', () => {
    const session = makeSession({
      messages: [
        makeUserMsg('Do something'),
        makeAssistantMsg([
          { type: 'step-start', snapshot: 'abc123', id: 'prt_ss', sessionID: 'ses_test123', messageID: 'msg_asst' },
          makeToolPart('write', 'completed', {}, 'ok'),
          { type: 'step-finish', reason: 'stop', id: 'prt_sf', sessionID: 'ses_test123', messageID: 'msg_asst' },
          { type: 'patch', hash: 'abc', files: ['test.txt'], id: 'prt_pt', sessionID: 'ses_test123', messageID: 'msg_asst' }
        ])
      ]
    });
    const result = distiller.distill(session);
    expect(result.steps[0].toolCalls).toHaveLength(1);
    expect(result.steps[0].toolCalls[0].toolName).toBe('write');
  });
});
