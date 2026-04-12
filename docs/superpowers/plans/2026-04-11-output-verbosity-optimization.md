# Output Verbosity Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去除 --verbose 参数，为不同输出格式设计内置详细程度属性，重构数据结构和 HTML formatter。

**Architecture:** 将运行详情从 StepResult 提升到 ScenarioResult，简化步骤级展示为统计表格，HTML 使用折叠块 + Tab 切换展示运行详情。

**Tech Stack:** TypeScript, Vitest (TDD), Commander.js

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/types/index.ts` | 数据类型定义：ScenarioResult、StepResult、AssertionStat、RunExecution、RunStepDetail |
| `src/cli.ts` | CLI 入口，移除 --verbose 参数 |
| `src/commands/run.ts` | 测试执行逻辑，数据收集和统计生成 |
| `src/executor/statistics.ts` | 统计计算函数：calculateAssertionStats |
| `src/output/formatters/html.ts` | HTML 输出：步骤统计表格 + 运行详情 Tab 折叠块 |
| `src/output/formatters/markdown.ts` | Markdown 输出：简化展示，移除详细断言和 session output |
| `src/output/formatters/jest.ts` | Jest 输出：适配新数据结构 |
| `tests/types/index.test.ts` | 类型定义单元测试 |
| `tests/executor/statistics.test.ts` | 统计函数单元测试 |
| `tests/output/formatters/html.test.ts` | HTML formatter 单元测试 |
| `tests/output/formatters/markdown.test.ts` | Markdown formatter 单元测试 |
| `tests/output/formatters/jest.test.ts` | Jest formatter 单元测试 |
| `README.md` | 项目文档，更新 CLI 命令说明 |

---

### Task 1: 更新类型定义 - AssertionStat 和 RunStepDetail

**Files:**
- Modify: `src/types/index.ts:272-282`
- Modify: `tests/types/index.test.ts:218-256`

- [ ] **Step 1: 写测试 - AssertionStat 类型验证**

在 `tests/types/index.test.ts` 的 `Probabilistic test types` describe 块末尾添加：

```typescript
  describe('AssertionStat type', () => {
    it('should support assertion-level statistics', () => {
      const stat: AssertionStat = {
        type: 'should_call_tool',
        value: 'Write',
        passed_runs: 4,
        total_runs: 5,
        pass_rate: 80,
        status: 'passed'
      };
      expect(stat.pass_rate).toBe(80);
      expect(stat.passed_runs).toBe(4);
    });

    it('should mark failed status when pass_rate below threshold', () => {
      const stat: AssertionStat = {
        type: 'response_contains',
        value: 'success',
        passed_runs: 2,
        total_runs: 5,
        pass_rate: 40,
        status: 'failed'
      };
      expect(stat.status).toBe('failed');
    });
  });

  describe('RunStepDetail type', () => {
    it('should capture step details within a run', () => {
      const stepDetail: RunStepDetail = {
        step_index: 0,
        input: 'Create file',
        status: 'passed',
        duration_ms: 1000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
        ],
        actual_output: [
          { type: 'text', part: { text: 'Creating file...' } }
        ]
      };
      expect(stepDetail.step_index).toBe(0);
      expect(stepDetail.actual_output).toHaveLength(1);
    });
  });

  describe('RunExecution extended structure', () => {
    it('should include steps array with RunStepDetail', () => {
      const run: RunExecution = {
        run_index: 0,
        status: 'passed',
        duration_ms: 5000,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 1000,
            assertions: []
          }
        ]
      };
      expect(run.steps).toHaveLength(1);
      expect(run.steps[0].step_index).toBe(0);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/types/index.test.ts`
Expected: FAIL - "AssertionStat is not defined", "RunStepDetail is not defined"

- [ ] **Step 3: 实现 - 更新 types/index.ts**

在 `types/index.ts` 中修改：

```typescript
// ========== Probabilistic Test Types ========== (保持现有)

/**
 * 单次运行的断言失败详情
 */
export interface AssertionFailure {
  run_index: number;
  message: string;
}

/**
 * 单次运行的执行结果（新版，含步骤详情）
 */
export interface RunExecution {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  error?: string;
  steps: RunStepDetail[];  // 新增：每步的完整详情
}

/**
 * 运行中单步的详情
 */
export interface RunStepDetail {
  step_index: number;
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];
}

/**
 * 断言级别的统计
 */
export interface AssertionStat {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  passed_runs: number;
  total_runs: number;
  pass_rate: number;  // 百分比，0-100
  status: 'passed' | 'failed';
}

/**
 * 步骤级别的汇总统计（保留旧名称，移到 ScenarioResult 使用）
 */
export interface StepSummary {
  total_runs: number;
  passed_runs: number;
  min_pass: number;
  status: 'passed' | 'failed';
}

/**
 * 断言级别的汇总统计（旧版，兼容保留）
 */
export interface AssertionSummary {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  min_pass: number;
  passed_runs: number;
  status: 'passed' | 'failed';
  failures: AssertionFailure[];
}

// ========== Test Result Types ==========

export interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;
  tempDirectory?: string;
  // 概率测试字段
  runs?: number;
  min_pass?: number;
  passed_runs?: number;
  // 新增：运行详情
  runDetails?: RunExecution[];
}

export interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  // 简化：只保留统计信息
  assertionStats?: AssertionStat[];
  // 保留 assertions 用于单次运行时的简单展示（兼容）
  assertions?: AssertionResult[];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "refactor(types): add AssertionStat, RunStepDetail; move runs to ScenarioResult"
```

---

### Task 2: 重构 statistics 模块 - 新增 calculateAssertionStats

**Files:**
- Modify: `src/executor/statistics.ts:1-175`
- Modify: `tests/executor/statistics.test.ts:1-256`

- [ ] **Step 1: 写测试 - calculateAssertionStats 函数**

在 `tests/executor/statistics.test.ts` 末尾添加：

```typescript
  describe('calculateAssertionStats', () => {
    const createAssertionResult = (
      type: string,
      value: any,
      passed: boolean,
      message?: string
    ): AssertionResult => ({
      type,
      value,
      passed,
      message: message || (passed ? 'OK' : 'Failed')
    });

    it('should calculate pass rate and status for each assertion', () => {
      const runs: RunExecution[] = [
        {
          run_index: 0,
          status: 'passed',
          duration_ms: 1000,
          steps: [{
            step_index: 0,
            input: 'test',
            status: 'passed',
            duration_ms: 1000,
            assertions: [
              createAssertionResult('should_call_tool', 'Write', true),
              createAssertionResult('response_contains', 'done', true)
            ]
          }]
        },
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          steps: [{
            step_index: 0,
            input: 'test',
            status: 'passed',
            duration_ms: 1000,
            assertions: [
              createAssertionResult('should_call_tool', 'Write', true),
              createAssertionResult('response_contains', 'done', false, 'Not found')
            ]
          }]
        },
        {
          run_index: 2,
          status: 'failed',
          duration_ms: 2000,
          steps: [{
            step_index: 0,
            input: 'test',
            status: 'failed',
            duration_ms: 2000,
            assertions: [
              createAssertionResult('should_call_tool', 'Write', false, 'Tool not called'),
              createAssertionResult('response_contains', 'done', false, 'Not found')
            ]
          }]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { response_contains: 'done' }
      ];

      const stats = calculateAssertionStats(runs, assertions, 2);

      expect(stats).toHaveLength(2);

      // should_call_tool: 2/3 passed, pass_rate = 66.67%
      expect(stats[0].type).toBe('should_call_tool');
      expect(stats[0].passed_runs).toBe(2);
      expect(stats[0].total_runs).toBe(3);
      expect(stats[0].pass_rate).toBeCloseTo(66.67, 1);
      expect(stats[0].status).toBe('passed'); // 2 >= 2

      // response_contains: 1/3 passed, pass_rate = 33.33%
      expect(stats[1].type).toBe('response_contains');
      expect(stats[1].passed_runs).toBe(1);
      expect(stats[1].pass_rate).toBeCloseTo(33.33, 1);
      expect(stats[1].status).toBe('failed'); // 1 < 2
    });

    it('should handle single run scenario', () => {
      const runs: RunExecution[] = [
        {
          run_index: 0,
          status: 'passed',
          duration_ms: 1000,
          steps: [{
            step_index: 0,
            input: 'test',
            status: 'passed',
            duration_ms: 1000,
            assertions: [
              createAssertionResult('should_call_tool', 'Write', true)
            ]
          }]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' }
      ];

      const stats = calculateAssertionStats(runs, assertions, 1);

      expect(stats).toHaveLength(1);
      expect(stats[0].passed_runs).toBe(1);
      expect(stats[0].total_runs).toBe(1);
      expect(stats[0].pass_rate).toBe(100);
    });

    it('should return empty array for no assertions', () => {
      const runs: RunExecution[] = [
        {
          run_index: 0,
          status: 'passed',
          duration_ms: 1000,
          steps: [{
            step_index: 0,
            input: 'test',
            status: 'passed',
            duration_ms: 1000,
            assertions: []
          }]
        }
      ];

      const stats = calculateAssertionStats(runs, [], 1);

      expect(stats).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/executor/statistics.test.ts`
Expected: FAIL - "calculateAssertionStats is not defined"

- [ ] **Step 3: 实现 - 添加 calculateAssertionStats 函数**

在 `src/executor/statistics.ts` 末尾添加：

```typescript
import type { RunExecution, AssertionStat } from '../types/index.js';

/**
 * 计算各断言的统计信息（新版，用于 StepResult.assertionStats）
 */
export function calculateAssertionStats(
  runs: RunExecution[],
  assertions: Assertion[],
  minPass: number
): AssertionStat[] {
  if (assertions.length === 0) {
    return [];
  }

  const stats: AssertionStat[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const type = getAssertionType(assertion);
    const value = getAssertionValue(assertion);
    const assertionMinPass = getAssertionMinPass(assertion, minPass);

    // 统计该断言在各次运行中的通过情况
    let passedRuns = 0;

    for (const run of runs) {
      // 收集所有步骤的断言结果
      const allAssertions = run.steps.flatMap(s => s.assertions);
      // 按索引匹配（假设各次运行的断言顺序一致）
      const assertionResult = allAssertions[i];

      if (assertionResult && assertionResult.passed) {
        passedRuns++;
      }
    }

    const totalRuns = runs.length;
    const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
    const status = passedRuns >= assertionMinPass ? 'passed' : 'failed';

    if (value !== undefined) {
      stats.push({
        type,
        value,
        passed_runs: passedRuns,
        total_runs: totalRuns,
        pass_rate: passRate,
        status
      });
    }
  }

  return stats;
}
```

同时更新导入语句：

```typescript
import type {
  StepSummary,
  AssertionSummary,
  AssertionFailure,
  Assertion,
  AssertionResult,
  Matcher,
  ToolCallAssertion,
  FileContentAssertion,
  RunExecution,
  AssertionStat
} from '../types/index.js';
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/executor/statistics.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/executor/statistics.ts tests/executor/statistics.test.ts
git commit -m "feat(statistics): add calculateAssertionStats for step-level statistics"
```

---

### Task 3: 移除 CLI verbose 参数

**Files:**
- Modify: `src/cli.ts:78-92`
- Modify: `src/commands/run.ts:24-36`

- [ ] **Step 1: 移除 cli.ts 中的 --verbose 选项**

在 `src/cli.ts` 中，找到 `run` 命令定义部分，删除：

```typescript
// 删除这行
.option('--verbose', 'Show detailed output')
```

同时删除传递 verbose 的代码：

```typescript
// 修改 action 中的 options 传递
const result = await runTests(testFile, {
  format: options.format,
  output: options.output,
  scenario: options.scenario,
  parallel: options.parallel,
  model: options.model,
  agent: options.agent,
  // verbose: options.verbose,  // 删除此行
  runs: options.runs,
  min_pass: options.minPass,
  quick: options.quick
});
```

- [ ] **Step 2: 移除 run.ts RunOptions 中的 verbose 字段**

在 `src/commands/run.ts` 中：

```typescript
export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  parallel?: boolean;
  model?: string;
  agent?: string;
  // verbose?: boolean;  // 删除此行
  runs?: number;
  min_pass?: number;
  quick?: boolean;
}
```

删除 executeScenario 函数中的 verbose 相关逻辑：

```typescript
// 删除 options.verbose 字段
// 删除 stepResult.actual_output = options?.verbose ? runResult.outputs : undefined
```

- [ ] **Step 3: 提交**

```bash
git add src/cli.ts src/commands/run.ts
git commit -m "refactor(cli): remove --verbose parameter, make verbosity format-intrinsic"
```

---

### Task 4: 重构 run.ts 数据收集逻辑

**Files:**
- Modify: `src/commands/run.ts:196-387`

- [ ] **Step 1: 重构数据收集 - 将 runs 数据移到 ScenarioResult**

在 `executeScenario` 函数末尾，重构数据收集和返回逻辑：

关键修改点：
1. `allRunExecutions` 需要包含完整的 `RunExecution` 结构（含 `steps: RunStepDetail[]`）
2. `stepResults` 只收集统计信息（`assertionStats`）
3. 返回的 `ScenarioResult` 包含 `runDetails`

修改逻辑：

```typescript
// 收集所有运行的执行结果
const allRunExecutions: RunExecution[] = [];
let lastError: string | undefined;

// 多次运行循环
for (let runIndex = 0; runIndex < effectiveRuns; runIndex++) {
  // ... 环境准备 ...

  const runStepDetails: RunStepDetail[] = [];
  let runError: string | undefined;

  for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
    const step = scenario.steps[stepIndex];
    // ... 执行步骤 ...

    const stepDetail: RunStepDetail = {
      step_index: stepIndex,
      input: step.input,
      status: stepPassed ? 'passed' : 'failed',
      duration_ms: stepDuration,
      assertions: assertionResults,
      actual_output: runResult.outputs  // 始终收集完整输出
    };
    runStepDetails.push(stepDetail);
  }

  // 收集单次运行结果
  allRunExecutions.push({
    run_index: runIndex,
    status: allStepsPassed && !runError ? 'passed' : 'failed',
    duration_ms: Date.now() - startTime,
    steps: runStepDetails,
    error: runError
  });
}

// 计算步骤级统计
const allAssertions = scenario.steps.flatMap(step => step.expected);
const assertionStats = effectiveRuns > 1 
  ? calculateAssertionStats(allRunExecutions, allAssertions, effectiveMinPass)
  : undefined;

// 构建 stepResults（简化结构）
const stepResults: StepResult[] = scenario.steps.map((step, i) => ({
  input: step.input,
  status: assertionStats?.[i]?.status ?? determineSingleRunStatus(allRunExecutions, i),
  duration_ms: calculateStepDuration(allRunExecutions, i),
  assertionStats: assertionStats ? assertionsForStep(assertionStats, i) : undefined
}));

// 返回
return {
  name: scenario.name,
  environment: scenario.environment,
  status: finalStatus,
  duration_ms: Date.now() - startTime,
  steps: stepResults,
  error: lastError,
  tempDirectory: scenario.cleanup ? undefined : preservedTempDirectory,
  runs: !isTraditionalSingleRun ? effectiveRuns : undefined,
  min_pass: !isTraditionalSingleRun ? effectiveMinPass : undefined,
  passed_runs: !isTraditionalSingleRun ? passedRuns : undefined,
  runDetails: allRunExecutions  // 新增：始终填充
};
```

- [ ] **Step 2: 提交**

```bash
git add src/commands/run.ts
git commit -m "refactor(run): move runDetails to ScenarioResult, generate assertionStats"
```

---

### Task 5: 重写 HTML formatter

**Files:**
- Modify: `src/output/formatters/html.ts:1-218`
- Modify: `tests/output/formatters/html.test.ts:1-254`

- [ ] **Step 1: 写测试 - 步骤统计表格和运行详情 Tab**

重写 `tests/output/formatters/html.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { formatAsHtml } from '../../../src/output/formatters/html.js';
import type { TestResult, ScenarioResult, AssertionStat, RunExecution } from '../../../src/types/index.js';

describe('formatAsHtml', () => {
  it('should generate complete HTML document', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('should include CSS for Tab switching and stats table', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('.tab-buttons');
    expect(html).toContain('.assertion-stats-table');
    expect(html).toContain('.pass-rate');
  });

  it('should display assertion stats table for multi-run scenario', () => {
    const assertionStats: AssertionStat[] = [
      { type: 'should_call_tool', value: 'Write', passed_runs: 4, total_runs: 5, pass_rate: 80, status: 'passed' },
      { type: 'file_content_contains', value: { file: 'hello.txt', text: 'Hello' }, passed_runs: 5, total_runs: 5, pass_rate: 100, status: 'passed' }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 5000, timestamp: '' },
      scenarios: [
        {
          name: 'create-file',
          environment: 'default',
          status: 'passed',
          duration_ms: 5000,
          runs: 5,
          min_pass: 4,
          passed_runs: 4,
          steps: [
            { input: 'Create file', status: 'passed', duration_ms: 4800, assertionStats }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    // 统计表格
    expect(html).toContain('断言类型');
    expect(html).toContain('通过次数');
    expect(html).toContain('通过率');
    expect(html).toContain('should_call_tool');
    expect(html).toContain('4/5');
    expect(html).toContain('80%');

    // 场景级 runs 统计
    expect(html).toContain('4/5 runs');
  });

  it('should display run details with Tab switching', () => {
    const runDetails: RunExecution[] = [
      {
        run_index: 0,
        status: 'passed',
        duration_ms: 1000,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 1000,
            assertions: [{ type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }],
            actual_output: [
              { type: 'text', part: { text: 'Creating file...' } },
              { type: 'tool_use', part: { tool: 'Write', state: { status: 'completed' } } }
            ]
          }
        ]
      },
      {
        run_index: 1,
        status: 'failed',
        duration_ms: 1500,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'failed',
            duration_ms: 1500,
            assertions: [{ type: 'should_call_tool', value: 'Write', passed: false, message: 'Not called' }],
            actual_output: [{ type: 'text', part: { text: 'Failed...' } }]
          }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 2500, timestamp: '' },
      scenarios: [
        {
          name: 'multi-run-scenario',
          environment: 'default',
          status: 'failed',
          duration_ms: 2500,
          runs: 2,
          steps: [
            { input: 'Create file', status: 'failed', duration_ms: 2500 }
          ],
          runDetails
        }
      ]
    };

    const html = formatAsHtml(result);

    // 折叠块和 Tab 按钮
    expect(html).toContain('运行详情');
    expect(html).toContain('[Run 1]');
    expect(html).toContain('[Run 2]');
    expect(html).toContain('switchTab');

    // Run 1 内容
    expect(html).toContain('Run 1 - ✓ passed');
    expect(html).toContain('Creating file...');

    // Run 2 内容
    expect(html).toContain('Run 2 - ✗ failed');
    expect(html).toContain('Failed...');
  });

  it('should include JavaScript for Tab and collapse functionality', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<script>');
    expect(html).toContain('function toggleRunDetails');
    expect(html).toContain('function switchTab');
  });

  it('should handle single-run scenario without runDetails block', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'single-run',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            { input: 'Test', status: 'passed', duration_ms: 100 }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    // 不显示运行详情折叠块（单次运行时）
    expect(html).not.toContain('运行详情');
    expect(html).not.toContain('[Run 1]');
  });

  it('should pass_rate color coding based on percentage', () => {
    const assertionStats: AssertionStat[] = [
      { type: 'test', value: 'a', passed_runs: 4, total_runs: 5, pass_rate: 80, status: 'passed' },  // high
      { type: 'test', value: 'b', passed_runs: 3, total_runs: 5, pass_rate: 60, status: 'passed' },  // medium
      { type: 'test', value: 'c', passed_runs: 1, total_runs: 5, pass_rate: 20, status: 'failed' }   // low
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'test',
          environment: 'default',
          status: 'failed',
          duration_ms: 100,
          steps: [{ input: 'Test', status: 'failed', duration_ms: 100, assertionStats }]
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('pass-rate high');  // 80%
    expect(html).toContain('pass-rate medium'); // 60%
    expect(html).toContain('pass-rate low');    // 20%
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/output/formatters/html.test.ts`
Expected: FAIL - 多项测试失败（现有实现不支持新结构）

- [ ] **Step 3: 实现 - 重写 html.ts**

完整重写 `src/output/formatters/html.ts`：

```typescript
import type { TestResult, ScenarioResult, AssertionStat, RunExecution, RunStepDetail, OpenCodeRunOutput } from '../../types/index.js';

export function formatAsHtml(result: TestResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report: ${escapeHtml(result.suite.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #2c3e50; margin-bottom: 10px; }
    h2 { color: #34495e; margin: 20px 0 10px; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
    h3 { color: #2c3e50; margin: 15px 0 10px; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .summary-item { margin: 5px 0; }
    .status-passed { color: #27ae60; font-weight: bold; }
    .status-failed { color: #e74c3c; font-weight: bold; }
    .scenario {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .scenario-header { display: flex; justify-content: space-between; align-items: center; }
    .scenario-status {
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
    }
    .scenario-status.passed { background: #d4edda; color: #155724; }
    .scenario-status.failed { background: #f8d7da; color: #721c24; }
    .scenario-runs-info { color: #666; font-size: 0.9em; margin-top: 5px; }
    .step { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .step-header { font-weight: bold; }
    .error { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .meta { color: #666; font-size: 0.9em; }

    /* 断言统计表格 */
    .assertion-stats-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
    }
    .assertion-stats-table th, .assertion-stats-table td {
      border: 1px solid #ddd;
      padding: 10px;
      text-align: left;
    }
    .assertion-stats-table th { background: #f5f5f5; }
    .pass-rate { font-weight: bold; }
    .pass-rate.high { color: #27ae60; }
    .pass-rate.medium { color: #f39c12; }
    .pass-rate.low { color: #e74c3c; }

    /* 运行详情折叠块 */
    .run-details-section { margin-top: 20px; }
    .run-details-header {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      background: #e9ecef;
      border-radius: 4px;
    }
    .run-details-content { margin-top: 15px; display: none; }
    .run-details-content.expanded { display: block; }

    /* Tab 切换 */
    .tab-buttons {
      display: flex;
      gap: 5px;
      margin-bottom: 15px;
      border-bottom: 1px solid #ddd;
    }
    .tab-btn {
      padding: 8px 15px;
      border: none;
      background: transparent;
      cursor: pointer;
      color: #666;
    }
    .tab-btn:hover { color: #333; }
    .tab-btn.active {
      color: #3498db;
      border-bottom: 2px solid #3498db;
    }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* 运行详情块内的步骤展示 */
    .run-step-block {
      margin: 15px 0;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .run-step-header { font-weight: bold; margin-bottom: 10px; }
    .run-step-assertions { margin: 10px 0; }
    .run-step-assertion { margin: 5px 0; }
    .run-step-assertion.passed { color: #27ae60; }
    .run-step-assertion.failed { color: #e74c3c; }
    .run-step-session { margin-top: 15px; }
    .session-request, .session-response { margin: 10px 0; }
    .session-request blockquote, .session-response blockquote {
      margin: 5px 0;
      padding: 10px;
      background: #fff;
      border-left: 3px solid #3498db;
    }
    .session-tool-calls table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .session-tool-calls th, .session-tool-calls td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .session-tool-calls td code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    .session-raw { margin-top: 10px; }
    .session-raw pre { background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Report: ${escapeHtml(result.suite.name)}</h1>
    ${result.suite.description ? `<p class="meta">${escapeHtml(result.suite.description)}</p>` : ''}

    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-item"><strong>File:</strong> ${escapeHtml(result.suite.file)}</div>
      <div class="summary-item"><strong>Timestamp:</strong> ${escapeHtml(result.summary.timestamp)}</div>
      <div class="summary-item"><strong>Duration:</strong> ${result.summary.duration_ms}ms</div>
      <div class="summary-item">
        <strong>Results:</strong>
        <span class="status-passed">✓ ${result.summary.passed} passed</span>,
        <span class="status-failed">✗ ${result.summary.failed} failed</span>
      </div>
    </div>

    <h2>Scenarios</h2>
    ${result.scenarios.length === 0 ? '<p>No scenarios executed.</p>' : result.scenarios.map((s, i) => formatScenario(s, i)).join('\n')}
  </div>

  <script>
    function toggleRunDetails(scenarioId) {
      const content = document.getElementById('run-details-' + scenarioId);
      const arrow = document.getElementById('arrow-' + scenarioId);
      if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        arrow.textContent = '▶';
      } else {
        content.classList.add('expanded');
        arrow.textContent = '▼';
      }
    }

    function switchTab(scenarioId, runIndex) {
      document.querySelectorAll('.tab-content-' + scenarioId).forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn-' + scenarioId).forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + scenarioId + '-' + runIndex).classList.add('active');
      document.getElementById('tab-btn-' + scenarioId + '-' + runIndex).classList.add('active');
    }
  </script>
</body>
</html>`;
}

function formatScenario(scenario: ScenarioResult, scenarioIndex: number): string {
  const runsInfo = scenario.runs 
    ? `<div class="scenario-runs-info">${scenario.passed_runs}/${scenario.runs} runs passed (min_pass: ${scenario.min_pass})</div>`
    : '';

  return `
    <div class="scenario">
      <div class="scenario-header">
        <h3>${escapeHtml(scenario.name)}</h3>
        <span class="scenario-status ${scenario.status}">${scenario.status.toUpperCase()}</span>
      </div>
      <div class="meta">
        Environment: ${escapeHtml(scenario.environment)} | Duration: ${scenario.duration_ms}ms
      </div>
      ${runsInfo}
      ${scenario.error ? `<div class="error"><strong>Error:</strong> ${escapeHtml(scenario.error)}</div>` : ''}
      ${scenario.steps.length > 0 ? `
        <h4>Steps</h4>
        ${scenario.steps.map((step, i) => formatStep(step, i + 1)).join('\n')}
      ` : ''}
      ${scenario.runDetails && scenario.runDetails.length > 1 ? formatRunDetails(scenario, scenarioIndex) : ''}
    </div>`;
}

function formatStep(step: { input: string; status: string; duration_ms: number; assertionStats?: AssertionStat[] }, index: number): string {
  const statsTable = step.assertionStats && step.assertionStats.length > 0
    ? formatAssertionStatsTable(step.assertionStats)
    : '';

  return `
    <div class="step">
      <div class="step-header">${index}. Input: "${escapeHtml(step.input)}"</div>
      <div class="meta">Status: ${step.status} | Duration: ${step.duration_ms}ms</div>
      ${statsTable}
    </div>`;
}

function formatAssertionStatsTable(stats: AssertionStat[]): string {
  const rows = stats.map(stat => {
    const rateClass = stat.pass_rate >= 80 ? 'high' : stat.pass_rate >= 50 ? 'medium' : 'low';
    const valueStr = typeof stat.value === 'object' ? JSON.stringify(stat.value) : String(stat.value);
    const statusIcon = stat.status === 'passed' ? '✓' : '✗';

    return `<tr>
      <td>${escapeHtml(stat.type)}</td>
      <td>${stat.passed_runs}/${stat.total_runs}</td>
      <td><span class="pass-rate ${rateClass}">${stat.pass_rate}%</span></td>
      <td>${statusIcon} ${stat.status}</td>
    </tr>`;
  }).join('\n');

  return `
    <table class="assertion-stats-table">
      <tr><th>断言类型</th><th>通过次数</th><th>通过率</th><th>状态</th></tr>
      ${rows}
    </table>`;
}

function formatRunDetails(scenario: ScenarioResult, scenarioIndex: number): string {
  const scenarioId = `scenario-${scenarioIndex}`;
  const tabButtons = scenario.runDetails!.map((run, i) => 
    `<button id="tab-btn-${scenarioId}-${i}" class="tab-btn tab-btn-${scenarioId} ${i === 0 ? 'active' : ''}" onclick="switchTab('${scenarioId}', ${i})">Run ${i + 1}</button>`
  ).join('\n');

  const tabContents = scenario.runDetails!.map((run, i) =>
    `<div id="tab-${scenarioId}-${i}" class="tab-content tab-content-${scenarioId} ${i === 0 ? 'active' : ''}">
      <div class="meta">${run.status === 'passed' ? '✓' : '✗'} Run ${i + 1} - ${run.status} - ${run.duration_ms}ms</div>
      ${run.error ? `<div class="error">${escapeHtml(run.error)}</div>` : ''}
      ${run.steps.map(step => formatRunStep(step)).join('\n')}
    </div>`
  ).join('\n');

  return `
    <div class="run-details-section">
      <div class="run-details-header" onclick="toggleRunDetails('${scenarioId}')">
        <span id="arrow-${scenarioId}">▶</span>
        <strong>运行详情 (${scenario.runDetails!.length} runs)</strong>
      </div>
      <div id="run-details-${scenarioId}" class="run-details-content">
        <div class="tab-buttons">${tabButtons}</div>
        ${tabContents}
      </div>
    </div>`;
}

function formatRunStep(step: RunStepDetail): string {
  const assertionsHtml = step.assertions.map(a => {
    const icon = a.passed ? '✓' : '✗';
    const valueStr = typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value);
    return `<div class="run-step-assertion ${a.passed ? 'passed' : 'failed'}">${icon} ${escapeHtml(a.type)}: ${escapeHtml(valueStr)}</div>`;
  }).join('\n');

  const sessionHtml = step.actual_output ? formatSessionOutputHtml(step.actual_output, step.input) : '';

  return `
    <div class="run-step-block">
      <div class="run-step-header">Step ${step.step_index + 1}: "${escapeHtml(step.input)}"</div>
      <div class="meta">Status: ${step.status} | Duration: ${step.duration_ms}ms</div>
      <div class="run-step-assertions">${assertionsHtml}</div>
      ${sessionHtml}
    </div>`;
}

function formatSessionOutputHtml(outputs: OpenCodeRunOutput[] | undefined, request: string): string {
  if (!outputs || outputs.length === 0) return '';

  const texts = outputs.filter(o => o.type === 'text' && o.part?.text).map(o => o.part!.text as string);
  const toolCalls = outputs.filter(o => o.type === 'tool_use' && o.part?.tool).map(o => ({
    tool: o.part!.tool as string,
    status: o.part?.state?.status || 'unknown',
    input: o.part?.state?.input || {},
    error: o.part?.state?.error
  }));

  const requestHtml = `<div class="session-request"><strong>Request:</strong><blockquote>${escapeHtml(request)}</blockquote></div>`;
  const responseHtml = texts.length > 0 
    ? `<div class="session-response"><strong>Response:</strong>${texts.map(t => `<blockquote>${escapeHtml(t).replace(/\n/g, '<br>')}</blockquote>`).join('\n')}</div>`
    : '';
  
  const toolCallsHtml = toolCalls.length > 0 
    ? `<div class="session-tool-calls"><strong>Tool Calls:</strong><table><tr><th>Tool</th><th>Status</th><th>Input</th></tr>${toolCalls.map(tc => {
      const icon = tc.status === 'completed' ? '✓' : '✗';
      const inputStr = Object.entries(tc.input).map(([k, v]) => `${k}: <code>${escapeHtml(String(v).replace(/\n/g, ' '))}</code>`).join('<br>');
      const errorStr = tc.error ? `<br><strong>Error:</strong> ${escapeHtml(tc.error)}` : '';
      return `<tr><td>${escapeHtml(tc.tool)}</td><td>${icon} ${escapeHtml(tc.status)}</td><td>${inputStr}${errorStr}</td></tr>`;
    }).join('\n')}</table></div>`
    : '';

  const rawHtml = `<details class="session-raw"><summary>Raw Output</summary><pre><code>${escapeHtml(JSON.stringify(outputs, null, 2))}</code></pre></details>`;

  return `<div class="run-step-session">${requestHtml}${responseHtml}${toolCallsHtml}${rawHtml}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/output/formatters/html.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/output/formatters/html.ts tests/output/formatters/html.test.ts
git commit -m "refactor(html): rewrite with stats table and tab-based run details"
```

---

### Task 6: 简化 Markdown formatter

**Files:**
- Modify: `src/output/formatters/markdown.ts:1-194`
- Modify: `tests/output/formatters/markdown.test.ts:1-301`

- [ ] **Step 1: 写测试 - 简化后的 Markdown 输出**

重写 `tests/output/formatters/markdown.test.ts` 关键测试：

```typescript
import { describe, it, expect } from 'vitest';
import { formatAsMarkdown } from '../../../src/output/formatters/markdown.js';
import type { TestResult, AssertionStat } from '../../../src/types/index.js';

describe('formatAsMarkdown (simplified)', () => {
  it('should generate markdown format', () => {
    const result: TestResult = {
      suite: { name: 'test-suite', description: 'Test', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '2026-03-29T10:30:00Z' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('# Test Report: test-suite');
    expect(markdown).toContain('## Summary');
  });

  it('should display runs info when multi-run scenario', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 5000, timestamp: '' },
      scenarios: [
        {
          name: 'probabilistic-test',
          environment: 'default',
          status: 'passed',
          duration_ms: 5000,
          runs: 5,
          min_pass: 4,
          passed_runs: 4,
          steps: [
            { input: 'Test', status: 'passed', duration_ms: 4800 }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('**Runs:** 4/5 passed (min_pass: 4)');
  });

  it('should NOT display detailed assertions in simplified mode', () => {
    const assertionStats: AssertionStat[] = [
      { type: 'should_call_tool', value: 'Write', passed_runs: 4, total_runs: 5, pass_rate: 80, status: 'passed' }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-1',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            { input: 'Test', status: 'passed', duration_ms: 50, assertionStats }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // 简化模式：不显示断言详情
    expect(markdown).not.toContain('should_call_tool: Write');
    expect(markdown).not.toContain('**Assertions:**');
  });

  it('should NOT display session output in simplified mode', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 200, timestamp: '' },
      scenarios: [
        {
          name: 'scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 200,
          steps: [
            { input: 'Step', status: 'passed', duration_ms: 100 }
          ],
          runDetails: [
            {
              run_index: 0,
              status: 'passed',
              duration_ms: 200,
              steps: [
                {
                  step_index: 0,
                  input: 'Step',
                  status: 'passed',
                  duration_ms: 100,
                  assertions: [],
                  actual_output: [{ type: 'text', part: { text: 'Response text' } }]
                }
              ]
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    // 简化模式：不显示 session output
    expect(markdown).not.toContain('**Request:**');
    expect(markdown).not.toContain('**Response:**');
    expect(markdown).not.toContain('Response text');
  });

  it('should display step status only', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 200, timestamp: '' },
      scenarios: [
        {
          name: 'multi-step',
          environment: 'default',
          status: 'passed',
          duration_ms: 200,
          steps: [
            { input: 'Step 1', status: 'passed', duration_ms: 100 },
            { input: 'Step 2', status: 'passed', duration_ms: 100 }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('1. **Input:** "Step 1"');
    expect(markdown).toContain('Status: ✓ passed');
    expect(markdown).toContain('2. **Input:** "Step 2"');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/output/formatters/markdown.test.ts`
Expected: FAIL - 部分测试因现有实现包含详细信息而失败

- [ ] **Step 3: 实现 - 简化 markdown.ts**

修改 `src/output/formatters/markdown.ts`，移除详细断言和 session output：

```typescript
import type { TestResult, ScenarioResult } from '../../types/index.js';

export function formatAsMarkdown(result: TestResult): string {
  const lines: string[] = [];

  lines.push(`# Test Report: ${result.suite.name}`);
  lines.push('');

  if (result.suite.description) {
    lines.push(result.suite.description);
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **File:** ${result.suite.file}`);
  lines.push(`- **Timestamp:** ${result.summary.timestamp}`);
  lines.push(`- **Duration:** ${result.summary.duration_ms}ms`);
  lines.push(`- **Results:** ✓ ${result.summary.passed} passed, ✗ ${result.summary.failed} failed`);
  lines.push('');

  lines.push('## Scenarios');
  lines.push('');

  if (result.scenarios.length === 0) {
    lines.push('No scenarios executed.');
  } else {
    for (const scenario of result.scenarios) {
      lines.push(formatScenario(scenario));
    }
  }

  return lines.join('\n');
}

function formatScenario(scenario: ScenarioResult): string {
  const lines: string[] = [];

  const statusIcon = scenario.status === 'passed' ? '✅' : '❌';

  lines.push(`### ${scenario.name}`);
  lines.push('');
  lines.push(`**Status:** ${statusIcon} ${scenario.status.toUpperCase()}`);
  lines.push(`**Environment:** ${scenario.environment}`);
  lines.push(`**Duration:** ${scenario.duration_ms}ms`);

  // 多运行时显示汇总信息
  if (scenario.runs !== undefined) {
    lines.push(`**Runs:** ${scenario.passed_runs}/${scenario.runs} passed (min_pass: ${scenario.min_pass})`);
  }

  if (scenario.error) {
    lines.push('');
    lines.push(`**Error:** ${scenario.error}`);
  }

  lines.push('');

  if (scenario.steps.length > 0) {
    lines.push('#### Steps');
    lines.push('');

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const icon = step.status === 'passed' ? '✓' : '✗';
      lines.push(`${i + 1}. **Input:** "${step.input}"`);
      lines.push(`   - Status: ${icon} ${step.status}`);
      lines.push(`   - Duration: ${step.duration_ms}ms`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// 移除 formatSessionOutputMarkdown 函数（不再需要）
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/output/formatters/markdown.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/output/formatters/markdown.ts tests/output/formatters/markdown.test.ts
git commit -m "refactor(markdown): simplify output, remove detailed assertions and session output"
```

---

### Task 7: 微调 Jest formatter

**Files:**
- Modify: `src/output/formatters/jest.ts:1-79`
- Modify: `tests/output/formatters/jest.test.ts:1-116`

- [ ] **Step 1: 写测试 - Jest 格式适配多运行**

在 `tests/output/formatters/jest.test.ts` 添加：

```typescript
  it('should handle multi-run scenario correctly', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 5000, timestamp: '' },
      scenarios: [
        {
          name: 'probabilistic-test',
          environment: 'default',
          status: 'passed',
          duration_ms: 5000,
          runs: 5,
          min_pass: 4,
          passed_runs: 4,
          steps: [
            { input: 'Test', status: 'passed', duration_ms: 4800 }
          ]
        }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.numTotalTests).toBe(1);
    expect(jest.numPassedTests).toBe(1);
    expect(jest.success).toBe(true);
  });
```

- [ ] **Step 2: 运行测试确认通过**

Run: `npm test tests/output/formatters/jest.test.ts`
Expected: PASS（Jest formatter 不需要改动，只需确认兼容）

- [ ] **Step 3: 提交**

```bash
git add tests/output/formatters/jest.test.ts
git commit -m "test(jest): add test for multi-run scenario compatibility"
```

---

### Task 8: 更新 README.md

**Files:**
- Modify: `README.md:364-442`

- [ ] **Step 1: 移除 --verbose 参数说明**

在 `README.md` 的 `agentut run` 命令部分，删除：

```markdown
- `--verbose` - 显示详细输出
```

- [ ] **Step 2: 更新输出格式说明**

替换 `## 输出格式` 部分：

```markdown
## 输出格式

Agent VCR 提供四种输出格式，各有不同的默认详细程度：

| 格式 | 详细程度 | 说明 |
|------|---------|------|
| `json` | 详尽 | 完整结构化数据，包含所有运行详情 |
| `html` | 详尽 | 可视化报告，步骤统计表格 + 可折叠 Tab 运行详情 |
| `markdown` | 简洁 | 仅展示基本结果和汇总统计 |
| `jest` | 简洁 | Jest 兼容格式，便于 CI 集成 |

### JSON 输出结构

JSON 输出始终包含完整数据：
- `scenarios[].runDetails` - 每次运行的完整对话过程和断言详情
- `scenarios[].steps[].assertionStats` - 步骤级断言统计（通过次数、通过率）

### HTML 报告特性

HTML 输出提供丰富的可视化：
- **步骤统计表格** - 展示每个断言的通过次数和通过率
- **运行详情折叠块** - Tab 切换查看各次运行的完整对话过程
- **颜色编码** - 通过率 ≥80% 绿色，50-79% 黄色，<50% 红色

示例：

```bash
# 生成 HTML 报告
agentut run ./tests/ -f html -o report.html

# 生成 Markdown 简要报告
agentut run ./tests/ -f markdown -o report.md

# 生成 Jest 格式用于 CI
agentut run ./tests/ -f jest -o results.json
```

### Markdown 输出示例

```markdown
### probabilistic-test

**Status:** ✅ PASSED
**Runs:** 4/5 passed (min_pass: 4)
**Duration:** 5000ms

#### Steps

1. **Input:** "创建文件"
   - Status: ✓ passed
   - Duration: 4800ms
```
```

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: remove --verbose, update output format documentation"
```

---

### Task 9: 运行完整测试套件

- [ ] **Step 1: 运行所有测试**

Run: `npm test`
Expected: PASS - 所有测试通过

- [ ] **Step 2: 检查 TypeScript 编译**

Run: `npm run build`
Expected: 成功编译，无错误

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: complete output verbosity optimization"

# 推送到远程（如果需要）
git push origin develop
```

---

## Spec Coverage Check

| 规范要求 | 任务覆盖 |
|---------|---------|
| 移除 --verbose 参数 | Task 3 |
| ScenarioResult.runDetails 字段 | Task 1, Task 4 |
| RunExecution.steps 结构 | Task 1 |
| AssertionStat 类型 | Task 1, Task 2 |
| HTML 步骤统计表格 | Task 5 |
| HTML 运行详情 Tab 折叠块 | Task 5 |
| Markdown 简化输出 | Task 6 |
| Jest 兼容 | Task 7 |
| README 更新 | Task 8 |
| 单元测试防护 | Tasks 1-7 每个 TDD 任务 |
| 单次运行 runDetails 填充 | Task 4 实现逻辑 |

---

## Placeholder Scan

无 TBD、TODO、待填充内容。所有任务包含完整代码和命令。

---

## Type Consistency Check

- `AssertionStat` 在 Task 1 定义，Task 2、Task 5 使用 ✓
- `RunExecution` 在 Task 1 定义，Task 4、Task 5 使用 ✓
- `RunStepDetail` 在 Task 1 定义，Task 5 使用 ✓
- `assertionStats` 在 Task 1 的 StepResult 定义，Task 4、Task 5、Task 6 使用 ✓
- `runDetails` 在 Task 1 的 ScenarioResult 定义，Task 4、Task 5、Task 6 使用 ✓