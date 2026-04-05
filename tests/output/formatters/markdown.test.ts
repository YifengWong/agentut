import { describe, it, expect } from 'vitest';
import { formatAsMarkdown, formatSessionOutputMarkdown } from '../../../src/output/formatters/markdown.js';
import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput } from '../../../src/types/index.js';

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