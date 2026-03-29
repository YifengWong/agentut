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
      expect(result.message).toContain('not called');
    });

    it('should handle empty outputs', () => {
      const outputs: OpenCodeRunOutput[] = [];

      const result = verifyShouldCallTool(outputs, 'Write');

      expect(result.passed).toBe(false);
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
      expect(result.message).toContain('not found');
    });

    it('should handle absolute paths', async () => {
      const testFile = path.resolve(TEST_TEMP_DIR, 'absolute.txt');
      await fs.writeFile(testFile, 'content');

      const result = await verifyShouldProduceFile(TEST_TEMP_DIR, testFile);

      expect(result.passed).toBe(true);
    });
  });

  describe('verifyFileContentContains', () => {
    it('should return true when content is found', async () => {
      const testFile = path.join(TEST_TEMP_DIR, 'content.txt');
      await fs.writeFile(testFile, 'Hello World\nTest Content');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, 'content.txt', 'Test Content');

      expect(result.passed).toBe(true);
      expect(result.message).toContain('found');
    });

    it('should return false when content is not found', async () => {
      const testFile = path.join(TEST_TEMP_DIR, 'content.txt');
      await fs.writeFile(testFile, 'Hello World');

      const result = await verifyFileContentContains(TEST_TEMP_DIR, 'content.txt', 'Missing');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return false when file does not exist', async () => {
      const result = await verifyFileContentContains(TEST_TEMP_DIR, 'missing.txt', 'any content');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('verifyResponseContains', () => {
    it('should return true when text is in outputs', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', data: { content: 'Hello World' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const result = verifyResponseContains(outputs, 'Hello');

      expect(result.passed).toBe(true);
      expect(result.message).toContain('found');
    });

    it('should return false when text is not in outputs', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', data: { content: 'Hello World' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const result = verifyResponseContains(outputs, 'Missing');

      expect(result.passed).toBe(false);
      expect(result.message).toContain('not found');
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