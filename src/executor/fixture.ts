import fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { SetupError, type EnvironmentConfig, type SetupAction, type GlobalConfig } from '../types/index.js';

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
      // Resolve copy path relative to yaml file location
      let sourcePath = action.copy;
      if (!path.isAbsolute(action.copy)) {
        sourcePath = path.resolve(yamlDirectory, action.copy);
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
    try {
      await fs.remove(directory);
    } catch {
      // Ignore cleanup errors (e.g., file locked on Windows)
    }
  }
}

/**
 * Copy skill file to target directory's .opencode/agents/ folder
 * so that opencode can load the skill
 */
export async function copySkillToTarget(
  skillPath: string,
  targetDir: string
): Promise<void> {
  const opencodeDir = path.join(targetDir, '.opencode');
  const agentsDir = path.join(opencodeDir, 'agents');

  // Ensure .opencode/agents directory exists
  await fs.ensureDir(agentsDir);

  // Copy skill file
  const skillFileName = path.basename(skillPath);
  const targetSkillPath = path.join(agentsDir, skillFileName);
  await fs.copy(skillPath, targetSkillPath, {
    overwrite: true,
    errorOnExist: false
  });
}

export interface PrepareEnvironmentOptions {
  skill?: string;
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

  // Copy skill file if specified
  if (options?.skill) {
    // Resolve skill path relative to yaml file location
    const skillPath = path.resolve(yamlDirectory, options.skill);
    await copySkillToTarget(skillPath, tempDir);
  }

  return {
    tempDirectory: tempDir
  };
}