import { describe, it, expect } from 'vitest';
import { formatAsJest } from '../../../src/output/formatters/jest.js';
import type { TestResult } from '../../../src/types/index.js';

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