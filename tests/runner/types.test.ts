// tests/runner/types.test.ts

import { describe, it, expect } from 'vitest';
import type { AgentRunner, RunOptions, RunResult } from '../../src/runner/types.js';

describe('AgentRunner interface', () => {
  it('should define runnerType as readonly string', () => {
    // This test verifies interface structure at compile time
    const mockRunner: AgentRunner = {
      runnerType: 'opencode',
      run: (options: RunOptions) => ({ outputs: [], sessionId: 'ses_1' }),
      exportSession: async (id: string) => ({ info: { id }, messages: [] }),
      listSessions: async () => []
    };
    expect(mockRunner.runnerType).toBe('opencode');
  });
});

describe('RunOptions interface', () => {
  it('should have required input field', () => {
    const options: RunOptions = {
      input: 'Create file'
    };
    expect(options.input).toBe('Create file');
  });

  it('should allow optional fields', () => {
    const options: RunOptions = {
      input: 'Test',
      directory: '/tmp/test',
      sessionId: 'ses_123',
      fork: true,
      timeout: 30000,
      model: 'claude-sonnet',
      agent: 'my-skill'
    };
    expect(options.directory).toBe('/tmp/test');
    expect(options.sessionId).toBe('ses_123');
  });
});

describe('RunResult interface', () => {
  it('should have outputs and sessionId', () => {
    const result: RunResult = {
      outputs: [{ type: 'text', sessionID: 'ses_1' }],
      sessionId: 'ses_1'
    };
    expect(result.outputs).toHaveLength(1);
    expect(result.sessionId).toBe('ses_1');
  });
});