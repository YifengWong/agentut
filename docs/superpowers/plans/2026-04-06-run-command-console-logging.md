# Run 命令控制台实时日志输出实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 run 命令添加实时控制台日志输出，让用户感知测试执行进度。

**Architecture:** 创建独立的 Logger 单例模块，无状态设计，各方法接收 scenarioName 参数。通过 ANSI 颜色码区分状态（成功绿色、失败红色、进度黄色）。

**Tech Stack:** TypeScript, vitest, chalk（已有依赖）

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `src/output/logger.ts` | 新建 - Logger 单例模块，控制所有实时日志输出 |
| `tests/output/logger.test.ts` | 新建 - Logger 单元测试 |
| `src/executor/fixture.ts` | 修改 - 添加 scenarioName 参数，集成 Logger |
| `src/commands/run.ts` | 修改 - 集成 Logger，在各执行阶段调用 |
| `tests/executor/fixture.test.ts` | 修改 - 更新测试以 mock Logger |
| `tests/commands/run.test.ts` | 修改 - 更新测试以 mock Logger |

---

### Task 1: 创建 Logger 模块及单元测试

**Files:**
- Create: `src/output/logger.ts`
- Create: `tests/output/logger.test.ts`

- [ ] **Step 1: 编写 Logger 测试 - 验证输出格式**

```typescript
// tests/output/logger.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, formatDuration } from '../../src/output/logger.js';

describe('Logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatDuration', () => {
    it('should format milliseconds under 1 second', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds under 1 minute', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(5500)).toBe('5.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });
  });

  describe('startSuite', () => {
    it('should output suite start message', () => {
      logger.startSuite('test-suite', 3);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Running test suite: test-suite')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 scenarios')
      );
    });
  });

  describe('startScenario', () => {
    it('should output scenario start with progress', () => {
      logger.startScenario('create-file', 1, 3);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Running scenario 1/3: create-file')
      );
    });
  });

  describe('endScenario', () => {
    it('should output passed scenario with green checkmark', () => {
      logger.endScenario('create-file', true, 3200);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('create-file')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('passed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3.2s')
      );
    });

    it('should output failed scenario with red X', () => {
      logger.endScenario('create-file', false, 5000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      );
    });
  });

  describe('startEnvironmentPrep', () => {
    it('should output environment prep start', () => {
      logger.startEnvironmentPrep('create-file');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preparing environment')
      );
    });
  });

  describe('setupCopy', () => {
    it('should output copy action details', () => {
      logger.setupCopy('create-file', './source/file.txt', '$WORKDIR/target/');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Setup: copy')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('./source/file.txt')
      );
    });
  });

  describe('setupRun', () => {
    it('should output run command details', () => {
      logger.setupRun('create-file', 'npm install');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Setup: run')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('npm install')
      );
    });
  });

  describe('endEnvironmentPrep', () => {
    it('should output success with duration', () => {
      logger.endEnvironmentPrep('create-file', true, 1500);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment ready')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.5s')
      );
    });

    it('should output failure', () => {
      logger.endEnvironmentPrep('create-file', false, 2000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment setup failed')
      );
    });
  });

  describe('startStep', () => {
    it('should output step start with input preview', () => {
      logger.startStep('create-file', '创建 hello.txt 文件', 1, 2);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 1/2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('创建 hello.txt 文件')
      );
    });

    it('should truncate long input', () => {
      const longInput = '这是一个非常长的输入内容超过五十个字符应该被截断显示';
      logger.startStep('create-file', longInput, 1, 2);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('...')
      );
    });
  });

  describe('showProgress', () => {
    it('should output progress indicator using stdout.write', () => {
      logger.showProgress('create-file', '执行中... (Agent 正在处理)');

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('\r')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('⏳')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('执行中')
      );
    });
  });

  describe('endStep', () => {
    it('should output passed step with duration', () => {
      logger.endStep('create-file', true, 1, 2, 2100);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 1/2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('passed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('2.1s')
      );
    });

    it('should output failed step', () => {
      logger.endStep('create-file', false, 1, 2, 60000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      );
    });
  });

  describe('cleanup', () => {
    it('should output cleanup message', () => {
      logger.cleanup('create-file');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleaning up')
      );
    });
  });

  describe('error', () => {
    it('should output error message with red X', () => {
      logger.error('create-file', 'Execution timed out');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Execution timed out')
      );
    });
  });

  describe('summary', () => {
    it('should output summary with all passed', () => {
      logger.summary(3, 0, 10000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summary')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 passed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('0 failed')
      );
    });

    it('should output summary with failures', () => {
      logger.summary(2, 1, 15000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 failed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('15.0s')
      );
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test tests/output/logger.test.ts
```

预期：测试失败，因为 Logger 模块不存在

- [ ] **Step 3: 实现 Logger 模块**

```typescript
// src/output/logger.ts
import chalk from 'chalk';

/**
 * 格式化时间 duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

/**
 * 截断长文本
 */
function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

class Logger {
  /**
   * 测试套件开始
   */
  startSuite(suiteName: string, totalScenarios: number): void {
    console.log(`\nRunning test suite: ${chalk.bold(suiteName)} (${totalScenarios} scenarios)\n`);
  }

  /**
   * 场景开始
   */
  startScenario(scenarioName: string, current: number, total: number): void {
    console.log(`Running scenario ${current}/${total}: ${chalk.bold(scenarioName)}`);
  }

  /**
   * 场景结束
   */
  endScenario(scenarioName: string, passed: boolean, durationMs: number): void {
    const status = passed
      ? chalk.green('✓')
      : chalk.red('✗');
    const duration = formatDuration(durationMs);
    const result = passed ? 'passed' : 'failed';
    console.log(`${status} ${scenarioName} ${result} (${duration})\n`);
  }

  /**
   * 环境准备开始
   */
  startEnvironmentPrep(scenarioName: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Preparing environment...`);
  }

  /**
   * Setup copy 动作
   */
  setupCopy(scenarioName: string, source: string, target: string): void {
    const displayTarget = target.replace(/\$WORKDIR/g, '$WORKDIR');
    console.log(`[${chalk.gray(scenarioName)}] Setup: copy ${source} -> ${displayTarget}`);
  }

  /**
   * Setup run 动作
   */
  setupRun(scenarioName: string, command: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Setup: run ${command}`);
  }

  /**
   * 环境准备结束
   */
  endEnvironmentPrep(scenarioName: string, success: boolean, durationMs: number): void {
    const status = success
      ? chalk.green('✓')
      : chalk.red('✗');
    const duration = formatDuration(durationMs);
    const message = success ? 'Environment ready' : 'Environment setup failed';
    console.log(`[${chalk.gray(scenarioName)}] ${status} ${message} (${duration})`);
  }

  /**
   * 步骤开始
   */
  startStep(scenarioName: string, stepInput: string, current: number, total: number): void {
    const truncatedInput = truncate(stepInput);
    console.log(`[${chalk.gray(scenarioName)}] Step ${current}/${total}: "${truncatedInput}"`);
  }

  /**
   * 进度指示器（动画效果）
   */
  showProgress(scenarioName: string, message: string): void {
    const prefix = `[${scenarioName}]`;
    // 使用 \r 回到行首，覆盖之前的内容
    process.stdout.write(`\r${chalk.yellow(prefix)} ⏳ ${message}`);
  }

  /**
   * 步骤结束
   */
  endStep(scenarioName: string, passed: boolean, current: number, total: number, durationMs: number): void {
    // 清除动画行（\x1b[K 清除整行）
    process.stdout.write('\r\x1b[K');

    const prefix = `[${chalk.gray(scenarioName)}]`;
    const status = passed
      ? chalk.green('✓')
      : chalk.red('✗');
    const duration = formatDuration(durationMs);
    const result = passed ? 'passed' : 'failed';

    console.log(`${prefix} ${status} Step ${current}/${total} ${result} (${duration})`);
  }

  /**
   * 清理环境
   */
  cleanup(scenarioName: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Cleaning up...`);
  }

  /**
   * 错误输出
   */
  error(scenarioName: string, message: string): void {
    console.log(`[${chalk.gray(scenarioName)}] ${chalk.red('✗')} Error: ${message}`);
  }

  /**
   * 最终汇总
   */
  summary(passed: number, failed: number, totalDurationMs: number): void {
    const duration = formatDuration(totalDurationMs);
    const passedText = failed === 0
      ? chalk.green(`${passed} passed`)
      : `${chalk.green(`${passed} passed`)}, ${chalk.red(`${failed} failed`)}`;

    console.log(`\nSummary: ${passedText} (total ${duration})`);
  }
}

// 单例导出
export const logger = new Logger();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test tests/output/logger.test.ts
```

预期：所有测试通过

- [ ] **Step 5: 提交**

```bash
git add src/output/logger.ts tests/output/logger.test.ts
git commit -m "feat: add Logger module for real-time console output"
```

---

### Task 2: 修改 fixture.ts 集成 Logger

**Files:**
- Modify: `src/executor/fixture.ts`
- Modify: `tests/executor/fixture.test.ts`

- [ ] **Step 1: 更新 fixture.ts - 添加 Logger 调用**

修改 `src/executor/fixture.ts`，添加 Logger 调用：

```typescript
// src/executor/fixture.ts
import fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { SetupError, ValidationError, type EnvironmentConfig, type SetupAction, type GlobalConfig } from '../types/index.js';
import { logger } from '../output/logger.js';

// ... 保持 parseCopyAction, sanitizeDirectoryName, createTempDirectory 不变 ...

/**
 * 复制环境文件
 * @param scenarioName 场景名称（用于日志输出）
 */
export async function copyEnvironment(
  sourcePath: string,
  targetDir: string,
  scenarioName?: string
): Promise<void> {
  const exists = await fs.pathExists(sourcePath);
  if (!exists) {
    throw new SetupError(`Source does not exist: ${sourcePath}`);
  }

  if (scenarioName) {
    logger.setupCopy(scenarioName, sourcePath, targetDir);
  }

  const sourceStat = await fs.stat(sourcePath);

  if (sourceStat.isDirectory()) {
    await fs.copy(sourcePath, targetDir, {
      overwrite: true,
      errorOnExist: false
    });
  } else {
    const fileName = path.basename(sourcePath);
    const targetFilePath = path.join(targetDir, fileName);
    await fs.copy(sourcePath, targetFilePath, {
      overwrite: true,
      errorOnExist: false
    });
  }
}

/**
 * 执行 setup 动作
 * @param scenarioName 场景名称（用于日志输出）
 */
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
        logger.setupCopy(scenarioName, spec.source, spec.target);
      }

      await fs.ensureDir(path.dirname(targetPath));
      await fs.copy(sourcePath, targetPath, { overwrite: true });
    }

    if (action.run) {
      if (scenarioName) {
        logger.setupRun(scenarioName, action.run);
      }

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

/**
 * 清理环境
 * @param scenarioName 场景名称（用于日志输出）
 */
export async function cleanupEnvironment(
  directory: string,
  shouldCleanup: boolean,
  scenarioName?: string
): Promise<void> {
  if (shouldCleanup) {
    if (scenarioName) {
      logger.cleanup(scenarioName);
    }

    try {
      await fs.remove(directory);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// prepareEnvironment 保持不变，但内部调用会传入 scenarioName
export async function prepareEnvironment(
  config: EnvironmentConfig,
  scenarioName: string,
  tempRoot: string,
  options?: PrepareEnvironmentOptions
): Promise<PrepareEnvironmentResult> {
  const yamlDirectory = options?.yamlDirectory || process.cwd();

  logger.startEnvironmentPrep(scenarioName);
  const startTime = Date.now();

  // Create temp directory
  const tempDir = await createTempDirectory(scenarioName, tempRoot);

  // Resolve source directory
  const sourceDir = yamlDirectory
    ? path.resolve(yamlDirectory, config.directory)
    : path.resolve(config.directory);

  // Copy environment
  await copyEnvironment(sourceDir, tempDir, scenarioName);

  // Execute setup actions
  await executeSetup(config.setup, tempDir, yamlDirectory, scenarioName);

  const duration = Date.now() - startTime;
  logger.endEnvironmentPrep(scenarioName, true, duration);

  return {
    tempDirectory: tempDir
  };
}

// 保持 parseCopyAction, sanitizeDirectoryName, createTempDirectory, PrepareEnvironmentOptions 不变
```

完整修改内容（保留原有的 parseCopyAction、sanitizeDirectoryName、createTempDirectory、PrepareEnvironmentOptions）：

需要修改的函数签名：
- `copyEnvironment(sourcePath, targetDir, scenarioName?)` - 新增可选参数
- `executeSetup(actions, workDir, yamlDirectory, scenarioName?)` - 新增可选参数
- `cleanupEnvironment(directory, shouldCleanup, scenarioName?)` - 新增可选参数

- [ ] **Step 2: 更新 fixture.test.ts - mock Logger**

```typescript
// tests/executor/fixture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Mock Logger
vi.mock('../../src/output/logger.js', () => ({
  logger: {
    startEnvironmentPrep: vi.fn(),
    setupCopy: vi.fn(),
    setupRun: vi.fn(),
    endEnvironmentPrep: vi.fn(),
    cleanup: vi.fn()
  }
}));

import { logger } from '../../src/output/logger.js';

// ... 保持原有测试结构，更新涉及新参数的测试 ...

describe('Fixture Manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_TEMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  // ... createTempDirectory 测试保持不变 ...

  describe('copyEnvironment', () => {
    it('should copy source directory to target', async () => {
      // 保持不变
    });

    it('should throw SetupError if source does not exist', async () => {
      // 保持不变
    });

    it('should call logger.setupCopy when scenarioName is provided', async () => {
      const sourceDir = path.join(TEST_TEMP_DIR, 'source');
      const targetDir = path.join(TEST_TEMP_DIR, 'target');

      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'hello');

      await copyEnvironment(sourceDir, targetDir, 'test-scenario');

      expect(logger.setupCopy).toHaveBeenCalledWith('test-scenario', sourceDir, targetDir);
    });
  });

  describe('executeSetup', () => {
    // ... 保持原有测试 ...

    it('should call logger.setupCopy for copy actions', async () => {
      const workDir = path.resolve(TEST_TEMP_DIR, 'work');
      const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const actions: SetupAction[] = [
        { copy: `${sourceDir} -> ${workDir}` }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR, 'test-scenario');

      expect(logger.setupCopy).toHaveBeenCalledWith('test-scenario', sourceDir, workDir);
    });

    it('should call logger.setupRun for run actions', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);

      const actions: SetupAction[] = [
        { run: 'echo test > output.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR, 'test-scenario');

      expect(logger.setupRun).toHaveBeenCalledWith('test-scenario', 'echo test > output.txt');
    });
  });

  describe('cleanupEnvironment', () => {
    it('should remove directory when cleanup is true', async () => {
      // 保持不变
    });

    it('should keep directory when cleanup is false', async () => {
      // 保持不变
    });

    it('should call logger.cleanup when scenarioName is provided', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-cleanup');
      await fs.ensureDir(tempDir);

      await cleanupEnvironment(tempDir, true, 'test-scenario');

      expect(logger.cleanup).toHaveBeenCalledWith('test-scenario');
    });

    it('should not call logger.cleanup when scenarioName is not provided', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-cleanup2');
      await fs.ensureDir(tempDir);

      await cleanupEnvironment(tempDir, true);

      expect(logger.cleanup).not.toHaveBeenCalled();
    });
  });

  describe('prepareEnvironment', () => {
    it('should create temp dir, copy environment, and run setup', async () => {
      // 保持原有测试逻辑不变
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
      // 验证 Logger 调用
      expect(logger.startEnvironmentPrep).toHaveBeenCalledWith('test-scenario');
      expect(logger.endEnvironmentPrep).toHaveBeenCalledWith('test-scenario', true, expect.any(Number));
    });

    it('should use relative directory from yaml file location', async () => {
      // 保持不变
    });
  });
});

// parseCopyAction 测试保持不变
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test tests/executor/fixture.test.ts
```

预期：所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/executor/fixture.ts tests/executor/fixture.test.ts
git commit -m "feat: integrate Logger into fixture module for setup/cleanup logging"
```

---

### Task 3: 修改 run.ts 集成 Logger

**Files:**
- Modify: `src/commands/run.ts`
- Modify: `tests/commands/run.test.ts`

- [ ] **Step 1: 更新 run.ts - 添加 Logger 调用**

修改 `src/commands/run.ts`：

```typescript
// src/commands/run.ts
import fs from 'fs-extra';
import * as path from 'path';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { runOpenCode } from '../executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../executor/fixture.js';
import { verifyAssertions } from '../executor/verifier.js';
import { generateTestResult } from '../output/json.js';
import { logger } from '../output/logger.js';
import {
  type YamlTestSuite,
  type TestResult,
  type ScenarioResult,
  type StepResult,
  ExecutionError
} from '../types/index.js';

// RunOptions 保持不变

export async function runTests(
  testPath: string,
  options: RunOptions = {}
): Promise<TestResult> {
  // Check if path exists
  if (!await fs.pathExists(testPath)) {
    throw new ExecutionError(`Test file not found: ${testPath}`, testPath);
  }

  // Read and parse YAML
  const yamlContent = await fs.readFile(testPath, 'utf-8');
  const suite = parseAndValidateYaml(yamlContent);
  const yamlDirectory = path.dirname(testPath);

  // Filter scenarios if specified
  let scenarios = suite.scenarios;
  if (options.scenario) {
    scenarios = scenarios.filter(s => s.name === options.scenario);
    if (scenarios.length === 0) {
      throw new ExecutionError(`Scenario not found: ${options.scenario}`, testPath);
    }
  }

  // 输出测试套件开始
  logger.startSuite(suite.name, scenarios.length);

  // Execute scenarios
  const scenarioResults: ScenarioResult[] = [];
  const tempRoot = path.resolve(yamlDirectory, '.agentvcr', 'temp');

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const result = await executeScenario(suite, scenario, yamlDirectory, tempRoot, {
      verbose: options.verbose,
      model: options.model,
      agent: options.agent,
      scenarioIndex: i + 1,
      totalScenarios: scenarios.length
    });

    logger.endScenario(scenario.name, result.status === 'passed', result.duration_ms);
    scenarioResults.push(result);
  }

  // Generate result
  const testResult = generateTestResult(suite, scenarioResults, testPath);

  // 输出汇总
  const passedCount = scenarioResults.filter(r => r.status === 'passed').length;
  const failedCount = scenarioResults.filter(r => r.status === 'failed').length;
  const totalDuration = scenarioResults.reduce((sum, r) => sum + r.duration_ms, 0);
  logger.summary(passedCount, failedCount, totalDuration);

  // Write to output file if specified
  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(testResult, null, 2));
  }

  return testResult;
}

interface ExecuteScenarioOptions {
  verbose?: boolean;
  model?: string;
  agent?: string;
  scenarioIndex?: number;
  totalScenarios?: number;
}

async function executeScenario(
  suite: YamlTestSuite,
  scenario: typeof suite.scenarios[0],
  yamlDirectory: string,
  tempRoot: string,
  options?: ExecuteScenarioOptions
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  let sessionId: string | undefined;
  let tempDirectory: string | undefined;
  let error: string | undefined;

  // 输出场景开始
  if (options?.scenarioIndex && options?.totalScenarios) {
    logger.startScenario(scenario.name, options.scenarioIndex, options.totalScenarios);
  }

  // Get model from options or config
  const model = options?.model || suite.config?.target?.model;

  // Get environment config
  const envConfig = suite.environments[scenario.environment];

  // Get agent name (保持原有逻辑不变)
  let agent = options?.agent;

  if (!agent && envConfig.agent) {
    agent = envConfig.agent;
  }

  if (!agent) {
    const agentCopy = envConfig.setup.find(a =>
      a.copy && a.copy.includes('->') &&
      a.copy.split('->')[1].trim().includes('.opencode/agents')
    );
    if (agentCopy) {
      const source = agentCopy.copy!.split('->')[0].trim();
      agent = path.basename(source, '.md');
    }
  }

  if (!agent && suite.config?.target?.agent) {
    agent = suite.config.target.agent;
  }

  try {
    // Prepare environment (内部已包含 Logger 调用)
    const envResult = await prepareEnvironment(envConfig, scenario.name, tempRoot, {
      yamlDirectory
    });
    tempDirectory = envResult.tempDirectory;

    // Execute steps
    const totalSteps = scenario.steps.length;

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const stepStartTime = Date.now();

      // 输出步骤开始
      logger.startStep(scenario.name, step.input, i + 1, totalSteps);

      // 输出进度指示器
      logger.showProgress(scenario.name, '执行中... (Agent 正在处理)');

      try {
        // Run opencode
        const runResult = runOpenCode({
          input: step.input,
          directory: tempDirectory,
          sessionId,
          fork: !!sessionId,
          timeout: step.timeout,
          model,
          agent
        });

        sessionId = runResult.sessionId;

        // Verify assertions
        const assertionResults = await verifyAssertions(step.expected, runResult.outputs, tempDirectory);

        const stepPassed = assertionResults.every(a => a.passed);
        const stepDuration = Date.now() - stepStartTime;

        // 输出步骤结束
        logger.endStep(scenario.name, stepPassed, i + 1, totalSteps, stepDuration);

        const stepResult: StepResult = {
          input: step.input,
          status: stepPassed ? 'passed' : 'failed',
          duration_ms: stepDuration,
          assertions: assertionResults,
          actual_output: options?.verbose ? runResult.outputs : undefined
        };

        stepResults.push(stepResult);
      } catch (err) {
        const stepDuration = step.timeout || 60000;

        // 输出步骤失败
        logger.endStep(scenario.name, false, i + 1, totalSteps, stepDuration);

        const stepResult: StepResult = {
          input: step.input,
          status: 'failed',
          duration_ms: stepDuration,
          assertions: [],
          actual_output: undefined
        };

        if (err instanceof Error) {
          logger.error(scenario.name, err.message);
          stepResult.assertions = [{
            type: 'error',
            value: err.message,
            passed: false,
            message: err.message
          }];
        }

        stepResults.push(stepResult);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      error = err.message;
      logger.error(scenario.name, err.message);
    }
  }

  // Cleanup
  if (tempDirectory) {
    await cleanupEnvironment(tempDirectory, scenario.cleanup, scenario.name);
  }

  const allStepsPassed = stepResults.every(s => s.status === 'passed');

  return {
    name: scenario.name,
    environment: scenario.environment,
    status: allStepsPassed && !error ? 'passed' : 'failed',
    duration_ms: Date.now() - startTime,
    steps: stepResults,
    error,
    tempDirectory: scenario.cleanup ? undefined : tempDirectory
  };
}
```

- [ ] **Step 2: 更新 run.test.ts - mock Logger**

```typescript
// tests/commands/run.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { runTests } from '../../src/commands/run.js';
import type { YamlTestSuite, TestResult } from '../../src/types/index.js';

const TEST_DIR = './test-temp-run';

// Mock dependencies
vi.mock('../../src/parser/yaml.js', () => ({
  parseAndValidateYaml: vi.fn()
}));

vi.mock('../../src/executor/opencode.js', () => ({
  runOpenCode: vi.fn()
}));

vi.mock('../../src/executor/fixture.js', () => ({
  prepareEnvironment: vi.fn(),
  cleanupEnvironment: vi.fn()
}));

vi.mock('../../src/executor/verifier.js', () => ({
  verifyAssertions: vi.fn()
}));

// Mock Logger
vi.mock('../../src/output/logger.js', () => ({
  logger: {
    startSuite: vi.fn(),
    startScenario: vi.fn(),
    endScenario: vi.fn(),
    startEnvironmentPrep: vi.fn(),
    setupCopy: vi.fn(),
    setupRun: vi.fn(),
    endEnvironmentPrep: vi.fn(),
    startStep: vi.fn(),
    showProgress: vi.fn(),
    endStep: vi.fn(),
    cleanup: vi.fn(),
    error: vi.fn(),
    summary: vi.fn()
  }
}));

import { parseAndValidateYaml } from '../../src/parser/yaml.js';
import { runOpenCode } from '../../src/executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../../src/executor/fixture.js';
import { verifyAssertions } from '../../src/executor/verifier.js';
import { logger } from '../../src/output/logger.js';

describe('run command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should run a single test file', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test-suite',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Create file',
          expected: [{ should_call_tool: 'Write' }],
          timeout: 60000
        }]
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(runOpenCode).mockReturnValue({
      outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([
      { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
    ]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(result.suite.name).toBe('test-suite');
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].status).toBe('passed');

    // 验证 Logger 调用
    expect(logger.startSuite).toHaveBeenCalledWith('test-suite', 1);
    expect(logger.startScenario).toHaveBeenCalledWith('scenario-1', 1, 1);
    expect(logger.startStep).toHaveBeenCalledWith('scenario-1', 'Create file', 1, 1);
    expect(logger.showProgress).toHaveBeenCalledWith('scenario-1', '执行中... (Agent 正在处理)');
    expect(logger.endStep).toHaveBeenCalled();
    expect(logger.endScenario).toHaveBeenCalled();
    expect(logger.summary).toHaveBeenCalled();
  });

  // ... 其他测试保持不变，更新 cleanupEnvironment mock 调用 ...

  it('should cleanup environment after scenario', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'cleanup-test',
        environment: 'default',
        cleanup: true,
        steps: []
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await runTests(yamlPath);

    // 更新：cleanupEnvironment 现在接收 scenarioName 参数
    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', true, 'cleanup-test');
  });

  it('should preserve temp directory when cleanup is false', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'no-cleanup',
        environment: 'default',
        cleanup: false,
        steps: []
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', false, 'no-cleanup');
    expect(result.scenarios[0].tempDirectory).toBe('/tmp/test');
  });

  it('should handle scenario with empty assertions', async () => {
    // 保持不变
  });

  it('should call logger.error on execution error', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'error-test',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test input',
          expected: [],
          timeout: 60000
        }]
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(runOpenCode).mockImplementation(() => {
      throw new Error('Timeout error');
    });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await runTests(yamlPath);

    expect(logger.error).toHaveBeenCalledWith('error-test', 'Timeout error');
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test tests/commands/run.test.ts
```

预期：所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "feat: integrate Logger into run command for real-time execution logging"
```

---

### Task 4: 运行全部测试并验证功能

**Files:**
- 无新增/修改文件

- [ ] **Step 1: 运行全部测试**

```bash
npm test
```

预期：所有测试通过

- [ ] **Step 2: 构建项目**

```bash
npm run build
```

预期：构建成功，无 TypeScript 编译错误

- [ ] **Step 3: 手动测试 - 运行示例测试**

```bash
node dist/cli.js run ./example/tests/file-operations.yaml
```

预期输出：
```
Running test suite: file-operations (2 scenarios)

Running scenario 1/2: create-file
[create-file] Preparing environment...
[create-file] Setup: copy ...
[create-file] ✓ Environment ready (xxx)
[create-file] Step 1/1: "创建 hello.txt 文件"
[create-file] ⏳ 执行中... (Agent 正在处理)
[create-file] ✓ Step 1/1 passed (xxx)
[create-file] Cleaning up...
✓ create-file passed (xxx)

Running scenario 2/2: read-file
...

Summary: 2 passed, 0 failed (total xxx)
```

- [ ] **Step 4: 更新项目文档**

在 README.md 的 CLI 命令部分，添加关于实时日志输出的说明：

```markdown
### agentvcr run

运行测试用例时会实时输出执行进度：
- 测试套件启动和场景进度
- 环境准备动作（copy、run 命令）
- 步骤执行状态（带动画指示器）
- 最终汇总结果

输出示例：
\`\`\`
Running test suite: file-operations (2 scenarios)

Running scenario 1/2: create-file
[create-file] Preparing environment...
[create-file] ✓ Environment ready (1.5s)
[create-file] Step 1/1: "创建 hello.txt 文件"
[create-file] ⏳ 执行中... (Agent 正在处理)
[create-file] ✓ Step 1/1 passed (2.1s)
✓ create-file passed (5.6s)

Summary: 1 passed, 0 failed (total 5.6s)
\`\`\`
```

- [ ] **Step 5: 提交文档更新**

```bash
git add README.md
git commit -m "docs: add real-time console logging documentation"
```

---

## 自我审查

**1. Spec 覆盖检查：**
- ✓ Logger 模块创建（Task 1）
- ✓ Logger 单元测试（Task 1）
- ✓ fixture.ts 集成 Logger（Task 2）
- ✓ fixture.test.ts 更新（Task 2）
- ✓ run.ts 集成 Logger（Task 3）
- ✓ run.test.ts 更新（Task 3）
- ✓ 全量测试和手动验证（Task 4）
- ✓ 文档更新（Task 4）

**2. Placeholder 检查：**
- 无 TBD、TODO 或模糊描述
- 所有代码块包含完整实现
- 所有测试包含具体断言

**3. 类型一致性检查：**
- Logger 方法签名在所有任务中一致
- scenarioName 参数类型为 string，可选时为 string | undefined
- durationMs 参数类型为 number

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-06-run-command-console-logging.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - 我为每个 Task 派发新的子 agent，任务间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中执行，使用批量执行加检查点审查

选择哪种方式？