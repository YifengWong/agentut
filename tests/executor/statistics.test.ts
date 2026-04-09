import { describe, it, expect } from 'vitest';
import {
  calculateStepSummary,
  calculateAssertionSummaries,
  determineScenarioStatus,
  type RunExecutionWithAssertions
} from '../../src/executor/statistics.js';
import type { AssertionResult, Assertion } from '../../src/types/index.js';

describe('statistics module', () => {
  describe('calculateStepSummary', () => {
    it('should calculate passed_runs from run executions', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] },
        { run_index: 3, status: 'failed', duration_ms: 2000, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 3);

      expect(summary.total_runs).toBe(3);
      expect(summary.passed_runs).toBe(2);
      expect(summary.min_pass).toBe(3);
      expect(summary.status).toBe('failed'); // 2 < 3
    });

    it('should return passed when passed_runs >= min_pass', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] },
        { run_index: 3, status: 'failed', duration_ms: 2000, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 2);

      expect(summary.passed_runs).toBe(2);
      expect(summary.status).toBe('passed'); // 2 >= 2
    });

    it('should handle all passed runs', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 2);

      expect(summary.passed_runs).toBe(2);
      expect(summary.status).toBe('passed');
    });

    it('should handle all failed runs', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'failed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'failed', duration_ms: 1100, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 1);

      expect(summary.passed_runs).toBe(0);
      expect(summary.status).toBe('failed');
    });

    it('should handle empty runs array', () => {
      const summary = calculateStepSummary([], 1);

      expect(summary.total_runs).toBe(0);
      expect(summary.passed_runs).toBe(0);
      expect(summary.status).toBe('failed');
    });
  });

  describe('calculateAssertionSummaries', () => {
    const createAssertionResult = (
      type: string,
      value: any,
      passed: boolean,
      message?: string
    ): AssertionResult => ({
      type,
      value,
      passed,
      message: message || (passed ? 'OK' : 'Failed')
    });

    it('should calculate assertion pass rates', () => {
      const runs: RunExecutionWithAssertions[] = [
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true),
            createAssertionResult('response_contains', 'done', true)
          ]
        },
        {
          run_index: 2,
          status: 'passed',
          duration_ms: 1100,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true),
            createAssertionResult('response_contains', 'done', false, 'Not found')
          ]
        },
        {
          run_index: 3,
          status: 'failed',
          duration_ms: 2000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', false, 'Tool not called'),
            createAssertionResult('response_contains', 'done', false, 'Not found')
          ]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { response_contains: 'done' }
      ];

      const summaries = calculateAssertionSummaries(runs, assertions, 2);

      expect(summaries).toHaveLength(2);

      // should_call_tool: 2/3 passed
      expect(summaries[0].type).toBe('should_call_tool');
      expect(summaries[0].passed_runs).toBe(2);
      expect(summaries[0].min_pass).toBe(2);
      expect(summaries[0].status).toBe('passed');

      // response_contains: 1/3 passed
      expect(summaries[1].type).toBe('response_contains');
      expect(summaries[1].passed_runs).toBe(1);
      expect(summaries[1].status).toBe('failed');
    });

    it('should use assertion-level min_pass when provided', () => {
      const runs: RunExecutionWithAssertions[] = [
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true)
          ]
        },
        {
          run_index: 2,
          status: 'passed',
          duration_ms: 1100,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', false, 'Failed')
          ]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write', min_pass: 2 }
      ];

      const summaries = calculateAssertionSummaries(runs, assertions, 1);

      expect(summaries[0].min_pass).toBe(2);
      expect(summaries[0].passed_runs).toBe(1);
      expect(summaries[0].status).toBe('failed');
    });

    it('should collect failure details', () => {
      const runs: RunExecutionWithAssertions[] = [
        {
          run_index: 1,
          status: 'failed',
          duration_ms: 1000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', false, 'Tool not called')
          ]
        },
        {
          run_index: 2,
          status: 'passed',
          duration_ms: 1100,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true)
          ]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' }
      ];

      const summaries = calculateAssertionSummaries(runs, assertions, 1);

      expect(summaries[0].failures).toHaveLength(1);
      expect(summaries[0].failures[0].run_index).toBe(1);
      expect(summaries[0].failures[0].message).toBe('Tool not called');
    });

    it('should handle empty assertions', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] }
      ];

      const summaries = calculateAssertionSummaries(runs, [], 1);

      expect(summaries).toHaveLength(0);
    });
  });

  describe('determineScenarioStatus', () => {
    it('should pass when step summary passes and all assertions pass', () => {
      const stepSummary = { total_runs: 3, passed_runs: 3, min_pass: 2, status: 'passed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 2, passed_runs: 3, status: 'passed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('passed');
    });

    it('should fail when step summary fails', () => {
      const stepSummary = { total_runs: 3, passed_runs: 1, min_pass: 2, status: 'failed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 2, passed_runs: 3, status: 'passed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('failed');
    });

    it('should fail when any assertion fails', () => {
      const stepSummary = { total_runs: 3, passed_runs: 3, min_pass: 2, status: 'passed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 3, passed_runs: 2, status: 'failed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('failed');
    });

    it('should pass with edge case: exactly min_pass', () => {
      const stepSummary = { total_runs: 10, passed_runs: 8, min_pass: 8, status: 'passed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 8, passed_runs: 8, status: 'passed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('passed');
    });
  });
});