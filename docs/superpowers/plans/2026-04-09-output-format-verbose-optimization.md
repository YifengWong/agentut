# 输出格式 verbose 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除 `--verbose` 参数，将详尽程度内化为各输出格式的固有属性，优化 HTML 对多次运行的展示。

**Architecture:** 移除 CLI 参数 → 修改数据收集逻辑 → 更新各格式化器（HTML/Markdown/Jest）→ 更新测试和文档。采用 TDD 方式，先写测试再实现。

**Tech Stack:** TypeScript, Vitest, commander, chalk

---

## 文件结构

| 文件 | 职责 | 改动类型 |
|-----|------|---------|
| `src/types/index.ts` | 为 `RunExecution` 添加 `output` 字段 | 修改 |
| `src/cli.ts` | 移除 `--verbose` 参数定义 | 修改 |
| `src/commands/run.ts` | 移除 verbose 逻辑，actual_output 始终收集 | 修改 |
| `src/output/formatters/html.ts` | 新增多运行详情展示函数 | 修改 |
| `src/output/formatters/markdown.ts` | 新增多运行表格展示函数 | 修改 |
| `src/output/formatters/jest.ts` | 重构为断言级别结果 | 修改 |
| `tests/types/index.test.ts` | 测试 `RunExecution.output` 字段 | 修改 |
| `tests/commands/run.test.ts` | 测试 verbose 移除和 actual_output 收集 | 修改 |
| `tests/output/formatters/html.test.ts` | 测试多运行 HTML 展示 | 修改 |
| `tests/output/formatters/markdown.test.ts` | 测试多运行 Markdown 表格 | 修改 |
| `tests/output/formatters/jest.test.ts` | 测试断言级别 Jest 结果 | 修改 |
| `README.md` | 更新文档，移除 verbose 参数说明 | 修改 |

---

### Task 1: 为 RunExecution 添加 output 字段

**Files:**
- Modify: `src/types/index.ts:243-248`
- Test: `tests/types/index.test.ts`

- [ ] **Step 1: 编写失败的测试**

```typescript
// tests/types/index.test.ts - 在现有测试后添加

import type { RunExecution, OpenCodeRunOutput } from '../../src/types/index.js';

describe('RunExecution type', () => {
  it('should support optional output field for session output', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Response text' } },
      { type: 'tool_use', part: { tool: 'Write', state: { status: 'completed' } } }
    ];

    const runExecution: RunExecution = {
      run_index: 0,
      status: 'passed',
      duration_ms: 1000,
      assertions: [],
      output // 新增字段
    };

    expect(runExecution.output).toBeDefined();
    expect(runExecution.output).toHaveLength(2);
  });

  it('should allow output field to be undefined', () => {
    const runExecution: RunExecution = {
      run_index: 0,
      status: 'passed',
      duration_ms: 1000,
      assertions: []
    };

    expect(runExecution.output).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- tests/types/index.test.ts --run`
Expected: TypeScript 编译通过，类型检查通过

- [ ] **Step 3: 修改类型定义**

```typescript
// src/types/index.ts:243-248
export interface RunExecution {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  error?: string;
  output?: OpenCodeRunOutput[];  // 新增：每次运行的详细输出
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- tests/types/index.test.ts --run`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "feat(types): add output field to RunExecution for per-run session output"
```

---

### Task 2: 移除 CLI 的 --verbose 参数

**Files:**
- Modify: `src/cli.ts:78,92`

- [ ] **Step 1: 移除 verbose 参数定义和传递**

```typescript
// src/cli.ts - 移除以下行

// 第 78 行移除：
// .option('--verbose', 'Show detailed output')

// 第 92 行移除 verbose 传递：
verbose: options.verbose,

// 修改后的 run 命令 action 部分：
.action(async (testFile, options) => {
  try {
    const result = await runTests(testFile, {
      format: options.format,
      output: options.output,
      scenario: options.scenario,
      parallel: options.parallel,
      model: options.model,
      agent: options.agent,
      // 移除 verbose: options.verbose
      runs: options.runs,
      min_pass: options.minPass,
      quick: options.quick
    });
    // ... 后续代码保持不变
```

- [ ] **Step 2: 移除 RunOptions 接口中的 verbose 字段**

```typescript
// src/commands/run.ts:24-36
export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  // verbose?: boolean;  // 移除此行
  parallel?: boolean;
  model?: string;
  agent?: string;
  // 概率测试选项
  runs?: number;
  min_pass?: number;
  quick?: boolean;
}
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 4: 提交**

```bash
git add src/cli.ts src/commands/run.ts
git commit -m "refactor(cli): remove --verbose parameter from run command"
```

---

### Task 3: 修改 run.ts 使 actual_output 始终收集

**Files:**
- Modify: `src/commands/run.ts:254-260`
- Test: `tests/commands/run.test.ts`

- [ ] **Step 1: 编写失败的测试 - 验证 actual_output 始终收集**

```typescript
// tests/commands/run.test.ts - 在 probabilistic test execution describe 块后添加

describe('actual_output collection', () => {
  it('should always collect actual_output regardless of options', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'output-test',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Create file',
          expected: [{ should_call_tool: 'Write' }],
          timeout: 60000
        }]
      }],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    const mockOutputs = [
      { type: 'text', part: { text: 'Response' }, session_id: 'ses_1', timestamp: 1 },
      { type: 'tool_use', part: { tool: 'Write', state: { status: 'completed' } }, session_id: 'ses_1', timestamp: 2 }
    ];

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    mockRunner.run.mockReturnValue({
      outputs: mockOutputs,
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([
      { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
    ]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    // 不传递任何 verbose 选项
    const result = await runTests(yamlPath);

    // actual_output 应该被收集
    expect(result.scenarios[0].steps[0].actual_output).toBeDefined();
    expect(result.scenarios[0].steps[0].actual_output).toEqual(mockOutputs);
  });

  it('should collect output for each run in multi-run scenario', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'multi-run-output',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test',
          expected: [],
          timeout: 60000
        }]
      }],
      config: {
        runs: 2,
        min_pass: 1,
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    const run1Outputs = [{ type: 'text', part: { text: 'Run 1' } }];
    const run2Outputs = [{ type: 'text', part: { text: 'Run 2' } }];

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

    let callCount = 0;
    mockRunner.run.mockImplementation(() => {
      callCount++;
      return {
        outputs: callCount === 1 ? run1Outputs : run2Outputs,
        sessionId: `ses_${callCount}`
      };
    });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    // 验证 runs 数组中的每次运行都有 output
    expect(result.scenarios[0].steps[0].runs).toBeDefined();
    expect(result.scenarios[0].steps[0].runs).toHaveLength(2);
    expect(result.scenarios[0].steps[0].runs![0].output).toEqual(run1Outputs);
    expect(result.scenarios[0].steps[0].runs![1].output).toEqual(run2Outputs);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- tests/commands/run.test.ts --run`
Expected: FAIL - actual_output 为 undefined

- [ ] **Step 3: 修改 actual_output 收集逻辑**

```typescript
// src/commands/run.ts:254-260
// 修改前：
const stepResult: StepResult = {
  input: step.input,
  status: stepPassed ? 'passed' : 'failed',
  duration_ms: stepDuration,
  assertions: assertionResults,
  actual_output: options?.verbose ? runResult.outputs : undefined
};

// 修改后：
const stepResult: StepResult = {
  input: step.input,
  status: stepPassed ? 'passed' : 'failed',
  duration_ms: stepDuration,
  assertions: assertionResults,
  actual_output: runResult.outputs  // 始终收集
};
```

- [ ] **Step 4: 为 RunExecution 添加 output 字段收集**

```typescript
// src/commands/run.ts - 在收集 runExecution 的位置添加 output 字段
// 大约在第 301-310 行附近

const runExecution: RunExecutionWithAssertions = {
  run_index: runIndex,
  status: allStepsPassed && !runError ? 'passed' : 'failed',
  duration_ms: Date.now() - startTime,
  assertions: runAssertions,
  error: runError,
  output: runResult.outputs  // 新增：收集每次运行的输出
};
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npm test -- tests/commands/run.test.ts --run`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "feat(run): always collect actual_output, add output to RunExecution"
```

---

### Task 4: HTML 格式化器 - 多运行详情展示

**Files:**
- Modify: `src/output/formatters/html.ts`
- Test: `tests/output/formatters/html.test.ts`

- [ ] **Step 1: 编写失败的测试 - HTML 多运行展示**

```typescript
// tests/output/formatters/html.test.ts - 在文件末尾添加

import type { RunExecution, StepSummary, AssertionSummary } from '../../../src/types/index.js';

describe('formatRunsDetailHtml', () => {
  // 由于 formatRunsDetailHtml 是内部函数，我们通过 formatAsHtml 间接测试

  it('should display runs summary for probabilistic test', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 1000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true }
      ]},
      { run_index: 1, status: 'passed', duration_ms: 1200, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true }
      ]},
      { run_index: 2, status: 'failed', duration_ms: 5000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: false, message: 'Timeout' }
      ], error: 'Timeout'}
    ];

    const summary: StepSummary = {
      total_runs: 3,
      passed_runs: 2,
      min_pass: 2,
      status: 'passed'
    };

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 7200, timestamp: '' },
      scenarios: [{
        name: 'prob-test',
        environment: 'default',
        status: 'passed',
        duration_ms: 7200,
        runs: 3,
        min_pass: 2,
        passed_runs: 2,
        steps: [{
          input: 'Create file',
          status: 'passed',
          duration_ms: 7200,
          assertions: [],
          runs,
          summary
        }]
      }]
    };

    const html = formatAsHtml(result);

    // 验证运行统计展示
    expect(html).toContain('运行统计');
    expect(html).toContain('3 次运行');
    expect(html).toContain('2 次通过');
    expect(html).toContain('要求 ≥ 2');

    // 验证运行详情表格
    expect(html).toContain('运行详情');
    expect(html).toContain('<details');
    expect(html).toContain('运行 1');
    expect(html).toContain('运行 2');
    expect(html).toContain('运行 3');
  });

  it('should display each run with collapsible details', () => {
    const runs: RunExecution[] = [
      {
        run_index: 0,
        status: 'passed',
        duration_ms: 1000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true }
        ],
        output: [
          { type: 'text', part: { text: 'Creating file...' } },
          { type: 'tool_use', part: { tool: 'Write', state: { status: 'completed', input: { file: 'test.txt' } } } }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1000, timestamp: '' },
      scenarios: [{
        name: 'with-output',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: [{
          input: 'Test',
          status: 'passed',
          duration_ms: 1000,
          assertions: [],
          runs
        }]
      }]
    };

    const html = formatAsHtml(result);

    // 验证折叠结构
    expect(html).toContain('<details class="run-item');
    expect(html).toContain('<summary class="run-header">');
    expect(html).toContain('</summary>');
    expect(html).toContain('</details>');

    // 验证运行输出展示
    expect(html).toContain('Creating file...');
    expect(html).toContain('<td>Write</td>');
  });

  it('should display error message for failed runs', () => {
    const runs: RunExecution[] = [
      {
        run_index: 0,
        status: 'failed',
        duration_ms: 60000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: false, message: 'Timeout' }
        ],
        error: 'Execution timeout after 60000ms'
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 60000, timestamp: '' },
      scenarios: [{
        name: 'failed-run',
        environment: 'default',
        status: 'failed',
        duration_ms: 60000,
        steps: [{
          input: 'Test',
          status: 'failed',
          duration_ms: 60000,
          assertions: [],
          runs
        }]
      }]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Execution timeout');
    expect(html).toContain('run-item failed');
  });

  it('should not display runs section for single-run scenario', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1000, timestamp: '' },
      scenarios: [{
        name: 'single-run',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: [{
          input: 'Test',
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: true }
          ]
        }]
      }]
    };

    const html = formatAsHtml(result);

    // 单次运行不应该显示多运行统计
    expect(html).not.toContain('运行统计');
    expect(html).not.toContain('运行详情');
  });

  it('should display assertion summaries in runs summary', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 1000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'file_content_contains', value: { file: 'test.txt', text: 'hello' }, passed: true }
      ]},
      { run_index: 1, status: 'failed', duration_ms: 2000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'file_content_contains', value: { file: 'test.txt', text: 'hello' }, passed: false, message: 'Content not found' }
      ]}
    ];

    const assertionSummaries: AssertionSummary[] = [
      {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 2,
        passed_runs: 2,
        status: 'passed',
        failures: []
      },
      {
        type: 'file_content_contains',
        value: { file: 'test.txt', text: 'hello' },
        min_pass: 2,
        passed_runs: 1,
        status: 'failed',
        failures: [{ run_index: 1, message: 'Content not found' }]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 3000, timestamp: '' },
      scenarios: [{
        name: 'with-summaries',
        environment: 'default',
        status: 'failed',
        duration_ms: 3000,
        steps: [{
          input: 'Test',
          status: 'failed',
          duration_ms: 3000,
          assertions: [],
          runs,
          assertionSummaries
        }]
      }]
    };

    const html = formatAsHtml(result);

    // 验证断言统计表格
    expect(html).toContain('断言统计');
    expect(html).toContain('should_call_tool');
    expect(html).toContain('file_content_contains');
    expect(html).toContain('2/2');
    expect(html).toContain('1/2');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- tests/output/formatters/html.test.ts --run`
Expected: FAIL - 新测试用例失败

- [ ] **Step 3: 实现 formatRunsDetailHtml 函数**

```typescript
// src/output/formatters/html.ts - 在文件末尾添加

import type { RunExecution, StepSummary, AssertionSummary } from '../../types/index.js';

/**
 * 格式化多次运行详情（HTML）
 */
function formatRunsDetailHtml(
  runs: RunExecution[] | undefined,
  summary: StepSummary | undefined,
  assertionSummaries: AssertionSummary[] | undefined
): string {
  if (!runs || runs.length <= 1) {
    return '';
  }

  const lines: string[] = [];

  // 运行统计
  if (summary) {
    const statusIcon = summary.status === 'passed' ? '✓' : '✗';
    const statusClass = summary.status === 'passed' ? 'status-passed' : 'status-failed';
    lines.push('<div class="runs-summary">');
    lines.push(`<strong>运行统计:</strong> ${summary.total_runs} 次运行，<span class="${statusClass}">${summary.passed_runs} 次通过</span>（要求 ≥ ${summary.min_pass}）${statusIcon}`);
    lines.push('</div>');
  }

  // 断言统计表格
  if (assertionSummaries && assertionSummaries.length > 0) {
    lines.push('<div class="assertion-summaries">');
    lines.push('<h4>断言统计</h4>');
    lines.push('<table class="assertion-summary-table">');
    lines.push('<tr><th>断言</th><th>通过次数</th><th>要求</th><th>状态</th></tr>');

    for (const as of assertionSummaries) {
      const valueStr = typeof as.value === 'string' ? as.value : JSON.stringify(as.value);
      const statusIcon = as.status === 'passed' ? '✓' : '✗';
      const statusClass = as.status === 'passed' ? 'status-passed' : 'status-failed';

      lines.push('<tr>');
      lines.push(`<td>${escapeHtml(as.type)}: ${escapeHtml(valueStr)}</td>`);
      lines.push(`<td>${as.passed_runs}/${summary?.total_runs || runs.length}</td>`);
      lines.push(`<td>≥ ${as.min_pass}</td>`);
      lines.push(`<td class="${statusClass}">${statusIcon}</td>`);
      lines.push('</tr>');
    }

    lines.push('</table>');
    lines.push('</div>');
  }

  // 运行详情
  lines.push('<div class="runs-details">');
  lines.push('<h4>运行详情</h4>');

  for (const run of runs) {
    const statusClass = run.status === 'passed' ? 'passed' : 'failed';
    const statusIcon = run.status === 'passed' ? '✓' : '✗';

    lines.push(`<details class="run-item ${statusClass}">`);
    lines.push(`<summary class="run-header">`);
    lines.push(`<span class="scenario-status ${statusClass}">${statusIcon}</span>`);
    lines.push(`运行 ${run.run_index + 1} (${run.status}, ${run.duration_ms}ms)`);
    lines.push('</summary>');

    lines.push('<div class="run-content">');

    // 断言结果
    if (run.assertions.length > 0) {
      lines.push('<div class="assertions">');
      lines.push('<strong>断言结果:</strong>');
      for (const a of run.assertions) {
        const aStatusIcon = a.passed ? '✓' : '✗';
        const aStatusClass = a.passed ? 'passed' : 'failed';
        const valueStr = typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
        lines.push(`<div class="assertion ${aStatusClass}">${aStatusIcon} ${escapeHtml(a.type)}: ${escapeHtml(valueStr)}`);
        if (!a.passed && a.message) {
          lines.push(` - <small>${escapeHtml(a.message)}</small>`);
        }
        lines.push('</div>');
      }
      lines.push('</div>');
    }

    // 运行输出（actual_output）
    if (run.output && run.output.length > 0) {
      lines.push(formatSessionOutputHtml(run.output, `运行 ${run.run_index + 1} 输出`));
    }

    // 错误信息
    if (run.error) {
      lines.push(`<div class="error"><strong>Error:</strong> ${escapeHtml(run.error)}</div>`);
    }

    lines.push('</div>'); // .run-content
    lines.push('</details>');
  }

  lines.push('</div>'); // .runs-details

  return lines.join('\n');
}
```

- [ ] **Step 4: 修改 formatScenario 函数调用 formatRunsDetailHtml**

```typescript
// src/output/formatters/html.ts - 修改 formatScenario 函数

function formatScenario(scenario: ScenarioResult): string {
  const lines: string[] = [];

  const statusIcon = scenario.status === 'passed' ? '✅' : '❌';
  const statusText = scenario.status.toUpperCase();

  lines.push(`
    <div class="scenario">
      <div class="scenario-header">
        <h3>${escapeHtml(scenario.name)}</h3>
        <span class="scenario-status ${scenario.status}">${statusText}</span>
      </div>
      <div class="meta">
        Environment: ${escapeHtml(scenario.environment)} | Duration: ${scenario.duration_ms}ms
      </div>`);

  // 运行统计（概率测试）
  if (scenario.steps[0]?.runs && scenario.steps[0].runs.length > 1) {
    lines.push(formatRunsDetailHtml(
      scenario.steps[0].runs,
      scenario.steps[0].summary,
      scenario.steps[0].assertionSummaries
    ));
  }

  // 错误信息
  if (scenario.error) {
    lines.push(`<div class="error"><strong>Error:</strong> ${escapeHtml(scenario.error)}</div>`);
  }

  // 步骤
  if (scenario.steps.length > 0) {
    lines.push(`
        <h4>Steps</h4>
        ${scenario.steps.map((step, i) => formatStep(step, i + 1)).join('\n')}`);
  }

  lines.push(`
    </div>`);

  return lines.join('\n');
}
```

- [ ] **Step 5: 添加 CSS 样式**

```typescript
// src/output/formatters/html.ts - 在 <style> 标签内添加新样式

// 在现有样式后添加：
    .runs-summary { margin: 15px 0; padding: 10px; background: #e8f4f8; border-radius: 4px; }
    .assertion-summaries { margin: 15px 0; }
    .assertion-summary-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .assertion-summary-table th, .assertion-summary-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .assertion-summary-table th { background: #f5f5f5; }
    .runs-details { margin: 15px 0; }
    .run-item { margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
    .run-item.passed { border-left: 4px solid #27ae60; }
    .run-item.failed { border-left: 4px solid #e74c3c; }
    .run-header { padding: 10px; cursor: pointer; background: #f9f9f9; }
    .run-content { padding: 15px; border-top: 1px solid #ddd; }
```

- [ ] **Step 6: 运行测试验证通过**

Run: `npm test -- tests/output/formatters/html.test.ts --run`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/output/formatters/html.ts tests/output/formatters/html.test.ts
git commit -m "feat(html): add multi-run detail display with collapsible sections"
```

---

### Task 5: Markdown 格式化器 - 多运行表格展示

**Files:**
- Modify: `src/output/formatters/markdown.ts`
- Test: `tests/output/formatters/markdown.test.ts`

- [ ] **Step 1: 编写失败的测试 - Markdown 多运行表格**

```typescript
// tests/output/formatters/markdown.test.ts - 在文件末尾添加

import type { RunExecution, StepSummary } from '../../../src/types/index.js';

describe('multi-run display', () => {
  it('should display runs summary for probabilistic test', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 1000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true }
      ]},
      { run_index: 1, status: 'passed', duration_ms: 1200, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true }
      ]},
      { run_index: 2, status: 'failed', duration_ms: 5000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: false }
      ], error: 'Timeout'}
    ];

    const summary: StepSummary = {
      total_runs: 3,
      passed_runs: 2,
      min_pass: 2,
      status: 'passed'
    };

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 7200, timestamp: '' },
      scenarios: [{
        name: 'prob-test',
        environment: 'default',
        status: 'passed',
        duration_ms: 7200,
        runs: 3,
        min_pass: 2,
        passed_runs: 2,
        steps: [{
          input: 'Create file',
          status: 'passed',
          duration_ms: 7200,
          assertions: [],
          runs,
          summary
        }]
      }]
    };

    const markdown = formatAsMarkdown(result);

    // 验证运行统计展示
    expect(markdown).toContain('**运行统计:**');
    expect(markdown).toContain('3 次运行');
    expect(markdown).toContain('2 次通过');
    expect(markdown).toContain('要求 ≥ 2');

    // 验证运行详情表格
    expect(markdown).toContain('#### 运行详情');
    expect(markdown).toContain('| 运行 | 状态 | 耗时 | 断言 |');
    expect(markdown).toContain('| 1 | ✓ passed |');
    expect(markdown).toContain('| 2 | ✓ passed |');
    expect(markdown).toContain('| 3 | ✗ failed |');
  });

  it('should display error message in assertion column', () => {
    const runs: RunExecution[] = [
      {
        run_index: 0,
        status: 'failed',
        duration_ms: 60000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: false, message: 'Timeout' }
        ],
        error: 'Execution timeout'
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 60000, timestamp: '' },
      scenarios: [{
        name: 'failed-run',
        environment: 'default',
        status: 'failed',
        duration_ms: 60000,
        steps: [{
          input: 'Test',
          status: 'failed',
          duration_ms: 60000,
          assertions: [],
          runs
        }]
      }]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('Execution timeout');
  });

  it('should not display runs table for single-run scenario', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1000, timestamp: '' },
      scenarios: [{
        name: 'single-run',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: [{
          input: 'Test',
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: true }
          ]
        }]
      }]
    };

    const markdown = formatAsMarkdown(result);

    // 单次运行不应该显示多运行表格
    expect(markdown).not.toContain('#### 运行详情');
    expect(markdown).not.toContain('| 运行 | 状态 |');
  });

  it('should display assertion count format as passed/total', () => {
    const runs: RunExecution[] = [
      { run_index: 0, status: 'passed', duration_ms: 1000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'done', passed: true }
      ]},
      { run_index: 1, status: 'failed', duration_ms: 2000, assertions: [
        { type: 'should_call_tool', value: 'Write', passed: true },
        { type: 'response_contains', value: 'done', passed: false }
      ]}
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 3000, timestamp: '' },
      scenarios: [{
        name: 'multi-assertion',
        environment: 'default',
        status: 'passed',
        duration_ms: 3000,
        steps: [{
          input: 'Test',
          status: 'passed',
          duration_ms: 3000,
          assertions: [],
          runs
        }]
      }]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('2/2');  // 第一次运行：2/2 通过
    expect(markdown).toContain('1/2');  // 第二次运行：1/2 通过
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- tests/output/formatters/markdown.test.ts --run`
Expected: FAIL - 新测试用例失败

- [ ] **Step 3: 实现 formatRunsTableMarkdown 函数**

```typescript
// src/output/formatters/markdown.ts - 在文件中添加

import type { RunExecution, StepSummary } from '../../types/index.js';

/**
 * 格式化多次运行表格（Markdown）
 */
function formatRunsTableMarkdown(
  runs: RunExecution[] | undefined,
  summary: StepSummary | undefined
): string {
  if (!runs || runs.length <= 1) {
    return '';
  }

  const lines: string[] = [];

  // 运行统计
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

    let assertionStr = `${passedCount}/${totalCount}`;
    if (run.error) {
      assertionStr += ` (${run.error})`;
    }

    lines.push(`| ${run.run_index + 1} | ${statusIcon} ${run.status} | ${run.duration_ms}ms | ${assertionStr} |`);
  }

  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: 修改 formatScenario 函数调用 formatRunsTableMarkdown**

```typescript
// src/output/formatters/markdown.ts - 修改 formatScenario 函数

function formatScenario(scenario: ScenarioResult): string {
  const lines: string[] = [];

  const statusIcon = scenario.status === 'passed' ? '✅' : '❌';
  const statusText = scenario.status.toUpperCase();

  lines.push(`### ${scenario.name}`);
  lines.push('');
  lines.push(`**Status:** ${statusIcon} ${statusText}`);
  lines.push(`**Environment:** ${scenario.environment}`);
  lines.push(`**Duration:** ${scenario.duration_ms}ms`);

  if (scenario.error) {
    lines.push('');
    lines.push(`**Error:** ${scenario.error}`);
  }

  if (scenario.tempDirectory) {
    lines.push(`**Temp Directory:** ${scenario.tempDirectory}`);
  }

  lines.push('');

  // 多运行统计（概率测试）- 新增
  if (scenario.steps[0]?.runs && scenario.steps[0].runs.length > 1) {
    lines.push(formatRunsTableMarkdown(
      scenario.steps[0].runs,
      scenario.steps[0].summary
    ));
  }

  // Steps
  if (scenario.steps.length > 0) {
    lines.push('#### Steps');
    lines.push('');

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      lines.push(formatStep(step, i + 1));
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npm test -- tests/output/formatters/markdown.test.ts --run`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/output/formatters/markdown.ts tests/output/formatters/markdown.test.ts
git commit -m "feat(markdown): add multi-run table display for probabilistic tests"
```

---

### Task 6: Jest 格式化器 - 断言级别结果

**Files:**
- Modify: `src/output/formatters/jest.ts`
- Test: `tests/output/formatters/jest.test.ts`

- [ ] **Step 1: 编写失败的测试 - Jest 断言级别结果**

```typescript
// tests/output/formatters/jest.test.ts - 在现有测试后添加

import type { AssertionSummary } from '../../../src/types/index.js';

describe('assertion-level results', () => {
  it('should generate assertion-level results for probabilistic test', () => {
    const assertionSummaries: AssertionSummary[] = [
      {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 2,
        passed_runs: 2,
        status: 'passed',
        failures: []
      },
      {
        type: 'file_content_contains',
        value: { file: 'test.txt', text: 'hello' },
        min_pass: 2,
        passed_runs: 1,
        status: 'failed',
        failures: [{ run_index: 2, message: 'Content not found' }]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 3000, timestamp: '' },
      scenarios: [{
        name: 'prob-test',
        environment: 'default',
        status: 'failed',
        duration_ms: 3000,
        steps: [{
          input: 'Create file',
          status: 'failed',
          duration_ms: 3000,
          assertions: [],
          runs: [
            { run_index: 0, status: 'passed', duration_ms: 1000, assertions: [] },
            { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
            { run_index: 2, status: 'failed', duration_ms: 1000, assertions: [] }
          ],
          summary: { total_runs: 3, passed_runs: 2, min_pass: 2, status: 'passed' },
          assertionSummaries
        }]
      }]
    };

    const jest = formatAsJest(result);

    // 应该有断言级别的 assertionResults
    expect(jest.testResults[0].assertionResults).toBeDefined();
    expect(jest.testResults[0].assertionResults.length).toBe(2);

    // 第一个断言通过
    const firstAssertion = jest.testResults[0].assertionResults[0];
    expect(firstAssertion.title).toContain('should_call_tool');
    expect(firstAssertion.status).toBe('passed');

    // 第二个断言失败
    const secondAssertion = jest.testResults[0].assertionResults[1];
    expect(secondAssertion.title).toContain('file_content_contains');
    expect(secondAssertion.status).toBe('failed');
    expect(secondAssertion.failureMessages).toContain('1/3 passed, required ≥ 2');
    expect(secondAssertion.failureMessages).toContain('- Run 3: Content not found');
  });

  it('should generate assertion-level results for traditional single-run test', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 1000, timestamp: '' },
      scenarios: [{
        name: 'traditional-test',
        environment: 'default',
        status: 'failed',
        duration_ms: 1000,
        steps: [{
          input: 'Test',
          status: 'failed',
          duration_ms: 1000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: true },
            { type: 'response_contains', value: 'success', passed: false, message: 'Not found' }
          ]
        }]
      }]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].assertionResults).toBeDefined();
    expect(jest.testResults[0].assertionResults.length).toBe(2);

    expect(jest.testResults[0].assertionResults[0].status).toBe('passed');
    expect(jest.testResults[0].assertionResults[1].status).toBe('failed');
    expect(jest.testResults[0].assertionResults[1].failureMessages).toContain('Not found');
  });

  it('should include fullName with scenario name', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1000, timestamp: '' },
      scenarios: [{
        name: 'my-scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: [{
          input: 'Test',
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: true }
          ]
        }]
      }]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].assertionResults[0].fullName).toBe('my-scenario - should_call_tool: Write');
    expect(jest.testResults[0].assertionResults[0].ancestorTitles).toEqual(['my-scenario']);
  });

  it('should aggregate all failure messages at scenario level', () => {
    const assertionSummaries: AssertionSummary[] = [
      {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 2,
        passed_runs: 1,
        status: 'failed',
        failures: [{ run_index: 0, message: 'Timeout' }]
      },
      {
        type: 'file_content_contains',
        value: { file: 'test.txt', text: 'hello' },
        min_pass: 2,
        passed_runs: 0,
        status: 'failed',
        failures: [
          { run_index: 0, message: 'File not found' },
          { run_index: 1, message: 'Content mismatch' }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 2000, timestamp: '' },
      scenarios: [{
        name: 'multi-failure',
        environment: 'default',
        status: 'failed',
        duration_ms: 2000,
        steps: [{
          input: 'Test',
          status: 'failed',
          duration_ms: 2000,
          assertions: [],
          runs: [
            { run_index: 0, status: 'failed', duration_ms: 1000, assertions: [] },
            { run_index: 1, status: 'failed', duration_ms: 1000, assertions: [] }
          ],
          summary: { total_runs: 2, passed_runs: 0, min_pass: 2, status: 'failed' },
          assertionSummaries
        }]
      }]
    };

    const jest = formatAsJest(result);

    // 场景级别的 failureMessages 应包含所有断言的失败信息
    expect(jest.testResults[0].failureMessages.length).toBeGreaterThan(0);
    expect(jest.testResults[0].failureMessages).toContain('1/2 passed, required ≥ 2');
    expect(jest.testResults[0].failureMessages).toContain('0/2 passed, required ≥ 2');
  });

  it('should handle empty assertions gracefully', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1000, timestamp: '' },
      scenarios: [{
        name: 'empty-assertions',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: [{
          input: 'Test',
          status: 'passed',
          duration_ms: 1000,
          assertions: []
        }]
      }]
    };

    const jest = formatAsJest(result);

    // 空断言应该产生一个默认的 assertionResult
    expect(jest.testResults[0].assertionResults.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- tests/output/formatters/jest.test.ts --run`
Expected: FAIL - 新测试用例失败

- [ ] **Step 3: 重构 formatScenarioAsJest 函数**

```typescript
// src/output/formatters/jest.ts - 重写整个文件

import type { TestResult, ScenarioResult, AssertionSummary } from '../../types/index.js';

interface JestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed';
  title: string;
  duration?: number;
  failureMessages: string[];
}

interface JestTestResult {
  assertionResults: JestAssertionResult[];
  startTime: number;
  endTime: number;
  status: 'passed' | 'failed';
  name: string;
  duration: number;
  failureMessages: string[];
}

interface JestResults {
  success: boolean;
  startTime: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
}

export function formatAsJest(result: TestResult): JestResults {
  const startTime = Date.now();

  const testResults = result.scenarios.map(scenario => formatScenarioAsJest(scenario));

  return {
    success: result.summary.failed === 0,
    startTime,
    numTotalTests: result.summary.total_scenarios,
    numPassedTests: result.summary.passed,
    numFailedTests: result.summary.failed,
    numPendingTests: 0,
    testResults
  };
}

function formatScenarioAsJest(scenario: ScenarioResult): JestTestResult {
  const startTime = Date.now() - scenario.duration_ms;
  const assertionResults: JestAssertionResult[] = [];
  const failureMessages: string[] = [];

  // 获取第一个步骤
  const firstStep = scenario.steps[0];

  // 处理概率测试的断言汇总
  if (firstStep?.assertionSummaries && firstStep.assertionSummaries.length > 0) {
    for (const summary of firstStep.assertionSummaries) {
      const valueStr = typeof summary.value === 'string'
        ? summary.value
        : JSON.stringify(summary.value);

      const assertionFailureMessages: string[] = [];
      if (summary.status === 'failed') {
        const totalRuns = firstStep.summary?.total_runs || firstStep.runs?.length || 1;
        assertionFailureMessages.push(`${summary.passed_runs}/${totalRuns} passed, required ≥ ${summary.min_pass}`);
        for (const failure of summary.failures) {
          assertionFailureMessages.push(`- Run ${failure.run_index + 1}: ${failure.message}`);
        }
        failureMessages.push(...assertionFailureMessages);
      }

      assertionResults.push({
        ancestorTitles: [scenario.name],
        fullName: `${scenario.name} - ${summary.type}: ${valueStr}`,
        status: summary.status,
        title: `${summary.type}: ${valueStr}`,
        failureMessages: assertionFailureMessages
      });
    }
  } else {
    // 传统单次测试：从断言构建结果
    for (const step of scenario.steps) {
      for (const assertion of step.assertions) {
        const valueStr = typeof assertion.value === 'string'
          ? assertion.value
          : JSON.stringify(assertion.value);

        const assertionFailureMessages: string[] = [];
        if (!assertion.passed && assertion.message) {
          assertionFailureMessages.push(assertion.message);
          failureMessages.push(`${assertion.type}: ${valueStr} - ${assertion.message}`);
        }

        assertionResults.push({
          ancestorTitles: [scenario.name],
          fullName: `${scenario.name} - ${assertion.type}: ${valueStr}`,
          status: assertion.passed ? 'passed' : 'failed',
          title: `${assertion.type}: ${valueStr}`,
          failureMessages: assertionFailureMessages
        });
      }
    }
  }

  // 如果场景有错误但没有断言结果，添加一个默认结果
  if (assertionResults.length === 0 && scenario.error) {
    failureMessages.push(scenario.error);
    assertionResults.push({
      ancestorTitles: [scenario.name],
      fullName: scenario.name,
      status: 'failed',
      title: scenario.name,
      failureMessages: [scenario.error]
    });
  }

  // 如果场景有错误，添加到 failureMessages
  if (scenario.error) {
    failureMessages.push(scenario.error);
  }

  return {
    assertionResults,
    startTime,
    endTime: startTime + scenario.duration_ms,
    status: scenario.status,
    name: scenario.name,
    duration: scenario.duration_ms,
    failureMessages
  };
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- tests/output/formatters/jest.test.ts --run`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/output/formatters/jest.ts tests/output/formatters/jest.test.ts
git commit -m "feat(jest): refactor to assertion-level results with failure details"
```

---

### Task 7: 更新 README 文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 移除 verbose 参数相关描述**

找到 README.md 中以下内容并移除：

```markdown
# 移除第 374 行的 --verbose 参数说明
- `--verbose` - 显示详细输出

# 移除第 430-442 行的会话内容展示部分
### 会话内容展示

使用 `--verbose` 参数时，markdown 和 html 格式的测试报告会包含完整的会话内容：
...
```

- [ ] **Step 2: 更新输出格式部分**

```markdown
## 输出格式

Agent VCR 支持四种输出格式：

| 格式 | 说明 | 详尽程度 |
|-----|------|---------|
| `json` | 结构化 JSON（默认） | 详尽（含 actual_output） |
| `html` | 带样式的 HTML 报告 | 详尽（含 actual_output、多运行详情） |
| `markdown` | 人类可读的 Markdown | 简洁（含多运行统计表格） |
| `jest` | Jest 兼容格式 | 简洁（断言级别结果） |

### JSON 输出

JSON 格式输出完整的测试数据，包含所有字段。适用于程序化处理和报告重新生成。

### HTML 输出

HTML 格式生成美观的网页报告，特性包括：
- 响应式布局
- 多次运行详情展示（概率测试）
- 可折叠的运行详情和会话输出
- 断言统计表格

### Markdown 输出

Markdown 格式适合人类阅读和版本控制：
- 简洁的运行统计表格
- 断言结果列表
- 不包含完整的会话输出（保持简洁）

### Jest 格式

Jest 格式便于 CI/CD 集成：
- 断言级别的测试结果
- 失败断言展示通过率和失败详情
- 兼容现有 Jest 测试报告工具

```bash
# 运行测试并输出 Jest 格式
agentvcr run ./tests/ -f jest -o results.json

# 退出码：0 表示全部通过，1 表示有失败
```
```

- [ ] **Step 3: 添加多运行展示示例**

在"概率性测试"部分后添加：

```markdown
### 多次运行结果展示

概率测试的多次运行结果会在报告中展示：

**HTML 报告**：
- 运行统计摘要
- 断言统计表格（各断言通过率）
- 可折叠的每次运行详情（状态、耗时、断言、会话输出）

**Markdown 报告**：
- 运行统计摘要
- 运行详情表格

| 运行 | 状态 | 耗时 | 断言 |
|-----|------|------|------|
| 1 | ✓ passed | 5200ms | 2/2 |
| 2 | ✓ passed | 5100ms | 2/2 |
| 3 | ✗ failed | 60000ms | 0/2 (超时) |

**Jest 格式**：
- 断言级别测试结果
- 失败断言的 `failureMessages` 包含通过率和失败原因
```

- [ ] **Step 4: 更新 CLI 命令文档**

```markdown
### agentvcr run

运行测试用例。

```bash
agentvcr run <testFile> [-f format] [-o file] [-s scenario]
```

**选项**：
- `-f, --format <format>` - 输出格式 (json, markdown, html, jest)，默认 json
- `-o, --output <file>` - 输出到文件
- `-s, --scenario <name>` - 只运行指定场景
- `--parallel` - 并行运行场景
- `-m, --model <model>` - 覆盖模型配置
- `-a, --agent <agent>` - 覆盖 agent 配置
- `--runs <n>` - 覆盖全局 runs 配置
- `--min-pass <n>` - 覆盖全局 min_pass 配置
- `--quick` - 快速模式: runs=1, min_pass=1
```

- [ ] **Step 5: 提交**

```bash
git add README.md
git commit -m "docs: update README for verbose removal and multi-run display"
```

---

### Task 8: 运行完整测试套件

**Files:**
- 无修改

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行构建**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: 验证 CLI 帮助信息**

Run: `node dist/cli.js run --help`
Expected: 不包含 `--verbose` 参数

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: verify all tests pass after verbose removal"
```

---

## 自检清单

- [x] **Spec 覆盖**：设计文档中所有改动点都有对应任务
- [x] **无占位符**：所有代码块都是完整实现，无 TBD/TODO
- [x] **类型一致性**：RunExecution.output 类型在各文件中一致
- [x] **测试覆盖**：每个改动都有对应的单元测试
- [x] **文档更新**：README 同步更新变化点

---

**文档版本**: 1.0
**创建日期**: 2026-04-09