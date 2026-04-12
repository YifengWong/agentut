import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { runTests } from '../../src/commands/run.js';
import type { YamlTestSuite, TestResult } from '../../src/types/index.js';

const TEST_DIR = './test-temp-run';

// Mock dependencies
vi.mock('../../src/parser/yaml.js', () => ({
  parseAndValidateYaml: vi.fn()
}));

vi.mock('../../src/runner/factory.js', () => ({
  createRunner: vi.fn()
}));

vi.mock('../../src/executor/fixture.js', () => ({
  prepareEnvironment: vi.fn(),
  cleanupEnvironment: vi.fn()
}));

vi.mock('../../src/executor/verifier.js', () => ({
  verifyAssertions: vi.fn()
}));

vi.mock('../../src/output/logger.js', () => ({
  logger: {
    startSuite: vi.fn(),
    startScenario: vi.fn(),
    endScenario: vi.fn(),
    startEnvironmentPrep: vi.fn(),
    setupCopy: vi.fn(),
    setupRun: vi.fn(),
    endEnvironmentPrep: vi.fn(),
    startStep: vi.fn(),
    showProgress: vi.fn(),
    endStep: vi.fn(),
    cleanup: vi.fn(),
    error: vi.fn(),
    summary: vi.fn()
  }
}));

import { parseAndValidateYaml } from '../../src/parser/yaml.js';
import { createRunner } from '../../src/runner/factory.js';
import { prepareEnvironment, cleanupEnvironment } from '../../src/executor/fixture.js';
import { verifyAssertions } from '../../src/executor/verifier.js';
import { logger } from '../../src/output/logger.js';

describe('run command', () => {
  const mockRunner = {
    runnerType: 'opencode',
    run: vi.fn(),
    exportSession: vi.fn(),
    listSessions: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);

    // Setup mock runner
    vi.mocked(createRunner).mockReturnValue(mockRunner as any);
    mockRunner.run.mockClear();
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should run a single test file', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test-suite',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Create file',
          expected: [{ should_call_tool: 'Write' }],
          timeout: 60000
        }]
      }],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    mockRunner.run.mockReturnValue({
      outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([
      { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
    ]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(result.suite.name).toBe('test-suite');
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].status).toBe('passed');
  });

  it('should filter scenarios when --scenario is specified', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [
        { name: 'scenario-1', environment: 'default', cleanup: true, steps: [] },
        { name: 'scenario-2', environment: 'default', cleanup: true, steps: [] }
      ],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath, { scenario: 'scenario-1' });

    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].name).toBe('scenario-1');
  });

  it('should cleanup environment after scenario', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'cleanup-test',
        environment: 'default',
        cleanup: true,
        steps: []
      }],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await runTests(yamlPath);

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', true, 'cleanup-test');
  });

  it('should preserve temp directory when cleanup is false', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'no-cleanup',
        environment: 'default',
        cleanup: false,
        steps: []
      }],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', false, 'no-cleanup');
    expect(result.scenarios[0].tempDirectory).toBe('/tmp/test');
  });

  it('should handle scenario with empty assertions', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'empty-assertions',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Simple question',
          expected: [],  // empty assertions
          timeout: 60000
        }]
      }],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(mockRunner.run).mockReturnValue({
      outputs: [{ type: 'text', data: { content: 'Answer' }, session_id: 'ses_1', timestamp: 1 }],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    // Scenario with empty assertions should pass
    expect(result.scenarios[0].status).toBe('passed');
    expect(result.scenarios[0].steps[0].assertions).toHaveLength(0);
  });

  // Logger integration tests
  describe('Logger integration', () => {
    it('should call logger.startSuite with suite name and scenario count', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'my-test-suite',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [
          { name: 'scenario-1', environment: 'default', cleanup: true, steps: [] },
          { name: 'scenario-2', environment: 'default', cleanup: true, steps: [] }
        ],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(logger.startSuite).toHaveBeenCalledWith('my-test-suite', 2);
    });

    it('should call logger.startScenario and endScenario for each scenario', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [
          { name: 'first-scenario', environment: 'default', cleanup: true, steps: [] },
          { name: 'second-scenario', environment: 'default', cleanup: true, steps: [] }
        ],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(logger.startScenario).toHaveBeenCalledTimes(2);
      expect(logger.startScenario).toHaveBeenNthCalledWith(1, 'first-scenario', 1, 2);
      expect(logger.startScenario).toHaveBeenNthCalledWith(2, 'second-scenario', 2, 2);

      expect(logger.endScenario).toHaveBeenCalledTimes(2);
      expect(logger.endScenario).toHaveBeenNthCalledWith(1, 'first-scenario', true, expect.any(Number));
      expect(logger.endScenario).toHaveBeenNthCalledWith(2, 'second-scenario', true, expect.any(Number));
    });

    it('should call logger.startStep, showProgress, endStep for each step', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'multi-step-scenario',
          environment: 'default',
          cleanup: true,
          steps: [
            { input: 'Step 1', expected: [{ should_call_tool: 'Write' }], timeout: 60000 },
            { input: 'Step 2', expected: [{ should_call_tool: 'Read' }], timeout: 60000 }
          ]
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(mockRunner.run).mockReturnValue({
        outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([
        { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
      ]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(logger.startStep).toHaveBeenCalledTimes(2);
      expect(logger.startStep).toHaveBeenNthCalledWith(1, 'multi-step-scenario', 'Step 1', 1, 2);
      expect(logger.startStep).toHaveBeenNthCalledWith(2, 'multi-step-scenario', 'Step 2', 2, 2);

      expect(logger.showProgress).toHaveBeenCalledTimes(2);
      expect(logger.showProgress).toHaveBeenNthCalledWith(1, 'multi-step-scenario', 'executing...');
      expect(logger.showProgress).toHaveBeenNthCalledWith(2, 'multi-step-scenario', 'executing...');

      expect(logger.endStep).toHaveBeenCalledTimes(2);
      expect(logger.endStep).toHaveBeenNthCalledWith(1, 'multi-step-scenario', true, 1, 2, expect.any(Number));
      expect(logger.endStep).toHaveBeenNthCalledWith(2, 'multi-step-scenario', true, 2, 2, expect.any(Number));
    });

    it('should call logger.error on step execution errors', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'error-scenario',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Failing step',
            expected: [],
            timeout: 60000
          }]
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(mockRunner.run).mockImplementation(() => {
        throw new Error('Execution failed');
      });

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(logger.error).toHaveBeenCalledWith('error-scenario', 'Execution failed');
      expect(logger.endStep).toHaveBeenCalledWith('error-scenario', false, 1, 1, expect.any(Number));
    });

    it('should call logger.summary with correct passed/failed counts', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [
          { name: 'passed-scenario', environment: 'default', cleanup: true, steps: [] }
        ],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(logger.summary).toHaveBeenCalledWith(1, 0, expect.any(Number));
    });

    it('should call logger.summary with failed count when scenario fails', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'failing-scenario',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Will fail',
            expected: [{ should_call_tool: 'Write' }],
            timeout: 60000
          }]
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(mockRunner.run).mockReturnValue({
        outputs: [{ type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 }],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([
        { type: 'should_call_tool', value: 'Write', passed: false, message: 'Tool not called' }
      ]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(logger.summary).toHaveBeenCalledWith(0, 1, expect.any(Number));
    });

    it('should pass scenarioName to cleanupEnvironment', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'my-scenario',
          environment: 'default',
          cleanup: true,
          steps: []
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', true, 'my-scenario');
    });
  });

  // Runner integration tests
  describe('runner integration', () => {
    it('should create runner from suite config', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: { default: { directory: './test', setup: [] } },
        scenarios: [{
          name: 'scenario-1',
          environment: 'default',
          cleanup: true,
          steps: [{ input: 'Test', expected: [], timeout: 60000 }]
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'mycode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      mockRunner.run.mockReturnValue({
        outputs: [],
        sessionId: 'ses_1'
      });

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(createRunner).toHaveBeenCalledWith({
        runner: 'opencode',
        command: 'mycode'
      });
    });

    it('should call runner.run with correct options', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: { default: { directory: './test', setup: [] } },
        scenarios: [{
          name: 'scenario-1',
          environment: 'default',
          cleanup: true,
          steps: [{ input: 'Test input', expected: [], timeout: 30000 }]
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test-dir' });
      mockRunner.run.mockReturnValue({
        outputs: [],
        sessionId: 'ses_1'
      });

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      expect(mockRunner.run).toHaveBeenCalledWith({
        input: 'Test input',
        directory: '/tmp/test-dir',
        sessionId: undefined,
        fork: false,
        timeout: 30000,
        model: undefined,
        agent: undefined
      });
    });

    it('should pass sessionId to runner.run for subsequent steps', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: { default: { directory: './test', setup: [] } },
        scenarios: [{
          name: 'multi-step',
          environment: 'default',
          cleanup: true,
          steps: [
            { input: 'Step 1', expected: [], timeout: 60000 },
            { input: 'Step 2', expected: [], timeout: 60000 }
          ]
        }],
        config: {
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

      let callCount = 0;
      mockRunner.run.mockImplementation(() => {
        callCount++;
        return {
          outputs: [],
          sessionId: `ses_${callCount}`
        };
      });

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      // First call should have no sessionId, second should have sessionId from first call
      expect(mockRunner.run).toHaveBeenCalledTimes(2);
      expect(mockRunner.run).toHaveBeenNthCalledWith(1, expect.objectContaining({
        sessionId: undefined,
        fork: false
      }));
      expect(mockRunner.run).toHaveBeenNthCalledWith(2, expect.objectContaining({
        sessionId: 'ses_1',
        fork: true
      }));
    });
  });

  // Probabilistic test execution tests
  describe('probabilistic test execution', () => {
    it('should run scenario multiple times based on runs config', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'multi-run-scenario',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Create file',
            expected: [{ should_call_tool: 'Write' }],
            timeout: 60000
          }]
        }],
        config: {
          runs: 3,
          min_pass: 2,
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      mockRunner.run.mockReturnValue({
        outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([
        { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
      ]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      const result = await runTests(yamlPath);

      expect(result.scenarios[0].status).toBe('passed');
      expect(result.scenarios[0].runs).toBe(3);
    });

    it('should use scenario-level runs/min_pass override', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'override-scenario',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Test',
            expected: [],
            timeout: 60000
          }],
          runs: 2,
          min_pass: 2
        }],
        config: {
          runs: 10,
          min_pass: 8,
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      mockRunner.run.mockReturnValue({
        outputs: [],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      const result = await runTests(yamlPath);

      expect(result.scenarios[0].status).toBe('passed');
      expect(result.scenarios[0].runs).toBe(2);
      expect(result.scenarios[0].min_pass).toBe(2);
    });

    it('should support CLI --runs and --min-pass overrides', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'cli-override',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Test',
            expected: [],
            timeout: 60000
          }]
        }],
        config: {
          runs: 10,
          min_pass: 8,
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      mockRunner.run.mockReturnValue({
        outputs: [],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      const result = await runTests(yamlPath, { runs: 1, min_pass: 1 });

      expect(result.scenarios[0].status).toBe('passed');
      expect(result.scenarios[0].runs).toBe(1);
    });

    it('should support --quick mode for single run', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'quick-test',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Test',
            expected: [],
            timeout: 60000
          }]
        }],
        config: {
          runs: 10,
          min_pass: 8,
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      mockRunner.run.mockReturnValue({
        outputs: [],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      const result = await runTests(yamlPath, { quick: true });

      expect(result.scenarios[0].status).toBe('passed');
      expect(result.scenarios[0].runs).toBe(1);
    });

    it('should showProgress for each run with step and run progress format', async () => {
      const mockSuite: YamlTestSuite = {
        name: 'test',
        environments: {
          default: { directory: './test', setup: [] }
        },
        scenarios: [{
          name: 'multi-run-progress',
          environment: 'default',
          cleanup: true,
          steps: [{
            input: 'Create file',
            expected: [{ should_call_tool: 'Write' }],
            timeout: 60000
          }]
        }],
        config: {
          runs: 3,
          min_pass: 2,
          agent_cli: { runner: 'opencode', command: 'opencode' }
        }
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      mockRunner.run.mockReturnValue({
        outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
        sessionId: 'ses_1'
      });
      vi.mocked(verifyAssertions).mockResolvedValue([
        { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
      ]);

      const yamlPath = path.join(TEST_DIR, 'test.yaml');
      await fs.writeFile(yamlPath, 'name: test');

      await runTests(yamlPath);

      // startStep 只在第一次运行时调用
      expect(logger.startStep).toHaveBeenCalledTimes(1);
      expect(logger.startStep).toHaveBeenCalledWith('multi-run-progress', 'Create file', 1, 1);

      // showProgress 每次运行都调用（3 次）
      expect(logger.showProgress).toHaveBeenCalledTimes(3);
      expect(logger.showProgress).toHaveBeenNthCalledWith(1, 'multi-run-progress', 'Step 1/1, Run 1/3...');
      expect(logger.showProgress).toHaveBeenNthCalledWith(2, 'multi-run-progress', 'Step 1/1, Run 2/3...');
      expect(logger.showProgress).toHaveBeenNthCalledWith(3, 'multi-run-progress', 'Step 1/1, Run 3/3...');

      // endStep 只在第一次运行时调用
      expect(logger.endStep).toHaveBeenCalledTimes(1);
    });
  });
});