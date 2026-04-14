import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { cleanTempDirectories } from '../../src/commands/clean.js';

const TEST_TEMP_DIR = './test-temp-clean';

// Mock console.log
vi.spyOn(console, 'log');

describe('clean command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_TEMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  it('should clean temp directories in nested locations', async () => {
    // Create temp directories in multiple nested paths
    const tempRoot1 = path.join(TEST_TEMP_DIR, '.agentut', 'temp');
    const tempRoot2 = path.join(TEST_TEMP_DIR, 'subdir', '.agentut', 'temp');
    await fs.ensureDir(tempRoot1);
    await fs.ensureDir(tempRoot2);
    await fs.ensureDir(path.join(tempRoot1, 'scenario-1-abc-123'));
    await fs.ensureDir(path.join(tempRoot2, 'scenario-2-def-456'));
    await fs.writeFile(path.join(tempRoot1, 'scenario-1-abc-123', 'file.txt'), 'content');

    await cleanTempDirectories(TEST_TEMP_DIR);

    expect(await fs.pathExists(tempRoot1)).toBe(false);
    expect(await fs.pathExists(tempRoot2)).toBe(false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cleaned 2 temporary directories in 2 locations'));
  });

  it('should report no temp directories when none exist', async () => {
    await cleanTempDirectories(TEST_TEMP_DIR);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No temporary directories to clean'));
  });

  it('should clean only in specified directory', async () => {
    // Create temp directories in two locations
    const tempRoot1 = path.join(TEST_TEMP_DIR, '.agentut', 'temp');
    const subdir = path.join(TEST_TEMP_DIR, 'subdir');
    const tempRoot2 = path.join(subdir, '.agentut', 'temp');
    await fs.ensureDir(tempRoot1);
    await fs.ensureDir(tempRoot2);
    await fs.ensureDir(path.join(tempRoot1, 'scenario-1'));
    await fs.ensureDir(path.join(tempRoot2, 'scenario-2'));

    // Clean only the subdir
    await cleanTempDirectories(subdir);

    // tempRoot1 should still exist, tempRoot2 should be cleaned
    expect(await fs.pathExists(tempRoot1)).toBe(true);
    expect(await fs.pathExists(tempRoot2)).toBe(false);
  });

  it('should handle cleanup failures gracefully', async () => {
    const tempRoot = path.join(TEST_TEMP_DIR, '.agentut', 'temp');
    await fs.ensureDir(tempRoot);
    await fs.ensureDir(path.join(tempRoot, 'scenario-1-abc-123'));

    // Mock fs.remove to fail on one directory
    const originalRemove = fs.remove;
    vi.spyOn(fs, 'remove').mockImplementation(async (p: string) => {
      if (typeof p === 'string' && p.includes('scenario-1')) {
        throw new Error('Permission denied');
      }
      return originalRemove(p as unknown as string);
    });

    await cleanTempDirectories(TEST_TEMP_DIR);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Failed to clean'));

    vi.mocked(fs.remove).mockRestore();
  });
});