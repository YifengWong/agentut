import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  ExecutionError,
  TimeoutError,
  SetupError,
  type Assertion,
  type AgentCliConfig,
  type SessionInfo,
  type GlobalConfig,
  type ScenarioConfig,
  type ToolCallAssertion,
  type FileContentAssertion,
  type StepResult,
  type RunExecution,
  type AssertionSummary,
  type AssertionFailure
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

describe('Probabilistic test types', () => {
  describe('GlobalConfig runs and min_pass', () => {
    it('should accept runs and min_pass as optional fields', () => {
      const config: GlobalConfig = {
        runs: 10,
        min_pass: 8,
        default_timeout: 120000
      };
      expect(config.runs).toBe(10);
      expect(config.min_pass).toBe(8);
    });

    it('should allow missing runs and min_pass', () => {
      const config: GlobalConfig = {
        default_timeout: 60000
      };
      expect(config.runs).toBeUndefined();
      expect(config.min_pass).toBeUndefined();
    });
  });

  describe('ScenarioConfig runs and min_pass override', () => {
    it('should allow scenario-level runs and min_pass', () => {
      const scenario: ScenarioConfig = {
        name: 'test',
        environment: 'default',
        cleanup: true,
        steps: [],
        runs: 5,
        min_pass: 4
      };
      expect(scenario.runs).toBe(5);
      expect(scenario.min_pass).toBe(4);
    });
  });

  describe('Assertion min_pass override', () => {
    it('should allow min_pass in ToolCallAssertion', () => {
      const assertion: ToolCallAssertion = {
        name: 'Write',
        min_pass: 9
      };
      expect(assertion.min_pass).toBe(9);
    });
  });

  describe('RunExecution type', () => {
    it('should track single run execution result', () => {
      const run: RunExecution = {
        run_index: 1,
        status: 'passed',
        duration_ms: 5000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
        ]
      };
      expect(run.run_index).toBe(1);
      expect(run.status).toBe('passed');
    });

    it('should include error info for failed run', () => {
      const run: RunExecution = {
        run_index: 2,
        status: 'failed',
        duration_ms: 60000,
        assertions: [],
        error: 'Timeout'
      };
      expect(run.error).toBe('Timeout');
    });
  });

  describe('AssertionSummary type', () => {
    it('should summarize assertion pass rate', () => {
      const summary: AssertionSummary = {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 9,
        passed_runs: 8,
        status: 'failed',
        failures: [
          { run_index: 3, message: 'Tool not called' }
        ]
      };
      expect(summary.passed_runs).toBe(8);
      expect(summary.status).toBe('failed');
      expect(summary.failures).toHaveLength(1);
    });
  });

  describe('StepResult extended structure', () => {
    it('should support runs array structure', () => {
      const step: StepResult = {
        input: 'Create file',
        status: 'passed',
        runs: [
          { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] }
        ],
        summary: {
          total_runs: 1,
          passed_runs: 1,
          min_pass: 1,
          status: 'passed'
        },
        assertions: [],
        duration_ms: 1000
      };
      expect(step.runs).toHaveLength(1);
      expect(step.summary?.status).toBe('passed');
    });
  });
});