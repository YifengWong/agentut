import fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { SetupError, ValidationError, type EnvironmentConfig, type SetupAction, type GlobalConfig } from '../types/index.js';

interface CopySpec {
  source: string;
  target: string;
}

export function parseCopyAction(copyValue: string, workDir: string): CopySpec {
  if (!copyValue.includes('->')) {
    throw new ValidationError(
      `copy must use "source -> target" format: ${copyValue}`,
      'setup.copy'
    );
  }

  const parts = copyValue.split('->').map(s => s.trim());
  const source = parts[0];
  const target = parts[1];

  const resolvedTarget = target.replaceAll('$WORKDIR', workDir);

  return { source, target: resolvedTarget };
}

interface PrepareEnvironmentResult {
  tempDirectory: string;
}

function sanitizeDirectoryName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export async function createTempDirectory(
  scenarioName: string,
  tempRoot: string
): Promise<string> {
  await fs.ensureDir(tempRoot);

  const sanitizedName = sanitizeDirectoryName(scenarioName);
  const runId = uuidv4().split('-')[0];
  const timestamp = Date.now();
  const dirName = `${sanitizedName}-${runId}-${timestamp}`;

  const tempDir = path.join(tempRoot, dirName);
  await fs.ensureDir(tempDir);

  return tempDir;
}

export async function copyEnvironment(
  sourcePath: string,
  targetDir: string
): Promise<void> {
  const exists = await fs.pathExists(sourcePath);
  if (!exists) {
    throw new SetupError(`Source does not exist: ${sourcePath}`);
  }

  const sourceStat = await fs.stat(sourcePath);

  if (sourceStat.isDirectory()) {
    // Copy directory contents into target
    await fs.copy(sourcePath, targetDir, {
      overwrite: true,
      errorOnExist: false
    });
  } else {
    // Copy file into target directory
    const fileName = path.basename(sourcePath);
    const targetFilePath = path.join(targetDir, fileName);
    await fs.copy(sourcePath, targetFilePath, {
      overwrite: true,
      errorOnExist: false
    });
  }
}

export async function executeSetup(
  actions: SetupAction[],
  workDir: string,
  yamlDirectory: string
): Promise<void> {
  for (const action of actions) {
    if (action.copy) {
      const spec = parseCopyAction(action.copy, workDir);

      const sourcePath = path.isAbsolute(spec.source)
        ? spec.source
        : path.resolve(yamlDirectory, spec.source);
      const targetPath = path.isAbsolute(spec.target)
        ? spec.target
        : path.resolve(yamlDirectory, spec.target);

      await fs.ensureDir(path.dirname(targetPath));

      await fs.copy(sourcePath, targetPath, { overwrite: true });
    }

    if (action.run) {
      try {
        execSync(action.run, {
          cwd: workDir,
          encoding: 'utf-8',
          timeout: 60000,
          stdio: 'pipe'
        });
      } catch (error) {
        throw new SetupError(
          `Setup command failed: ${action.run}`,
          action
        );
      }
    }
  }
}

export async function cleanupEnvironment(
  directory: string,
  shouldCleanup: boolean
): Promise<void> {
  if (shouldCleanup) {
    try {
      await fs.remove(directory);
    } catch {
      // Ignore cleanup errors (e.g., file locked on Windows)
    }
  }
}

export interface PrepareEnvironmentOptions {
  yamlDirectory?: string;
}

export async function prepareEnvironment(
  config: EnvironmentConfig,
  scenarioName: string,
  tempRoot: string,
  options?: PrepareEnvironmentOptions
): Promise<PrepareEnvironmentResult> {
  const yamlDirectory = options?.yamlDirectory || process.cwd();

  // Create temp directory
  const tempDir = await createTempDirectory(scenarioName, tempRoot);

  // Resolve source directory (relative to yaml file location)
  const sourceDir = yamlDirectory
    ? path.resolve(yamlDirectory, config.directory)
    : path.resolve(config.directory);

  // Copy environment
  await copyEnvironment(sourceDir, tempDir);

  // Execute setup actions
  await executeSetup(config.setup, tempDir, yamlDirectory);

  return {
    tempDirectory: tempDir
  };
}