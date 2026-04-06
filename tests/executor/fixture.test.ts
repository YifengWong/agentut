import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import {
  createTempDirectory,
  copyEnvironment,
  executeSetup,
  cleanupEnvironment,
  prepareEnvironment,
  parseCopyAction
} from '../../src/executor/fixture.js';
import { SetupError, ValidationError } from '../../src/types/index.js';
import type { EnvironmentConfig, SetupAction } from '../../src/types/index.js';

const TEST_TEMP_DIR = './test-temp-fixture';

describe('Fixture Manager', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
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
  });

  describe('cleanupEnvironment', () => {
    it('should remove directory when cleanup is true', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-cleanup');
      await fs.ensureDir(tempDir);

      await cleanupEnvironment(tempDir, true);

      expect(await fs.pathExists(tempDir)).toBe(false);
    });

    it('should keep directory when cleanup is false', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-keep');
      await fs.ensureDir(tempDir);

      await cleanupEnvironment(tempDir, false);

      expect(await fs.pathExists(tempDir)).toBe(true);
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