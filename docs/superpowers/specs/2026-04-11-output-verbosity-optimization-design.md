---
name: output-verbosity-optimization
description: 优化输出系统，去除verbose参数，为不同输出格式设计内置详细程度属性
type: project
---

# 输出格式详细程度优化设计

## 概述

去除 `--verbose` CLI 参数，将详细程度内化为各输出格式的默认属性：
- **json**：详尽（完整数据源）
- **html**：详尽（精心设计的可视化）
- **jest**：简洁（仅基本结果）
- **markdown**：简洁（仅基本结果）

核心改动包括数据结构调整和 HTML formatter 重写。

## Why

用户需要更清晰的输出体验：
1. verbose 参数增加认知负担，用户需要记住何时使用
2. 不同格式的使用场景天然决定详细程度：json 用于数据分析需完整；html 用于可视化报告需丰富；jest/markdown 用于快速查看需简洁
3. 多次运行后，现有输出结构不够清晰，运行详情与步骤统计混杂
4. HTML 输出缺乏精心设计的运行详情展示，难以追溯每次执行的完整对话过程

## How to Apply

- 移除 verbose 参数和相关逻辑
- 调整数据结构，将运行详情提升到场景级别
- 重写 HTML formatter 实现步骤统计表格 + 运行详情 Tab 展示
- 微调其他 formatter 适配新数据结构

---

## 1. CLI 层面改动

### 移除 --verbose 参数

**cli.ts:**
```typescript
// 移除该行
// .option('--verbose', 'Show detailed output')

// run.ts RunOptions 接口移除 verbose 字段
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
  // verbose?: boolean;  // 移除
}
```

---

## 2. 数据结构调整

### 2.1 ScenarioResult 新增字段

运行详情提升到场景级别，`StepResult` 简化为统计信息。

**types/index.ts:**

```typescript
export interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;
  tempDirectory?: string;
  
  // 概率测试字段（保持在场景级别）
  runs?: number;
  min_pass?: number;
  passed_runs?: number;
  
  // 新增：运行详情
  runDetails?: RunExecution[];
}

// 新增：单次运行的完整执行结果
export interface RunExecution {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  error?: string;
  steps: RunStepDetail[];  // 每步的完整详情
}

// 新增：运行中单步的详情
export interface RunStepDetail {
  step_index: number;
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];  // 完整对话过程
}

// StepResult 简化：移除 runs/summary/assertionSummaries，改为统计表格
export interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertionStats?: AssertionStat[];  // 新增：断言统计表格
}

// 新增：断言级别的统计
export interface AssertionStat {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  passed_runs: number;
  total_runs: number;
  pass_rate: number;  // 百分比，0-100
  status: 'passed' | 'failed';
}
```

### 2.2 移除的旧字段

从 `StepResult` 移除：
- `runs?: RunExecution[]`（旧版，数据移到 ScenarioResult.runDetails）
- `summary?: StepSummary`（不再使用）
- `assertionSummaries?: AssertionSummary[]`（改为 assertionStats）
- `actual_output?: OpenCodeRunOutput[]`（移到 `RunStepDetail.actual_output`）

**注意：** 单次运行时，`ScenarioResult.runDetails` 仍存在（只有 1 个 RunExecution），确保 JSON 输出始终完整。传统单次运行模式与概率测试多运行的唯一区别是 `runs/min_pass/passed_runs` 字段不填充。

从 `types/index.ts` 可考虑移除或保留：
- `RunExecution`（旧版，重命名为新版）
- `StepSummary`（不再使用）
- `AssertionSummary`（重命名为 `AssertionStat`）

---

## 3. JSON 格式详尽结构示例

```json
{
  "suite": {
    "name": "file-operations-test",
    "description": "验证文件操作 Skill 的基本行为",
    "file": "./example/tests/file-operations.yaml"
  },
  "summary": {
    "total_scenarios": 1,
    "passed": 1,
    "failed": 0,
    "duration_ms": 5000,
    "timestamp": "2026-04-11T..."
  },
  "scenarios": [
    {
      "name": "create-file",
      "environment": "empty",
      "status": "passed",
      "duration_ms": 5000,
      "steps": [
        {
          "input": "创建 hello.txt...",
          "status": "passed",
          "duration_ms": 4800,
          "assertionStats": [
            {
              "type": "should_call_tool",
              "value": "Write",
              "passed_runs": 4,
              "total_runs": 5,
              "pass_rate": 80,
              "status": "passed"
            },
            {
              "type": "file_content_contains",
              "value": {"file": "hello.txt", "text": "Hello World"},
              "passed_runs": 5,
              "total_runs": 5,
              "pass_rate": 100,
              "status": "passed"
            }
          ]
        }
      ],
      "runs": 5,
      "min_pass": 3,
      "passed_runs": 4,
      "runDetails": [
        {
          "run_index": 0,
          "status": "passed",
          "duration_ms": 1000,
          "steps": [
            {
              "step_index": 0,
              "input": "创建 hello.txt...",
              "status": "passed",
              "duration_ms": 980,
              "assertions": [
                {
                  "type": "should_call_tool",
                  "value": "Write",
                  "passed": true,
                  "message": "Tool 'Write' was called 1 times"
                },
                {
                  "type": "file_content_contains",
                  "value": {"file": "hello.txt", "text": "Hello World"},
                  "passed": true,
                  "message": "Content 'Hello World' found in 'hello.txt'"
                }
              ],
              "actual_output": [
                {"type": "text", "part": {"text": "我来创建文件..."}},
                {"type": "tool_use", "part": {"tool": "Write", "state": {"status": "completed", "input": {"path": "hello.txt"}}}}
              ]
            }
          ]
        },
        {
          "run_index": 1,
          "status": "passed",
          "duration_ms": 950,
          "steps": [...]
        }
        // ... Run 2-4
      ]
    }
  ]
}
```

---

## 4. HTML 展示结构设计

### 4.1 场景块层级结构

```
┌─────────────────────────────────────────────────────────────┐
│ [场景头部]                                                   │
│   create-file | ✓ PASSED | 4/5 runs | 5000ms                │
├─────────────────────────────────────────────────────────────┤
│ [步骤统计区]                                                 │
│                                                             │
│   Step 1: "创建 hello.txt 文件..."                          │
│   ┌───────────────────────────────────────────────────────┐│
│   │ 断言类型            │ 通过次数 │ 通过率 │ 状态        ││
│   ├───────────────────────────────────────────────────────┤│
│   │ should_call_tool    │ 4/5     │ 80%   │ ✓ passed    ││
│   │ file_content_contains│ 5/5     │ 100%  │ ✓ passed    ││
│   └───────────────────────────────────────────────────────┘│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ [运行详情折叠块]                                             │
│                                                             │
│   ▶ 运行详情 (5 runs)                                       │
│   ┌───────────────────────────────────────────────────────┐│
│   │ [Run 1] [Run 2] [Run 3] [Run 4] [Run 5]    ← Tab 按钮 ││
│   ├───────────────────────────────────────────────────────┤│
│   │ Run 1 - ✓ passed - 1000ms                             ││
│   │                                                       ││
│   │ Step 1: "创建 hello.txt..."                           ││
│   │ Assertions:                                           ││
│   │   ✓ should_call_tool: Write                          ││
│   │   ✓ file_content_contains: hello.txt 含 'Hello World'││
│   │                                                       ││
│   │ Request:                                              ││
│   │   > 创建 hello.txt 文件...                            ││
│   │                                                       ││
│   │ Response:                                             ││
│   │   > 我来创建文件...                                    ││
│   │                                                       ││
│   │ Tool Calls:                                           ││
│   │   ┌─────────────────────────────────────────────────┐││
│   │   │ Tool  │ Status    │ Input                       │││
│   │   │ Write │ ✓ completed │ path: hello.txt           │││
│   │   └─────────────────────────────────────────────────┘││
│   │                                                       ││
│   │ ▶ Raw Output (JSON 折叠)                              ││
│   └───────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 CSS 样式新增

```css
/* Tab 切换区域 */
.run-details-section { margin-top: 20px; }
.run-details-header { 
  cursor: pointer; 
  display: flex; 
  align-items: center; 
  gap: 10px;
}
.run-details-content { 
  margin-top: 15px; 
  display: none;  /* 默认折叠 */
}
.run-details-content.expanded { display: block; }

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

/* 断言统计表格 */
.assertion-stats-table { 
  width: 100%; 
  border-collapse: collapse; 
  margin: 10px 0;
}
.assertion-stats-table th, 
.assertion-stats-table td { 
  border: 1px solid #ddd; 
  padding: 10px; 
  text-align: left;
}
.assertion-stats-table th { background: #f5f5f5; }

.pass-rate { 
  font-weight: bold;
}
.pass-rate.high { color: #27ae60; }      /* >= 80% */
.pass-rate.medium { color: #f39c12; }    /* 50-79% */
.pass-rate.low { color: #e74c3c; }       /* < 50% */

/* 运行详情块内的步骤展示 */
.run-step-block { 
  margin: 15px 0; 
  padding: 15px; 
  background: #f9f9f9; 
  border-radius: 4px;
}
.run-step-header { font-weight: bold; margin-bottom: 10px; }
.run-step-assertions { margin: 10px 0; }
.run-step-session { margin-top: 15px; }
```

### 4.3 JavaScript（内联脚本）

```html
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
  // 隐藏所有 tab content
  document.querySelectorAll('.tab-content-' + scenarioId).forEach(el => {
    el.classList.remove('active');
  });
  // 移除所有 tab button active 状态
  document.querySelectorAll('.tab-btn-' + scenarioId).forEach(el => {
    el.classList.remove('active');
  });
  // 显示选中的 tab
  document.getElementById('tab-' + scenarioId + '-' + runIndex).classList.add('active');
  document.getElementById('tab-btn-' + scenarioId + '-' + runIndex).classList.add('active');
}
</script>
```

### 4.4 HTML Formatter 重写要点

**文件：`src/output/formatters/html.ts`**

1. **formatScenario 函数重写：**
   - 渲染场景头部（含 runs 统计）
   - 渲染步骤统计区（每个步骤的 assertionStats 表格）
   - 渲染运行详情折叠块

2. **formatStep 函数简化：**
   - 只渲染步骤标题和断言统计表格
   - 不渲染 actual_output（已移到运行详情）

3. **新增 formatRunDetails 函数：**
   - 渲染折叠块头部（▶ 运行详情）
   - 渲染 Tab 按钮区域（[Run 1] [Run 2] ...）
   - 渲染每个 Run 的详细内容（Tab content）

4. **新增 formatRunStep 函数：**
   - 渲染单个运行中的步骤详情
   - 包含：断言列表、Request/Response、Tool Calls、Raw Output

---

## 5. Markdown 和 Jest 格式改动

### 5.1 Markdown（保持简洁）

**文件：`src/output/formatters/markdown.ts`**

改动：
- 场景级显示 runs/passed_runs 汇总（如果有多运行）
- 步骤级只显示状态和耗时，移除详细断言列表
- 移除 session output 详情展示

示例输出：
```markdown
### create-file

**Status:** ✅ PASSED
**Runs:** 4/5 passed (min_pass: 3)
**Duration:** 5000ms

#### Steps

1. **Input:** "创建 hello.txt..."
   - Status: ✓ passed
   - Duration: 4800ms
```

### 5.2 Jest（保持简洁）

**文件：`src/output/formatters/jest.ts`**

改动：
- 适配新数据结构
- 保持现有简洁输出格式
- 无需添加运行详情

---

## 6. 涉及文件改动清单

| 文件 | 改动类型 | 改动内容 |
|------|---------|---------|
| `src/cli.ts` | 移除 | 移除 `--verbose` 选项 |
| `src/types/index.ts` | 重构 | 调整 ScenarioResult、StepResult；新增 RunExecution、RunStepDetail、AssertionStat |
| `src/commands/run.ts` | 重构 | 移除 verbose 逻辑；调整数据收集，生成 runDetails 和 assertionStats |
| `src/executor/statistics.ts` | 重构 | 调整统计函数，生成 AssertionStat 数据 |
| `src/output/formatters/html.ts` | 重写 | 步骤统计表格 + 运行详情 Tab 折叠块 |
| `src/output/formatters/markdown.ts` | 简化 | 移除详细断言，添加汇总统计 |
| `src/output/formatters/jest.ts` | 微调 | 适配新数据结构 |
| `src/output/json.ts` | 微调 | 确保完整数据输出（无需改动，数据结构调整后自然输出完整） |

---

## 7. 测试验证

### 7.1 单次运行场景

- JSON 输出正常（无 runDetails 字段）
- HTML 输出正常（无运行详情折叠块）
- Markdown/Jest 输出正常

### 7.2 多次运行场景

- JSON 输出包含完整 runDetails
- HTML 展示步骤统计表格 + 可折叠 Tab 运行详情
- Tab 切换功能正常
- Markdown/Jest 显示汇总统计

### 7.3 多步骤场景

- 每个步骤独立显示统计表格
- 运行详情中每个 Run 包含所有步骤的完整对话过程