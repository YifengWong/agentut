import { describe, it, expect } from 'vitest';
import { formatAsMarkdown, formatSessionOutputMarkdown } from '../../../src/output/formatters/markdown.js';
import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput, RunExecution, StepSummary } from '../../../src/types/index.js';

// Test fixtures for formatSessionOutputMarkdown
const mockSessionOutput: OpenCodeRunOutput[] = [
  { type: 'text', part: { text: '好的，我来帮你创建这个文件。' } },
  { type: 'tool_use', part: { tool: 'write', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt', content: 'Hello World' }
  }}},
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt' }
  }}},
  { type: 'text', part: { text: '文件已成功创建。' } }
];

const mockErrorOutput: OpenCodeRunOutput[] = [
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'error',
    input: { filePath: '/nonexistent.txt' },
    error: 'File not found'
  }}}
];

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

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('1. **Input:** "Step 1 input"');
    expect(markdown).toContain('2. **Input:** "Step 2 input"');
    expect(markdown).toContain('should_call_tool: Write');
    expect(markdown).toContain('response_contains: success');
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

    const markdown = formatAsMarkdown(result);

    // Step 1 session output
    expect(markdown).toContain('> Create file');
    expect(markdown).toContain('Step 1 response');
    expect(markdown).toContain('| write |');

    // Step 2 session output
    expect(markdown).toContain('> Read file');
    expect(markdown).toContain('Step 2 response');
    expect(markdown).toContain('| read |');
  });
});

describe('formatSessionOutputMarkdown', () => {
  it('should format complete session with text and tool calls', () => {
    const result = formatSessionOutputMarkdown(mockSessionOutput, '创建文件');
    expect(result).toContain('**Request:**');
    expect(result).toContain('创建文件');
    expect(result).toContain('**Response:**');
    expect(result).toContain('好的，我来帮你创建这个文件。');
    expect(result).toContain('**Tool Calls:**');
    expect(result).toContain('| write | ✓ completed |');
    expect(result).toContain('| read | ✓ completed |');
  });

  it('should format tool call with error status', () => {
    const result = formatSessionOutputMarkdown(mockErrorOutput, '读取文件');
    expect(result).toContain('| read | ✗ error |');
    expect(result).toContain('File not found');
  });

  it('should return empty string for empty output', () => {
    const result = formatSessionOutputMarkdown([], 'test');
    expect(result).toBe('');
  });

  it('should escape pipe characters in table cells', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'tool_use', part: { tool: 'test', state: {
        status: 'completed',
        input: { path: 'file|name.txt' }
      }}}
    ];
    const result = formatSessionOutputMarkdown(output, 'test');
    expect(result).toContain('file\\|name.txt');
  });

  it('should return empty string for undefined input', () => {
    const result = formatSessionOutputMarkdown(undefined, 'test');
    expect(result).toBe('');
  });

  it('should format multiline text responses with quote prefix', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Line 1\nLine 2\nLine 3' } }
    ];
    const result = formatSessionOutputMarkdown(output, 'test');
    expect(result).toContain('> Line 1');
    expect(result).toContain('> Line 2');
    expect(result).toContain('> Line 3');
  });

  it('should include raw output in collapsible section', () => {
    const result = formatSessionOutputMarkdown(mockSessionOutput, 'test');
    expect(result).toContain('<details>');
    expect(result).toContain('<summary>Raw Output</summary>');
    expect(result).toContain('```json');
  });

  it('should escape newlines in table cells', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'tool_use', part: { tool: 'test', state: {
        status: 'completed',
        input: { text: 'line1\nline2' }
      }}}
    ];
    const result = formatSessionOutputMarkdown(output, 'test');
    expect(result).toContain('line1 line2');
    expect(result).not.toContain('line1\nline2');
  });
});

describe('multi-run display', () => {
  it('should display runs summary for probabilistic test', () => {
    const stepSummary: StepSummary = {
      total_runs: 3,
      passed_runs: 2,
      min_pass: 2,
      status: 'passed'
    };

    const runs: RunExecution[] = [
      { run_index: 1, status: 'passed', duration_ms: 100, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'success', passed: true }
      ]},
      { run_index: 2, status: 'passed', duration_ms: 120, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'success', passed: true }
      ]},
      { run_index: 3, status: 'failed', duration_ms: 90, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'success', passed: false }
      ]}
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 310, timestamp: '' },
      scenarios: [
        {
          name: 'probabilistic-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 310,
          steps: [
            {
              input: 'Test input',
              status: 'passed',
              duration_ms: 310,
              assertions: [],
              runs: runs,
              summary: stepSummary
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Verify summary section
    expect(markdown).toContain('**运行统计:**');
    expect(markdown).toContain('3 次运行');
    expect(markdown).toContain('2 次通过');
    expect(markdown).toContain('要求 ≥ 2');

    // Verify table header
    expect(markdown).toContain('#### 运行详情');
    expect(markdown).toContain('| 运行 | 状态 | 耗时 | 断言 |');
  });

  it('should display error message in assertion column', () => {
    const stepSummary: StepSummary = {
      total_runs: 2,
      passed_runs: 1,
      min_pass: 2,
      status: 'failed'
    };

    const runs: RunExecution[] = [
      { run_index: 1, status: 'passed', duration_ms: 100, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'success', passed: true }
      ]},
      { run_index: 2, status: 'failed', duration_ms: 30000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: false },
        { type: 'response_contains', value: 'success', passed: false }
      ], error: 'Execution timeout' }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 30100, timestamp: '' },
      scenarios: [
        {
          name: 'timeout-scenario',
          environment: 'default',
          status: 'failed',
          duration_ms: 30100,
          steps: [
            {
              input: 'Test input',
              status: 'failed',
              duration_ms: 30100,
              assertions: [],
              runs: runs,
              summary: stepSummary
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Verify error message appears in output
    expect(markdown).toContain('Execution timeout');
  });

  it('should not display runs table for single-run scenario', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'single-run-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test input',
              status: 'passed',
              duration_ms: 100,
              assertions: [
                { type: 'should_call_tool', value: 'Write', passed: true }
              ]
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Verify no runs table is displayed
    expect(markdown).not.toContain('#### 运行详情');
    expect(markdown).not.toContain('| 运行 | 状态 |');
    expect(markdown).not.toContain('**运行统计:**');
  });

  it('should display assertion count format as passed/total', () => {
    const stepSummary: StepSummary = {
      total_runs: 2,
      passed_runs: 1,
      min_pass: 1,
      status: 'passed'
    };

    const runs: RunExecution[] = [
      { run_index: 1, status: 'passed', duration_ms: 100, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'success', passed: true }
      ]},
      { run_index: 2, status: 'failed', duration_ms: 110, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'success', passed: false }
      ]}
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 210, timestamp: '' },
      scenarios: [
        {
          name: 'assertion-count-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 210,
          steps: [
            {
              input: 'Test input',
              status: 'passed',
              duration_ms: 210,
              assertions: [],
              runs: runs,
              summary: stepSummary
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Verify assertion count format
    expect(markdown).toContain('2/2');  // Run 1: both assertions passed
    expect(markdown).toContain('1/2');  // Run 2: one assertion passed
  });

  it('should display status icon in runs table', () => {
    const stepSummary: StepSummary = {
      total_runs: 2,
      passed_runs: 1,
      min_pass: 1,
      status: 'passed'
    };

    const runs: RunExecution[] = [
      { run_index: 1, status: 'passed', duration_ms: 100, assertions: [] },
      { run_index: 2, status: 'failed', duration_ms: 110, assertions: [] }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 210, timestamp: '' },
      scenarios: [
        {
          name: 'status-icon-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 210,
          steps: [
            {
              input: 'Test input',
              status: 'passed',
              duration_ms: 210,
              assertions: [],
              runs: runs,
              summary: stepSummary
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Verify status icons appear in table
    expect(markdown).toContain('✅ passed');
    expect(markdown).toContain('❌ failed');
  });

  it('should display 0/N format when all assertions fail', () => {
    const stepSummary: StepSummary = {
      total_runs: 2,
      passed_runs: 0,
      min_pass: 1,
      status: 'failed'
    };

    const runs: RunExecution[] = [
      { run_index: 1, status: 'failed', duration_ms: 100, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: false },
        { type: 'response_contains', value: 'success', passed: false }
      ]},
      { run_index: 2, status: 'failed', duration_ms: 110, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: false },
        { type: 'response_contains', value: 'success', passed: false }
      ]}
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 210, timestamp: '' },
      scenarios: [
        {
          name: 'all-fail-scenario',
          environment: 'default',
          status: 'failed',
          duration_ms: 210,
          steps: [
            {
              input: 'Test input',
              status: 'failed',
              duration_ms: 210,
              assertions: [],
              runs: runs,
              summary: stepSummary
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // Verify 0/N format
    expect(markdown).toContain('0/2');
  });
});