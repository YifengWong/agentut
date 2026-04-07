// tests/runner/opencode.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeRunner } from '../../src/runner/opencode.js';
import { ExecutionError, TimeoutError } from '../../src/types/index.js';
import type { RunOptions } from '../../src/runner/types.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

import { execSync } from 'child_process';

describe('OpenCodeRunner', () => {
  let runner: OpenCodeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new OpenCodeRunner('opencode');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should store runnerType as opencode', () => {
      expect(runner.runnerType).toBe('opencode');
    });

    it('should accept custom command name', () => {
      const customRunner = new OpenCodeRunner('mycode');
      expect(customRunner.runnerType).toBe('opencode');
    });
  });

  describe('run', () => {
    it('should call CLI with correct arguments for first step', () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Hello' },
        session_id: 'ses_123',
        timestamp: 1234567890
      });
      vi.mocked(execSync).mockReturnValue(mockOutput);

      const result = runner.run({ input: 'Hello', directory: '/test/project' });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('opencode run'),
        expect.any(Object)
      );
      expect(result.sessionId).toBe('ses_123');
    });

    it('should use custom command name when configured', () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('{}');

      customRunner.run({ input: 'Test', directory: '/test' });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode run'),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError on failure', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      expect(() => runner.run({ input: 'Test' })).toThrow(ExecutionError);
    });

    it('should throw TimeoutError when ETIMEDOUT', () => {
      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('Timeout') as Error & { code?: string };
        error.code = 'ETIMEDOUT';
        throw error;
      });

      expect(() => runner.run({ input: 'Test', timeout: 5000 })).toThrow(TimeoutError);
    });

    it('should use --session flag for continuation', () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Response' },
        session_id: 'ses_456',
        timestamp: 1234567890
      });
      vi.mocked(execSync).mockReturnValue(mockOutput);

      runner.run({
        input: 'Continue',
        sessionId: 'ses_123'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--session ses_123'),
        expect.any(Object)
      );
    });

    it('should use --fork flag when specified', () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Response' },
        session_id: 'ses_789',
        timestamp: 1234567890
      });
      vi.mocked(execSync).mockReturnValue(mockOutput);

      runner.run({
        input: 'Test',
        sessionId: 'ses_123',
        fork: true
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--fork'),
        expect.any(Object)
      );
    });

    it('should use --format json flag', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        directory: '/test'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--format json'),
        expect.any(Object)
      );
    });

    it('should use --model flag when specified', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        model: 'claude-sonnet'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--model claude-sonnet'),
        expect.any(Object)
      );
    });

    it('should use --agent flag when specified', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        agent: 'my-skill'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--agent my-skill'),
        expect.any(Object)
      );
    });

    it('should parse JSON stream output', () => {
      const mockOutput = [
        JSON.stringify({ type: 'message', data: { role: 'user' }, session_id: 'ses_1', timestamp: 1 }),
        JSON.stringify({ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 2 }),
        JSON.stringify({ type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 3 })
      ].join('\n');

      vi.mocked(execSync).mockReturnValue(mockOutput);

      const result = runner.run({
        input: 'Create file',
        directory: '/test'
      });

      expect(result.outputs).toHaveLength(3);
      expect(result.outputs[0].type).toBe('message');
      expect(result.outputs[1].type).toBe('tool_call');
      expect(result.sessionId).toBe('ses_1');
    });

    it('should parse sessionID in new format', () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        sessionID: 'ses_new_format',
        timestamp: 1234567890
      });
      vi.mocked(execSync).mockReturnValue(mockOutput);

      const result = runner.run({ input: 'Test' });

      expect(result.sessionId).toBe('ses_new_format');
    });

    it('should escape quotes in input', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Say "hello" to the user'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('Say \\"hello\\" to the user'),
        expect.any(Object)
      );
    });
  });

  describe('exportSession', () => {
    it('should call CLI export with session ID', async () => {
      const mockSession = {
        info: { id: 'ses_123', directory: '/test' },
        messages: []
      };
      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockSession));

      const result = await runner.exportSession('ses_123');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('opencode export ses_123'),
        expect.any(Object)
      );
      expect(result.info.id).toBe('ses_123');
    });

    it('should use custom command name', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('{}');

      await customRunner.exportSession('ses_123');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode export ses_123'),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError for invalid session ID', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Session not found');
      });

      await expect(runner.exportSession('invalid')).rejects.toThrow(ExecutionError);
    });
  });

  describe('listSessions', () => {
    it('should parse session list table output', async () => {
      const mockOutput = `Session ID                      Title                                   Updated
ses_abc123                      Test Session                            10:30
ses_def456                      Another Session                         09:00`;
      vi.mocked(execSync).mockReturnValue(mockOutput);

      const result = await runner.listSessions();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ses_abc123');
      expect(result[1].id).toBe('ses_def456');
    });

    it('should use custom command name', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('Session ID\n');

      await customRunner.listSessions();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode session list'),
        expect.any(Object)
      );
    });

    it('should return empty array for no sessions', async () => {
      vi.mocked(execSync).mockReturnValue('Session ID                      Title                                   Updated');

      const result = await runner.listSessions();

      expect(result).toHaveLength(0);
    });

    it('should return empty array on error', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = await runner.listSessions();

      expect(result).toHaveLength(0);
    });
  });
});