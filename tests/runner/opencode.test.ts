// tests/runner/opencode.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { OpenCodeRunner } from '../../src/runner/opencode.js';
import { ExecutionError, TimeoutError } from '../../src/types/index.js';

function createMockProcess(stdoutData: string, exitCode = 0) {
  const mockProc = new EventEmitter() as any;
  mockProc.stdout = new EventEmitter();
  mockProc.stderr = new EventEmitter();
  mockProc.pid = 12345;

  setImmediate(() => {
    if (stdoutData) {
      mockProc.stdout.emit('data', Buffer.from(stdoutData));
    }
    mockProc.emit('close', exitCode);
  });

  return mockProc;
}

// Mock child_process — provide both spawn and execSync
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn()
}));

// Mock process module
vi.mock('../../src/process/index.js', () => ({
  processManager: {
    register: vi.fn(),
    unregister: vi.fn()
  },
  treeKill: vi.fn()
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
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
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { processManager, treeKill } from '../../src/process/index.js';

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
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput));

      const result = await runner.run({ input: 'Hello', directory: '/test/project' });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('opencode run'),
        expect.any(Array),
        expect.objectContaining({ shell: true, detached: process.platform !== 'win32' })
      );
      expect(result.sessionId).toBe('ses_123');
      expect(processManager.register).toHaveBeenCalledWith(12345);
      expect(processManager.unregister).toHaveBeenCalledWith(12345);
    });

    it('should use custom command name when configured', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await customRunner.run({ input: 'Test', directory: '/test' });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('mycode run'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError on failure', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new EventEmitter();
      mockProc.stderr = new EventEmitter();
      mockProc.pid = 12345;

      vi.mocked(spawn).mockReturnValue(mockProc);

      setImmediate(() => {
        mockProc.emit('error', new Error('Command failed'));
      });

      await expect(runner.run({ input: 'Test' })).rejects.toThrow(ExecutionError);
      expect(processManager.unregister).toHaveBeenCalledWith(12345);
    });

    it('should throw TimeoutError on timeout with no session info recovered', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new EventEmitter();
      mockProc.stderr = new EventEmitter();
      mockProc.pid = 12345;

      vi.mocked(spawn).mockReturnValue(mockProc);

      // treeKill kills the process → close fires without valid output
      vi.mocked(treeKill).mockImplementation(() => {
        setImmediate(() => mockProc.emit('close', null));
      });

      await expect(
        runner.run({ input: 'Test', timeout: 100 })
      ).rejects.toThrow(TimeoutError);
    });

    it('should return partial result on timeout if session info recovered', async () => {
      const mockProc = new EventEmitter() as any;
      mockProc.stdout = new EventEmitter();
      mockProc.stderr = new EventEmitter();
      mockProc.pid = 12345;

      vi.mocked(spawn).mockReturnValue(mockProc);

      const partialOutput = JSON.stringify({
        type: 'text',
        data: { content: 'partial response' },
        session_id: 'ses_partial',
        timestamp: 1
      });

      // treeKill kills the process → emit partial output before close
      vi.mocked(treeKill).mockImplementation(() => {
        mockProc.stdout.emit('data', Buffer.from(partialOutput));
        setImmediate(() => mockProc.emit('close', null));
      });

      const result = await runner.run({ input: 'Test', timeout: 100 });

      expect(result.sessionId).toBe('ses_partial');
      expect(result.outputs).toHaveLength(1);
    });

    it('should use --session flag for continuation', async () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Response' },
        session_id: 'ses_456',
        timestamp: 1234567890
      });
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput));

      await runner.run({
        input: 'Continue',
        sessionId: 'ses_123'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--session ses_123'),
        expect.any(Array),
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
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput));

      await runner.run({
        input: 'Test',
        sessionId: 'ses_123',
        fork: true
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--fork'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use --format json flag', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        directory: '/test'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--format json'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use --model flag when specified', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        model: 'claude-sonnet'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--model "claude-sonnet"'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should use --agent flag when specified', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        agent: 'my-skill'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--agent "my-skill"'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should append runArgs to the command when provided', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        runArgs: '--verbose --command "my-cmd"'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--verbose --command "my-cmd"'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should not include runArgs in the command when not provided', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        directory: '/test'
      });

      const call = vi.mocked(spawn).mock.calls[0][0] as string;
      // Should contain the basic args but NOT any "runArgs" or extra custom flags
      expect(call).toContain('opencode run');
      expect(call).toContain('--format json');
      expect(call).not.toContain('--verbose');
    });

    it('should quote model value with special characters', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        model: 'anthropic/claude-3.5-sonnet'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('--model "anthropic/claude-3.5-sonnet"'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should parse JSON stream output', async () => {
      const mockOutput = [
        JSON.stringify({ type: 'message', data: { role: 'user' }, session_id: 'ses_1', timestamp: 1 }),
        JSON.stringify({ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 2 }),
        JSON.stringify({ type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 3 })
      ].join('\n');
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput));

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
      vi.mocked(spawn).mockReturnValue(createMockProcess(mockOutput));

      const result = await runner.run({ input: 'Test' });

      expect(result.sessionId).toBe('ses_new_format');
    });

    it('should pass input via temp file redirection', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Say "hello" to the user'
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('agentut-input-'),
        'Say "hello" to the user',
        'utf-8'
      );
      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('< "'),
        expect.any(Array),
        expect.any(Object)
      );
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should use -f flag when file option is specified', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}'));

      await runner.run({
        input: 'Test',
        file: '/path/to/outputs.json'
      });

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('-f "/path/to/outputs.json"'),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should treeKill and unregister on non-zero exitCode', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('partial output', 1));

      const result = await runner.run({ input: 'Test' });

      expect(result.outputs).toHaveLength(0); // partial output — no valid JSON
      expect(treeKill).toHaveBeenCalledWith(12345);
      expect(processManager.unregister).toHaveBeenCalledWith(12345);
    });

    it('should NOT treeKill on normal exit (exitCode 0)', async () => {
      vi.mocked(spawn).mockReturnValue(createMockProcess('{}', 0));

      await runner.run({ input: 'Test' });

      expect(treeKill).not.toHaveBeenCalled();
      expect(processManager.unregister).toHaveBeenCalledWith(12345);
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
