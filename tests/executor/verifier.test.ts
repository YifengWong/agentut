import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import {
  verifyAssertions,
  verifyShouldCallTool,
  verifyShouldProduceFile,
  verifyFileContentContains,
  verifyResponseContains
} from '../../src/executor/verifier.js';
import { type Assertion, type OpenCodeRunOutput, type StepResult } from '../../src/types/index.js';

const TEST_TEMP_DIR = './test-temp-verifier';

describe('Verifier', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  describe('verifyShouldCallTool', () => {
    it('should return true when tool was called', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 },
        { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 2 }
      ];

      const result = verifyShouldCallTool(outputs, 'Write');

      expect(result.passed).toBe(true);
      expect(result.message).toContain('Write');
    });

    it('should return false when tool was not called', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const result = verifyShouldCallTool(outputs, 'Write');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No tool call found');
    });

    it('should handle empty outputs', () => {
      const outputs: OpenCodeRunOutput[] = [];

      const result = verifyShouldCallTool(outputs, 'Write');

      expect(result.passed).toBe(false);
    });
  });

  describe('verifyShouldCallTool with Matcher', () => {
    it('should support ToolCallAssertion object format', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: {
              status: 'completed',
              input: { name: 'brainstorming' }
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'Skill',
        input: { name: 'brainstorming' },
        status: 'completed'
      });

      expect(result.passed).toBe(true);
      expect(result.actual?.tool).toBe('skill');
      expect(result.actual?.input?.name).toBe('brainstorming');
    });

    it('should support Matcher in name', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: { status: 'completed', input: {} }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: { regex: '.*skill.*' }
      });

      expect(result.passed).toBe(true);
    });

    it('should support Matcher in input', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: {
              status: 'completed',
              input: { name: 'writing-plans' }
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'Skill',
        input: { name: { regex: '.*writing.*' } }
      });

      expect(result.passed).toBe(true);
    });

    it('should support contains matcher in input', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'write',
            state: {
              status: 'completed',
              input: { filePath: '/path/to/config.json' }
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'Write',
        input: { filePath: { contains: '.json' } }
      });

      expect(result.passed).toBe(true);
    });

    it('should support status matching', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: {
              status: 'error',
              input: { name: 'brainstorming' },
              error: 'Skill not found'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'Skill',
        input: { name: 'brainstorming' },
        status: 'error'
      });

      expect(result.passed).toBe(true);
      expect(result.actual?.status).toBe('error');
    });

    it('should fail when status does not match', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: { status: 'error', input: { name: 'test' } }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'Skill',
        status: 'completed'
      });

      expect(result.passed).toBe(false);
    });

    it('should support oneOf matcher', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: { status: 'completed', input: {} }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: { oneOf: ['Skill', 'skill', 'SKILL'] }
      });

      expect(result.passed).toBe(true);
    });

    it('should match multiple tool calls independently', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: { status: 'completed', input: { name: 'brainstorming' } }
          }
        },
        {
          type: 'tool_use',
          timestamp: 2,
          sessionID: 'ses_1',
          part: {
            tool: 'skill',
            state: { status: 'completed', input: { name: 'writing-plans' } }
          }
        }
      ];

      // 第一条断言匹配第一次调用
      const result1 = verifyShouldCallTool(outputs, {
        name: 'Skill',
        input: { name: 'brainstorming' }
      });

      // 第二条断言匹配第二次调用
      const result2 = verifyShouldCallTool(outputs, {
        name: 'Skill',
        input: { name: { regex: '.*writing.*' } }
      });

      expect(result1.passed).toBe(true);
      expect(result2.passed).toBe(true);
    });

    it('should remain backward compatible with string format', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'write',
            state: { status: 'completed', input: {} }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, 'Write');

      expect(result.passed).toBe(true);
    });
  });

  describe('verifyShouldProduceFile', () => {
    it('should return true when file exists', async () => {
      const testFile = path.join(TEST_TEMP_DIR, 'output.txt');
      await fs.writeFile(testFile, 'test content');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, 'output.txt');

      expect(result.passed).toBe(true);
      expect(result.message).toContain('output.txt');
    });

    it('should return false when file does not exist', async () => {
      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, 'nonexistent.txt');

      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/not found|No file found/i);
    });

    it('should handle absolute paths', async () => {
      const testFile = path.resolve(TEST_TEMP_DIR, 'absolute.txt');
      await fs.writeFile(testFile, 'content');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, testFile);

      expect(result.passed).toBe(true);
    });
  });

  describe('verifyShouldProduceFile with Matcher', () => {
    it('should support regex matcher for file name', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.json'), '{}');
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'settings.json'), '{}');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { regex: '.*\\.json$' });

      expect(result.passed).toBe(true);
      expect(result.actual?.files?.length).toBeGreaterThanOrEqual(1);
    });

    it('should support oneOf matcher', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.yaml'), 'key: value');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { oneOf: ['config.json', 'config.yaml'] });

      expect(result.passed).toBe(true);
    });

    it('should support contains matcher', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'test-output.txt'), 'content');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { contains: 'output' });

      expect(result.passed).toBe(true);
    });

    it('should remain backward compatible with string format', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'hello.txt'), 'Hello');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, 'hello.txt');

      expect(result.passed).toBe(true);
    });

    it('should fail when regex does not match any file', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.txt'), 'text');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { regex: '.*\\.json$' });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('regex');
    });
  });

  describe('verifyFileContentContains', () => {
    it('should return true when content is found', async () => {
      const testFile = path.join(TEST_TEMP_DIR, 'content.txt');
      await fs.writeFile(testFile, 'Hello World\nTest Content');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: 'content.txt',
        text: 'Test Content'
      });

      expect(result.passed).toBe(true);
      expect(result.message).toContain('found');
    });

    it('should return false when content is not found', async () => {
      const testFile = path.join(TEST_TEMP_DIR, 'content.txt');
      await fs.writeFile(testFile, 'Hello World');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: 'content.txt',
        text: 'Missing'
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return false when file does not exist', async () => {
      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: 'missing.txt',
        text: 'any content'
      });

      expect(result.passed).toBe(false);
      expect(result.message).toContain('No file found');
    });
  });

  describe('verifyFileContentContains with Matcher', () => {
    it('should support Matcher in file parameter', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'error.log'), 'ERROR: something failed');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: { regex: '.*\\.log$' },
        text: 'ERROR'
      });

      expect(result.passed).toBe(true);
    });

    it('should support Matcher in text parameter', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'output.txt'), 'Phase 1: Analysis started');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: 'output.txt',
        text: { regex: 'Phase.*Analysis' }
      });

      expect(result.passed).toBe(true);
    });

    it('should support contains matcher for text', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.json'), '{"name": "test", "value": 123}');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: 'config.json',
        text: { contains: 'name' }
      });

      expect(result.passed).toBe(true);
    });

    it('should support both file and text Matcher', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'debug.log'), 'DEBUG: entering function');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: { contains: 'debug' },
        text: { contains: 'entering' }
      });

      expect(result.passed).toBe(true);
    });

    it('should remain backward compatible with simple format', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'simple.txt'), 'Hello World');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: 'simple.txt',
        text: 'Hello'
      });

      expect(result.passed).toBe(true);
    });

    it('should search all matching files when file uses regex', async () => {
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'file1.txt'), 'no match');
      await fs.writeFile(path.join(TEST_TEMP_DIR, 'file2.txt'), 'FOUND IT');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, {
        file: { regex: '.*\\.txt$' },
        text: 'FOUND'
      });

      expect(result.passed).toBe(true);
      expect(result.actual?.file).toBe('file2.txt');
    });
  });

  describe('verifyResponseContains', () => {
    it('should return true when text is in outputs', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', data: { content: 'Hello World' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const result = verifyResponseContains(outputs, 'Hello');

      expect(result.passed).toBe(true);
      expect(result.message).toMatch(/found/i);
    });

    it('should return false when text is not in outputs', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', data: { content: 'Hello World' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const result = verifyResponseContains(outputs, 'Missing');

      expect(result.passed).toBe(false);
      expect(result.message).toMatch(/not.*found|No response found/i);
    });

    it('should search across multiple text outputs', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', data: { content: 'First part' }, session_id: 'ses_1', timestamp: 1 },
        { type: 'text', data: { content: 'Second part' }, session_id: 'ses_1', timestamp: 2 }
      ];

      const result = verifyResponseContains(outputs, 'Second');

      expect(result.passed).toBe(true);
    });

    it('should handle empty outputs', () => {
      const outputs: OpenCodeRunOutput[] = [];

      const result = verifyResponseContains(outputs, 'anything');

      expect(result.passed).toBe(false);
    });
  });

  describe('verifyResponseContains with Matcher', () => {
    it('should support regex matcher', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'text',
          timestamp: 1,
          sessionID: 'ses_1',
          part: { text: 'Operation completed successfully' }
        }
      ];

      const result = verifyResponseContains(outputs, { regex: '.*success.*' });

      expect(result.passed).toBe(true);
    });

    it('should support contains matcher', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'text',
          timestamp: 1,
          sessionID: 'ses_1',
          part: { text: 'Phase 1: Initial analysis' }
        }
      ];

      const result = verifyResponseContains(outputs, { contains: 'Phase 1' });

      expect(result.passed).toBe(true);
    });

    it('should support oneOf matcher', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'text',
          timestamp: 1,
          sessionID: 'ses_1',
          part: { text: 'done' }
        }
      ];

      const result = verifyResponseContains(outputs, { oneOf: ['success', 'completed', 'done'] });

      expect(result.passed).toBe(true);
    });

    it('should remain backward compatible with string format', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'text',
          timestamp: 1,
          sessionID: 'ses_1',
          part: { text: 'File created' }
        }
      ];

      const result = verifyResponseContains(outputs, 'File created');

      expect(result.passed).toBe(true);
    });

    it('should return matched responses in actual', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'text',
          timestamp: 1,
          sessionID: 'ses_1',
          part: { text: 'First response' }
        },
        {
          type: 'text',
          timestamp: 2,
          sessionID: 'ses_1',
          part: { text: 'Second response with match' }
        }
      ];

      const result = verifyResponseContains(outputs, { contains: 'match' });

      expect(result.passed).toBe(true);
      expect(result.actual?.responses).toContain('Second response with match');
    });
  });

  describe('verifyAssertions', () => {
    it('should verify all assertion types', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);
      await fs.writeFile(path.join(workDir, 'test.txt'), 'expected content');

      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 },
        { type: 'text', data: { content: 'Done writing file' }, session_id: 'ses_1', timestamp: 2 }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { should_produce_file: 'test.txt' },
        { file_content_contains: { file: 'test.txt', text: 'expected' } },
        { response_contains: 'Done' }
      ];

      const results = await verifyAssertions(assertions, outputs, workDir);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.passed)).toBe(true);
    });

    it('should handle mixed pass/fail results', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);

      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' }, // should fail
        { should_call_tool: 'Read' }   // should pass
      ];

      const results = await verifyAssertions(assertions, outputs, workDir);

      expect(results).toHaveLength(2);
      expect(results[0].passed).toBe(false);
      expect(results[1].passed).toBe(true);
    });

    it('should return empty array for no assertions', async () => {
      const results = await verifyAssertions([], [], TEST_TEMP_DIR);

      expect(results).toHaveLength(0);
    });
  });
});