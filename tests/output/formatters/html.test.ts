import { describe, it, expect } from 'vitest';
import { formatAsHtml, formatSessionOutputHtml } from '../../../src/output/formatters/html.js';
import type { TestResult, OpenCodeRunOutput } from '../../../src/types/index.js';

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