# Run 命令控制台实时日志输出设计

## 背景

当前运行 `agentvcr run` 命令时，控制台没有任何实时输出，用户无法感知测试执行进度。测试可能需要数十秒甚至更长，用户在等待期间无法判断程序是否正常运行。

## 目标

增加实时日志输出，让用户能够感知：
- 环境准备进度（copy 文件、执行 setup 命令）
- 场景运行步骤（简要）
- 场景清理动作
- 整体进度和最终汇总

## 设计方案

### 1. 文件结构

新建文件：
```
src/output/logger.ts
```

Logger 模块与现有 formatter 模块职责分离：
- `formatter`（markdown/html/json）：最终结果的格式化输出
- `logger`：执行过程的实时日志

### 2. Logger 接口设计（无状态）

Logger 采用无状态设计，所有方法接收必要的参数，内部只做格式化输出。

```typescript
// src/output/logger.ts

class Logger {
  // 测试整体开始
  startSuite(suiteName: string, totalScenarios: number): void;

  // 场景级别
  startScenario(scenarioName: string, current: number, total: number): void;
  endScenario(scenarioName: string, passed: boolean, durationMs: number): void;

  // 环境准备
  startEnvironmentPrep(scenarioName: string): void;
  setupCopy(scenarioName: string, source: string, target: string): void;
  setupRun(scenarioName: string, command: string): void;
  endEnvironmentPrep(scenarioName: string, success: boolean, durationMs: number): void;

  // 步骤执行
  startStep(scenarioName: string, stepInput: string, current: number, total: number): void;
  showProgress(scenarioName: string, message: string): void;
  endStep(scenarioName: string, passed: boolean, current: number, total: number, durationMs: number): void;

  // 清理
  cleanup(scenarioName: string): void;

  // 错误
  error(scenarioName: string, message: string): void;

  // 最终汇总
  summary(passed: number, failed: number, totalDurationMs: number): void;
}

// 单例导出
export const logger = new Logger();
```

### 3. 颜色方案

使用 ANSI 颜色码，无需额外依赖：

```typescript
const COLORS = {
  green: '\x1b[32m',   // 成功 ✓
  red: '\x1b[31m',     // 失败 ✗
  yellow: '\x1b[33m',  // 进度 ⏳
  gray: '\x1b[90m',    // 场景名前缀
  reset: '\x1b[0m',
};

// 示例输出格式
// [create-file] ✓ Step 1 passed (2.1s)  <-- 绿色 ✓
// [create-file] ✗ Step 2 failed        <-- 红色 ✗
// [create-file] ⏳ 执行中...            <-- 黄色 ⏳
```

### 4. 动画指示器实现

使用 `\r` 回车符实现行内更新，避免输出过多行：

```typescript
showProgress(scenarioName: string, message: string): void {
  const prefix = this.formatPrefix(scenarioName);
  // \r 回到行首，覆盖之前的内容
  process.stdout.write(`\r${COLORS.yellow}${prefix} ⏳ ${message}${COLORS.reset}`);
}

endStep(scenarioName: string, passed: boolean, current: number, total: number, durationMs: number): void {
  // 清除动画行
  process.stdout.write('\r\x1b[K');  // \x1b[K 清除整行

  const prefix = this.formatPrefix(scenarioName);
  const status = passed
    ? `${COLORS.green}✓${COLORS.reset}`
    : `${COLORS.red}✗${COLORS.reset}`;
  const duration = formatDuration(durationMs);

  console.log(`${prefix} ${status} Step ${current}/${total} ${passed ? 'passed' : 'failed'} (${duration})`);
}
```

### 5. 输出示例

完整执行流程的输出效果：

```
Running test suite: file-operations (3 scenarios)

Running scenario 1/3: create-file
[create-file] Preparing environment...
[create-file] Setup: copy skill.md -> $WORKDIR/.opencode/agents/
[create-file] ✓ Copy completed
[create-file] Setup: npm install
[create-file] ✓ Run completed (3.2s)
[create-file] ✓ Environment ready (1.5s)
[create-file] Step 1/2: "创建 hello.txt 文件"
[create-file] ⏳ 执行中... (Agent 正在处理)
[create-file] ✓ Step 1 passed (2.1s)
[create-file] Step 2/2: "读取文件内容"
[create-file] ⏳ 执行中... (Agent 正在处理)
[create-file] ✓ Step 2 passed (0.9s)
[create-file] Cleaning up...
[create-file] ✓ Cleanup completed
[create-file] ✓ Scenario passed (5.6s)

Running scenario 2/3: read-file
[read-file] Preparing environment...
...
[read-file] ✓ Scenario passed (3.2s)

Running scenario 3/3: multi-step
[multi-step] Preparing environment...
[multi-step] Step 1/3: "创建配置文件"
[multi-step] ⏳ 执行中... (Agent 正在处理)
[multi-step] ✗ Step 1 failed (timeout)
[multi-step] Cleaning up...
[multi-step] ✗ Scenario failed (60s)

Summary: 2 passed, 1 failed (total 68.8s)
```

### 6. 集成改动

**run.ts 改动：**

```typescript
import { logger } from '../output/logger.js';

export async function runTests(testPath: string, options: RunOptions): Promise<TestResult> {
  // ...

  logger.startSuite(suite.name, scenarios.length);

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    logger.startScenario(scenario.name, i + 1, scenarios.length);

    const result = await executeScenario(suite, scenario, yamlDirectory, tempRoot, {
      verbose: options.verbose,
      model: options.model,
      agent: options.agent
    });

    logger.endScenario(scenario.name, result.status === 'passed', result.duration_ms);
    scenarioResults.push(result);
  }

  const totalDuration = scenarioResults.reduce((sum, r) => sum + r.duration_ms, 0);
  logger.summary(
    scenarioResults.filter(r => r.status === 'passed').length,
    scenarioResults.filter(r => r.status === 'failed').length,
    totalDuration
  );

  return testResult;
}

async function executeScenario(...): Promise<ScenarioResult> {
  // ...
  logger.startEnvironmentPrep(scenario.name);

  // prepareEnvironment 内部调用 logger.setupCopy/setupRun

  logger.endEnvironmentPrep(scenario.name, true, prepDuration);

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    logger.startStep(scenario.name, step.input, i + 1, scenario.steps.length);

    // 执行时调用 logger.showProgress

    // 验证后调用
    logger.endStep(scenario.name, passed, i + 1, scenario.steps.length, duration);
  }

  logger.cleanup(scenario.name);

  // ...
}
```

**fixture.ts 改动：**

```typescript
import { logger } from '../output/logger.js';

export async function prepareEnvironment(
  config: EnvironmentConfig,
  scenarioName: string,  // 新增参数
  tempRoot: string,
  options?: PrepareEnvironmentOptions
): Promise<PrepareEnvironmentResult> {
  // ...

  logger.startEnvironmentPrep(scenarioName);

  await copyEnvironment(sourceDir, tempDir, scenarioName);

  await executeSetup(config.setup, tempDir, yamlDirectory, scenarioName);

  // ...
}

export async function copyEnvironment(
  sourcePath: string,
  targetDir: string,
  scenarioName?: string  // 新增参数
): Promise<void> {
  if (scenarioName) {
    logger.setupCopy(scenarioName, sourcePath, targetDir);
  }
  // 执行 copy...
}

export async function executeSetup(
  actions: SetupAction[],
  workDir: string,
  yamlDirectory: string,
  scenarioName?: string  // 新增参数
): Promise<void> {
  for (const action of actions) {
    if (action.copy && scenarioName) {
      const spec = parseCopyAction(action.copy, workDir);
      logger.setupCopy(scenarioName, spec.source, spec.target);
      // 执行...
    }

    if (action.run && scenarioName) {
      logger.setupRun(scenarioName, action.run);
      // 执行...
    }
  }
}

export async function cleanupEnvironment(
  directory: string,
  shouldCleanup: boolean,
  scenarioName?: string  // 新增参数
): Promise<void> {
  if (shouldCleanup && scenarioName) {
    logger.cleanup(scenarioName);
  }
  // 执行 cleanup...
}
```

### 7. 时间格式化

统一的时间格式化函数：

```typescript
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}
```

### 8. 错误处理

当步骤执行出错时，Logger 输出错误信息：

```typescript
// 在 executeScenario 的 catch 块中
catch (err) {
  if (err instanceof Error) {
    logger.error(scenario.name, err.message);
  }
}
```

输出示例：
```
[create-file] ✗ Error: OpenCode execution timed out after 60000ms
```

## 实现范围

1. 新建 `src/output/logger.ts`
2. 修改 `src/commands/run.ts`：添加 Logger 调用
3. 修改 `src/executor/fixture.ts`：添加 scenarioName 参数和 Logger 调用
4. 修改 `src/executor/opencode.ts`：添加进度指示器调用（可选）

## 不涉及

- 测试结果的格式化输出（现有 formatter 模块）
- 新增 CLI 参数（未来可扩展 --quiet/--verbose）
- 并行执行时的日志处理（当前仅支持串行）