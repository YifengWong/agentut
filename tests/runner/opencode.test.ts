// tests/runner/opencode.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { OpenCodeRunner } from '../../src/runner/opencode.js';
import { ExecutionError, TimeoutError } from '../../src/types/index.js';
import type { RunOptions } from '../../src/runner/types.js';

const { mockSpawn } = vi.hoisted(() => ({
  mockSpawn: vi.fn()
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: mockSpawn
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    unlinkSync: vi.fn()
  }
}));

// Mock os
vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn(() => '/tmp')
  }
}));

import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

/**
 * Create a mock ChildProcess for spawn tests.
 * Emits 'data' on stdout with the given content, then 'close' with the exit code.
 */
function createMockProc(stdout: string, exitCode = 0) {
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  const proc = {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false
  };

  proc.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'close') {
      // Emit close asynchronously, after stdout data is emitted
      setImmediate(() => {
        cb(exitCode);
      });
    }
    if (event === 'error') {
      // Don't auto-trigger error
    }
    return proc;
  });

  // Emit stdout data asynchronously
  if (stdout) {
    setImmediate(() => {
      stdoutEmitter.emit('data', Buffer.from(stdout));
    });
  }

  return proc;
}

/**
 * Create a mock proc that never closes (simulates stuck process for timeout testing).
 */
function createStuckMockProc(stdout: string) {
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();

  const proc = {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false
  };

  proc.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'close') {
      // Will be called when kill() is invoked
      proc.kill.mockImplementation(() => {
        proc.killed = true;
        setImmediate(() => cb(null)); // null exit code on kill
      });
    }
    return proc;
  });

  proc.kill.mockImplementation(() => {
    proc.killed = true;
    // Trigger close after kill
    setImmediate(() => {
      // Find the close callback and call it
      const closeCalls = proc.on.mock.calls.filter((c: unknown[]) => c[0] === 'close');
      if (closeCalls.length > 0) {
        closeCalls[0][1](null);
      }
    });
  });

  if (stdout) {
    setImmediate(() => {
      stdoutEmitter.emit('data', Buffer.from(stdout));
    });
  }

  return proc;
}

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
    it('should call CLI with correct arguments for first step', async () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Hello' },
        session_id: 'ses_123',
        timestamp: 1234567890
      });
      mockSpawn.mockReturnValue(createMockProc(mockOutput));

      const result = await runner.run({ input: 'Hello', directory: '/test/project' });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['run', '--dir', '/test/project', '--format', 'json']),
        expect.any(Object)
      );
      expect(result.sessionId).toBe('ses_123');
    });

    it('should use custom command name when configured', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      mockSpawn.mockReturnValue(createMockProc('{}'));

      await customRunner.run({ input: 'Test', directory: '/test' });

      expect(mockSpawn).toHaveBeenCalledWith(
        'mycode',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError on non-zero exit', async () => {
      mockSpawn.mockReturnValue(createMockProc('', 1));

      await expect(runner.run({ input: 'Test' })).rejects.toThrow(ExecutionError);
    });

    it('should return partial results on timeout when sessionId exists', async () => {
      const mockOutput = [
        JSON.stringify({ type: 'text', data: { content: 'Processing...' }, session_id: 'ses_timeout', timestamp: 1 }),
        JSON.stringify({ type: 'tool_use', part: { tool: 'bash' }, session_id: 'ses_timeout', timestamp: 2 })
      ].join('\n');
      mockSpawn.mockReturnValue(createStuckMockProc(mockOutput));

      const result = await runner.run({ input: 'Test', timeout: 100 });

      expect(result.sessionId).toBe('ses_timeout');
      expect(result.outputs).toHaveLength(2);
    });

    it('should throw TimeoutError when no sessionId found on timeout', async () => {
      // Output with no session_id field
      const mockOutput = JSON.stringify({
        type: 'system',
        data: { content: 'Starting...' },
        timestamp: 1
      });
      mockSpawn.mockReturnValue(createStuckMockProc(mockOutput));

      await expect(runner.run({ input: 'Test', timeout: 100 })).rejects.toThrow(TimeoutError);
    });

    it('should use --session flag for continuation', async () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Response' },
        session_id: 'ses_456',
        timestamp: 1234567890
      });
      mockSpawn.mockReturnValue(createMockProc(mockOutput));

      await runner.run({
        input: 'Continue',
        sessionId: 'ses_123'
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--session', 'ses_123']),
        expect.any(Object)
      );
    });

    it('should use --fork flag when specified', async () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Response' },
        session_id: 'ses_789',
        timestamp: 1234567890
      });
      mockSpawn.mockReturnValue(createMockProc(mockOutput));

      await runner.run({
        input: 'Test',
        sessionId: 'ses_123',
        fork: true
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--fork']),
        expect.any(Object)
      );
    });

    it('should use --format json flag', async () => {
      mockSpawn.mockReturnValue(createMockProc('{}'));

      await runner.run({
        input: 'Test',
        directory: '/test'
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--format', 'json']),
        expect.any(Object)
      );
    });

    it('should use --model flag when specified', async () => {
      mockSpawn.mockReturnValue(createMockProc('{}'));

      await runner.run({
        input: 'Test',
        model: 'claude-sonnet'
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--model', 'claude-sonnet']),
        expect.any(Object)
      );
    });

    it('should use --agent flag when specified', async () => {
      mockSpawn.mockReturnValue(createMockProc('{}'));

      await runner.run({
        input: 'Test',
        agent: 'my-skill'
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['--agent', 'my-skill']),
        expect.any(Object)
      );
    });

    it('should parse JSON stream output', async () => {
      const mockOutput = [
        JSON.stringify({ type: 'message', data: { role: 'user' }, session_id: 'ses_1', timestamp: 1 }),
        JSON.stringify({ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 2 }),
        JSON.stringify({ type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 3 })
      ].join('\n');

      mockSpawn.mockReturnValue(createMockProc(mockOutput));

      const result = await runner.run({
        input: 'Create file',
        directory: '/test'
      });

      expect(result.outputs).toHaveLength(3);
      expect(result.outputs[0].type).toBe('message');
      expect(result.outputs[1].type).toBe('tool_call');
      expect(result.sessionId).toBe('ses_1');
    });

    it('should parse sessionID in new format', async () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        sessionID: 'ses_new_format',
        timestamp: 1234567890
      });
      mockSpawn.mockReturnValue(createMockProc(mockOutput));

      const result = await runner.run({ input: 'Test' });

      expect(result.sessionId).toBe('ses_new_format');
    });

    it('should pass input via stdin', async () => {
      const mockProc = createMockProc('{}');
      mockSpawn.mockReturnValue(mockProc);

      await runner.run({
        input: 'Say "hello" to the user'
      });

      expect(mockProc.stdin.write).toHaveBeenCalledWith('Say "hello" to the user');
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });

    it('should use -f flag when file option is specified', async () => {
      mockSpawn.mockReturnValue(createMockProc('{}'));

      await runner.run({
        input: 'Test',
        file: '/path/to/outputs.json'
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        'opencode',
        expect.arrayContaining(['-f', '/path/to/outputs.json']),
        expect.any(Object)
      );
    });

    it('should pass stdin input correctly', async () => {
      const mockProc = createMockProc('{}');
      mockSpawn.mockReturnValue(mockProc);

      // prompt no longer appears in command string — goes through stdin
      await runner.run({
        input: 'Say "hello" to the user'
      });

      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).not.toContain('Say');
      expect(mockProc.stdin.write).toHaveBeenCalledWith('Say "hello" to the user');
    });
  });

  describe('exportSession', () => {
    it('should redirect export to temp file and parse JSON', async () => {
      const mockSession = {
        info: { id: 'ses_123', directory: '/test' },
        messages: []
      };
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockSession));

      const result = await runner.exportSession('ses_123');

      const expectedTmpPath = path.join('/tmp', 'agentut-export-ses_123.json');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining(`opencode export ses_123 > "${expectedTmpPath}"`),
        expect.objectContaining({ timeout: 30000 })
      );
      expect(fs.readFileSync).toHaveBeenCalledWith(
        expectedTmpPath,
        'utf-8'
      );
      expect(fs.unlinkSync).toHaveBeenCalledWith(expectedTmpPath);
      expect(result.info.id).toBe('ses_123');
    });

    it('should use custom command name', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      vi.mocked(fs.readFileSync).mockReturnValue('{}');

      await customRunner.exportSession('ses_123');

      const expectedTmpPath = path.join('/tmp', 'agentut-export-ses_123.json');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining(`mycode export ses_123 > "${expectedTmpPath}"`),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError when execSync fails', async () => {
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Session not found');
      });

      await expect(runner.exportSession('invalid')).rejects.toThrow(ExecutionError);
    });

    it('should throw ExecutionError when reading temp file fails', async () => {
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: file not found');
      });

      await expect(runner.exportSession('ses_123')).rejects.toThrow(ExecutionError);
    });

    it('should clean up temp file even when JSON parse fails', async () => {
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json');

      await expect(runner.exportSession('ses_123')).rejects.toThrow(ExecutionError);
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join('/tmp', 'agentut-export-ses_123.json'));
    });

    it('should clean up temp file even when execSync fails', async () => {
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      await expect(runner.exportSession('ses_123')).rejects.toThrow(ExecutionError);
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join('/tmp', 'agentut-export-ses_123.json'));
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

  describe('importSession', () => {
    it('should call CLI import with session file', async () => {
      vi.mocked(execSync).mockReturnValue('Imported session: ses_abc123\n');

      const result = await runner.importSession('/path/to/session.json');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('opencode import "/path/to/session.json"'),
        expect.any(Object)
      );
      expect(result).toBe('ses_abc123');
    });

    it('should use custom command name', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('Imported session: ses_xyz\n');

      await customRunner.importSession('/path/to/session.json');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode import'),
        expect.any(Object)
      );
    });

    it('should parse session ID from output format', async () => {
      vi.mocked(execSync).mockReturnValue('Imported session: ses_123abc\n');

      const result = await runner.importSession('/path/to/session.json');

      expect(result).toBe('ses_123abc');
    });

    it('should handle session ID without ses_ prefix', async () => {
      vi.mocked(execSync).mockReturnValue('Imported session: abc123xyz\n');

      const result = await runner.importSession('/path/to/session.json');

      expect(result).toBe('abc123xyz');
    });

    it('should throw ExecutionError when import fails', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Import failed');
      });

      await expect(runner.importSession('/path/to/session.json')).rejects.toThrow(ExecutionError);
    });

    it('should throw ExecutionError when output format is invalid', async () => {
      vi.mocked(execSync).mockReturnValue('Invalid output format\n');

      await expect(runner.importSession('/path/to/session.json')).rejects.toThrow(ExecutionError);
    });

    it('should throw ExecutionError when output does not start with Imported session:', async () => {
      vi.mocked(execSync).mockReturnValue('ses_abc123\n');

      await expect(runner.importSession('/path/to/session.json')).rejects.toThrow(ExecutionError);
    });
  });
});
