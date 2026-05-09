import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import {
  verifyAssertions,
  verifyShouldCallTool,
  verifyShouldProduceFile,
  verifyFileContentContains,
  verifyResponseContains,
  verifyJudgedBy,
  verifyExecCommand
} from '../../src/executor/verifier.js';
import { type Assertion, type OpenCodeRunOutput, type StepResult, type AgentCliConfig, type JudgedByAssertion, type ExecCommandAssertion } from '../../src/types/index.js';

// Mock createRunner
vi.mock('../../src/runner/factory.js', () => ({
  createRunner: vi.fn()
}));

import { createRunner } from '../../src/runner/factory.js';

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

    it('should support output matching with contains', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'echo hello' },
              output: 'BUILD SUCCESS\n'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'bash',
        output: { contains: 'BUILD SUCCESS' }
      });

      expect(result.passed).toBe(true);
      expect(result.actual?.output).toBe('BUILD SUCCESS\n');
    });

    it('should support output matching with regex', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'bash',
            state: {
              status: 'completed',
              input: {},
              output: 'Tests: 5 passed, 0 failed'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'bash',
        output: { regex: '.*passed.*failed.*' }
      });

      expect(result.passed).toBe(true);
    });

    it('should support output matching with string (equals)', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'bash',
            state: {
              status: 'completed',
              input: {},
              output: 'exact match'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'bash',
        output: 'exact match'
      });

      expect(result.passed).toBe(true);
    });

    it('should fail when output does not match', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'bash',
            state: {
              status: 'completed',
              input: {},
              output: 'actual output'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'bash',
        output: { contains: 'BUILD SUCCESS' }
      });

      expect(result.passed).toBe(false);
    });

    it('should support output matching combined with status', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'bash',
            state: {
              status: 'completed',
              input: { command: 'npm test' },
              output: 'All tests passed'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'bash',
        input: { command: { contains: 'test' } },
        status: 'completed',
        output: { contains: 'passed' }
      });

      expect(result.passed).toBe(true);
    });

    it('should include output in message description', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          timestamp: 1,
          sessionID: 'ses_1',
          part: {
            tool: 'bash',
            state: {
              status: 'completed',
              input: {},
              output: 'Hello World'
            }
          }
        }
      ];

      const result = verifyShouldCallTool(outputs, {
        name: 'bash',
        output: { contains: 'Hello' }
      });

      expect(result.passed).toBe(true);
      expect(result.message).toContain('output');
      expect(result.message).toContain('contains');
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

    it('should verify judged_by assertion with config', async () => {
      const mockRunner = {
        runnerType: 'opencode',
        run: vi.fn().mockReturnValue({
          outputs: [
            { type: 'text', part: { text: '{"passed":true,"reason":"Quality check passed"}' } }
          ],
          sessionId: 'judge-session-1'
        }),
        exportSession: vi.fn(),
        listSessions: vi.fn()
      };

      vi.mocked(createRunner).mockReturnValue(mockRunner as any);

      const config = {
        judges: {
          'quality-judge': { runner: 'opencode', command: 'opencode' }
        },
        default_timeout: 60000
      };

      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', part: { text: 'Some output' } }
      ];

      const assertions: Assertion[] = [
        { judged_by: { judge: 'quality-judge', prompt: 'Check quality' } }
      ];

      const results = await verifyAssertions(assertions, outputs, TEST_TEMP_DIR, config);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].type).toBe('judged_by');
    });

    it('should handle judged_by with missing judge config', async () => {
      const config = {
        judges: {},
        default_timeout: 60000
      };

      const outputs: OpenCodeRunOutput[] = [
        { type: 'text', part: { text: 'Some output' } }
      ];

      const assertions: Assertion[] = [
        { judged_by: { judge: 'missing-judge', prompt: 'Check something' } }
      ];

      const results = await verifyAssertions(assertions, outputs, TEST_TEMP_DIR, config);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain('not found');
    });

    it('should handle judged_by with empty judges config', async () => {
      const config = {
        judges: {}
      };

      const assertions: Assertion[] = [
        { judged_by: { judge: 'any-judge', prompt: 'Test' } }
      ];

      const results = await verifyAssertions(assertions, [], TEST_TEMP_DIR, config);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(results[0].message).toContain('not found');
    });

    it('should use tempRoot for judged_by when provided', async () => {
      const mockRunner = {
        runnerType: 'opencode',
        run: vi.fn().mockReturnValue({
          outputs: [
            { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
          ],
          sessionId: 'judge-session-2'
        }),
        exportSession: vi.fn(),
        listSessions: vi.fn()
      };

      vi.mocked(createRunner).mockReturnValue(mockRunner as any);

      const tempRootDir = path.join(TEST_TEMP_DIR, 'custom-temp');
      await fs.ensureDir(tempRootDir);

      const config = {
        judges: {
          'test-judge': { runner: 'opencode', command: 'opencode' }
        }
      };

      const assertions: Assertion[] = [
        { judged_by: { judge: 'test-judge', prompt: 'Test' } }
      ];

      await verifyAssertions(assertions, [], TEST_TEMP_DIR, config, tempRootDir);

      // Verify runner runs in workDir (TEST_TEMP_DIR acts as tempDirectory)
      const runCall = mockRunner.run.mock.calls[0][0];
      expect(runCall.directory).toBe(TEST_TEMP_DIR);
    });

    it('should fall back to workDir when tempRoot not provided', async () => {
      const mockRunner = {
        runnerType: 'opencode',
        run: vi.fn().mockReturnValue({
          outputs: [
            { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
          ],
          sessionId: 'judge-session-3'
        }),
        exportSession: vi.fn(),
        listSessions: vi.fn()
      };

      vi.mocked(createRunner).mockReturnValue(mockRunner as any);

      const workDir = path.join(TEST_TEMP_DIR, 'fallback-workdir');
      await fs.ensureDir(workDir);

      const config = {
        judges: {
          'test-judge': { runner: 'opencode', command: 'opencode' }
        }
      };

      const assertions: Assertion[] = [
        { judged_by: { judge: 'test-judge', prompt: 'Test' } }
      ];

      await verifyAssertions(assertions, [], workDir, config);

      // Verify runner runs in workDir (fallback: workDir is both tempDirectory and tempRoot)
      const runCall = mockRunner.run.mock.calls[0][0];
      expect(runCall.directory).toBe(workDir);
    });

    it('should support mixed assertions with judged_by', async () => {
      const mockRunner = {
        runnerType: 'opencode',
        run: vi.fn().mockReturnValue({
          outputs: [
            { type: 'text', part: { text: '{"passed":true,"reason":"All checks passed"}' } }
          ],
          sessionId: 'judge-session-4'
        }),
        exportSession: vi.fn(),
        listSessions: vi.fn()
      };

      vi.mocked(createRunner).mockReturnValue(mockRunner as any);

      const workDir = path.join(TEST_TEMP_DIR, 'mixed-workdir');
      await fs.ensureDir(workDir);
      await fs.writeFile(path.join(workDir, 'output.txt'), 'Hello World');

      const config = {
        judges: {
          'output-judge': { runner: 'opencode', command: 'opencode' }
        }
      };

      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 },
        { type: 'text', part: { text: 'Generated output' } }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { should_produce_file: 'output.txt' },
        { judged_by: { judge: 'output-judge', prompt: 'Evaluate output quality' } }
      ];

      const results = await verifyAssertions(assertions, outputs, workDir, config);

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true); // should_call_tool
      expect(results[0].type).toBe('should_call_tool');
      expect(results[1].passed).toBe(true); // should_produce_file
      expect(results[1].type).toBe('should_produce_file');
      expect(results[2].passed).toBe(true); // judged_by
      expect(results[2].type).toBe('judged_by');
    });

    it('should be backward compatible without config parameter', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'backward-compat');
      await fs.ensureDir(workDir);
      await fs.writeFile(path.join(workDir, 'file.txt'), 'content');

      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Read' },
        { should_produce_file: 'file.txt' }
      ];

      // Call without config parameter - should still work
      const results = await verifyAssertions(assertions, outputs, workDir);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.passed)).toBe(true);
    });

    it('should use default timeout from config for judged_by', async () => {
      const mockRunner = {
        runnerType: 'opencode',
        run: vi.fn().mockReturnValue({
          outputs: [
            { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
          ],
          sessionId: 'judge-session-5'
        }),
        exportSession: vi.fn(),
        listSessions: vi.fn()
      };

      vi.mocked(createRunner).mockReturnValue(mockRunner as any);

      const config = {
        judges: {
          'timeout-judge': { runner: 'opencode', command: 'opencode' }
        },
        default_timeout: 90000
      };

      const assertions: Assertion[] = [
        { judged_by: { judge: 'timeout-judge', prompt: 'Test' } }
      ];

      await verifyAssertions(assertions, [], TEST_TEMP_DIR, config);

      expect(mockRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 90000
        })
      );
    });

    it('should verify exec_command assertion', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'exec-work');
      await fs.ensureDir(workDir);

      const assertions: Assertion[] = [
        {
          exec_command: {
            command: 'echo "Test output"',
            expect: { contains: 'Test output' }
          }
        }
      ];

      const results = await verifyAssertions(assertions, [], workDir, undefined, undefined, workDir);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
      expect(results[0].type).toBe('exec_command');
    });

    it('should verify exec_command with cwd parameter', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'cwd-work');
      const subDir = path.join(TEST_TEMP_DIR, 'subdir');
      await fs.ensureDir(workDir);
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, 'file.txt'), 'subdir content');

      const assertions: Assertion[] = [
        {
          exec_command: {
            command: 'cat file.txt',
            expect: { contains: 'subdir content' },
            cwd: './subdir'
          }
        }
      ];

      const results = await verifyAssertions(assertions, [], workDir, undefined, undefined, TEST_TEMP_DIR);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
    });

    it('should support mixed assertions including exec_command', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'mixed-exec');
      await fs.ensureDir(workDir);
      await fs.writeFile(path.join(workDir, 'output.txt'), 'Hello');

      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { should_produce_file: 'output.txt' },
        {
          exec_command: {
            command: 'cat output.txt',
            expect: { contains: 'Hello' }
          }
        }
      ];

      const results = await verifyAssertions(assertions, outputs, workDir, undefined, undefined, workDir);

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true); // should_call_tool
      expect(results[1].passed).toBe(true); // should_produce_file
      expect(results[2].passed).toBe(true); // exec_command
    });
  });
});

describe('verifyJudgedBy', () => {
  const mockJudges: Record<string, AgentCliConfig> = {
    'test-judge': { runner: 'opencode', command: 'opencode' },
    'another-judge': { runner: 'opencode', command: 'opencode' }
  };
  const defaultTimeout = 30000;
  const tempRoot = TEST_TEMP_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when judge is not configured', async () => {
    const assertion: JudgedByAssertion = {
      judge: 'non-existent-judge',
      prompt: 'Evaluate the output'
    };

    const result = await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir
    );

    expect(result.passed).toBe(false);
    expect(result.type).toBe('judged_by');
    expect(result.message).toContain('not found');
    expect(result.message).toContain('non-existent-judge');
  });

  it('should return true when judge returns passed=true', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"All checks passed"}' } }
        ],
        sessionId: 'judge-session-1'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Check if output is correct'
    };

    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Some output' } }
    ];

    const result = await verifyJudgedBy(
      outputs,
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir
    );

    expect(result.passed).toBe(true);
    expect(result.type).toBe('judged_by');
    expect(result.message).toContain('passed');
    expect(result.message).toContain('All checks passed');
    expect(result.actual?.reason).toBe('All checks passed');
  });

  it('should return false when judge returns passed=false', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":false,"reason":"Missing required content"}' } }
        ],
        sessionId: 'judge-session-2'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Verify the output contains X'
    };

    const result = await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir
    );

    expect(result.passed).toBe(false);
    expect(result.type).toBe('judged_by');
    expect(result.message).toContain('failed');
    expect(result.message).toContain('Missing required content');
    expect(result.actual?.reason).toBe('Missing required content');
  });

  it('should handle execution error', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockImplementation(() => {
        throw new Error('CLI crashed');
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Test prompt'
    };

    const result = await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir
    );

    expect(result.passed).toBe(false);
    expect(result.type).toBe('judged_by');
    expect(result.message).toContain('execution error');
    expect(result.message).toContain('CLI crashed');
  });

  it('should handle invalid JSON output', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: 'This is not valid JSON' } }
        ],
        sessionId: 'judge-session-3'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Evaluate'
    };

    const result = await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir
    );

    expect(result.passed).toBe(false);
    expect(result.type).toBe('judged_by');
    expect(result.message).toContain('No valid judge result');
  });

  it('should use assertion timeout over default timeout', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-4'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Test',
      timeout: 60000 // Custom timeout
    };

    await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout, // Default is 30000
      tempRoot,
      tempRoot  // judgeDir
    );

    // Verify the runner was called with the assertion timeout, not the default
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 60000
      })
    );
  });

  it('should use default timeout when assertion timeout not specified', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-5'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Test'
      // No timeout specified
    };

    await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout, // 30000
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 30000
      })
    );
  });

  it('should pass outputs to temp file and runner', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-6'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Output 1' } },
      { type: 'tool_use', part: { tool: 'write' } }
    ];

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Evaluate outputs'
    };

    await verifyJudgedBy(
      outputs,
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir - AI裁判运行目录
    );

    // Verify run was called with directory option (runs in tempDirectory)
    const runCall = mockRunner.run.mock.calls[0][0];
    expect(runCall.directory).toBe(tempRoot);
    expect(runCall.input).toContain('Evaluate outputs');
    expect(runCall.input).toContain('{"passed":boolean');
  });

  it('should extract judge result from data.content (legacy format)', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', data: { content: '{"passed":true,"reason":"Legacy format works"}' } }
        ],
        sessionId: 'judge-session-7'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Test'
    };

    const result = await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot,
      tempRoot  // judgeDir
    );

    expect(result.passed).toBe(true);
    expect(result.actual?.reason).toBe('Legacy format works');
  });

  it('should cleanup temp file after execution', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-8'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Test'
    };

    await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot
    );

    // Get the temp file path from the runner call
    const runCall = mockRunner.run.mock.calls[0][0];
    const tempFile = runCall.file;
    const fileExists = await fs.pathExists(tempFile);
    expect(fileExists).toBe(false);
  });

  it('should cleanup temp file even when execution fails', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockImplementation(() => {
        throw new Error('Execution failed');
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertion: JudgedByAssertion = {
      judge: 'test-judge',
      prompt: 'Test'
    };

    await verifyJudgedBy(
      [],
      assertion,
      mockJudges,
      defaultTimeout,
      tempRoot
    );

    // Get the temp file path from the runner call
    const runCall = mockRunner.run.mock.calls[0][0];
    const tempFile = runCall.file;
    const fileExists = await fs.pathExists(tempFile);
    expect(fileExists).toBe(false);
  });

  it('should pass model from judge config to runner', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-model'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const judgesWithModel: Record<string, AgentCliConfig> = {
      'gpt-judge': {
        runner: 'opencode',
        command: 'opencode',
        model: 'openai/gpt-4o'
      }
    };

    const assertion: JudgedByAssertion = {
      judge: 'gpt-judge',
      prompt: 'Evaluate'
    };

    await verifyJudgedBy(
      [],
      assertion,
      judgesWithModel,
      defaultTimeout,
      tempRoot,
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o'
      })
    );
  });

  it('should pass agent from judge config to runner', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-agent'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const judgesWithAgent: Record<string, AgentCliConfig> = {
      'custom-judge': {
        runner: 'opencode',
        command: 'opencode',
        agent: 'reviewer-agent'
      }
    };

    const assertion: JudgedByAssertion = {
      judge: 'custom-judge',
      prompt: 'Review'
    };

    await verifyJudgedBy(
      [],
      assertion,
      judgesWithAgent,
      defaultTimeout,
      tempRoot,
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'reviewer-agent'
      })
    );
  });

  it('should pass both model and agent from judge config', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-both'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const judgesWithBoth: Record<string, AgentCliConfig> = {
      'full-judge': {
        runner: 'opencode',
        command: 'opencode',
        model: 'anthropic/claude-3.5-sonnet',
        agent: 'strict-reviewer'
      }
    };

    const assertion: JudgedByAssertion = {
      judge: 'full-judge',
      prompt: 'Full review'
    };

    await verifyJudgedBy(
      [],
      assertion,
      judgesWithBoth,
      defaultTimeout,
      tempRoot,
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-3.5-sonnet',
        agent: 'strict-reviewer'
      })
    );
  });
});

describe('verifyExecCommand', () => {
  const workDir = TEST_TEMP_DIR;
  const defaultTimeout = 30000;
  const yamlDir = TEST_TEMP_DIR;

  it('should return true when output matches contains matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "BUILD SUCCESS"',
      expect: { contains: 'BUILD SUCCESS' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
    expect(result.type).toBe('exec_command');
    expect(result.message).toContain('matches');
    expect(result.actual?.stdout).toContain('BUILD SUCCESS');
  });

  it('should return false when output does not match', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "Hello World"',
      expect: { contains: 'BUILD SUCCESS' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(false);
    expect(result.type).toBe('exec_command');
    expect(result.message).toContain('does not match');
  });

  it('should support regex matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "Tests run: 5, Failures: 0"',
      expect: { regex: 'Tests run.*Failures: 0' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should support oneOf matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'printf "done"',
      expect: { oneOf: ['BUILD SUCCESS', 'done', 'passing'] }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should return exitCode in actual', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "test"',
      expect: { contains: 'test' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.actual?.exitCode).toBe(0);
  });

  it('should handle command execution error', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'nonexistent_command_xyz',
      expect: { contains: 'anything' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(false);
  });

  it('should use cwd parameter for execution directory', async () => {
    const subDir = path.join(TEST_TEMP_DIR, 'subproject');
    await fs.ensureDir(subDir);
    await fs.writeFile(path.join(subDir, 'test.txt'), 'content from subdir');

    const assertion: ExecCommandAssertion = {
      command: 'cat test.txt',
      expect: { contains: 'content from subdir' },
      cwd: './subproject'
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should use default workDir when cwd not specified', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'workfile.txt'), 'work content');

    const assertion: ExecCommandAssertion = {
      command: 'cat workfile.txt',
      expect: { contains: 'work content' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });
});