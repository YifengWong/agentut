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

vi.mock('../../src/executor/opencode.js', () => ({
  runOpenCode: vi.fn()
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
import { runOpenCode } from '../../src/executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../../src/executor/fixture.js';
import { verifyAssertions } from '../../src/executor/verifier.js';
import { logger } from '../../src/output/logger.js';

describe('run command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
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
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(runOpenCode).mockReturnValue({
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
      ]
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
      }]
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
      }]
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
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(runOpenCode).mockReturnValue({
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
        ]
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
        ]
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
        }]
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(runOpenCode).mockReturnValue({
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
        }]
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(runOpenCode).mockImplementation(() => {
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
        ]
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
        }]
      };

      vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
      vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
      vi.mocked(runOpenCode).mockReturnValue({
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
        }]
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
});