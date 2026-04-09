---
title: 概率性测试通过率指标设计
date: 2026-04-08
status: draft
---

# 概率性测试通过率指标设计

## 概述

在 AI 时代，Agent 测试结果存在不确定性（模型响应可能因温度、随机性等因素产生差异）。传统单元测试要求 100% 通过已不再适用。本设计引入**概率性通过率指标**，允许用户设定合理的通过阈值（如 10 次运行中 8 次通过即为合格）。

## 核心概念

### 两层通过率体系

1. **场景层级**：整次运行所有断言都通过才算一次"通过"
2. **断言层级**：每个断言可单独设定通过次数要求

### 默认值

- `runs: 5` —— 默认运行 5 次
- `min_pass: 4` —— 默认最少通过 4 次（80%）

## YAML 配置结构

### 配置层级

```yaml
config:
  runs: 5          # 全局默认
  min_pass: 4      # 全局默认

scenarios:
  - name: scenario1
    # 无配置，继承全局默认
    steps:
      - input: "..."
        expected:
          - should_call_tool: Write
            min_pass: 5    # 断言层级覆盖

  - name: scenario2
    runs: 10         # 场景层级覆盖
    min_pass: 8
    steps:
      - input: "..."
        expected:
          - should_call_tool: Write
            min_pass: 9    # 断言层级覆盖
          - response_contains: "完成"  # 继承场景 min_pass: 8
```

### 配置优先级

```
断言 min_pass > 场景 min_pass > 全局 min_pass
断言 runs    > 场景 runs    > 全局 runs（runs 不支持断言层级配置）
```

**注意**：`runs` 仅在全局和场景层级配置，断言层级不单独设置运行次数。

### 完整示例

```yaml
name: skill-operations-test
description: 测试文件操作技能的概率性表现

config:
  runs: 10
  min_pass: 8
  default_timeout: 120000

environments:
  default:
    directory: ./fixtures/test-env
    setup:
      - copy: "./templates/base -> $WORKDIR/"

scenarios:
  - name: create-file
    runs: 10
    min_pass: 8
    environment: default
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件，内容为 'hello world'"
        expected:
          - should_call_tool: Write
            min_pass: 9        # 该断言要求更高：9/10 通过
          - should_produce_file: hello.txt
          - file_content_contains:
              file: hello.txt
              text: "hello world"
            min_pass: 10       # 该断言要求最高：必须 10/10 通过
        timeout: 60000

  - name: read-file
    # 继承全局 runs: 10, min_pass: 8
    environment: default
    cleanup: true
    steps:
      - input: "读取 hello.txt 的内容"
        expected:
          - should_call_tool: Read
          - response_contains: "hello"
```

## 判定逻辑

### 场景通过判定

场景判定需同时满足两个条件：

```
场景状态 = 'passed' 当：
  1. 场景整体通过次数 >= 场景 min_pass
  2. 每个断言的通过次数 >= 断言各自的 min_pass
```

### 单次运行通过判定

```
运行通过 = 该次运行的所有断言都通过
```

### 判定示例

配置：`runs=10, 场景min_pass=8`

断言配置：
- `should_call_tool: Write` → `min_pass: 9`
- `should_produce_file: hello.txt` → `min_pass: 8`

运行结果：

| 运行序号 | should_call_tool | should_produce_file | 运行状态 |
|---------|-----------------|--------------------|---------|
| 1 | ✓ | ✓ | passed |
| 2 | ✓ | ✓ | passed |
| 3 | ✗ | ✓ | failed |
| 4 | ✓ | ✓ | passed |
| 5-10 | ✓ | ✓ | passed |

统计：
- 场景整体通过次数：9/10 ≥ 8 → 满足条件 1
- `should_call_tool` 通过次数：9/10 ≥ 9 → 满足条件 2
- `should_produce_file` 通过次数：10/10 ≥ 8 → 满足条件 2

**最终判定**：场景 passed

### 失败判定示例

若 `should_call_tool` 仅通过 8 次（8 < 9）：
- 条件 1 满足（场景整体 9 ≥ 8）
- 条件 2 不满足（断言 8 < 9）
- **最终判定**：场景 failed

## TypeScript 类型定义

### 扩展的类型定义

```typescript
// ========== YAML 配置扩展 ==========

interface GlobalConfig {
  runs?: number;              // 运行次数，默认 5
  min_pass?: number;          // 最少通过次数，默认 4
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;
}

interface ScenarioConfig {
  name: string;
  environment: string;
  cleanup: boolean;
  runs?: number;              // 场景层级覆盖
  min_pass?: number;          // 场景层级覆盖
  steps: StepConfig[];
}

interface Assertion {
  should_call_tool?: string | ToolCallAssertion;
  should_produce_file?: string | Matcher;
  file_content_contains?: { file: string | Matcher; text: string | Matcher };
  response_contains?: string | Matcher;
  min_pass?: number;          // 断言层级覆盖
}

interface ToolCallAssertion {
  name: string | Matcher;
  input?: Record<string, string | Matcher>;
  status?: 'completed' | 'error' | 'pending';
  min_pass?: number;          // 断言层级覆盖
}

// ========== 测试结果扩展 ==========

interface StepResult {
  input: string;
  runs: RunExecution[];           // 每次运行的详情
  summary: StepSummary;           // 步骤汇总
  assertions: AssertionSummary[]; // 各断言汇总统计
}

interface StepSummary {
  total_runs: number;
  passed_runs: number;
  min_pass: number;               // 实际使用的 min_pass 值
  status: 'passed' | 'failed';
}

interface RunExecution {
  run_index: number;              // 运行序号（1-N）
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];  // 本次运行的断言结果
  error?: string;                 // 失败原因
  output?: OpenCodeRunOutput[];   // 完整输出（用于复盘）
}

interface AssertionSummary {
  type: string;
  value: string | object;
  min_pass: number;
  passed_runs: number;
  status: 'passed' | 'failed';
  failures: AssertionFailure[];
}

interface AssertionFailure {
  run_index: number;
  message: string;
  actual?: any;
}

// ========== 现有类型保持不变 ==========

interface AssertionResult {
  type: string;
  value: string | object;
  passed: boolean;
  actual?: string | object;
  message?: string;
}
```

## 结果输出示例

### JSON 输出格式

```json
{
  "suite": {
    "name": "skill-operations-test",
    "description": "测试文件操作技能的概率性表现",
    "file": "./tests/operations.yaml"
  },
  "summary": {
    "total_scenarios": 2,
    "passed": 2,
    "failed": 0,
    "duration_ms": 120000,
    "timestamp": "2026-04-08T10:30:00Z"
  },
  "scenarios": [
    {
      "name": "create-file",
      "environment": "default",
      "status": "passed",
      "runs": 10,
      "min_pass": 8,
      "passed_runs": 9,
      "duration_ms": 60000,
      "steps": [
        {
          "input": "创建 hello.txt 文件",
          "runs": [
            {
              "run_index": 1,
              "status": "passed",
              "duration_ms": 5000,
              "assertions": [
                { "type": "should_call_tool", "value": "Write", "passed": true },
                { "type": "should_produce_file", "value": "hello.txt", "passed": true }
              ]
            },
            {
              "run_index": 2,
              "status": "passed",
              "duration_ms": 5200,
              "assertions": [...]
            },
            {
              "run_index": 3,
              "status": "failed",
              "duration_ms": 60000,
              "error": "超时",
              "assertions": [
                { "type": "should_call_tool", "value": "Write", "passed": false, "message": "超时未完成" },
                { "type": "should_produce_file", "value": "hello.txt", "passed": false, "message": "文件不存在" }
              ]
            },
            ...
          ],
          "summary": {
            "total_runs": 10,
            "passed_runs": 9,
            "min_pass": 8,
            "status": "passed"
          },
          "assertions": [
            {
              "type": "should_call_tool",
              "value": "Write",
              "min_pass": 9,
              "passed_runs": 9,
              "status": "passed",
              "failures": [
                { "run_index": 3, "message": "超时未完成" }
              ]
            },
            {
              "type": "should_produce_file",
              "value": "hello.txt",
              "min_pass": 8,
              "passed_runs": 10,
              "status": "passed",
              "failures": []
            },
            {
              "type": "file_content_contains",
              "value": { "file": "hello.txt", "text": "hello world" },
              "min_pass": 10,
              "passed_runs": 9,
              "status": "failed",
              "failures": [
                { "run_index": 3, "message": "文件不存在", "actual": null }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Markdown/HTML 报告展示

```markdown
## 场景: create-file

**运行统计**: 10 次运行，9 次通过（要求 ≥ 8）✓

### 步骤 1: 创建 hello.txt 文件

**通过率**: 9/10 (要求 ≥ 8) ✓

| 断言 | 通过次数 | 要求 | 状态 |
|-----|---------|-----|------|
| should_call_tool: Write | 9/10 | ≥ 9 | ✓ |
| should_produce_file: hello.txt | 10/10 | ≥ 8 | ✓ |
| file_content_contains | 9/10 | ≥ 10 | ✗ |

**失败详情**:
- file_content_contains 在第 3 次运行失败: 文件不存在
```

## CLI 命令调整

### agentvcr run 新增参数

```bash
agentvcr run <test-file> [options]

新增选项:
  --runs <n>              覆盖全局 runs 配置
  --min-pass <n>          覆盖全局 min_pass 配置
  --quick                 快速模式: runs=1, min_pass=1（传统单次测试）
```

### 使用示例

```bash
# 使用 YAML 配置的 runs/min_pass
agentvcr run ./tests/my-test.yaml

# CLI 覆盖配置（临时调整，用于快速验证）
agentvcr run ./tests/my-test.yaml --runs 3 --min-pass 2

# 快速单次测试（用于开发调试）
agentvcr run ./tests/my-test.yaml --quick

# 并行执行多个场景（每个场景独立多次运行）
agentvcr run ./tests/ --parallel
```

## 执行流程调整

### 原流程 vs 新流程

**原流程（单次执行）**:
```
场景 → 步骤 → 执行 → 断言 → 结果
```

**新流程（多次执行）**:
```
场景 → 步骤 → 循环 runs 次:
          → 执行 → 断言 → 记录单次结果
        → 汇总统计 → 判定 → 结果
```

### 详细执行流程

```
场景开始
  │
  ├─ 1. 确定配置
  │    ├─ runs = scenario.runs || config.runs || 5
  │    ├─ min_pass = scenario.min_pass || config.min_pass || 4
  │    └─ 初始化 runs 数组
  │
  ├─ 2. 循环执行 (i = 1 to runs)
  │    │
  │    ├─ 准备环境（每次运行独立环境）
  │    ├─ 执行步骤 → 收集输出
  │    ├─ 执行断言 → 记录本次断言结果
  │    ├─ 计算本次运行状态（所有断言通过 → passed）
  │    └─ 记录 RunExecution
  │    └─ 继续下一次运行（不提前终止）
  │
  ├─ 3. 汇总统计
  │    ├─ 计算 passed_runs
  │    ├─ 计算每个断言的 passed_runs
  │    ├─ 收集各断言的失败详情
  │    └─ 判定整体状态
  │
  ├─ 4. 清理环境
  │
  └─ 场景结束
```

### 环境隔离

每次运行需要独立的环境隔离：

| 方案 | 说明 |
|-----|------|
| 独立临时目录 | 每次运行创建独立临时工作目录 |
| Session 隔离 | 每次运行使用独立 session（不共享） |
| 并行安全 | 并行执行时每个运行独立进程 |

**临时目录命名**:
```
{tempRoot}/{scenarioId}-{runIndex}-{timestamp}
```

示例: `.agentvcr/temp/create-file-run1-20260408103000/`

## 向后兼容

### 默认值策略

若 YAML 未配置 `runs` 和 `min_pass`:
- 使用默认值 `runs: 5, min_pass: 4`
- 输出格式扩展但保持兼容，现有解析工具可正常工作

### 传统单次测试

使用 `--quick` 参数或配置 `runs: 1, min_pass: 1`:
- 行为等同于传统单元测试
- 100% 通过要求
- 用于开发调试场景

## 输出格式兼容

### Jest 格式映射

Jest 格式需适配多次运行：

```typescript
// 场景映射为 Jest test
{
  "name": "create-file",
  "status": "passed",      // 基于概率判定结果
  "duration": 60000,
  "failureMessages": []    // 仅当场景 failed 时记录
}

// 断言失败详情可选择记录在 failureMessages
{
  "failureMessages": [
    "file_content_contains: 9/10 passed, required ≥ 10\n  - Run 3: 文件不存在"
  ]
}
```

## 实现要点

### 需修改的模块

| 模块 | 改动 |
|-----|------|
| `src/types/index.ts` | 扩展类型定义 |
| `src/parser/yaml.ts` | 解析新增配置字段 |
| `src/executor/fixture.ts` | 支持多次运行的环境隔离 |
| `src/executor/verifier.ts` | 统计断言通过次数 |
| `src/commands/run.ts` | 循环执行逻辑、CLI 参数 |
| `src/output/json.ts` | 新输出结构生成 |
| `src/output/formatters/*` | 报告格式适配 |

### 新增模块

| 模块 | 职责 |
|-----|------|
| `src/executor/statistics.ts` | 汇总统计、通过率计算 |

---

**文档版本**: 1.0-draft
**创建日期**: 2026-04-08