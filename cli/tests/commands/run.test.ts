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

import { parseAndValidateYaml } from '../../src/parser/yaml.js';
import { runOpenCode } from '../../src/executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../../src/executor/fixture.js';
import { verifyAssertions } from '../../src/executor/verifier.js';

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

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', true);
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

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', false);
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
});