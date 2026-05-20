import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import {
  createTempDirectory,
  copyEnvironment,
  executeSetup,
  cleanupEnvironment,
  prepareEnvironment,
  parseCopyAction,
  injectMockPlugin
} from '../../src/executor/fixture.js';
import { SetupError, ValidationError } from '../../src/types/index.js';
import type { EnvironmentConfig, SetupAction } from '../../src/types/index.js';

// Mock logger
vi.mock('../../src/output/logger.js', () => ({
  logger: {
    startEnvironmentPrep: vi.fn(),
    setupCopy: vi.fn(),
    setupRun: vi.fn(),
    endEnvironmentPrep: vi.fn(),
    cleanup: vi.fn(),
    warn: vi.fn()
  }
}));

import { logger } from '../../src/output/logger.js';

const mockedLogger = vi.mocked(logger);

const TEST_TEMP_DIR = './test-temp-fixture';

describe('Fixture Manager', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
    // Clear all mock calls
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  describe('createTempDirectory', () => {
    it('should create a unique temporary directory', async () => {
      const tempDir = await createTempDirectory('test-scenario', TEST_TEMP_DIR);

      expect(await fs.pathExists(tempDir)).toBe(true);
      expect(path.basename(tempDir)).toContain('test-scenario');
    });

    it('should create directories with unique names', async () => {
      const dir1 = await createTempDirectory('scenario', TEST_TEMP_DIR);
      const dir2 = await createTempDirectory('scenario', TEST_TEMP_DIR);

      expect(dir1).not.toBe(dir2);
    });

    it('should sanitize scenario name for directory', async () => {
      const tempDir = await createTempDirectory('test/scenario:with*chars', TEST_TEMP_DIR);

      expect(path.basename(tempDir)).not.toContain('/');
      expect(path.basename(tempDir)).not.toContain(':');
      expect(path.basename(tempDir)).not.toContain('*');
    });
  });

  describe('copyEnvironment', () => {
    it('should copy source directory to target', async () => {
      const sourceDir = path.join(TEST_TEMP_DIR, 'source');
      const targetDir = path.join(TEST_TEMP_DIR, 'target');

      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'hello');

      await copyEnvironment(sourceDir, targetDir);

      expect(await fs.pathExists(targetDir)).toBe(true);
      expect(await fs.readFile(path.join(targetDir, 'test.txt'), 'utf-8')).toBe('hello');
    });

    it('should throw SetupError if source does not exist', async () => {
      const targetDir = path.join(TEST_TEMP_DIR, 'target');

      await expect(copyEnvironment('/non/existent/path', targetDir))
        .rejects.toThrow(SetupError);
    });

    it('should call logger.setupCopy when scenarioName is provided', async () => {
      const sourceDir = path.join(TEST_TEMP_DIR, 'source-log');
      const targetDir = path.join(TEST_TEMP_DIR, 'target-log');

      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'hello');

      await copyEnvironment(sourceDir, targetDir, 'test-scenario');

      expect(mockedLogger.setupCopy).toHaveBeenCalledWith('test-scenario', sourceDir, targetDir);
    });

    it('should not call logger.setupCopy when scenarioName is not provided', async () => {
      const sourceDir = path.join(TEST_TEMP_DIR, 'source-no-log');
      const targetDir = path.join(TEST_TEMP_DIR, 'target-no-log');

      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'hello');

      await copyEnvironment(sourceDir, targetDir);

      expect(mockedLogger.setupCopy).not.toHaveBeenCalled();
    });
  });

  describe('executeSetup', () => {
    it('should execute copy action with new syntax', async () => {
      const workDir = path.resolve(TEST_TEMP_DIR, 'work');
      const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const actions: SetupAction[] = [
        { copy: `${sourceDir} -> ${workDir}` }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      expect(await fs.pathExists(path.join(workDir, 'file.txt'))).toBe(true);
    });

    it('should execute copy action with $WORKDIR variable', async () => {
      const workDir = path.resolve(TEST_TEMP_DIR, 'workdir');
      const sourceDir = path.resolve(TEST_TEMP_DIR, 'source-var');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'data.txt'), 'variable content');

      const actions: SetupAction[] = [
        { copy: `${sourceDir} -> $WORKDIR/data/` }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      expect(await fs.pathExists(path.join(workDir, 'data', 'data.txt'))).toBe(true);
    });

    it('should execute run command', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);

      const actions: SetupAction[] = [
        { run: 'echo test > output.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      expect(await fs.pathExists(path.join(workDir, 'output.txt'))).toBe(true);
    });

    it('should execute multiple setup actions in order', async () => {
      const workDir = path.resolve(TEST_TEMP_DIR, 'work');
      const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'base.txt'), 'base');

      const actions: SetupAction[] = [
        { copy: `${sourceDir} -> ${workDir}` },
        { run: 'echo added >> base.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      const content = await fs.readFile(path.join(workDir, 'base.txt'), 'utf-8');
      expect(content).toContain('base');
      expect(content).toContain('added');
    });

    it('should throw SetupError if command fails', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);

      const actions: SetupAction[] = [
        { run: 'exit 1' }
      ];

      await expect(executeSetup(actions, workDir, TEST_TEMP_DIR))
        .rejects.toThrow(SetupError);
    });

    it('should call logger.setupCopy when scenarioName is provided for copy action', async () => {
      const workDir = path.resolve(TEST_TEMP_DIR, 'work-log');
      const sourceDir = path.resolve(TEST_TEMP_DIR, 'source-log');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const actions: SetupAction[] = [
        { copy: `${sourceDir} -> ${workDir}` }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR, 'test-scenario');

      expect(mockedLogger.setupCopy).toHaveBeenCalledWith('test-scenario', sourceDir, workDir);
    });

    it('should call logger.setupRun when scenarioName is provided for run action', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work-run-log');
      await fs.ensureDir(workDir);

      const actions: SetupAction[] = [
        { run: 'echo test > output.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR, 'test-scenario-run');

      expect(mockedLogger.setupRun).toHaveBeenCalledWith('test-scenario-run', 'echo test > output.txt');
    });

    it('should not call logger methods when scenarioName is not provided', async () => {
      const workDir = path.resolve(TEST_TEMP_DIR, 'work-no-log');
      const sourceDir = path.resolve(TEST_TEMP_DIR, 'source-no-log');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const actions: SetupAction[] = [
        { copy: `${sourceDir} -> ${workDir}` },
        { run: 'echo test > output.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      expect(mockedLogger.setupCopy).not.toHaveBeenCalled();
      expect(mockedLogger.setupRun).not.toHaveBeenCalled();
    });
  });

  describe('cleanupEnvironment', () => {
    it('should remove directory and return cleaned: true', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-cleanup');
      await fs.ensureDir(tempDir);
      await fs.writeFile(path.join(tempDir, 'file.txt'), 'content');

      const result = await cleanupEnvironment(tempDir);

      expect(result.cleaned).toBe(true);
      expect(result.path).toBe(tempDir);
      expect(await fs.pathExists(tempDir)).toBe(false);
    });

    it('should return cleaned: false with error when directory does not exist', async () => {
      const nonExistentDir = path.join(TEST_TEMP_DIR, 'non-existent');

      const result = await cleanupEnvironment(nonExistentDir);

      expect(result.cleaned).toBe(false);
      expect(result.path).toBe(nonExistentDir);
      expect(result.error).toBeDefined();
    });

    it('should return cleaned: false with error when fs.remove fails', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'locked-dir');
      await fs.ensureDir(tempDir);

      // Mock fs.remove to throw an error
      vi.spyOn(fs, 'remove').mockImplementationOnce(async () => {
        throw new Error('Permission denied');
      });

      const result = await cleanupEnvironment(tempDir);

      expect(result.cleaned).toBe(false);
      expect(result.path).toBe(tempDir);
      expect(result.error).toBe('Permission denied');

      // Restore and cleanup
      vi.mocked(fs.remove).mockRestore();
      await fs.remove(tempDir);
    });

    it('should clean empty directory successfully', async () => {
      const emptyDir = path.join(TEST_TEMP_DIR, 'empty-dir');
      await fs.ensureDir(emptyDir);

      const result = await cleanupEnvironment(emptyDir);

      expect(result.cleaned).toBe(true);
      expect(await fs.pathExists(emptyDir)).toBe(false);
    });
  });

  describe('prepareEnvironment', () => {
    it('should create temp dir, copy environment, and run setup', async () => {
      const envSource = path.join(TEST_TEMP_DIR, 'env-source');
      await fs.ensureDir(envSource);
      await fs.writeFile(path.join(envSource, 'base.txt'), 'env content');

      const config: EnvironmentConfig = {
        directory: envSource,
        setup: [
          { run: 'echo setup >> base.txt' }
        ]
      };

      const result = await prepareEnvironment(config, 'test-scenario', TEST_TEMP_DIR);

      expect(await fs.pathExists(result.tempDirectory)).toBe(true);
      expect(await fs.readFile(path.join(result.tempDirectory, 'base.txt'), 'utf-8'))
        .toContain('env content');
      expect(await fs.readFile(path.join(result.tempDirectory, 'base.txt'), 'utf-8'))
        .toContain('setup');
    });

    it('should use relative directory from yaml file location', async () => {
      const yamlDir = path.join(TEST_TEMP_DIR, 'yaml-dir');
      const relativeEnvDir = path.join(yamlDir, 'env');
      await fs.ensureDir(relativeEnvDir);
      await fs.writeFile(path.join(relativeEnvDir, 'test.txt'), 'relative');

      const config: EnvironmentConfig = {
        directory: './env',
        setup: []
      };

      const result = await prepareEnvironment(config, 'test', TEST_TEMP_DIR, { yamlDirectory: yamlDir });

      expect(await fs.readFile(path.join(result.tempDirectory, 'test.txt'), 'utf-8'))
        .toBe('relative');
    });

    it('should call logger.startEnvironmentPrep and endEnvironmentPrep', async () => {
      const envSource = path.join(TEST_TEMP_DIR, 'env-log');
      await fs.ensureDir(envSource);
      await fs.writeFile(path.join(envSource, 'test.txt'), 'content');

      const config: EnvironmentConfig = {
        directory: envSource,
        setup: []
      };

      await prepareEnvironment(config, 'test-scenario-log', TEST_TEMP_DIR);

      expect(mockedLogger.startEnvironmentPrep).toHaveBeenCalledWith('test-scenario-log');
      expect(mockedLogger.endEnvironmentPrep).toHaveBeenCalledWith('test-scenario-log', true, expect.any(Number));
    });

    it('should call logger.endEnvironmentPrep with false on error', async () => {
      const config: EnvironmentConfig = {
        directory: '/non/existent/path',
        setup: []
      };

      await expect(prepareEnvironment(config, 'test-scenario-error', TEST_TEMP_DIR))
        .rejects.toThrow();

      expect(mockedLogger.startEnvironmentPrep).toHaveBeenCalledWith('test-scenario-error');
      expect(mockedLogger.endEnvironmentPrep).toHaveBeenCalledWith('test-scenario-error', false, expect.any(Number));
    });
  });
});

describe('parseCopyAction', () => {
  it('should parse valid copy action with -> separator', () => {
    const result = parseCopyAction('./source/file.txt -> $WORKDIR/target/', '/temp/workdir');
    expect(result.source).toBe('./source/file.txt');
    expect(result.target).toBe('/temp/workdir/target/');
  });

  it('should throw ValidationError for copy without -> separator', () => {
    expect(() => parseCopyAction('./source/file.txt', '/temp'))
      .toThrow('copy must use "source -> target" format');
  });

  it('should replace $WORKDIR with actual work directory', () => {
    const result = parseCopyAction('./source -> $WORKDIR/.opencode/agents/', '/tmp/test-123');
    expect(result.target).toBe('/tmp/test-123/.opencode/agents/');
  });

  it('should handle paths with spaces around ->', () => {
    const result = parseCopyAction('./source/file.txt   ->   ./target/', '/temp');
    expect(result.source).toBe('./source/file.txt');
    expect(result.target).toBe('./target/');
  });

  it('should replace all occurrences of $WORKDIR', () => {
    const result = parseCopyAction('./source -> $WORKDIR/a/$WORKDIR/b', '/workdir');
    expect(result.target).toBe('/workdir/a//workdir/b');
  });
});

describe('injectMockPlugin', () => {
  it('should create .opencode/plugins directory with mock-rules.json', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-1');
    await fs.ensureDir(workDir);

    const mockRules = [
      { tool: 'read', output: 'mocked' },
      { tool: 'bash', when: [{ command: { contains: 'push' } }], error: 'Permission denied' },
    ];

    const result = await injectMockPlugin(workDir, mockRules);

    const pluginsDir = path.join(workDir, '.opencode', 'plugins');
    expect(await fs.pathExists(pluginsDir)).toBe(true);
    expect(result).toBe(true);
  });

  it('should write mock-rules.json with correct content', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-2');
    await fs.ensureDir(workDir);

    const mockRules = [
      { tool: 'read', when: [{ file_path: { contains: '.env' } }], output: 'secret' },
    ];

    await injectMockPlugin(workDir, mockRules);

    const rulesPath = path.join(workDir, '.opencode', 'plugins', 'mock-rules.json');
    const content = await fs.readFile(rulesPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0].tool).toBe('read');
    expect(parsed.rules[0].output).toBe('secret');
    expect(parsed.rules[0].when[0]).toEqual({ file_path: { contains: '.env' } });
  });

  it('should copy agentut-plugins.ts to plugins dir', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-3');
    await fs.ensureDir(workDir);

    await injectMockPlugin(workDir, [
      { tool: 'read', output: 'mocked' }
    ]);

    const pluginPath = path.join(workDir, '.opencode', 'plugins', 'agentut-plugins.ts');
    expect(await fs.pathExists(pluginPath)).toBe(true);
  });

  it('should create .mock-empty file', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-4');
    await fs.ensureDir(workDir);

    await injectMockPlugin(workDir, [
      { tool: 'read', output: 'mocked' }
    ]);

    const emptyPath = path.join(workDir, '.opencode', 'plugins', '.mock-empty');
    expect(await fs.pathExists(emptyPath)).toBe(true);
    const content = await fs.readFile(emptyPath, 'utf-8');
    expect(content).toBe('');
  });

  it('should return false when mockRules is empty (no injection needed)', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-5');
    await fs.ensureDir(workDir);

    const result = await injectMockPlugin(workDir, []);
    expect(result).toBe(false);
  });

  it('should not create any files when rules are empty', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-6');
    await fs.ensureDir(workDir);

    await injectMockPlugin(workDir, []);

    const pluginsDir = path.join(workDir, '.opencode', 'plugins');
    expect(await fs.pathExists(pluginsDir)).toBe(false);
  });

  it('should handle undefined mockRules gracefully', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'mock-test-7');
    await fs.ensureDir(workDir);

    const result = await injectMockPlugin(workDir, undefined);
    expect(result).toBe(false);
  });
});