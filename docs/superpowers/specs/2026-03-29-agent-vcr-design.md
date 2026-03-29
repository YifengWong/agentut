---
title: Agent VCR 设计文档
date: 2026-03-29
status: draft
---

# Agent VCR 设计文档

## 概述

Agent VCR 是一个为 opencode Agent 工程提供单元测试能力的 TypeScript CLI 工具。通过记录用户输入序列和关键检查点，每次完整重放测试，验证 Agent 行为是否符合预期。

**核心理念**：只记录输入，不记录响应。测试用例存储用户输入序列和预期断言，每次运行都使用最新的 Skills/Rules 从头执行，确保测试始终验证当前行为。

## 目标用户

1. **Skills 开发者**：在开发过程中快速验证 Skills 行为，支持迭代调试
2. **团队 QA/测试流程**：支持 CI 集成，生成标准化报告，便于评审

## 架构设计

### 目录结构

```
agentvcr/
├── src/
│   ├── cli.ts                    # CLI 入口，命令分发
│   ├── commands/
│   │   ├── run.ts                # 执行测试命令
│   │   ├── suggest.ts            # 智能推荐生成命令
│   │   ├── report.ts             # 报告生成命令
│   │   └── init.ts               # 初始化目录命令
│   ├── parser/
│   │   ├── yaml.ts               # YAML 测试用例解析
│   │   └── session.ts            # Session 数据解析（用于 suggest）
│   ├── executor/
│   │   ├── opencode.ts           # opencode CLI 调用封装
│   │   ├── fixture.ts            # 测试环境管理（复制、清理）
│   │   └── verifier.ts           # 断言验证执行
│   ├── output/
│   │   ├── json.ts               # JSON 输出（核心格式）
│   │   └── formatters/
│   │       ├── html.ts           # HTML 报告转换
│   │       ├── markdown.ts       # Markdown 报告转换
│   │       └── jest.ts           # Jest/Vitest 兼容格式
│   └── types/
│       └── index.ts              # 类型定义
├── SKILL.md                      # Skill 描述文档
├── package.json
├── tsconfig.json
└── tests/                        # 单元测试目录
    ├── parser/
    ├── executor/
    └── output/
```

### 模块职责

| 模块 | 职责 | 依赖 |
|------|------|------|
| `cli.ts` | 解析命令行参数，分发到对应 command | commands/* |
| `commands/run.ts` | 加载 YAML，执行测试，输出结果 | parser/yaml, executor/*, output/json |
| `commands/suggest.ts` | 导出 session，分析行为，生成 YAML | parser/session, output/json |
| `commands/report.ts` | 读取 JSON 结果，转换格式输出 | output/formatters/* |
| `commands/init.ts` | 创建目录结构，生成示例文件 | 无 |
| `parser/yaml.ts` | 解析 YAML 测试用例文件，验证格式 | types |
| `parser/session.ts` | 解析 opencode export JSON，提取关键信息 | types |
| `executor/opencode.ts` | 封装 opencode CLI 调用（run、export） | 无 |
| `executor/fixture.ts` | 环境复制、setup 执行、cleanup 清理 | 无 |
| `executor/verifier.ts` | 执行断言验证，返回验证结果 | types |
| `output/json.ts` | 生成 JSON 测试结果 | types |
| `output/formatters/*` | 格式转换（HTML、Markdown、Jest） | output/json |

## YAML 测试用例格式

### 格式规范

```yaml
name: <test-suite-name>                    # 必填，测试套件名称
description: <测试描述>                     # 可选，描述信息

environments:                              # 必填，环境配置区块
  <env-name>:                              # 环境名称（作为引用 key）
    directory: <相对路径>                   # 测试目录路径
    setup:                                  # 可选，初始化步骤
      - copy: <源路径>                      # 复制文件/目录
      - run: <命令>                         # 执行 shell 命令

scenarios:                                 # 必填，测试场景列表
  - name: <scenario-name>                  # 场景名称
    environment: <env-name>                # 引用的环境名称
    cleanup: <boolean>                     # 场景结束后是否清理
    steps:                                 # 顺序执行的步骤
      - input: <用户输入文本>               # 发送给 opencode 的输入
        expected:                          # 预期断言列表
          - <断言类型>: <值>
        timeout: <milliseconds>            # 可选，步骤超时时间

config:                                    # 可选，全局配置
  target:
    skill: <skill-name>                    # 目标 skill
    agent: <agent-name>                    # 使用的 agent
  default_timeout: <milliseconds>          # 默认超时
  parallel: <boolean>                      # 是否并行运行场景
```

### 完整示例

```yaml
name: skill-systematic-debugging-test
description: 测试 systematic-debugging skill 的基本功能

environments:
  empty-env:
    directory: ./fixtures/empty
    setup: []

  bug-project:
    directory: ./fixtures/bug-project
    setup:
      - copy: ./templates/sample-bug
      - run: npm install

scenarios:
  - name: create-and-modify-file
    environment: bug-project
    cleanup: true
    steps:
      - input: "帮我调试这个报错：TypeError: Cannot read property 'x' of undefined"
        expected:
          - should_call_tool: Read
          - response_contains: "Phase 1"
        timeout: 60000

      - input: "继续分析"
        expected:
          - should_call_tool: Grep
          - response_contains: "root cause"

  - name: file-content-verification
    environment: empty-env
    cleanup: true
    steps:
      - input: "创建 config.json 文件，内容为 {\"name\": \"test\"}"
        expected:
          - should_call_tool: Write
          - should_produce_file: config.json
          - file_content_contains:
              file: config.json
              text: "test"

      - input: "检查 config.json 内容"
        expected:
          - should_call_tool: Read
          - response_contains: "test"

config:
  target:
    skill: systematic-debugging
    agent: build
  default_timeout: 120000
  parallel: false
```

### 断言类型

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `should_call_tool` | 字符串：工具名称（如 Write、Read、Bash） | 验证 Agent 调用了指定工具 |
| `should_produce_file` | 字符串：文件名（相对路径） | 验证产生了指定文件 |
| `file_content_contains` | 对象：`{ file: string, text: string }` | 验证指定文件内容包含该文本 |
| `response_contains` | 字符串：文本字符串 | 验证 Agent 响应文本包含该内容 |

**断言 YAML 写法示例**：

```yaml
expected:
  - should_call_tool: Write                # 字符串参数
  - should_produce_file: hello.txt         # 字符串参数
  - file_content_contains:                 # 对象参数
      file: hello.txt
      text: "hello world"
  - response_contains: "success"           # 字符串参数
```

## CLI 命令设计

### agentvcr run

运行测试用例。

```bash
agentvcr run <test-file-or-directory> [options]

Options:
  --format <json|markdown|html|jest>   输出格式，默认 json
  --output <file-path>                 输出到文件
  --scenario <name>                    只运行指定场景
  --parallel                           并行运行场景
  --verbose                            详细输出
```

**执行流程**：

1. 加载 YAML 文件，解析测试用例
2. 验证 YAML 格式和必填字段
3. 准备测试环境（按 environment 配置）
4. 顺序执行每个 scenario：
   - 复制环境目录到临时位置
   - 执行 setup 步骤
   - 顺序执行 steps：
     - 调用 `opencode run <input>` 发送用户输入
     - 收集执行输出（JSON 格式）
     - 执行断言验证
     - 记录结果
   - 执行 cleanup 清理
5. 输出测试结果（JSON 或其他格式）

### agentvcr suggest

智能推荐生成测试用例。

```bash
agentvcr suggest <session-id> [options]

Options:
  --latest                             使用最近的会话
  --output <file-path>                 输出 YAML 文件路径
  --skill <name>                       指定目标 skill
  --name <test-name>                   测试套件名称
```

**执行流程**：

1. 调用 `opencode export <session-id>` 导出会话数据
2. 解析 JSON 数据，提取：
   - 用户输入序列（user messages 中的 text parts）
   - 工具调用记录（assistant parts 中的 tool call）
   - 文件变更信息（summary.diffs）
   - 目录信息（info.directory）
3. 生成 YAML 测试用例结构
4. 输出到文件或标准输出

### agentvcr report

生成测试报告。

```bash
agentvcr report [options]

Options:
  --input <json-file>                  JSON 结果文件路径
  --format <html|markdown|jest>        输出格式
  --output <file-or-directory>         输出路径
```

### agentvcr init

初始化测试目录结构。

```bash
agentvcr init [directory] [options]

Options:
  --with-example                       创建示例测试用例
```

**生成结构**：

```
<directory>/
├── fixtures/
│   └── example-env/
│       └── sample.txt
├── tests/
│   └── example-test.yaml
└── agentvcr.config.yaml               # 可选配置文件
```

## opencode CLI 接口规范

本节定义 agentvcr 对 opencode CLI 的使用规范，确保实现时有明确的接口契约。

### opencode run 命令

**用途**：执行用户输入，获取 Agent 响应。

**命令格式**：

```bash
opencode run <message> \
  --dir <working-directory> \
  --format json \
  --session <session-id> \
  --fork \
  [--model <provider/model>] \
  [--agent <agent-name>] \
  [--timeout <ms>]
```

**参数说明**：

| 参数 | 说明 | 必填 |
|------|------|------|
| `<message>` | 用户输入文本，作为位置参数 | 是 |
| `--dir` | 工作目录路径 | 是（首次步骤） |
| `--format json` | 输出 JSON 格式 | 是 |
| `--session` | 会话 ID，用于继续会话 | 后续步骤必填 |
| `--fork` | Fork 会话而非直接继续 | 建议使用 |
| `--model` | 模型配置 | 可选 |
| `--agent` | Agent 类型 | 可选 |

**输出格式**（JSON）：

```typescript
interface OpenCodeRunOutput {
  type: 'message' | 'tool_call' | 'tool_result' | 'text' | 'error';
  data: {
    // type=message 时
    role?: 'user' | 'assistant';
    content?: string;

    // type=tool_call 时
    tool_name?: string;
    tool_args?: Record<string, any>;

    // type=tool_result 时
    tool_output?: string;
    success?: boolean;

    // type=error 时
    error?: string;
  };
  session_id: string;
  timestamp: number;
}
```

**多步骤会话处理**：

- **首个步骤**：使用 `--dir` 指定工作目录，不指定 `--session`
- **后续步骤**：使用 `--session` + `--fork` 继续会话，确保状态传递

```bash
# 步骤 1：首次执行
opencode run "创建 hello.txt" --dir ./fixtures/test-env --format json

# 步骤 2：继续会话（使用步骤1返回的 session_id）
opencode run "修改内容" --session ses_xxx --fork --format json
```

### opencode export 命令

**用途**：导出会话数据，用于智能推荐生成测试用例。

**命令格式**：

```bash
opencode export <session-id> [--format json]
```

**输出格式**（ExportedSession）：

```typescript
interface ExportedSession {
  info: {
    id: string;                      // session ID
    slug: string;                    // session slug
    projectID: string;               // 项目 ID
    directory: string;               // 工作目录
    title: string;                   // 会话标题
    version: string;                 // opencode 版本
    summary: {
      additions: number;             // 新增行数
      deletions: number;             // 删除行数
      files: number;                 // 变更文件数
      diffs?: Array<{                // 文件变更详情
        path: string;
        additions: number;
        deletions: number;
      }>;
    };
    time: {
      created: number;               // 创建时间戳
      updated: number;               // 更新时间戳
    };
  };
  messages: Message[];
}

interface Message {
  info: {
    role: 'user' | 'assistant';
    time: {
      created: number;
      completed?: number;
    };
    parentID?: string;               // 父消息 ID
    modelID?: string;                // 模型 ID
    providerID?: string;             // 提供者 ID
    agent?: string;                  // Agent 类型
    id: string;                      // 消息 ID
    sessionID: string;               // 会话 ID
  };
  parts: Part[];
}

interface Part {
  type: 'text' | 'tool_call' | 'tool_result' | 'step-start' | 'step-end' | 'reasoning';

  // type=text 时
  text?: string;

  // type=tool_call 时
  tool_name?: string;
  tool_args?: Record<string, any>;

  // type=tool_result 时
  tool_output?: string;
  success?: boolean;

  id: string;
  sessionID: string;
  messageID: string;
}
```

### opencode session list 命令

**用途**：获取最近会话列表（用于 `suggest --latest`）。

**命令格式**：

```bash
opencode session list [--limit <n>]
```

**输出格式**：

```
Session ID                      Title                                   Updated
ses_xxx                         Session Title                           timestamp
```

需要解析文本输出提取最新 session ID。

---

## TypeScript 类型定义汇总

本节集中展示所有核心类型定义，便于实现参考。

```typescript
// ========== YAML 测试用例类型 ==========

interface YamlTestSuite {
  name: string;
  description?: string;
  environments: Record<string, EnvironmentConfig>;
  scenarios: ScenarioConfig[];
  config?: GlobalConfig;
}

interface EnvironmentConfig {
  directory: string;
  setup: SetupAction[];
}

interface SetupAction {
  copy?: string;                    // 复制源路径
  run?: string;                     // 执行命令
}

interface ScenarioConfig {
  name: string;
  environment: string;              // 引用环境名
  cleanup: boolean;
  steps: StepConfig[];
}

interface StepConfig {
  input: string;
  expected: Assertion[];
  timeout?: number;
}

interface Assertion {
  should_call_tool?: string;
  should_produce_file?: string;
  file_content_contains?: { file: string; text: string };
  response_contains?: string;
}

interface GlobalConfig {
  target?: {
    skill?: string;
    agent?: string;
  };
  default_timeout?: number;
  parallel?: boolean;
}

// ========== Session 分析类型 ==========

interface ExportedSession {
  info: SessionInfo;
  messages: Message[];
}

interface SessionInfo {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  summary: SessionSummary;
  time: SessionTime;
}

interface SessionSummary {
  additions: number;
  deletions: number;
  files: number;
  diffs?: FileDiff[];
}

interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
}

interface SessionTime {
  created: number;
  updated: number;
}

interface Message {
  info: MessageInfo;
  parts: Part[];
}

interface MessageInfo {
  role: 'user' | 'assistant';
  time: MessageTime;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  agent?: string;
  id: string;
  sessionID: string;
}

interface MessageTime {
  created: number;
  completed?: number;
}

interface Part {
  type: string;
  text?: string;
  tool_name?: string;
  tool_args?: Record<string, any>;
  tool_output?: string;
  success?: boolean;
  id: string;
  sessionID: string;
  messageID: string;
}

interface SessionAnalysis {
  inputs: string[];
  toolCalls: string[];
  fileChanges: string[];
  workingDirectory: string;
}

// ========== 测试结果类型 ==========

interface TestResult {
  suite: SuiteInfo;
  summary: TestSummary;
  scenarios: ScenarioResult[];
}

interface SuiteInfo {
  name: string;
  description: string;
  file: string;
}

interface TestSummary {
  total_scenarios: number;
  passed: number;
  failed: number;
  duration_ms: number;
  timestamp: string;
}

interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;
}

interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];
}

interface AssertionResult {
  type: string;
  value: string | { file: string; text: string };
  passed: boolean;
  actual?: string;
  message?: string;
}

// ========== opencode 输出类型 ==========

interface OpenCodeRunOutput {
  type: string;
  data: Record<string, any>;
  session_id: string;
  timestamp: number;
}

// ========== 执行上下文类型 ==========

interface ExecutionContext {
  sessionId?: string;               // 当前会话 ID（后续步骤使用）
  workingDirectory: string;         // 当前工作目录
  outputs: OpenCodeRunOutput[];     // 收集的输出
  startTime: number;                // 场景开始时间
}

// ========== 错误类型 ==========

class ValidationError extends Error {
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class ExecutionError extends Error {
  constructor(message: string, command?: string) {
    super(message);
    this.name = 'ExecutionError';
  }
}

class TimeoutError extends Error {
  constructor(message: string, timeout: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

class SetupError extends Error {
  constructor(message: string, step?: SetupAction) {
    super(message);
    this.name = 'SetupError';
  }
}
```

---

## 执行流程详细规范

### 多步骤场景执行流程

```
场景开始
  │
  ├─ 1. 准备环境
  │    ├─ 创建临时目录：{tempRoot}/{scenarioId}-{timestamp}
  │    ├─ 复制 environment.directory 到临时目录
  │    ├─ 执行 setup 步骤（按顺序）
  │    └─ 初始化 ExecutionContext
  │
  ├─ 2. 执行步骤（循环）
  │    │
  │    ├─ 步骤 N 开始
  │    │    ├─ 构建命令：
  │    │    │    首次: opencode run <input> --dir <tmpDir> --format json
  │    │    │    后续: opencode run <input> --session <sessionId> --fork --format json
  │    │    ├─ 执行命令，收集 JSON 输出流
  │    │    ├─ 设置超时监控（step.timeout 或 default_timeout）
  │    │    │    ├─ 正常完成：记录 outputs，提取 session_id
  │    │    │    ├─ 超时：终止进程，标记步骤失败，继续下一步骤（不中断场景）
  │    │    ├─ 执行断言验证（遍历 expected）
  │    │    │    ├─ should_call_tool：检查 outputs 中是否有 type=tool_call 且 tool_name 匹配
  │    │    │    ├─ should_produce_file：检查临时目录是否存在该文件
  │    │    │    ├─ file_content_contains：读取文件，检查内容包含指定文本
  │    │    │    ├─ response_contains：检查 outputs 中 type=text 的 data.content 包含指定文本
  │    │    ├─ 记录 StepResult（包含 assertions 结果）
  │    │    └─ 更新 ExecutionContext.sessionId
  │    │
  │    └─ 步骤 N 结束 → 继续下一步骤或结束循环
  │
  ├─ 3. 场景结束处理
  │    ├─ 计算场景总耗时
  │    ├─ 判断场景状态（所有步骤 passed → scenario passed，否则 failed）
  │    ├─ cleanup=true 时：删除临时目录
  │    ├─ cleanup=false 时：保留临时目录（路径记录在 ScenarioResult 中）
  │    └─ 返回 ScenarioResult
  │
  └─ 场景结束 → 继续下一个场景或结束测试
```

### 超时处理策略

| 场景 | 处理方式 |
|------|----------|
| 步骤超时 | 终止 opencode 进程，标记步骤失败，**继续执行后续步骤**（不中断场景） |
| 步骤失败 | 记录失败原因，后续步骤仍正常执行（允许部分失败后继续） |
| 场景中某步骤超时 | 不触发 cleanup 提前执行，场景结束时按配置处理 cleanup |
| 整个测试超时（CLI 级别） | 设置全局超时（如 10 分钟），超时后终止所有进行中的场景 |

### 输出收集方式

`opencode run --format json` 输出为 JSON 流（每行一个 JSON 对象）：

```bash
# 示例输出流
{"type":"message","data":{"role":"user","content":"创建文件"},"session_id":"ses_xxx","timestamp":123}
{"type":"tool_call","data":{"tool_name":"Write","tool_args":{"path":"hello.txt"}},"session_id":"ses_xxx","timestamp":124}
{"type":"tool_result","data":{"tool_output":"File created","success":true},"session_id":"ses_xxx","timestamp":125}
{"type":"text","data":{"content":"已创建 hello.txt 文件"},"session_id":"ses_xxx","timestamp":126}
```

**收集逻辑**：

1. 读取 stdout 流，按行解析 JSON
2. 过滤 `type` 字段，存储到 `outputs` 数组
3. 提取最后一个 message 的 `session_id` 用于后续步骤

---

## 并行执行规范

### 临时目录命名规则

```
{tempRoot}/{scenarioId}-{runId}-{timestamp}
```

| 组成部分 | 说明 |
|----------|------|
| `tempRoot` | 系统临时目录或配置的临时目录（如 `./.agentvcr/temp/`） |
| `scenarioId` | 场景名称（清理非法字符） |
| `runId` | 本次运行唯一 ID（UUID 短格式） |
| `timestamp` | 执行时间戳（确保唯一性） |

**示例**：`./.agentvcr/temp/basic-debugging-flow-a1b2c3-20260329103000/`

### 并行执行资源隔离

| 资源 | 隔离策略 |
|------|----------|
| 工作目录 | 每个场景独立临时目录（按命名规则生成） |
| opencode session | 每个场景独立 session（不共享） |
| fixture 文件 | 从源目录复制到独立临时目录 |
| 进程 | 每个场景独立 opencode 进程 |

### 并行执行限制

- 默认最大并行数：4（可配置）
- 同一 environment 配置可被多个场景引用，但各自使用独立临时目录
- 不支持跨场景 session 共享

---

## 智能推荐机制

### 数据提取映射

| Session JSON 字段 | 提取内容 | YAML 对应字段 |
|-------------------|----------|---------------|
| `messages[].parts` (role=user, type=text) | 用户输入文本 | `steps[].input` |
| `messages[].parts` (type=tool_call) | 工具调用类型 | `steps[].expected.should_call_tool` |
| `summary.diffs[].path` | 文件路径 | `steps[].expected.should_produce_file`（最后一个步骤） |
| `info.directory` | 工作目录 | `environments[].directory` |
| `info.title` | 会话标题 | `name` (处理后) |

### 推荐算法（修正版）

```typescript
function analyzeSession(session: ExportedSession): SessionAnalysis {
  const inputs: string[] = [];
  const toolCallsByInput: Map<number, string[]> = new Map();
  const fileChanges: string[] = [];

  let inputIndex = -1;

  for (const message of session.messages) {
    if (message.info.role === 'user') {
      for (const part of message.parts) {
        if (part.type === 'text' && part.text) {
          inputs.push(part.text);
          inputIndex++;
          toolCallsByInput.set(inputIndex, []);
        }
      }
    }
    if (message.info.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool_call' && part.tool_name) {
          const calls = toolCallsByInput.get(inputIndex) || [];
          calls.push(part.tool_name);
          toolCallsByInput.set(inputIndex, calls);
        }
      }
    }
  }

  // 从 summary 提取文件变更
  if (session.info.summary?.diffs) {
    for (const diff of session.info.summary.diffs) {
      fileChanges.push(diff.path);
    }
  }

  return {
    inputs,
    toolCallsByInput,
    fileChanges,
    workingDirectory: session.info.directory
  };
}

function generateYaml(analysis: SessionAnalysis): YamlTestSuite {
  const steps: StepConfig[] = [];

  for (let i = 0; i < analysis.inputs.length; i++) {
    const step: StepConfig = {
      input: analysis.inputs[i],
      expected: [],
      timeout: 60000
    };

    // 添加工具调用断言（对应该输入的所有工具调用）
    const toolCalls = analysis.toolCallsByInput.get(i) || [];
    for (const toolName of toolCalls) {
      step.expected.push({ should_call_tool: toolName });
    }

    steps.push(step);
  }

  // 文件变更断言：添加到最后一个步骤
  if (analysis.fileChanges.length > 0 && steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    for (const filePath of analysis.fileChanges) {
      lastStep.expected.push({ should_produce_file: filePath });
    }
  }

  return {
    name: `suggested-test`,
    description: `从会话自动生成的测试用例`,
    environments: {
      default: {
        directory: './fixtures/suggested-env',
        setup: []
      }
    },
    scenarios: [{
      name: 'suggested-scenario',
      environment: 'default',
      cleanup: true,
      steps: steps
    }],
    config: {
      target: {},
      default_timeout: 120000,
      parallel: false
    }
  };
}
```

## JSON 输出格式

### 测试结果结构

```typescript
interface TestResult {
  suite: {
    name: string;
    description: string;
    file: string;                    // YAML 文件路径
  };
  summary: {
    total_scenarios: number;
    passed: number;
    failed: number;
    duration_ms: number;
    timestamp: string;               // ISO 8601
  };
  scenarios: ScenarioResult[];
}

interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;                    // 失败时的错误信息
}

interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: any;               // 实际输出（用于调试）
}

interface AssertionResult {
  type: string;                      // 断言类型
  value: string;                     // 断言参数
  passed: boolean;
  actual?: string;                   // 实际值（失败时）
  message?: string;                  // 失败原因
}
```

### 示例输出

```json
{
  "suite": {
    "name": "skill-systematic-debugging-test",
    "description": "测试 systematic-debugging skill 的基本功能",
    "file": "./tests/debugging.yaml"
  },
  "summary": {
    "total_scenarios": 2,
    "passed": 1,
    "failed": 1,
    "duration_ms": 45000,
    "timestamp": "2026-03-29T10:30:00Z"
  },
  "scenarios": [
    {
      "name": "basic-debugging-flow",
      "environment": "bug-project",
      "status": "passed",
      "duration_ms": 30000,
      "steps": [
        {
          "input": "帮我调试这个报错...",
          "status": "passed",
          "duration_ms": 15000,
          "assertions": [
            {
              "type": "should_call_tool",
              "value": "Read",
              "passed": true
            },
            {
              "type": "response_contains",
              "value": "Phase 1",
              "passed": true
            }
          ]
        },
        {
          "input": "继续分析",
          "status": "passed",
          "duration_ms": 15000,
          "assertions": [
            {
              "type": "should_call_tool",
              "value": "Grep",
              "passed": true
            }
          ]
        }
      ]
    },
    {
      "name": "simple-question",
      "environment": "empty-env",
      "status": "failed",
      "duration_ms": 15000,
      "error": "Assertion failed: response_contains 'Phase'",
      "steps": [...]
    }
  ]
}
```

## 单元测试设计

### 测试文件组织

```
tests/
├── parser/
│   ├── yaml.test.ts
│   └── session.test.ts
├── executor/
│   ├── opencode.test.ts
│   ├── fixture.test.ts
│   └── verifier.test.ts
├── output/
│   ├── json.test.ts
│   └── formatters/
│       ├── html.test.ts
│       ├── markdown.test.ts
│       └── jest.test.ts
└── commands/
    ├── run.test.ts
    ├── suggest.test.ts
    └── init.test.ts
```

### parser/yaml.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 解析有效 YAML | 完整合规的 YAML 文件 | 返回正确的 YamlTestSuite 对象 |
| 缺少必填字段 name | YAML 无 name 字段 | 抛出 ValidationError，提示缺少 name |
| 缺少必填字段 environments | YAML 无 environments | 抛出 ValidationError |
| 缺少必填字段 scenarios | YAML 无 scenarios | 抛出 ValidationError |
| 场景引用不存在环境 | environment: "non-existent" | 抛出 ValidationError，提示环境不存在 |
| 断言类型无效 | expected 包含未知断言类型 | 抛出 ValidationError |
| 多场景文件解析 | YAML 包含 3 个场景 | 返回包含 3 个 Scenario 的 YamlTestSuite |
| 环境配置解析 | setup 包含 copy 和 run | 正确解析 SetupAction 数组 |
| 步骤超时默认值 | step 无 timeout 字段 | 使用 config.default_timeout 或 60000 |

### parser/session.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 提取用户输入 | Session JSON 包含 2 个 user message | 返回 inputs 数组长度为 2 |
| 提取工具调用 | Assistant message 包含 tool_call parts | 返回正确的工具名称数组 |
| 提取文件变更 | summary.diffs 包含文件列表 | 返回文件路径数组 |
| 空会话处理 | Session 无任何 message | 返回空的 SessionAnalysis |
| 只包含 user message | Session 只有 user 无 assistant | toolCalls 数组为空 |
| 复杂消息结构 | 多层嵌套的 parts | 正确遍历提取所有相关内容 |
| 目录信息提取 | info.directory 存在 | 正确返回 workingDirectory |

### executor/opencode.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 调用 opencode run | 输入文本 + 目录 | 返回执行输出 JSON |
| opencode run 失败 | 无效参数或超时 | 抛出 ExecutionError，包含错误信息 |
| 调用 opencode export | session ID | 返回 Session JSON 数据 |
| opencode export 失败 | 不存在的 session ID | 抛出 ExecutionError |
| JSON 输出格式 | --format json 参数 | 返回结构化的 JSON 对象 |
| 超时控制 | 设置 timeout 参数 | 在超时时间内返回或抛出 TimeoutError |
| 工作目录设置 | 指定 --dir 参数 | 在正确目录下执行 |

### executor/fixture.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 复制环境目录 | copy 源路径 + 目标路径 | 目标目录存在且内容一致 |
| 执行 run 命令 | setup 包含 "npm install" | 命令执行成功，返回 exitCode 0 |
| 清理环境 | cleanup=true | 临时目录被删除 |
| 不清理环境 | cleanup=false | 临时目录保留 |
| 多步骤 setup | setup 包含 copy + run | 按顺序执行所有步骤 |
| setup 命令失败 | run 命令返回非零 exitCode | 抛出 SetupError，停止后续步骤 |
| 源目录不存在 | copy 源路径无效 | 抛出 SetupError |
| 环境隔离 | 两个场景使用相同环境名 | 各场景使用独立临时目录 |

### executor/verifier.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| should_call_tool 验证 | 输出包含指定工具调用 | 返回 AssertionResult.passed=true |
| should_call_tool 失败 | 输出不包含指定工具 | 返回 AssertionResult.passed=false，包含 actual |
| should_produce_file 验证 | 文件存在 | passed=true |
| should_produce_file 失败 | 文件不存在 | passed=false，提示文件不存在 |
| file_content_contains 验证 | 文件内容包含文本 | passed=true |
| file_content_contains 失败 | 文件内容不包含 | passed=false，返回 actual 内容片段 |
| response_contains 验证 | 响应文本包含关键词 | passed=true |
| response_contains 失败 | 响应文本不包含 | passed=false |
| 多断言验证 | 3 个断言同时验证 | 返回 3 个 AssertionResult |
| 空断言列表 | expected=[] | 返回空数组，step 视为 passed |
| 文件不存在时的 file_content_contains | 文件不存在 | passed=false，提示文件不存在而非内容问题 |

### output/json.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 生成完整测试结果 | 所有场景结果数据 | 返回符合 TestResult 结构的 JSON |
| 计算汇总信息 | 3 passed, 2 failed | summary 正确计算总数 |
| 时间戳格式 | 当前时间 | timestamp 为 ISO 8601 格式 |
| 空 scenarios | 无场景数据 | summary.total_scenarios=0 |
| 失败场景信息 | failed 场景 | 包含 error 字段 |
| 步骤实际输出 | verbose=true | 包含 actual_output 字段 |

### output/formatters/markdown.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 基本格式转换 | TestResult JSON | 输出 Markdown 格式文本 |
| 显示通过/失败计数 | summary 数据 | 显示 "✓ 3 passed, ✗ 1 failed" |
| 场景详情展示 | ScenarioResult | 显示场景名称和状态 |
| 断言结果展示 | AssertionResult | 显示断言类型和结果 |
| 失败信息展示 | failed 场景 | 显示 error 和失败断言详情 |
| 空结果处理 | 无场景 | 显示 "No scenarios executed" |

### output/formatters/html.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 生成 HTML 结构 | TestResult JSON | 返回完整 HTML 文档 |
| 包含样式 | HTML 输出 | 包含 CSS 样式定义或引用 |
| 通过/失败视觉区分 | passed vs failed | 使用不同颜色标识 |
| 响应式布局 | HTML 结构 | 支持不同屏幕宽度 |
| 导出到文件 | --output 参数 | 文件正确写入 |

### output/formatters/jest.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| Jest 格式转换 | TestResult JSON | 返回 Jest 兼容格式 |
| 测试名称映射 | scenario.name | 映射到 Jest test name |
| 状态映射 | passed/failed | 映射到 Jest pass/fail |
| 时间映射 | duration_ms | 映射到 Jest duration |
| 失败消息映射 | error 字段 | 映射到 Jest failureMessages |

### commands/run.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 单文件运行 | 有效 YAML 文件路径 | 返回 TestResult |
| 目录运行 | 包含多个 YAML 的目录 | 返回合并的 TestResult |
| 指定场景运行 | --scenario 参数 | 只运行指定场景 |
| 格式参数处理 | --format markdown | 输出 Markdown 格式 |
| 输出到文件 | --output 参数 | 结果写入文件 |
| YAML 文件不存在 | 无效路径 | 抛出 FileNotFoundError |
| YAML 格式错误 | 无效 YAML 语法 | 抛出 ParseError |
| 并行运行 | --parallel 参数 | 场景并行执行，总时间减少 |
| 详细输出 | --verbose 参数 | 包含 actual_output 信息 |

### commands/suggest.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 从 session 生成 | 有效 session ID | 返回 YAML 文本 |
| 输出到文件 | --output 参数 | YAML 文件正确写入 |
| 指定 skill | --skill 参数 | config.target.skill 设置正确 |
| 使用最近会话 | --latest 参数 | 自动获取最近 session ID |
| session 不存在 | 无效 session ID | 抛出 SessionNotFoundError |
| 空 session 处理 | session 无用户输入 | 生成空的 scenarios 数组 |

### commands/init.test.ts 测试场景

| 测试场景 | 输入 | 预期结果 |
|----------|------|----------|
| 初始化目录 | 有效路径 | 创建 fixtures/ 和 tests/ 目录 |
| 创建示例 | --with-example 参数 | 创建示例 YAML 和 fixture 文件 |
| 目录已存在 | 目标目录已存在 | 提示已存在，不覆盖 |
| 无权限 | 无写权限路径 | 抛出 PermissionError |

## 技术依赖

### 外部依赖

| 依赖包 | 用途 | 版本建议 |
|--------|------|----------|
| `yaml` | YAML 解析 | ^2.x |
| `commander` | CLI 框架 | ^12.x |
| `chalk` | 终端彩色输出 | ^5.x |
| `fs-extra` | 文件操作增强 | ^11.x |
| `vitest` | 单元测试框架 | ^2.x |

### opencode CLI 依赖

| 命令 | 用途 |
|------|------|
| `opencode run` | 执行测试输入 |
| `opencode export` | 导出 session 数据 |
| `opencode session list` | 获取最近会话（suggest --latest） |

## 后续扩展方向

1. **分支场景支持**：允许从特定 checkpoint 开始测试，而非从头执行
2. **Mock 响应注入**：在重放时注入预设响应，测试特定交互路径
3. **断言扩展**：支持正则匹配、JSON 结构验证、自定义验证函数
4. **CI 集成模板**：提供 GitHub Actions、GitLab CI 配置模板
5. **测试覆盖率**：统计 skill 被测试覆盖的行为比例

---

**文档版本**: 1.0-draft
**创建日期**: 2026-03-29