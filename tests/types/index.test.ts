import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  ExecutionError,
  TimeoutError,
  SetupError,
  type Assertion,
  type AgentCliConfig,
  type SessionInfo
} from '../../src/types/index.js';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBeUndefined();
    });

    it('should create error with message and field', () => {
      const error = new ValidationError('Missing field', 'name');
      expect(error.message).toBe('Missing field');
      expect(error.field).toBe('name');
    });
  });

  describe('ExecutionError', () => {
    it('should create error with message', () => {
      const error = new ExecutionError('Command failed');
      expect(error.message).toBe('Command failed');
      expect(error.name).toBe('ExecutionError');
      expect(error.command).toBeUndefined();
    });

    it('should create error with message and command', () => {
      const error = new ExecutionError('Failed', 'opencode run');
      expect(error.command).toBe('opencode run');
    });
  });

  describe('TimeoutError', () => {
    it('should create error with message and timeout', () => {
      const error = new TimeoutError('Timed out', 5000);
      expect(error.message).toBe('Timed out');
      expect(error.name).toBe('TimeoutError');
      expect(error.timeout).toBe(5000);
    });
  });

  describe('SetupError', () => {
    it('should create error with message', () => {
      const error = new SetupError('Setup failed');
      expect(error.message).toBe('Setup failed');
      expect(error.name).toBe('SetupError');
      expect(error.step).toBeUndefined();
    });

    it('should create error with message and step', () => {
      const step = { run: 'npm install' };
      const error = new SetupError('npm install failed', step);
      expect(error.step).toEqual(step);
    });
  });
});

describe('Assertion Type', () => {
  it('should allow should_call_tool assertion', () => {
    const assertion: Assertion = { should_call_tool: 'Write' };
    expect('should_call_tool' in assertion).toBe(true);
  });

  it('should allow should_produce_file assertion', () => {
    const assertion: Assertion = { should_produce_file: 'hello.txt' };
    expect('should_produce_file' in assertion).toBe(true);
  });

  it('should allow file_content_contains assertion', () => {
    const assertion: Assertion = {
      file_content_contains: { file: 'test.txt', text: 'hello' }
    };
    expect('file_content_contains' in assertion).toBe(true);
  });

  it('should allow response_contains assertion', () => {
    const assertion: Assertion = { response_contains: 'success' };
    expect('response_contains' in assertion).toBe(true);
  });
});

describe('AgentCliConfig type', () => {
  it('should allow valid runner types', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'mycode'
    };
    expect(config.runner).toBe('opencode');
    expect(config.command).toBe('mycode');
  });

  it('should allow claude as runner type (for future)', () => {
    const config: AgentCliConfig = {
      runner: 'claude',
      command: 'claude'
    };
    expect(config.runner).toBe('claude');
  });

  it('should allow gemini as runner type (for future)', () => {
    const config: AgentCliConfig = {
      runner: 'gemini',
      command: 'gemini'
    };
    expect(config.runner).toBe('gemini');
  });
});

describe('SessionInfo type', () => {
  it('should have required id field', () => {
    const info: SessionInfo = {
      id: 'ses_123'
    };
    expect(info.id).toBe('ses_123');
  });

  it('should allow optional fields', () => {
    const info: SessionInfo = {
      id: 'ses_123',
      title: 'Test Session',
      created: 1234567890,
      updated: 1234567891
    };
    expect(info.title).toBe('Test Session');
    expect(info.created).toBe(1234567890);
  });
});