import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runOpenCode,
  exportSession,
  getLatestSessionId
} from '../../src/executor/opencode.js';
import { ExecutionError, TimeoutError } from '../../src/types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

import { execSync } from 'child_process';

describe('runOpenCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call opencode run with correct arguments', async () => {
    const mockOutput = JSON.stringify({
      type: 'text',
      data: { content: 'Hello' },
      session_id: 'ses_123',
      timestamp: 1234567890
    });

    vi.mocked(execSync).mockReturnValue(mockOutput);

    const result = runOpenCode({
      input: 'Hello',
      directory: '/test/project'
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('opencode run'),
      expect.any(Object)
    );
    expect(result.sessionId).toBe('ses_123');
  });

  it('should use --session flag for subsequent steps', async () => {
    const mockOutput = JSON.stringify({
      type: 'text',
      data: { content: 'Response' },
      session_id: 'ses_456',
      timestamp: 1234567890
    });

    vi.mocked(execSync).mockReturnValue(mockOutput);

    runOpenCode({
      input: 'Continue',
      sessionId: 'ses_123'
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--session ses_123'),
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

    vi.mocked(execSync).mockReturnValue(mockOutput);

    runOpenCode({
      input: 'Test',
      sessionId: 'ses_123',
      fork: true
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--fork'),
      expect.any(Object)
    );
  });

  it('should throw ExecutionError on failure', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    expect(() => runOpenCode({
      input: 'Test',
      directory: '/test'
    })).toThrow(ExecutionError);
  });

  it('should throw TimeoutError when timeout is exceeded', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const error = new Error('Timeout') as Error & { code?: string };
      error.code = 'ETIMEDOUT';
      throw error;
    });

    expect(() => runOpenCode({
      input: 'Test',
      directory: '/test',
      timeout: 5000
    })).toThrow(TimeoutError);
  });

  it('should parse JSON stream output', async () => {
    const mockOutput = [
      JSON.stringify({ type: 'message', data: { role: 'user' }, session_id: 'ses_1', timestamp: 1 }),
      JSON.stringify({ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 2 }),
      JSON.stringify({ type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 3 })
    ].join('\n');

    vi.mocked(execSync).mockReturnValue(mockOutput);

    const result = runOpenCode({
      input: 'Create file',
      directory: '/test'
    });

    expect(result.outputs).toHaveLength(3);
    expect(result.outputs[0].type).toBe('message');
    expect(result.outputs[1].type).toBe('tool_call');
    expect(result.sessionId).toBe('ses_1');
  });

  it('should use --format json flag', async () => {
    vi.mocked(execSync).mockReturnValue('{}');

    runOpenCode({
      input: 'Test',
      directory: '/test'
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--format json'),
      expect.any(Object)
    );
  });
});

describe('exportSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call opencode export with session ID', async () => {
    const mockSession = {
      info: { id: 'ses_123', directory: '/test' },
      messages: []
    };

    vi.mocked(execSync).mockReturnValue(JSON.stringify(mockSession));

    const result = await exportSession('ses_123');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('opencode export ses_123'),
      expect.any(Object)
    );
    expect(result.info.id).toBe('ses_123');
  });

  it('should throw ExecutionError for invalid session ID', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Session not found');
    });

    await expect(exportSession('invalid')).rejects.toThrow(ExecutionError);
  });
});

describe('getLatestSessionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse session list and return latest ID', async () => {
    const mockOutput = `Session ID                      Title                                   Updated
ses_abc123                      Test Session                            10:30
ses_def456                      Another Session                         09:00`;

    vi.mocked(execSync).mockReturnValue(mockOutput);

    const result = await getLatestSessionId();

    expect(result).toBe('ses_abc123');
  });

  it('should return null for empty session list', async () => {
    vi.mocked(execSync).mockReturnValue('Session ID                      Title                                   Updated');

    const result = await getLatestSessionId();

    expect(result).toBeNull();
  });
});