import fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { SetupError, type EnvironmentConfig, type SetupAction } from '../types/index.js';

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
  sourceDir: string,
  targetDir: string
): Promise<void> {
  const exists = await fs.pathExists(sourceDir);
  if (!exists) {
    throw new SetupError(`Source directory does not exist: ${sourceDir}`);
  }

  await fs.copy(sourceDir, targetDir, {
    overwrite: true,
    errorOnExist: false
  });
}

export async function executeSetup(
  actions: SetupAction[],
  workDir: string,
  tempRoot: string
): Promise<void> {
  for (const action of actions) {
    if (action.copy) {
      // Check if it's already an absolute path
      let sourcePath = action.copy;
      if (!path.isAbsolute(action.copy)) {
        sourcePath = path.resolve(tempRoot, action.copy);
      }
      await copyEnvironment(sourcePath, workDir);
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
    await fs.remove(directory);
  }
}

export async function prepareEnvironment(
  config: EnvironmentConfig,
  scenarioName: string,
  tempRoot: string,
  yamlDirectory?: string
): Promise<PrepareEnvironmentResult> {
  // Create temp directory
  const tempDir = await createTempDirectory(scenarioName, tempRoot);

  // Resolve source directory (relative to yaml file location)
  const sourceDir = yamlDirectory
    ? path.resolve(yamlDirectory, config.directory)
    : path.resolve(config.directory);

  // Copy environment
  await copyEnvironment(sourceDir, tempDir);

  // Execute setup actions
  await executeSetup(config.setup, tempDir, tempRoot);

  return {
    tempDirectory: tempDir
  };
}