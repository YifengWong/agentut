import { describe, it, expect } from 'vitest';
import { extractText, extractToolInfo, truncateOutput } from '../../src/distiller/extract.js';

describe('extractText', () => {
  it('should extract text from part.text', () => {
    expect(extractText({ part: { text: 'Hello World' } })).toBe('Hello World');
  });

  it('should extract text from data.content (legacy)', () => {
    expect(extractText({ data: { content: 'Legacy text' } })).toBe('Legacy text');
  });

  it('should return null for empty input', () => {
    expect(extractText({})).toBeNull();
    expect(extractText({ part: { text: '' } })).toBeNull();
  });

  it('should prefer part.text over data.content', () => {
    expect(extractText({ part: { text: 'new' }, data: { content: 'old' } })).toBe('new');
  });

  it('should trim whitespace', () => {
    expect(extractText({ part: { text: '  trimmed  ' } })).toBe('trimmed');
  });
});

describe('extractToolInfo', () => {
  it('should extract from part format', () => {
    const item = {
      type: 'tool_use',
      part: {
        tool: 'write',
        state: {
          status: 'completed',
          input: { filePath: '/test.txt' },
          output: 'File written',
        }
      }
    };
    const result = extractToolInfo(item);
    expect(result?.toolName).toBe('write');
    expect(result?.status).toBe('completed');
    expect(result?.input).toEqual({ filePath: '/test.txt' });
    expect(result?.output).toBe('File written');
  });

  it('should extract from legacy data format', () => {
    const item = {
      type: 'tool_call',
      data: {
        tool_name: 'Read',
        tool_args: { file: 'test.txt' },
        tool_output: 'content here',
        success: true,
      }
    };
    const result = extractToolInfo(item);
    expect(result?.toolName).toBe('Read');
    expect(result?.status).toBe('completed');
    expect(result?.input).toEqual({ file: 'test.txt' });
    expect(result?.output).toBe('content here');
  });

  it('should detect error status', () => {
    const item = {
      type: 'tool_use',
      part: {
        tool: 'bash',
        state: {
          status: 'error',
          input: {},
          error: 'Permission denied',
        }
      }
    };
    const result = extractToolInfo(item);
    expect(result?.status).toBe('error');
    expect(result?.error).toBe('Permission denied');
  });

  it('should return null for non-tool items', () => {
    expect(extractToolInfo({ type: 'text', part: { text: 'hello' } })).toBeNull();
    expect(extractToolInfo({})).toBeNull();
  });
});

describe('truncateOutput', () => {
  it('should replace skill output with placeholder', () => {
    const result = truncateOutput('skill', { name: 'brainstorming' }, '<long skill content>');
    expect(result).toBe('[Loaded skill: brainstorming]');
  });

  it('should truncate long output to 500 chars', () => {
    const longOutput = 'A'.repeat(1000);
    const result = truncateOutput('bash', {}, longOutput);
    expect(result!.length).toBeLessThanOrEqual(503);
    expect(result).toContain('...');
  });

  it('should return output unchanged if short', () => {
    const result = truncateOutput('write', {}, 'Short output');
    expect(result).toBe('Short output');
  });

  it('should return undefined for undefined output', () => {
    expect(truncateOutput('bash', {}, undefined)).toBeUndefined();
  });
});
