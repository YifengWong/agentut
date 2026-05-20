import fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { processManager, treeKill } from '../process/index.js';
import { SetupError, ValidationError, type EnvironmentConfig, type SetupAction, type GlobalConfig, type CleanupResult } from '../types/index.js';
import type { MockRule } from '../types/index.js';
import { logger } from '../output/logger.js';

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_SOURCE_CANDIDATES = [
  path.resolve(__dirname, '../plugins/opencode/agentut-plugins.ts'),       // dist/plugins/ (production)
  path.resolve(__dirname, '../../plugins/opencode/agentut-plugins.ts'),    // project-root/plugins/ (dev/test)
];

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
  targetDir: string,
  scenarioName?: string
): Promise<void> {
  if (scenarioName) {
    logger.setupCopy(scenarioName, sourcePath, targetDir);
  }

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
  yamlDirectory: string,
  scenarioName?: string
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

      if (scenarioName) {
        logger.setupCopy(scenarioName, sourcePath, targetPath);
      }

      await fs.ensureDir(path.dirname(targetPath));

      await fs.copy(sourcePath, targetPath, { overwrite: true });
    }

    if (action.run) {
      if (scenarioName) {
        logger.setupRun(scenarioName, action.run);
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(action.run!, [], {
            cwd: workDir,
            shell: true,
            detached: true,
            stdio: 'pipe'
          });

          processManager.register(proc.pid!);

          let stderr = '';
          proc.stderr?.on('data', (data) => {
            stderr += data.toString();
          });

          const timeoutId = setTimeout(() => {
            treeKill(proc.pid!);
            processManager.unregister(proc.pid!);
            reject(new SetupError(
              `Setup command timed out after 60s: ${action.run}`,
              action
            ));
          }, 60000);

          proc.on('close', (code) => {
            clearTimeout(timeoutId);
            processManager.unregister(proc.pid!);
            if (code === 0) {
              resolve();
            } else {
              reject(new SetupError(
                `Setup command failed with exit code ${code}: ${action.run}${stderr ? `\n${stderr}` : ''}`,
                action
              ));
            }
          });

          proc.on('error', (err) => {
            clearTimeout(timeoutId);
            treeKill(proc.pid!);
            processManager.unregister(proc.pid!);
            reject(new SetupError(
              `Setup command failed: ${err.message}`,
              action
            ));
          });
        });
      } catch (error) {
        if (error instanceof SetupError) throw error;
        throw new SetupError(
          `Setup command failed: ${action.run}`,
          action
        );
      }
    }
  }
}

export async function cleanupEnvironment(
  directory: string
): Promise<CleanupResult> {
  try {
    const exists = await fs.pathExists(directory);
    if (!exists) {
      return { cleaned: false, path: directory, error: 'Directory does not exist' };
    }
    await fs.remove(directory);
    return { cleaned: true, path: directory };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { cleaned: false, path: directory, error };
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
  const startTime = Date.now();
  const yamlDirectory = options?.yamlDirectory || process.cwd();

  logger.startEnvironmentPrep(scenarioName);

  try {
    // Create temp directory
    const tempDir = await createTempDirectory(scenarioName, tempRoot);

    // Resolve source directory (relative to yaml file location)
    const sourceDir = yamlDirectory
      ? path.resolve(yamlDirectory, config.directory)
      : path.resolve(config.directory);

    // Copy environment
    await copyEnvironment(sourceDir, tempDir, scenarioName);

    // Execute setup actions
    await executeSetup(config.setup || [], tempDir, yamlDirectory, scenarioName);

    const duration = Date.now() - startTime;
    logger.endEnvironmentPrep(scenarioName, true, duration);

    return {
      tempDirectory: tempDir
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.endEnvironmentPrep(scenarioName, false, duration);
    throw error;
  }
}

/**
 * Inject mock plugin and rules into the working directory's .opencode/plugins/.
 *
 * @param workDir - The test working directory ($WORKDIR)
 * @param mockRules - Mock rules from YAML step config
 * @returns true if plugin was injected, false if no rules (skipped)
 */
export async function injectMockPlugin(
  workDir: string,
  mockRules: MockRule[] | undefined
): Promise<boolean> {
  if (!mockRules || mockRules.length === 0) {
    return false;
  }

  const pluginsDir = path.join(workDir, '.opencode', 'plugins');
  await fs.ensureDir(pluginsDir);

  // Write mock-rules.json
  const rulesJson = JSON.stringify({ rules: mockRules }, null, 2);
  await fs.writeFile(path.join(pluginsDir, 'mock-rules.json'), rulesJson);

  // Copy plugin source — try candidates (dist-first, then source tree)
  const pluginTarget = path.join(pluginsDir, 'agentut-plugins.ts');
  for (const candidate of PLUGIN_SOURCE_CANDIDATES) {
    if (await fs.pathExists(candidate)) {
      await fs.copy(candidate, pluginTarget);
      break;
    }
  }

  // Create empty file for neutralizing file operations
  await fs.writeFile(path.join(pluginsDir, '.mock-empty'), '');

  return true;
}