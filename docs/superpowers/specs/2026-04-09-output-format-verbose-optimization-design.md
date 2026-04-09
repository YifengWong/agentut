---
title: 输出格式 verbose 优化设计
date: 2026-04-09
status: approved
---

# 输出格式 verbose 优化设计

## 概述

移除 `--verbose` 参数，将详尽程度内化为各输出格式的固有属性，并优化 HTML 对多次运行的展示。

## 改动摘要

| 改动项 | 改动内容 |
|-------|---------|
| CLI 参数 | 移除 `--verbose` 参数 |
| 数据收集 | `StepResult.actual_output` 始终收集（不再受 verbose 控制） |
| JSON 输出 | 保持全量输出（含 actual_output、runs 详情） |
| HTML 输出 | 新增多运行详情展示（折叠/展开），展示完整 actual_output |
| Markdown 输出 | 展示多运行基本信息（状态、耗时），不展示 actual_output |
| Jest 输出 | 断言级别 assertionResults，展示失败详情（通过率、失败原因） |

## 数据结构设计

当前 `StepResult` 已有概率测试的扩展字段，无需新增核心类型。

### 新增改动

为 `RunExecution` 添加 `output` 字段，存储每次运行的详细输出：

```typescript
interface RunExecution {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  error?: string;
  output?: OpenCodeRunOutput[];  // 新增：每次运行的 actual_output
}
```

### 现有类型（保持不变）

```typescript
interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];  // 始终收集（移除 verbose 控制）

  // 概率测试扩展字段
  runs?: RunExecution[];
  summary?: StepSummary;
  assertionSummaries?: AssertionSummary[];
}
```

## 格式化器输出设计

### JSON 输出（详尽）

保持现有逻辑，全量输出所有字段：
- `actual_output`：完整的 Agent 输出
- `runs`：每次运行的完整详情（含新增的 `output` 字段）
- `summary`、`assertionSummaries`：汇总统计

**原则**：JSON 是原始数据格式，保持完整性。

### HTML 输出（详尽）

新增多运行详情展示：

```html
<!-- 概率测试场景：展示多次运行 -->
<div class="runs-summary">
  <strong>运行统计:</strong> 10 次运行，9 次通过（要求 ≥ 8）✓
</div>

<div class="runs-details">
  <h4>运行详情</h4>

  <!-- 每次运行：可折叠展开 -->
  <details class="run-item">
    <summary class="run-header">
      <span class="status passed">✓</span> 运行 1 (passed, 5200ms)
    </summary>
    <div class="run-content">
      <!-- 断言结果 -->
      <div class="assertions">...</div>
      <!-- actual_output 详情 -->
      <div class="session-output">...</div>
    </div>
  </details>

  <details class="run-item failed">
    <summary class="run-header">
      <span class="status failed">✗</span> 运行 3 (failed, 60000ms)
    </summary>
    <div class="run-content">
      <!-- 断言结果 + 失败消息 -->
      <!-- actual_output 详情 -->
      <!-- error 信息 -->
    </div>
  </details>
  ...
</div>
```

**设计要点**：
- 使用 `<details>` 元素实现折叠/展开
- 每次运行展示：状态、耗时、断言结果、actual_output
- 复用现有 `formatSessionOutputHtml` 函数展示 session 输出

### Markdown 输出（简洁）

展示多运行基本信息，不展示 actual_output：

```markdown
### create-file

**Status:** ✅ PASSED
**Environment:** default
**Duration:** 60000ms

**运行统计:** 10 次运行，9 次通过（要求 ≥ 8）✓

#### 运行详情

| 运行 | 状态 | 耗时 | 断言 |
|-----|------|------|------|
| 1 | ✓ passed | 5200ms | 2/2 |
| 2 | ✓ passed | 5100ms | 2/2 |
| 3 | ✗ failed | 60000ms | 0/2 (超时) |
| ... | ... | ... | ... |

#### 步骤 1: 创建 hello.txt 文件
- Status: ✓ passed
- Duration: 5200ms
- Assertions:
  - ✓ should_call_tool: Write
  - ✓ should_produce_file: hello.txt
```

**设计要点**：
- 使用表格展示多运行基本信息
- 断言列格式：`通过数/总数`，失败时附带失败原因
- 不展示 actual_output，保持简洁原则

### Jest 输出（简洁但有失败详情）

将每个断言映射为 Jest 的 `assertionResults` 项：

```json
{
  "name": "create-file",
  "status": "passed",
  "duration": 60000,
  "assertionResults": [
    {
      "fullName": "create-file - should_call_tool: Write",
      "status": "passed",
      "title": "should_call_tool: Write"
    },
    {
      "fullName": "create-file - file_content_contains",
      "status": "failed",
      "title": "file_content_contains",
      "failureMessages": [
        "9/10 passed, required ≥ 10",
        "- Run 3: 文件不存在"
      ]
    }
  ]
}
```

**设计要点**：
- 断言级别结果，兼容现有 Jest 测试报告工具
- 失败断言展示：通过率、失败原因（含具体运行序号）
- 概率测试时，`failureMessages` 包含统计信息

## 实现方案

### 需修改的文件

| 文件 | 改动内容 |
|-----|---------|
| `src/cli.ts` | 移除 `--verbose` 参数定义和传递 |
| `src/commands/run.ts` | 移除 verbose 相关逻辑，`actual_output` 始终收集，为 `RunExecution` 添加 `output` 字段 |
| `src/types/index.ts` | 为 `RunExecution` 添加可选 `output` 字段 |
| `src/output/formatters/html.ts` | 新增多运行详情展示（折叠/展开），复用现有 `formatSessionOutputHtml` |
| `src/output/formatters/markdown.ts` | 新增多运行表格展示，不展示 actual_output |
| `src/output/formatters/jest.ts` | 改为断言级别 assertionResults，展示失败详情 |

### 改动优先级

1. **P0（核心改动）**：
   - 移除 `--verbose` 参数
   - `actual_output` 始终收集

2. **P1（格式化器改动）**：
   - HTML 多运行详情展示
   - Markdown 多运行表格展示
   - Jest 断言级别结果

3. **P2（可选优化）**：
   - 为 `RunExecution` 添加 `output` 字段（HTML 展示每次运行的 actual_output）

### 具体改动点

#### src/cli.ts

```diff
- .option('--verbose', 'Show detailed output')
```

移除 verbose 参数定义，不再传递给 `runTests`。

#### src/commands/run.ts

```diff
export interface RunOptions {
- verbose?: boolean;
  // 其他选项保持不变
}

// actual_output 始终收集，移除条件判断
const stepResult: StepResult = {
  input: step.input,
  status: stepPassed ? 'passed' : 'failed',
  duration_ms: stepDuration,
  assertions: assertionResults,
- actual_output: options?.verbose ? runResult.outputs : undefined
+ actual_output: runResult.outputs
};

// 为 RunExecution 添加 output 字段
const runExecution: RunExecutionWithAssertions = {
  run_index: runIndex,
  status: allStepsPassed && !runError ? 'passed' : 'failed',
  duration_ms: Date.now() - startTime,
  assertions: runAssertions,
  error: runError,
+ output: runResult.outputs  // 新增
};
```

#### src/types/index.ts

```diff
export interface RunExecution {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  error?: string;
+ output?: OpenCodeRunOutput[];  // 新增：每次运行的详细输出
}
```

#### src/output/formatters/html.ts

新增函数：

```typescript
function formatRunsDetailHtml(
  runs: RunExecution[],
  assertionSummaries?: AssertionSummary[]
): string {
  if (!runs || runs.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // 汇总统计
  if (assertionSummaries) {
    lines.push('<div class="runs-summary">');
    lines.push('<strong>断言统计:</strong>');
    lines.push('<table>');
    // 展示各断言的通过率
    lines.push('</table>');
    lines.push('</div>');
  }

  // 每次运行详情
  lines.push('<div class="runs-details">');
  lines.push('<h4>运行详情</h4>');

  for (const run of runs) {
    const statusClass = run.status === 'passed' ? 'passed' : 'failed';
    const statusIcon = run.status === 'passed' ? '✓' : '✗';

    lines.push(`<details class="run-item ${statusClass}">`);
    lines.push(`<summary class="run-header">`);
    lines.push(`<span class="status ${statusClass}">${statusIcon}</span>`);
    lines.push(`运行 ${run.run_index + 1} (${run.status}, ${run.duration_ms}ms)`);
    lines.push('</summary>');

    lines.push('<div class="run-content">');

    // 断言结果
    lines.push('<div class="assertions">');
    for (const a of run.assertions) {
      // 展示断言结果
    }
    lines.push('</div>');

    // actual_output 详情（如果有）
    if (run.output) {
      lines.push(formatSessionOutputHtml(run.output, '运行输出'));
    }

    // error 信息
    if (run.error) {
      lines.push(`<div class="error"><strong>Error:</strong> ${escapeHtml(run.error)}</div>`);
    }

    lines.push('</div>');
    lines.push('</details>');
  }

  lines.push('</div>');

  return lines.join('\n');
}
```

修改 `formatScenario` 函数，在步骤展示前调用 `formatRunsDetailHtml`。

#### src/output/formatters/markdown.ts

新增函数：

```typescript
function formatRunsTableMarkdown(
  runs: RunExecution[],
  summary?: StepSummary
): string {
  if (!runs || runs.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // 汇总统计
  if (summary) {
    const statusIcon = summary.status === 'passed' ? '✓' : '✗';
    lines.push(`**运行统计:** ${summary.total_runs} 次运行，${summary.passed_runs} 次通过（要求 ≥ ${summary.min_pass}）${statusIcon}`);
    lines.push('');
  }

  // 运行详情表格
  lines.push('#### 运行详情');
  lines.push('');
  lines.push('| 运行 | 状态 | 耗时 | 断言 |');
  lines.push('|-----|------|------|------|');

  for (const run of runs) {
    const statusIcon = run.status === 'passed' ? '✓' : '✗';
    const passedCount = run.assertions.filter(a => a.passed).length;
    const totalCount = run.assertions.length;
    const assertionStr = run.error
      ? `${passedCount}/${totalCount} (${run.error})`
      : `${passedCount}/${totalCount}`;

    lines.push(`| ${run.run_index + 1} | ${statusIcon} ${run.status} | ${run.duration_ms}ms | ${assertionStr} |`);
  }

  lines.push('');

  return lines.join('\n');
}
```

修改 `formatScenario` 函数，在步骤展示前调用 `formatRunsTableMarkdown`。

#### src/output/formatters/jest.ts

重构 `formatScenarioAsJest` 函数：

```typescript
function formatScenarioAsJest(scenario: ScenarioResult): JestTestResult {
  const startTime = Date.now() - scenario.duration_ms;

  // 构建断言级别的 assertionResults
  const assertionResults: AssertionResult[] = [];

  // 处理概率测试的断言汇总
  if (scenario.steps[0]?.assertionSummaries) {
    for (const summary of scenario.steps[0].assertionSummaries) {
      const valueStr = typeof summary.value === 'string'
        ? summary.value
        : JSON.stringify(summary.value);

      const failureMessages: string[] = [];
      if (summary.status === 'failed') {
        failureMessages.push(`${summary.passed_runs}/${summary.total_runs} passed, required ≥ ${summary.min_pass}`);
        for (const failure of summary.failures) {
          failureMessages.push(`- Run ${failure.run_index + 1}: ${failure.message}`);
        }
      }

      assertionResults.push({
        ancestorTitles: [scenario.name],
        fullName: `${scenario.name} - ${summary.type}: ${valueStr}`,
        status: summary.status,
        title: `${summary.type}: ${valueStr}`,
        failureMessages
      });
    }
  } else {
    // 传统单次测试：保持现有逻辑
    for (const step of scenario.steps) {
      for (const assertion of step.assertions) {
        // 构建 assertionResult
      }
    }
  }

  return {
    assertionResults,
    startTime,
    endTime: startTime + scenario.duration_ms,
    status: scenario.status,
    name: scenario.name,
    duration: scenario.duration_ms,
    failureMessages: assertionResults
      .filter(a => a.status === 'failed')
      .flatMap(a => a.failureMessages)
  };
}
```

## 向后兼容

### report 命令

report 命令从 JSON 重新生成报告，因为 JSON 仍保持全量输出，report 命令可正常工作。

### 现有测试结果

移除 verbose 后，所有输出都会包含 actual_output，对现有解析工具无影响（只是数据更完整）。

---

**文档版本**: 1.0
**创建日期**: 2026-04-09
**状态**: approved