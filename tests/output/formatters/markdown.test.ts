import { describe, it, expect } from 'vitest';
import { formatAsMarkdown } from '../../../src/output/formatters/markdown.js';
import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput } from '../../../src/types/index.js';

describe('formatAsMarkdown (simplified)', () => {
  it('should generate markdown format with basic structure', () => {
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

  it('should display runs info when multi-run scenario', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 500, timestamp: '' },
      scenarios: [
        {
          name: 'multi-run-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 500,
          runs: 5,
          passed_runs: 4,
          min_pass: 3,
          steps: []
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('**Runs:** 4/5 passed (min_pass: 3)');
  });

  it('should NOT display detailed assertions in simplified mode', () => {
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

    // Should NOT contain assertion details
    expect(markdown).not.toContain('Assertions:');
    expect(markdown).not.toContain('should_call_tool: Write');
    expect(markdown).not.toContain('response_contains: success');
  });

  it('should NOT display session output in simplified mode', () => {
    const stepOutput: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'AI response text' } },
      { type: 'tool_use', part: { tool: 'write', state: { status: 'completed', input: { file: 'test.txt' } } } }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-with-output',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Create file',
              status: 'passed',
              duration_ms: 50,
              assertions: [],
              actual_output: stepOutput
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Should NOT contain session output details
    expect(markdown).not.toContain('**Request:**');
    expect(markdown).not.toContain('**Response:**');
    expect(markdown).not.toContain('**Tool Calls:**');
    expect(markdown).not.toContain('AI response text');
    expect(markdown).not.toContain('| write |');
    expect(markdown).not.toContain('<details>');
    expect(markdown).not.toContain('Raw Output');
  });

  it('should display step status and duration only', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 200, timestamp: '' },
      scenarios: [
        {
          name: 'multi-step-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 200,
          steps: [
            {
              input: 'Step 1 input',
              status: 'passed',
              duration_ms: 100,
              assertions: [{ type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }]
            },
            {
              input: 'Step 2 input',
              status: 'failed',
              duration_ms: 100,
              assertions: [{ type: 'response_contains', value: 'success', passed: false, message: 'Found' }]
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Should show step inputs and status
    expect(markdown).toContain('1. **Input:** "Step 1 input"');
    expect(markdown).toContain('2. **Input:** "Step 2 input"');

    // Should show status with icons
    expect(markdown).toContain('- Status: ✓ passed');
    expect(markdown).toContain('- Status: ✗ failed');

    // Should show duration
    expect(markdown).toContain('- Duration: 100ms');

    // Should NOT show assertion details
    expect(markdown).not.toContain('Assertions:');
    expect(markdown).not.toContain('should_call_tool');
    expect(markdown).not.toContain('response_contains');
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

    expect(markdown).toContain('**Error:**');
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

  it('should display multiple steps in a scenario without detailed assertions', () => {
    const stepOutput: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Step 1 response' } },
      { type: 'tool_use', part: { tool: 'write', state: { status: 'completed', input: { file: 'a.txt' } } } }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 200, timestamp: '' },
      scenarios: [
        {
          name: 'multi-step-with-session',
          environment: 'default',
          status: 'passed',
          duration_ms: 200,
          steps: [
            {
              input: 'Create file',
              status: 'passed',
              duration_ms: 100,
              assertions: [],
              actual_output: stepOutput
            },
            {
              input: 'Read file',
              status: 'passed',
              duration_ms: 100,
              assertions: [],
              actual_output: []
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Should show step inputs
    expect(markdown).toContain('1. **Input:** "Create file"');
    expect(markdown).toContain('2. **Input:** "Read file"');

    // Should show status and duration
    expect(markdown).toContain('- Status: ✓ passed');
    expect(markdown).toContain('- Duration: 100ms');

    // Should NOT show session output
    expect(markdown).not.toContain('Step 1 response');
    expect(markdown).not.toContain('| write |');
    expect(markdown).not.toContain('> Create file');
  });

  it('should NOT display temp directory in simplified mode', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-with-temp',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          tempDirectory: '/tmp/test-123',
          steps: []
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Temp directory should not be displayed in simplified mode
    expect(markdown).not.toContain('Temp Directory');
    expect(markdown).not.toContain('/tmp/test-123');
  });

  it('should display scenario environment', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-1',
          environment: 'production',
          status: 'passed',
          duration_ms: 100,
          steps: []
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('**Environment:** production');
  });
});