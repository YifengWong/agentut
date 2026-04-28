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
  type JudgedByAssertion,
  type ExecCommandAssertion,
  type StepResult,
  type ScenarioResult,
  type RunExecution,
  type AssertionSummary,
  type AssertionFailure,
  type AssertionStat,
  type RunStepDetail
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

  it('should allow judged_by assertion', () => {
    const assertion: Assertion = {
      judged_by: {
        judge: 'code-reviewer',
        prompt: 'Is this code well-structured?'
      }
    };
    expect('judged_by' in assertion).toBe(true);
  });

  it('should allow judged_by assertion with optional fields', () => {
    const assertion: Assertion = {
      judged_by: {
        judge: 'security-auditor',
        prompt: 'Are there security vulnerabilities?',
        timeout: 60000,
        min_pass: 8
      }
    };
    expect('judged_by' in assertion).toBe(true);
    expect((assertion as { judged_by: JudgedByAssertion }).judged_by.timeout).toBe(60000);
    expect((assertion as { judged_by: JudgedByAssertion }).judged_by.min_pass).toBe(8);
  });

  it('should allow exec_command assertion', () => {
    const assertion: Assertion = {
      exec_command: {
        command: 'mvn test',
        expect: { contains: 'BUILD SUCCESS' }
      }
    };
    expect('exec_command' in assertion).toBe(true);
  });

  it('should allow exec_command assertion with optional fields', () => {
    const assertion: Assertion = {
      exec_command: {
        command: 'npm test',
        expect: { regex: '.*passing.*' },
        timeout: 300000,
        cwd: './src',
        min_pass: 4
      }
    };
    expect('exec_command' in assertion).toBe(true);
    expect((assertion as { exec_command: ExecCommandAssertion }).exec_command.timeout).toBe(300000);
    expect((assertion as { exec_command: ExecCommandAssertion }).exec_command.cwd).toBe('./src');
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

  it('should allow optional model field', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      model: 'anthropic/claude-3.5-sonnet'
    };
    expect(config.model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('should allow optional agent field', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      agent: 'my-custom-agent'
    };
    expect(config.agent).toBe('my-custom-agent');
  });

  it('should allow both model and agent fields', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      model: 'openai/gpt-4o',
      agent: 'judge-agent'
    };
    expect(config.model).toBe('openai/gpt-4o');
    expect(config.agent).toBe('judge-agent');
  });

  it('should allow model with special characters (slash and dot)', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      model: 'anthropic/claude-3.5-sonnet-20240620'
    };
    expect(config.model).toContain('/');
    expect(config.model).toContain('.');
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

    it('should accept judges configuration', () => {
      const config: GlobalConfig = {
        judges: {
          'code-reviewer': {
            runner: 'claude',
            command: 'claude'
          },
          'security-auditor': {
            runner: 'gemini',
            command: 'gemini'
          }
        }
      };
      expect(config.judges).toBeDefined();
      expect(config.judges!['code-reviewer'].runner).toBe('claude');
      expect(config.judges!['security-auditor'].runner).toBe('gemini');
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

  describe('StepResult assertionStats field', () => {
    it('should support assertionStats field', () => {
      const step: StepResult = {
        input: 'Create file',
        status: 'passed',
        duration_ms: 1000,
        assertions: [],
        assertionStats: [
          { type: 'should_call_tool', value: 'Write', passed_runs: 5, total_runs: 5, pass_rate: 100, status: 'passed' }
        ]
      };
      expect(step.assertionStats).toHaveLength(1);
      expect(step.assertionStats![0].pass_rate).toBe(100);
    });
  });

  describe('ScenarioResult.runDetails field', () => {
    it('should support runDetails field', () => {
      const scenario: ScenarioResult = {
        name: 'test',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: [],
        runDetails: [
          {
            run_index: 0,
            status: 'passed',
            duration_ms: 1000,
            steps: []
          }
        ]
      };
      expect(scenario.runDetails).toHaveLength(1);
      expect(scenario.runDetails![0].run_index).toBe(0);
    });
  });

  describe('AssertionStat type', () => {
    it('should support assertion-level statistics', () => {
      const stat: AssertionStat = {
        type: 'should_call_tool',
        value: 'Write',
        passed_runs: 4,
        total_runs: 5,
        pass_rate: 80,
        status: 'passed'
      };
      expect(stat.pass_rate).toBe(80);
      expect(stat.passed_runs).toBe(4);
    });

    it('should mark failed status when pass_rate below threshold', () => {
      const stat: AssertionStat = {
        type: 'response_contains',
        value: 'success',
        passed_runs: 2,
        total_runs: 5,
        pass_rate: 40,
        status: 'failed'
      };
      expect(stat.status).toBe('failed');
    });
  });

  describe('RunStepDetail type', () => {
    it('should capture step details within a run', () => {
      const stepDetail: RunStepDetail = {
        step_index: 0,
        input: 'Create file',
        status: 'passed',
        duration_ms: 1000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
        ],
        actual_output: [
          { type: 'text', part: { text: 'Creating file...' } }
        ]
      };
      expect(stepDetail.step_index).toBe(0);
      expect(stepDetail.actual_output).toHaveLength(1);
    });
  });

  describe('RunExecution extended structure', () => {
    it('should include steps array with RunStepDetail', () => {
      const run: RunExecution = {
        run_index: 0,
        status: 'passed',
        duration_ms: 5000,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 1000,
            assertions: []
          }
        ]
      };
      expect(run.steps).toHaveLength(1);
      expect(run.steps[0].step_index).toBe(0);
    });
  });

  describe('JudgedByAssertion type', () => {
    it('should require judge and prompt fields', () => {
      const assertion: JudgedByAssertion = {
        judge: 'code-reviewer',
        prompt: 'Is this code well-structured?'
      };
      expect(assertion.judge).toBe('code-reviewer');
      expect(assertion.prompt).toBe('Is this code well-structured?');
      expect(assertion.timeout).toBeUndefined();
      expect(assertion.min_pass).toBeUndefined();
    });

    it('should allow optional timeout and min_pass', () => {
      const assertion: JudgedByAssertion = {
        judge: 'security-auditor',
        prompt: 'Check for vulnerabilities',
        timeout: 30000,
        min_pass: 9
      };
      expect(assertion.timeout).toBe(30000);
      expect(assertion.min_pass).toBe(9);
    });
  });
});