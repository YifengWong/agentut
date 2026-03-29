import { describe, it, expect } from 'vitest';
import { formatAsMarkdown } from '../../../src/output/formatters/markdown.js';
import type { TestResult, ScenarioResult, StepResult } from '../../../src/types/index.js';

describe('formatAsMarkdown', () => {
  it('should generate markdown format', () => {
    const result: TestResult = {
      suite: { name: 'test-suite', description: 'Test', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '2026-03-29T10:30:00Z' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('# Test Report: test-suite');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('1 passed');
    expect(markdown).toContain('0 failed');
  });

  it('should display pass/fail counts correctly', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 3, passed: 2, failed: 1, duration_ms: 300, timestamp: '' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('✓ 2 passed');
    expect(markdown).toContain('✗ 1 failed');
  });

  it('should display scenario details', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-1',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: []
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('### scenario-1');
    expect(markdown).toContain('✅ PASSED');
    expect(markdown).toContain('**Duration:** 100ms');
  });

  it('should display assertion results', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-1',
          environment: 'default',
          status: 'failed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test',
              status: 'failed',
              duration_ms: 50,
              assertions: [
                { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' },
                { type: 'response_contains', value: 'success', passed: false, message: 'Not found' }
              ]
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('should_call_tool: Write');
    expect(markdown).toContain('✓');
    expect(markdown).toContain('response_contains: success');
    expect(markdown).toContain('✗');
  });

  it('should display error for failed scenarios', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'failed-scenario',
          environment: 'default',
          status: 'failed',
          duration_ms: 100,
          steps: [],
          error: 'Assertion failed: missing file'
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('Error:');
    expect(markdown).toContain('Assertion failed: missing file');
  });

  it('should handle empty scenarios', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('No scenarios executed');
  });
});