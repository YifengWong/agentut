---
name: console-progress-display-fix
description: 修复多轮执行时控制台进度不实时刷新的问题，实现步骤+运行双重进度显示
type: project
---

# 控制台进度显示修复设计

## 概述

修复多轮执行时控制台日志未实时刷新 `1/5...2/5...3/5...` 的问题，实现步骤+运行双重进度显示。

## Why

用户执行多轮测试时，进度显示不动态更新：
- 当前代码只在 `runIndex === 0` 时调用 `showProgress`
- 后续运行的进度不会实时刷新，用户无法看到当前执行位置
- 用户体验差，难以判断执行进度

## How to Apply

- 移除 `showProgress` 的 `runIndex === 0` 条件限制
- 调整进度消息格式为 `Step X/Y, Run Z/N...`
- 保持 `startStep` 只在第一次运行时调用（步骤标题只需显示一次）

---

## 问题分析

**当前代码 (`src/commands/run.ts` 第 224-228 行)：**

```typescript
// Log step start (只在第一次运行时显示详细日志，避免重复)
if (runIndex === 0) {
  logger.startStep(scenario.name, step.input, stepNumber, totalSteps);
  const progressMsg = isTraditionalSingleRun ? 'executing...' : `executing run ${runIndex + 1}/${effectiveRuns}...`;
  logger.showProgress(scenario.name, progressMsg);
}
```

问题：
- `if (runIndex === 0)` 条件导致进度只在第一次运行时显示
- `showProgress` 使用 `\r` 回到行首覆盖，但后续运行不再调用，无法动态更新

---

## 修改方案

### 1. `src/commands/run.ts` 改动

**位置：** 第 224-228 行附近

**改动内容：**

```typescript
// Log step start (只在第一次运行时显示步骤标题)
if (runIndex === 0) {
  logger.startStep(scenario.name, step.input, stepNumber, totalSteps);
}

// 每次运行都显示进度（动态覆盖）
const progressMsg = isTraditionalSingleRun
  ? 'executing...'
  : `Step ${stepNumber}/${totalSteps}, Run ${runIndex + 1}/${effectiveRuns}...`;
logger.showProgress(scenario.name, progressMsg);
```

**改动要点：**
- `startStep` 保持只在 `runIndex === 0` 时调用
- `showProgress` 移出条件块，每次运行都调用
- 消息格式调整为 `Step X/Y, Run Z/N...`

### 2. `src/output/logger.ts` 改动（可选优化）

**当前 `showProgress` 方法：**

```typescript
showProgress(scenarioName: string, message: string): void {
  process.stdout.write(`\r[${chalk.gray(scenarioName)}] ${chalk.yellow('⏳')} ${message}`);
}
```

**优化建议：** 可选择将消息格式化逻辑移入 Logger，但当前直接在 `run.ts` 传递格式化后的消息更简单，无需改动 Logger。

---

## 预期效果

**传统单次运行模式：**
```
[create-file] Step 1/2: "创建 hello.txt..."
[create-file] ⏳ executing...
[create-file] ✓ Step 1/2 passed (1200ms)
```

**多轮运行模式：**
```
[create-file] Step 1/2: "创建 hello.txt..."
[create-file] ⏳ Step 1/2, Run 1/5...
[create-file] ⏳ Step 1/2, Run 2/5...
[create-file] ⏳ Step 1/2, Run 3/5...
[create-file] ⏳ Step 1/2, Run 4/5...
[create-file] ⏳ Step 1/2, Run 5/5...
[create-file] ✓ Step 1/2 passed (avg 1000ms)
```

---

## 涉及文件

| 文件 | 改动类型 | 改动内容 |
|------|---------|---------|
| `src/commands/run.ts` | 修改 | 移除 `showProgress` 的条件限制，调整消息格式 |
| `src/output/logger.ts` | 无需改动 | 当前实现已满足需求 |

---

## 测试验证

1. **单次运行场景：** 进度显示为 `executing...`，行为不变
2. **多轮运行场景（runs=5）：** 进度动态显示 `Step 1/2, Run 1/5...` → `Run 2/5...` → ...
3. **多步骤多轮场景：** 每个步骤的进度独立显示，切换步骤时标题重新打印