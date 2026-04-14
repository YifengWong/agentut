# Cleanup Strategy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign cleanup strategy to give users full control over when temporary directories are cleaned, with a new `agentut clean` command and `--clean` CLI parameter.

**Architecture:** Simplify cleanupEnvironment function to return results instead of silently swallowing errors. Add a new clean command that cleans `.agentut/temp/` directory. Remove cleanup logic from run.ts, add --clean parameter for immediate cleanup after run.

**Tech Stack:** TypeScript, fs-extra, vitest, commander

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/types/index.ts` | Add CleanupResult type, deprecate ScenarioConfig.cleanup field |
| `src/executor/fixture.ts` | Redesign cleanupEnvironment function with new signature |
| `src/commands/clean.ts` | New file: implement clean command |
| `src/cli.ts` | Register clean command, add --clean parameter to run |
| `src/commands/run.ts` | Remove cleanup logic, add --clean parameter handling |
| `tests/executor/fixture.test.ts` | Update cleanupEnvironment tests for new signature |
| `tests/commands/clean.test.ts` | New file: test clean command |

---

### Task 1: Add CleanupResult Type and Deprecate cleanup Field

**Files:**
- Modify: `src/types/index.ts:25` (cleanup field)
- Modify: `src/types/index.ts` (add CleanupResult type)

- [ ] **Step 1: Add CleanupResult interface after AssertionResult interface (around line 327)**

```typescript
// ========== Cleanup Types ==========

export interface CleanupResult {
  cleaned: boolean;
  path: string;
  error?: string;
}
```

- [ ] **Step 2: Add deprecated JSDoc comment to ScenarioConfig.cleanup field (line 25)**

Change:
```typescript
cleanup: boolean;
```

To:
```typescript
/** @deprecated Cleanup strategy is now controlled by CLI --clean parameter or agentut clean command */
cleanup: boolean;
```

- [ ] **Step 3: Run build to verify type changes compile**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add CleanupResult type and deprecate cleanup field"
```

---

### Task 2: Redesign cleanupEnvironment Function

**Files:**
- Modify: `src/executor/fixture.ts:136-151`
- Modify: `tests/executor/fixture.test.ts:243-288`

- [ ] **Step 1: Write failing tests for new cleanupEnvironment signature**

In `tests/executor/fixture.test.ts`, replace the existing `describe('cleanupEnvironment', ...)` block (lines 243-288) with:

```typescript
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
    const originalRemove = fs.remove;
    vi.spyOn(fs, 'remove').mockImplementationOnce(async () => {
      throw new Error('Permission denied');
    });

    const result = await cleanupEnvironment(tempDir);

    expect(result.cleaned).toBe(false);
    expect(result.path).toBe(tempDir);
    expect(result.error).toBe('Permission denied');

    // Restore original
    vi.mocked(fs.remove).mockRestore();
    await originalRemove(tempDir);
  });

  it('should clean empty directory successfully', async () => {
    const emptyDir = path.join(TEST_TEMP_DIR, 'empty-dir');
    await fs.ensureDir(emptyDir);

    const result = await cleanupEnvironment(emptyDir);

    expect(result.cleaned).toBe(true);
    expect(await fs.pathExists(emptyDir)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test tests/executor/fixture.test.ts`
Expected: Tests fail with signature mismatch and type errors

- [ ] **Step 3: Update cleanupEnvironment function implementation**

In `src/executor/fixture.ts`, replace lines 136-151 with:

```typescript
export async function cleanupEnvironment(
  directory: string
): Promise<CleanupResult> {
  try {
    await fs.remove(directory);
    return { cleaned: true, path: directory };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { cleaned: false, path: directory, error };
  }
}
```

- [ ] **Step 4: Remove import of logger (no longer needed)**

The function no longer calls logger, so remove the import if it's only used for cleanup logging. Check if logger is used elsewhere in the file before removing.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test tests/executor/fixture.test.ts`
Expected: All cleanupEnvironment tests pass

- [ ] **Step 6: Commit**

```bash
git add src/executor/fixture.ts tests/executor/fixture.test.ts
git commit -m "refactor: redesign cleanupEnvironment to return CleanupResult"
```

---

### Task 3: Create clean Command

**Files:**
- Create: `src/commands/clean.ts`
- Create: `tests/commands/clean.test.ts`

- [ ] **Step 1: Write failing tests for clean command**

Create `tests/commands/clean.test.ts`:

```typescript
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
      if (p.includes('scenario-1')) {
        throw new Error('Permission denied');
      }
      return originalRemove(p);
    });

    await cleanTempDirectories(TEST_TEMP_DIR);

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Failed to clean'));

    vi.mocked(fs.remove).mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test tests/commands/clean.test.ts`
Expected: Tests fail with module not found error

- [ ] **Step 3: Implement cleanTempDirectories function**

Create `src/commands/clean.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test tests/commands/clean.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/commands/clean.ts tests/commands/clean.test.ts
git commit -m "feat: add agentut clean command"
```

---

### Task 4: Register clean Command in CLI

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add import for cleanTempDirectories**

In `src/cli.ts`, add import after line 7:

```typescript
import { cleanTempDirectories } from './commands/clean.js';
```

- [ ] **Step 2: Add clean command registration**

In `src/cli.ts`, add before `program.parse()` (around line 154):

```typescript
// clean command
program
  .command('clean')
  .description('Clean temporary directories (.agentut/temp)')
  .option('-d, --directory <path>', 'Working directory', '.')
  .action(async (options) => {
    try {
      const result = await cleanTempDirectories(options.directory);
      if (result.failedCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });
```

- [ ] **Step 3: Add --clean option to run command**

In the run command options section (around line 82), add after `--quick` option:

```typescript
.option('--clean', 'Clean temporary directories after run')
```

- [ ] **Step 4: Pass clean option to runTests**

In the run command action (line 84-94), add `clean: options.clean` to the options object:

```typescript
const result = await runTests(testFile, {
  format: options.format,
  output: options.output,
  scenario: options.scenario,
  parallel: options.parallel,
  model: options.model,
  agent: options.agent,
  runs: options.runs,
  min_pass: options.minPass,
  quick: options.quick,
  clean: options.clean  // Add this line
});
```

- [ ] **Step 5: Run build to verify CLI compiles**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts
git commit -m "feat: register clean command and add --clean option to run"
```

---

### Task 5: Update run.ts to Remove cleanup Logic and Add --clean Handling

**Files:**
- Modify: `src/commands/run.ts:5` (import)
- Modify: `src/commands/run.ts:36-37` (RunOptions interface)
- Modify: `src/commands/run.ts:314-319` (cleanupEnvironment call)
- Modify: `src/commands/run.ts:407` (tempDirectory assignment)
- Modify: `src/commands/run.ts:66-102` (suite execution flow)

- [ ] **Step 1: Update RunOptions interface**

In `src/commands/run.ts`, add `clean` option to `RunOptions` interface (around line 36):

```typescript
export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  parallel?: boolean;
  model?: string;
  agent?: string;
  runs?: number;
  min_pass?: number;
  quick?: boolean;
  clean?: boolean;  // Add this
}
```

- [ ] **Step 2: Remove cleanupEnvironment import and call**

Remove `cleanupEnvironment` from the import at line 5:
```typescript
import { prepareEnvironment } from '../executor/fixture.js';
```

Remove the cleanup call block (lines 310-319) inside the run loop. Replace with:

```typescript
// After run completes, preserve tempDirectory for result
if (runIndex === 0) {
  preservedTempDirectory = tempDirectory;
}
```

- [ ] **Step 3: Always preserve tempDirectory in result**

Change line 407 from:
```typescript
tempDirectory: scenario.cleanup ? undefined : preservedTempDirectory,
```

To:
```typescript
tempDirectory: preservedTempDirectory,
```

- [ ] **Step 4: Add clean handling after all scenarios complete**

After line 92 (logger.summary call), add clean handling:

```typescript
// Log summary
logger.summary(passedCount, failedCount, totalDuration);

// Clean if --clean option is specified
if (options.clean) {
  await cleanTempDirectories(yamlDirectory);
}

// Generate result
const testResult = generateTestResult(suite, scenarioResults, testPath);
```

Add import for cleanTempDirectories at line 5:
```typescript
import { cleanTempDirectories } from './clean.js';
```

- [ ] **Step 5: Run tests to verify run.test.ts still passes (with adjustments)**

Run: `npm run test tests/commands/run.test.ts`

Expected: Some tests may fail because they mock cleanupEnvironment. Need to update the mock and tests.

- [ ] **Step 6: Update run.test.ts mocks**

In `tests/commands/run.test.ts`:
- Remove `cleanupEnvironment` from the mock at line 20
- Remove `cleanupEnvironment` from the import at line 47
- Remove tests that check cleanupEnvironment calls (lines 141-198, 450-477)

Remove the mock:
```typescript
vi.mock('../../src/executor/fixture.js', () => ({
  prepareEnvironment: vi.fn()
}));
```

Remove tests:
- 'should cleanup environment after scenario' (lines 141-168)
- 'should preserve temp directory when cleanup is false' (lines 170-198)
- 'should pass scenarioName to cleanupEnvironment' (lines 450-477)

Add a new test for --clean option:
```typescript
it('should call cleanTempDirectories when --clean is specified', async () => {
  vi.mock('../../src/commands/clean.js', () => ({
    cleanTempDirectories: vi.fn()
  }));

  const { cleanTempDirectories } = await import('../../src/commands/clean.js');

  const mockSuite: YamlTestSuite = {
    name: 'test',
    environments: { default: { directory: './test', setup: [] } },
    scenarios: [{ name: 'scenario-1', environment: 'default', cleanup: true, steps: [] }],
    config: { agent_cli: { runner: 'opencode', command: 'opencode' } }
  };

  vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
  vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
  vi.mocked(verifyAssertions).mockResolvedValue([]);

  const yamlPath = path.join(TEST_DIR, 'test.yaml');
  await fs.writeFile(yamlPath, 'name: test');

  await runTests(yamlPath, { clean: true });

  expect(cleanTempDirectories).toHaveBeenCalled();
});
```

- [ ] **Step 7: Run all tests to verify**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "refactor: remove cleanup logic from run, add --clean option handling"
```

---

### Task 6: Run Full Test Suite and Build

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

- [ ] **Step 3: Verify CLI commands work**

Run: `node dist/cli.js --help`
Expected: Shows help with 'clean' command listed

Run: `node dist/cli.js run --help`
Expected: Shows help with '--clean' option listed

- [ ] **Step 4: Final commit if any fixes were needed**

If any fixes were made during verification:
```bash
git add -A
git commit -m "fix: final cleanup strategy implementation fixes"
```

---

## Self-Review

**1. Spec coverage:**

| Spec Requirement | Task |
|------------------|------|
| Redesign cleanupEnvironment with new signature | Task 2 |
| Add CleanupResult type | Task 1 |
| Deprecate cleanup field | Task 1 |
| Add agentut clean command | Task 3, 4 |
| Add --clean parameter to run | Task 4, 5 |
| Remove cleanup logic from run.ts | Task 5 |
| Update tests | Task 2, 3, 5, 6 |

**2. Placeholder scan:** No TBD, TODO, or vague descriptions found.

**3. Type consistency:**
- CleanupResult type defined in Task 1, used in Task 2 and Task 3
- cleanTempDirectories function signature matches usage in Task 4 and Task 5
- RunOptions.clean boolean added in Task 5, used in Task 4

All consistent.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-13-cleanup-strategy-redesign.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**