import { describe, it, expect } from 'vitest';
import { formatAsJest } from '../../../src/output/formatters/jest.js';
import type { TestResult, AssertionSummary } from '../../../src/types/index.js';

describe('formatAsJest', () => {
  it('should generate Jest-compatible format', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 'scenario-1', environment: 'e', status: 'passed', duration_ms: 100, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest).toHaveProperty('success');
    expect(jest).toHaveProperty('startTime');
    expect(jest).toHaveProperty('numTotalTests');
    expect(jest).toHaveProperty('numPassedTests');
    expect(jest).toHaveProperty('numFailedTests');
    expect(jest).toHaveProperty('testResults');
  });

  it('should map scenario names to test names', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 'my-test-scenario', environment: 'e', status: 'passed', duration_ms: 100, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].name).toContain('my-test-scenario');
  });

  it('should map passed/failed status correctly', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 200, timestamp: '' },
      scenarios: [
        { name: 'passed-test', environment: 'e', status: 'passed', duration_ms: 100, steps: [] },
        { name: 'failed-test', environment: 'e', status: 'failed', duration_ms: 100, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.numPassedTests).toBe(1);
    expect(jest.numFailedTests).toBe(1);
    expect(jest.testResults[0].status).toBe('passed');
    expect(jest.testResults[1].status).toBe('failed');
  });

  it('should map duration to Jest format', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1500, timestamp: '' },
      scenarios: [
        { name: 'test', environment: 'e', status: 'passed', duration_ms: 1500, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    // Jest uses seconds, we use ms
    expect(jest.testResults[0].duration).toBe(1500);
    expect(jest.testResults[0].endTime).toBeGreaterThan(jest.testResults[0].startTime);
  });

  it('should map error messages to failureMessages', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'failed-test',
          environment: 'e',
          status: 'failed',
          duration_ms: 100,
          steps: [],
          error: 'Assertion failed: missing file'
        }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].failureMessages).toContain('Assertion failed: missing file');
  });

  it('should calculate overall success correctly', () => {
    const passedResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 2, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 't1', environment: 'e', status: 'passed', duration_ms: 50, steps: [] },
        { name: 't2', environment: 'e', status: 'passed', duration_ms: 50, steps: [] }
      ]
    };

    const failedResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 't1', environment: 'e', status: 'passed', duration_ms: 50, steps: [] },
        { name: 't2', environment: 'e', status: 'failed', duration_ms: 50, steps: [] }
      ]
    };

    expect(formatAsJest(passedResult).success).toBe(true);
    expect(formatAsJest(failedResult).success).toBe(false);
  });
});

describe('assertion-level results', () => {
  it('should generate assertion-level results for probabilistic test', () => {
    const assertionSummaries: AssertionSummary[] = [
      {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 2,
        passed_runs: 3,
        status: 'passed',
        failures: []
      },
      {
        type: 'file_content_contains',
        value: { file: 'test.txt', text: 'hello' },
        min_pass: 2,
        passed_runs: 1,
        status: 'failed',
        failures: [
          { run_index: 2, message: 'File content mismatch' },
          { run_index: 3, message: 'File not found' }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'my-scenario',
          environment: 'e',
          status: 'failed',
          duration_ms: 100,
          steps: [
            {
              input: 'test input',
              status: 'failed',
              duration_ms: 100,
              assertions: [],
              assertionSummaries
            }
          ],
          runs: 3,
          min_pass: 2,
          passed_runs: 1
        }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].assertionResults).toBeDefined();
    expect(jest.testResults[0].assertionResults.length).toBe(2);

    // First assertion passed
    const firstAssertion = jest.testResults[0].assertionResults[0];
    expect(firstAssertion.status).toBe('passed');
    expect(firstAssertion.title).toContain('should_call_tool');
    expect(firstAssertion.failureMessages).toHaveLength(0);

    // Second assertion failed
    const secondAssertion = jest.testResults[0].assertionResults[1];
    expect(secondAssertion.status).toBe('failed');
    expect(secondAssertion.failureMessages.length).toBeGreaterThan(0);
    expect(secondAssertion.failureMessages[0]).toContain('1/3 passed');
    expect(secondAssertion.failureMessages[0]).toContain('required >= 2');
    expect(secondAssertion.failureMessages.some(m => m.includes('Run 2'))).toBe(true);
  });

  it('should generate assertion-level results for traditional single-run test', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'traditional-test',
          environment: 'e',
          status: 'failed',
          duration_ms: 100,
          steps: [
            {
              input: 'test input',
              status: 'failed',
              duration_ms: 50,
              assertions: [
                {
                  type: 'should_call_tool',
                  value: 'Read',
                  passed: true
                },
                {
                  type: 'file_content_contains',
                  value: { file: 'output.txt', text: 'expected' },
                  passed: false,
                  message: 'File content does not contain expected text'
                }
              ]
            }
          ]
        }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].assertionResults.length).toBe(2);

    const firstAssertion = jest.testResults[0].assertionResults[0];
    expect(firstAssertion.status).toBe('passed');

    const secondAssertion = jest.testResults[0].assertionResults[1];
    expect(secondAssertion.status).toBe('failed');
    expect(secondAssertion.failureMessages).toContain('File content does not contain expected text');
  });

  it('should include fullName with scenario name', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'my-scenario',
          environment: 'e',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'test',
              status: 'passed',
              duration_ms: 100,
              assertions: [
                {
                  type: 'should_call_tool',
                  value: 'Write',
                  passed: true
                }
              ]
            }
          ]
        }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].assertionResults[0].fullName).toBe('my-scenario - should_call_tool: Write');
    expect(jest.testResults[0].assertionResults[0].ancestorTitles).toEqual(['my-scenario']);
  });

  it('should aggregate all failure messages at scenario level', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'multi-failure-scenario',
          environment: 'e',
          status: 'failed',
          duration_ms: 100,
          steps: [
            {
              input: 'test',
              status: 'failed',
              duration_ms: 100,
              assertions: [
                {
                  type: 'should_call_tool',
                  value: 'Read',
                  passed: false,
                  message: 'Tool Read was not called'
                },
                {
                  type: 'file_content_contains',
                  value: { file: 'test.txt', text: 'expected' },
                  passed: false,
                  message: 'File content mismatch'
                }
              ]
            }
          ]
        }
      ]
    };

    const jest = formatAsJest(result);

    // Scenario-level failureMessages should contain all assertion failures
    const scenarioFailureMessages = jest.testResults[0].failureMessages;
    expect(scenarioFailureMessages.some(m => m.includes('Tool Read was not called'))).toBe(true);
    expect(scenarioFailureMessages.some(m => m.includes('File content mismatch'))).toBe(true);
  });

  it('should handle empty assertions gracefully', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'empty-assertions',
          environment: 'e',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'test',
              status: 'passed',
              duration_ms: 100,
              assertions: []
            }
          ]
        }
      ]
    };

    const jest = formatAsJest(result);

    // Should have at least one assertionResult (default result for the scenario)
    expect(jest.testResults[0].assertionResults.length).toBeGreaterThanOrEqual(1);
  });
});