import fs from 'fs-extra';
import * as path from 'path';
import { cleanupEnvironment } from '../executor/fixture.js';

export interface CleanResult {
  cleanedCount: number;
  failedCount: number;
  errors: string[];
}

/**
 * Recursively find all .agentut/temp directories under a given root
 */
async function findTempRoots(rootDir: string): Promise<string[]> {
  const tempRoots: string[] = [];

  async function search(currentDir: string): Promise<void> {
    const tempPath = path.join(currentDir, '.agentut', 'temp');
    if (await fs.pathExists(tempPath)) {
      tempRoots.push(tempPath);
    }

    // Recursively search subdirectories (excluding .agentut itself)
    try {
      const dirents = await fs.readdir(currentDir, { withFileTypes: true });
      for (const dirent of dirents) {
        if (dirent.isDirectory() && dirent.name !== '.agentut') {
          await search(path.join(currentDir, dirent.name));
        }
      }
    } catch {
      // Ignore errors (permission denied, etc.)
    }
  }

  await search(rootDir);
  return tempRoots;
}

export async function cleanTempDirectories(
  workingDirectory: string
): Promise<CleanResult> {
  // Recursively find all .agentut/temp directories
  const tempRoots = await findTempRoots(workingDirectory);

  if (tempRoots.length === 0) {
    console.log('No temporary directories to clean');
    return { cleanedCount: 0, failedCount: 0, errors: [] };
  }

  let cleanedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  // Clean each temp root
  for (const tempRoot of tempRoots) {
    // List subdirectories within this temp root
    try {
      const dirents = await fs.readdir(tempRoot, { withFileTypes: true });
      const subdirs = dirents
        .filter(d => d.isDirectory())
        .map(d => path.join(tempRoot, d.name));

      if (subdirs.length === 0) {
        continue;
      }

      // Clean each subdirectory
      for (const subdir of subdirs) {
        const result = await cleanupEnvironment(subdir);
        if (result.cleaned) {
          cleanedCount++;
        } else {
          failedCount++;
          errors.push(`${result.path}: ${result.error}`);
        }
      }

      // Remove empty temp root if all subdirs were cleaned
      try {
        const remaining = await fs.readdir(tempRoot);
        if (remaining.length === 0) {
          await fs.remove(tempRoot);
          // Also try to remove parent .agentut if empty
          const agentutDir = path.dirname(tempRoot);
          const agentutRemaining = await fs.readdir(agentutDir);
          if (agentutRemaining.length === 0) {
            await fs.remove(agentutDir);
          }
        }
      } catch {
        // Ignore errors removing empty directories
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`${tempRoot}: ${error}`);
      failedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`✓ Cleaned ${cleanedCount} temporary directories in ${tempRoots.length} locations`);
  }

  if (failedCount > 0) {
    console.log(`⚠ Failed to clean ${failedCount} directories:`);
    errors.forEach(e => console.log(`  ${e}`));
  }

  return { cleanedCount, failedCount, errors };
}