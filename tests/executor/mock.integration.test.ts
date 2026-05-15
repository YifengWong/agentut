// tests/executor/mock.integration.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { injectMockPlugin } from '../../src/executor/fixture.js';
import { verifyMockHits } from '../../src/executor/verifier.js';
import type { MockRule, OpenCodeRunOutput } from '../../src/types/index.js';

// Mock logger
vi.mock('../../src/output/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    startEnvironmentPrep: vi.fn(),
    setupCopy: vi.fn(),
    setupRun: vi.fn(),
    endEnvironmentPrep: vi.fn(),
    cleanup: vi.fn(),
    startSuite: vi.fn(),
    startScenario: vi.fn(),
    endScenario: vi.fn(),
    startStep: vi.fn(),
    showProgress: vi.fn(),
    endStep: vi.fn(),
    error: vi.fn(),
    importSession: vi.fn(),
    startScoring: vi.fn(),
    endScoring: vi.fn(),
    summary: vi.fn(),
  }
}));

import { logger } from '../../src/output/logger.js';
const mockedLogger = vi.mocked(logger);

const TEST_TEMP_DIR = './test-temp-mock-integration';

describe('Mock Feature Integration', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  describe('end-to-end mock flow', () => {
    it('should inject plugin files correctly', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'integration-1');
      await fs.ensureDir(workDir);

      const mockRules: MockRule[] = [
        { tool: 'read', when: [{ file_path: { contains: '.env' } }], output: 'SECRET_KEY=test' },
        { tool: 'bash', when: [{ command: { contains: 'rm -rf' } }], error: 'Permission denied' },
      ];

      const result = await injectMockPlugin(workDir, mockRules);
      expect(result).toBe(true);

      // Verify mock-rules.json
      const rulesPath = path.join(workDir, '.opencode', 'plugins', 'mock-rules.json');
      const rulesContent = await fs.readFile(rulesPath, 'utf-8');
      const rules = JSON.parse(rulesContent);
      expect(rules.rules).toHaveLength(2);
      expect(rules.rules[0].tool).toBe('read');
      expect(rules.rules[1].tool).toBe('bash');

      // Verify plugin file
      const pluginPath = path.join(workDir, '.opencode', 'plugins', 'agentut-plugins.ts');
      expect(await fs.pathExists(pluginPath)).toBe(true);

      // Verify .mock-empty
      const emptyPath = path.join(workDir, '.opencode', 'plugins', '.mock-empty');
      expect(await fs.pathExists(emptyPath)).toBe(true);
      const emptyContent = await fs.readFile(emptyPath, 'utf-8');
      expect(emptyContent).toBe('');
    });

    it('should correctly verify matched mock with output', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          part: {
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: '.env.production' },
              output: 'DATABASE_URL=prod'
            }
          }
        }
      ];
      const mockRules: MockRule[] = [
        { tool: 'read', when: [{ file_path: { contains: '.env' } }], output: 'DATABASE_URL=prod' }
      ];

      verifyMockHits(outputs, mockRules);
      expect(mockedLogger.warn).not.toHaveBeenCalled();
    });

    it('should detect mock output mismatch', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          part: {
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: '.env' },
              output: 'real-secret-value'
            }
          }
        }
      ];
      const mockRules: MockRule[] = [
        { tool: 'read', when: [{ file_path: { contains: '.env' } }], output: 'MOCKED' }
      ];

      verifyMockHits(outputs, mockRules);
      expect(mockedLogger.warn).toHaveBeenCalled();
    });

    it('should handle multiple mock rules for same tool', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          part: {
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: '.env' },
              output: 'MOCKED_ENV'
            }
          }
        },
        {
          type: 'tool_use',
          part: {
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: 'config.json' },
              output: 'MOCKED_CONFIG'
            }
          }
        }
      ];
      const mockRules: MockRule[] = [
        { tool: 'read', when: [{ file_path: { contains: '.env' } }], output: 'MOCKED_ENV' },
        { tool: 'read', when: [{ file_path: { contains: 'config.json' } }], output: 'MOCKED_CONFIG' },
      ];

      verifyMockHits(outputs, mockRules);
      expect(mockedLogger.warn).not.toHaveBeenCalled();
    });

    it('should detect when one of multiple rules is not matched', () => {
      const outputs: OpenCodeRunOutput[] = [
        {
          type: 'tool_use',
          part: {
            tool: 'read',
            state: {
              status: 'completed',
              input: { file_path: '.env' },
              output: 'MOCKED_ENV'
            }
          }
        }
      ];
      const mockRules: MockRule[] = [
        { tool: 'read', when: [{ file_path: { contains: '.env' } }], output: 'MOCKED_ENV' },
        { tool: 'bash', output: 'should not match' },
      ];

      verifyMockHits(outputs, mockRules);
      expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('bash')
      );
    });
  });
});
