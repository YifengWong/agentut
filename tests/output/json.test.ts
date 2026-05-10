import { describe, it, expect } from 'vitest';
import { generateTestResult, formatTimestamp } from '../../src/output/json.js';
import type {
  ScenarioResult,
  StepResult,
  YamlTestSuite,
  AssertionSummary
} from '../../src/types/index.js';

describe('formatTimestamp', () => {
  it('should format date as ISO 8601', () => {
    const date = new Date('2026-03-29T10:30:00Z');
    const result = formatTimestamp(date);
    expect(result).toBe('2026-03-29T10:30:00.000Z');
  });
});

describe('generateTestResult', () => {
  it('should generate complete test result', () => {
    const suite: YamlTestSuite = {
      name: 'test-suite',
      description: 'A test suite',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario-1',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: []
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml', 85);

    expect(result.suite.name).toBe('test-suite');
    expect(result.suite.description).toBe('A test suite');
    expect(result.suite.file).toBe('./test.yaml');
    expect(result.summary.total_scenarios).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.scenarios).toHaveLength(1);
    expect(result.total_score).toBe(85);
  });

  it('should calculate summary correctly', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      { name: 's1', environment: 'e1', status: 'passed', duration_ms: 100, steps: [] },
      { name: 's2', environment: 'e1', status: 'passed', duration_ms: 200, steps: [] },
      { name: 's3', environment: 'e1', status: 'failed', duration_ms: 300, steps: [] },
      { name: 's4', environment: 'e1', status: 'failed', duration_ms: 400, steps: [] },
      { name: 's5', environment: 'e1', status: 'failed', duration_ms: 500, steps: [] }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml', 75);

    expect(result.summary.total_scenarios).toBe(5);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(3);
    expect(result.summary.duration_ms).toBe(1500);
    expect(result.total_score).toBe(75);
  });

  it('should handle empty scenarios', () => {
    const suite: YamlTestSuite = {
      name: 'empty',
      environments: {},
      scenarios: []
    };

    const result = generateTestResult(suite, [], './test.yaml');

    expect(result.summary.total_scenarios).toBe(0);
    expect(result.summary.passed).toBe(0);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.duration_ms).toBe(0);
    expect(result.total_score).toBe(0);
  });

  it('should include error message for failed scenarios', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'failed-scenario',
        environment: 'default',
        status: 'failed',
        duration_ms: 100,
        steps: [],
        error: 'Assertion failed: response_contains'
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].error).toBe('Assertion failed: response_contains');
  });

  it('should include temp directory for non-cleanup scenarios', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 100,
        steps: [],
        tempDirectory: '/tmp/test-123'
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].tempDirectory).toBe('/tmp/test-123');
  });

  it('should generate valid ISO 8601 timestamp', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const result = generateTestResult(suite, [], './test.yaml');

    // Validate ISO 8601 format
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    expect(result.summary.timestamp).toMatch(dateRegex);
  });

  it('should include step details', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const steps: StepResult[] = [
      {
        input: 'Create file',
        status: 'passed',
        duration_ms: 500,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool Write was called' }
        ]
      }
    ];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 500,
        steps
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].steps).toHaveLength(1);
    expect(result.scenarios[0].steps[0].input).toBe('Create file');
    expect(result.scenarios[0].steps[0].assertions).toHaveLength(1);
  });
});

describe('probabilistic test result output', () => {
  it('should include runs and min_pass in scenario result', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const steps: StepResult[] = [{
      input: 'Create file',
      status: 'passed',
      duration_ms: 4100,
      assertions: [],
      runs: [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] },
        { run_index: 3, status: 'failed', duration_ms: 2000, assertions: [] }
      ],
      summary: {
        total_runs: 3,
        passed_runs: 2,
        min_pass: 2,
        status: 'passed'
      }
    }];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 4100,
        steps,
        runs: 3,
        min_pass: 2,
        passed_runs: 2
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].runs).toBe(3);
    expect(result.scenarios[0].min_pass).toBe(2);
    expect(result.scenarios[0].passed_runs).toBe(2);
    expect(result.scenarios[0].steps[0].runs).toHaveLength(3);
    expect(result.scenarios[0].steps[0].summary?.status).toBe('passed');
  });

  it('should include assertion summaries with pass rates', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const assertionSummaries: AssertionSummary[] = [
      {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 2,
        passed_runs: 1,
        status: 'failed',
        failures: [
          { run_index: 2, message: 'Not called' }
        ]
      }
    ];

    const steps: StepResult[] = [{
      input: 'Create file',
      status: 'failed',
      duration_ms: 3000,
      assertions: [],
      runs: [
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
          ]
        },
        {
          run_index: 2,
          status: 'failed',
          duration_ms: 2000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: false, message: 'Not called' }
          ]
        }
      ],
      summary: {
        total_runs: 2,
        passed_runs: 1,
        min_pass: 2,
        status: 'failed'
      },
      assertionSummaries
    }];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'failed',
        duration_ms: 3000,
        steps,
        runs: 2,
        min_pass: 2,
        passed_runs: 1
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    const assertionSummary = result.scenarios[0].steps[0].assertionSummaries?.[0];
    expect(assertionSummary?.type).toBe('should_call_tool');
    expect(assertionSummary?.passed_runs).toBe(1);
    expect(assertionSummary?.min_pass).toBe(2);
    expect(assertionSummary?.status).toBe('failed');
    expect(assertionSummary?.failures).toHaveLength(1);
  });
});