# Agent VCR 架构文档

本文档总结项目架构信息和模块关系，便于后续迭代开发。

**要求：每当新特性、新架构等能力补充时，必须完善`AGENTS.md`以及`README.md`文档**

## 项目概述

Agent VCR 是一个为 opencode Agent 工程提供单元测试能力的 TypeScript CLI 工具。

**核心理念**：只记录输入，不记录响应。测试用例存储用户输入序列和预期断言，每次运行都使用最新的 Skills/Rules 从头执行。

## 目录结构

```
cli/
├── src/
│   ├── cli.ts                    # CLI 入口，命令分发
│   ├── commands/
│   │   ├── run.ts                # 执行测试命令（使用 runner）
│   │   ├── suggest.ts            # 智能推荐生成命令（读取 YAML config）
│   │   ├── report.ts             # 报告生成命令
│   │   └── init.ts               # 初始化目录命令
│   ├── runner/                   # Agent Runner 抽象层（新增）
│   │   ├── types.ts              # AgentRunner 接口定义
│   │   ├── opencode.ts           # OpenCodeRunner 实现
│   │   ├── factory.ts            # createRunner 工厂
│   │   └── index.ts              # 模块导出
│   ├── parser/
│   │   ├── yaml.ts               # YAML 测试用例解析（含 agent_cli 默认值）
│   │   └── session.ts            # Session 数据解析（用于 suggest）
│   ├── executor/
│   │   ├── fixture.ts            # 测试环境管理（复制、清理）
│   │   └── verifier.ts           # 断言验证执行
│   ├── output/
│   │   ├── json.ts               # JSON 输出（核心格式）
│   │   └── formatters/
│   │       ├── html.ts           # HTML 报告转换
│   │       ├── markdown.ts       # Markdown 报告转换
│   │       └── jest.ts           # Jest/Vitest 兼容格式
│   └── types/
│       └ index.ts                # 类型定义（含 AgentCliConfig, SessionInfo）
├── tests/                        # 单元测试目录
├── SKILL.md                      # Skill 描述文档
├── README.md                     # 用户使用文档
├── example/                      # 示例 Skill 和测试用例
│   ├── skills/
│   │   └── file-operations.md   # 示例 Skill 定义
│   ├── fixtures/
│   │   ├── templates/           # 测试模板文件
│   │   └── empty/               # 空环境目录
│   └── tests/
│       └── file-operations.yaml # 示例测试用例
└── package.json
```

## 模块职责与依赖关系

### 模块职责表

| 模块 | 职责 | 依赖 |
|------|------|------|
| `cli.ts` | 解析命令行参数，分发到对应 command | commands/* |
| `commands/run.ts` | 加载 YAML，执行测试，输出结果 | parser/yaml, runner/*, executor/*, output/json |
| `commands/suggest.ts` | 导出 session，分析行为，生成 YAML | parser/yaml, parser/session, runner/* |
| `commands/report.ts` | 读取 JSON 结果，转换格式输出 | output/formatters/* |
| `commands/init.ts` | 创建目录结构，生成示例文件 | 无 |
| `parser/yaml.ts` | 解析 YAML 测试用例文件，验证格式，设置默认值 | types |
| `parser/session.ts` | 解析 opencode export JSON，提取关键信息 | types |
| `runner/types.ts` | 定义 AgentRunner 接口和运行时类型 | types |
| `runner/opencode.ts` | OpenCode CLI 执行封装 | runner/types, types |
| `runner/factory.ts` | Runner 实例创建工厂 | runner/opencode, types |
| `executor/fixture.ts` | 环境复制、setup 执行、cleanup 清理 | 无 |
| `executor/verifier.ts` | 执行断言验证，返回验证结果（含 exec_command 命令执行） | types |
| `output/json.ts` | 生成 JSON 测试结果 | types |
| `output/formatters/*` | 格式转换（HTML、Markdown、Jest） | types |

### 依赖关系图

```
cli.ts
  └── commands/
        ├── init.ts (独立)
        ├── suggest.ts
        │     ├── parser/yaml.ts
        │     ├── parser/session.ts
        │     └── runner/factory.ts
        │           └── runner/opencode.ts
        ├── run.ts
        │     ├── parser/yaml.ts
        │     ├── runner/factory.ts
        │     │     └── runner/opencode.ts
        │     ├── executor/fixture.ts
        │     ├── executor/verifier.ts
        │     └── output/json.ts
        └── report.ts
              └── output/formatters/*
```

## 核心数据流

### run 命令执行流程

```
YAML 文件
    │
    ▼
parser/yaml.ts (解析验证)
    │
    ▼
executor/fixture.ts (准备环境)
    │
    ▼
executor/opencode.ts (执行步骤)
    │
    ▼
executor/verifier.ts (验证断言)
    │
    ▼
output/json.ts (生成结果)
    │
    ▼
TestResult JSON
```

### suggest 命令执行流程

```
Session ID
    │
    ▼
executor/opencode.ts (export session)
    │
    ▼
parser/session.ts (分析提取)
    │
    ▼
YAML 生成
    │
    ▼
输出文件
```

## 核心类型定义

### YAML 测试用例类型

```typescript
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

interface ScenarioConfig {
  name: string;
  environment: string;
  cleanup: boolean;
  steps: StepConfig[];
}

interface StepConfig {
  input: string;
  expected: Assertion[];
  timeout?: number;
}

type Assertion =
  | { should_call_tool: string }
  | { should_produce_file: string }
  | { file_content_contains: { file: string; text: string } }
  | { response_contains: string };
```

### 测试结果类型

```typescript
interface TestResult {
  suite: SuiteInfo;
  summary: TestSummary;
  scenarios: ScenarioResult[];
}

interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;
  tempDirectory?: string;
}

interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
}

interface AssertionResult {
  type: string;
  value: string | { file: string; text: string };
  passed: boolean;
  message?: string;
}
```

## opencode CLI 接口规范

### run 命令

```bash
# 首次步骤
opencode run "<input>" --dir <directory> --format json

# 后续步骤（继续会话）
opencode run "<input>" --session <sessionId> --fork --format json
```

输出为 JSON 流（每行一个 JSON 对象）：
```json
{"type":"tool_call","data":{"tool_name":"Write"},"session_id":"ses_xxx","timestamp":123}
{"type":"text","data":{"content":"Done"},"session_id":"ses_xxx","timestamp":124}
```

### export 命令

```bash
opencode export <session-id>
```

输出完整的 Session JSON，包含 messages、info、summary 等。

### session list 命令

```bash
opencode session list
```

输出会话列表表格文本，需要解析提取 session ID。

## 关键实现细节

### ESM 模块导入

项目使用 `"type": "module"`，fs-extra 等模块需使用默认导入：

```typescript
// 正确
import fs from 'fs-extra';

// 错误（在 ESM 下不工作）
import * as fs from 'fs-extra';
```

### 多步骤会话处理

- 首次步骤：使用 `--dir` 指定工作目录
- 后续步骤：使用 `--session` + `--fork` 继续会话

### 断言验证

| 断言类型 | 验证逻辑 |
|----------|----------|
| `should_call_tool` | 检查 outputs 中 type=tool_call 且 tool_name 匹配 |
| `should_produce_file` | 检查工作目录是否存在该文件 |
| `file_content_contains` | 读取文件，检查内容包含指定文本 |
| `response_contains` | 检查 outputs 中 type=text 的 data.content |
| `exec_command` | 执行命令，检查输出（stdout+stderr）是否匹配 Matcher |

### 临时目录命名

```
{tempRoot}/{scenarioId}-{runId}-{timestamp}
```

## Agent CLI 配置

### YAML 配置

```yaml
config:
  agent_cli:
    runner: opencode      # Agent 类型
    command: mycode       # 自定义命令名
    model: anthropic/claude-3.5-sonnet  # 可选：默认 model
    agent: my-custom-agent              # 可选：默认 agent
  judges:
    code-reviewer:
      runner: opencode
      command: opencode
      model: openai/gpt-4o              # AI裁判使用的 model
      agent: reviewer-agent             # AI裁判使用的 agent
```

验证层自动设置默认值 `{ runner: 'opencode', command: 'opencode' }`。

### Model/Agent 优先级

**Model 优先级：**
1. CLI 参数 `--model`
2. YAML `config.agent_cli.model`
3. YAML `config.target.model`（已废弃）

**Agent 优先级：**
1. CLI 参数 `--agent`
2. Environment 配置 `agent` 字段
3. 从 `setup.copy` 推导（复制到 `.opencode/agents`）
4. YAML `config.agent_cli.agent`
5. YAML `config.target.agent`（已废弃）

**注意：** model 值可能包含 `/` 或 `.` 字符（如 `anthropic/claude-3.5-sonnet`），CLI 参数会自动添加引号处理。

### Runner 抽象

| Runner | CLI 格式 | 状态 |
|--------|---------|------|
| `opencode` | `opencode run/export/session` | 已实现 |
| `claude` | 待定义 | 未实现 |
| `gemini` | 待定义 | 未实现 |

### 扩展新 Runner

1. 在 `types/index.ts` 的 `AgentCliConfig.runner` 添加类型
2. 创建 `runner/<name>.ts` 实现 `AgentRunner`
3. 在 `factory.ts` 添加 case

## 扩展方向

1. **分支场景支持**：允许从特定 checkpoint 开始测试
2. **Mock 响应注入**：在重放时注入预设响应
3. **断言扩展**：支持正则匹配、JSON 结构验证、自定义验证函数
4. **CI 集成模板**：提供 GitHub Actions、GitLab CI 配置模板
5. **测试覆盖率**：统计 skill 被测试覆盖的行为比例

## 相关文档

- [设计文档](../docs/superpowers/specs/2026-03-29-agent-vcr-design.md) - 完整的设计规范
- [实现计划](../docs/superpowers/plans/2026-03-29-agent-vcr-implementation.md) - TDD 实现步骤
- [SKILL.md](./SKILL.md) - Skill 使用说明