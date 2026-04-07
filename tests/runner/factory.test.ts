// tests/runner/factory.test.ts

import { describe, it, expect } from 'vitest';
import { createRunner } from '../../src/runner/factory.js';
import { OpenCodeRunner } from '../../src/runner/opencode.js';
import type { AgentCliConfig } from '../../src/types/index.js';

describe('createRunner', () => {
  it('should create OpenCodeRunner for opencode type', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode'
    };
    const runner = createRunner(config);
    expect(runner).toBeInstanceOf(OpenCodeRunner);
    expect(runner.runnerType).toBe('opencode');
  });

  it('should pass custom command to OpenCodeRunner', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'mycode'
    };
    const runner = createRunner(config) as OpenCodeRunner;
    expect(runner.runnerType).toBe('opencode');
  });

  it('should throw error for unknown runner type', () => {
    const config = {
      runner: 'unknown',
      command: 'test'
    } as unknown as AgentCliConfig;
    expect(() => createRunner(config)).toThrow('Unknown runner type: unknown');
  });

  it('should throw error for claude runner (not yet implemented)', () => {
    const config: AgentCliConfig = {
      runner: 'claude',
      command: 'claude'
    };
    expect(() => createRunner(config)).toThrow('Unknown runner type: claude');
  });

  it('should throw error for gemini runner (not yet implemented)', () => {
    const config: AgentCliConfig = {
      runner: 'gemini',
      command: 'gemini'
    };
    expect(() => createRunner(config)).toThrow('Unknown runner type: gemini');
  });
});