import { describe, it, expect } from 'vitest';
import { formatAsHtml, formatSessionOutputHtml, formatRunsDetailHtml } from '../../../src/output/formatters/html.js';
import type { TestResult, OpenCodeRunOutput, RunExecution, StepSummary, AssertionSummary } from '../../../src/types/index.js';

describe('formatAsHtml', () => {
  it('should generate complete HTML document', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('should include CSS styles', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<style>');
    expect(html).toContain('font-family');
  });

  it('should use different colors for passed/failed', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 0, timestamp: '' },
      scenarios: [
        { name: 'passed', environment: 'e', status: 'passed', duration_ms: 0, steps: [] },
        { name: 'failed', environment: 'e', status: 'failed', duration_ms: 0, steps: [] }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('status-passed');
    expect(html).toContain('status-failed');
  });

  it('should include scenario details', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'test-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Create file',
              status: 'passed',
              duration_ms: 50,
              assertions: [
                { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
              ]
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('test-scenario');
    expect(html).toContain('Create file');
    expect(html).toContain('Write');
  });

  it('should support responsive layout', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('width=device-width');
  });

  it('should display multiple steps in a scenario', () => {
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
              status: 'passed',
              duration_ms: 100,
              assertions: [{ type: 'response_contains', value: 'success', passed: true, message: 'Found' }]
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('1. Input: "Step 1 input"');
    expect(html).toContain('2. Input: "Step 2 input"');
    expect(html).toContain('should_call_tool: Write');
    expect(html).toContain('response_contains: success');
  });

  it('should display session output for each step in multi-step scenario', () => {
    const step1Output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Step 1 response' } },
      { type: 'tool_use', part: { tool: 'write', state: { status: 'completed', input: { file: 'a.txt' } } } }
    ];
    const step2Output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Step 2 response' } },
      { type: 'tool_use', part: { tool: 'read', state: { status: 'completed', input: { file: 'b.txt' } } } }
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
              actual_output: step1Output
            },
            {
              input: 'Read file',
              status: 'passed',
              duration_ms: 100,
              assertions: [],
              actual_output: step2Output
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    // Step 1 session output
    expect(html).toContain('<blockquote>Create file</blockquote>');
    expect(html).toContain('Step 1 response');
    expect(html).toContain('<td>write</td>');

    // Step 2 session output
    expect(html).toContain('<blockquote>Read file</blockquote>');
    expect(html).toContain('Step 2 response');
    expect(html).toContain('<td>read</td>');

    // Both step-session divs should exist
    const sessionDivCount = (html.match(/class="step-session"/g) || []).length;
    expect(sessionDivCount).toBe(2);
  });
});

// Test fixtures for formatSessionOutputHtml
const mockSessionOutput: OpenCodeRunOutput[] = [
  { type: 'text', part: { text: '好的，我来帮你创建这个文件。' } },
  { type: 'tool_use', part: { tool: 'write', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt', content: 'Hello World' }
  }}}
];

const mockErrorOutput: OpenCodeRunOutput[] = [
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'error',
    input: { filePath: '/nonexistent.txt' },
    error: 'File not found'
  }}}
];

describe('formatSessionOutputHtml', () => {
  it('should format complete session with proper HTML structure', () => {
    const result = formatSessionOutputHtml(mockSessionOutput, '创建文件');
    expect(result).toContain('<div class="step-session">');
    expect(result).toContain('<div class="session-request">');
    expect(result).toContain('<div class="session-response">');
    expect(result).toContain('<div class="session-tool-calls">');
    expect(result).toContain('<td>write</td>');
    expect(result).toContain('✓ completed');
  });

  it('should escape HTML special characters', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Test <script>alert("xss")</script>' } }
    ];
    const result = formatSessionOutputHtml(output, 'test');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('should escape XSS in request parameter', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Normal response' } }
    ];
    const result = formatSessionOutputHtml(output, 'Test <script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>alert');
  });

  it('should format error status', () => {
    const result = formatSessionOutputHtml(mockErrorOutput, '读取文件');
    expect(result).toContain('✗ error');
    expect(result).toContain('File not found');
  });

  it('should return empty string for empty output', () => {
    const result = formatSessionOutputHtml([], 'test');
    expect(result).toBe('');
  });

  it('should return empty string for undefined input', () => {
    const result = formatSessionOutputHtml(undefined, 'test');
    expect(result).toBe('');
  });

  it('should include raw output in collapsible details', () => {
    const result = formatSessionOutputHtml(mockSessionOutput, 'test');
    expect(result).toContain('<details class="session-raw">');
    expect(result).toContain('<summary>Raw Output</summary>');
  });
});

describe('formatRunsDetailHtml', () => {
  it('should display runs summary for probabilistic test', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 100, assertions: [] },
      { run_index: 1, status: 'passed', duration_ms: 120, assertions: [] },
      { run_index: 2, status: 'failed', duration_ms: 80, assertions: [], error: 'Timeout' }
    ];
    const summary: StepSummary = { total_runs: 3, passed_runs: 2, min_pass: 2, status: 'passed' };

    const result = formatRunsDetailHtml(runs, summary);

    expect(result).toContain('运行统计');
    expect(result).toContain('3 次运行');
    expect(result).toContain('2 次通过');
    expect(result).toContain('要求 ≥ 2');
    expect(result).toContain('运行详情');
    expect(result).toContain('<details');
    expect(result).toContain('运行 1');
    expect(result).toContain('运行 2');
    expect(result).toContain('运行 3');
  });

  it('should display each run with collapsible details', () => {
    const runs: RunExecution[] = [
      {
        run_index: 0,
        status: 'passed',
        duration_ms: 100,
        assertions: [],
        output: [{ type: 'text', part: { text: 'Session output for run 1' } }]
      },
      {
        run_index: 1,
        status: 'passed',
        duration_ms: 120,
        assertions: [],
        output: [{ type: 'text', part: { text: 'Session output for run 2' } }]
      }
    ];
    const summary: StepSummary = { total_runs: 2, passed_runs: 2, min_pass: 1, status: 'passed' };

    const result = formatRunsDetailHtml(runs, summary);

    expect(result).toContain('<details class="run-item');
    expect(result).toContain('<summary class="run-header">');
    expect(result).toContain('Session output for run 1');
    expect(result).toContain('Session output for run 2');
  });

  it('should display error message for failed runs', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 100, assertions: [] },
      { run_index: 1, status: 'failed', duration_ms: 80, assertions: [], error: 'Connection timeout' }
    ];
    const summary: StepSummary = { total_runs: 2, passed_runs: 1, min_pass: 2, status: 'failed' };

    const result = formatRunsDetailHtml(runs, summary);

    expect(result).toContain('run-item failed');
    expect(result).toContain('Connection timeout');
  });

  it('should not display runs section for single-run scenario', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 100, assertions: [] }
    ];
    const summary: StepSummary = { total_runs: 1, passed_runs: 1, min_pass: 1, status: 'passed' };

    const result = formatRunsDetailHtml(runs, summary);

    expect(result).not.toContain('运行统计');
    expect(result).not.toContain('运行详情');
    expect(result).toBe('');
  });

  it('should return empty string for empty runs', () => {
    const runs: RunExecution[] = [];
    const summary: StepSummary = { total_runs: 0, passed_runs: 0, min_pass: 0, status: 'passed' };

    const result = formatRunsDetailHtml(runs, summary);

    expect(result).toBe('');
  });

  it('should display assertion summaries in runs summary', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 100, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true }
      ] },
      { run_index: 1, status: 'passed', duration_ms: 120, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true }
      ] }
    ];
    const summary: StepSummary = { total_runs: 2, passed_runs: 2, min_pass: 1, status: 'passed' };
    const assertionSummaries: AssertionSummary[] = [
      { type: 'should_call_tool', value: 'Write', min_pass: 1, passed_runs: 2, status: 'passed', failures: [] }
    ];

    const result = formatRunsDetailHtml(runs, summary, assertionSummaries);

    expect(result).toContain('断言统计');
    expect(result).toContain('should_call_tool');
    expect(result).toContain('Write');
    expect(result).toContain('2/2');
  });

  it('should display assertion with partial pass rate', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 100, assertions: [
        { type: 'response_contains', value: 'success', passed: true }
      ] },
      { run_index: 1, status: 'failed', duration_ms: 80, assertions: [
        { type: 'response_contains', value: 'success', passed: false }
      ] }
    ];
    const summary: StepSummary = { total_runs: 2, passed_runs: 1, min_pass: 2, status: 'failed' };
    const assertionSummaries: AssertionSummary[] = [
      { type: 'response_contains', value: 'success', min_pass: 2, passed_runs: 1, status: 'failed', failures: [
        { run_index: 1, message: 'Expected "success" not found' }
      ] }
    ];

    const result = formatRunsDetailHtml(runs, summary, assertionSummaries);

    expect(result).toContain('1/2');
    expect(result).toContain('assertion-summary-failed');
  });
});