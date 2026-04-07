# Agent VCR

Agent VCR 是一个为 opencode Agent 工程提供单元测试能力的 TypeScript CLI 工具。通过记录用户输入序列和关键检查点，每次完整重放测试，验证 Agent 行为是否符合预期。

## 核心理念

**只记录输入，不记录响应**。测试用例存储用户输入序列和预期断言，每次运行都使用最新的 Skills/Rules 从头执行，确保测试始终验证当前行为。

## 安装

```bash
npm install -g agentvcr
```

## 快速开始

### 1. 初始化测试目录

```bash
agentvcr init ./tests --with-example
```

这会创建：
- `fixtures/example-env/` - 示例测试环境
- `tests/example-test.yaml` - 示例测试用例

### 2. 运行测试

```bash
agentvcr run ./tests/example-test.yaml
```

### 3. 从 Session 生成测试

```bash
# 从最近的 opencode session 生成测试用例
agentvcr suggest --latest -o ./tests/my-test.yaml

# 从指定 session 生成
agentvcr suggest ses_xxx -o ./tests/my-test.yaml
```

## 示例

项目包含示例 Skill 和测试用例，位于 `example/` 目录：

```bash
# 运行示例测试
agentvcr run ./example/tests/file-operations.yaml
```

示例覆盖：
- 创建文件（Write 工具 + 文件断言）
- 读取文件（Read 工具 + 响应断言）
- 多步骤串联（步骤间会话保持）

## 测试用例格式

测试用例使用 YAML 格式定义：

```yaml
name: my-test-suite
description: 测试描述

environments:
  default:
    directory: ./fixtures/test-env
    setup:
      - copy: "./templates/base -> $WORKDIR/"
      - copy: "./skills/my-skill.md -> $WORKDIR/.opencode/agents/"
      - run: npm install
    agent: "my-skill"  # 可选，显式指定 agent 名称

scenarios:
  - name: create-file
    environment: default
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
        timeout: 60000

config:
  default_timeout: 120000
  parallel: false
```

### setup.copy 配置

`setup.copy` 使用 `source -> target` 格式：

- `source`: 复制源路径，相对于 YAML 文件
- `target`: 复制目标路径，支持 `$WORKDIR` 变量

**$WORKDIR 变量**：表示测试执行的临时工作目录。例如：

```yaml
setup:
  - copy: "./skills/skill.md -> $WORKDIR/.opencode/agents/"
```

会将 skill.md 复制到临时工作目录的 `.opencode/agents/` 下。

### agent 名称推导

agent 名称按以下优先级确定：

1. CLI `--agent` 参数
2. 环境 `agent` 字段显式指定
3. 从复制到 `.opencode/agents/` 的文件名推导

## 断言类型

### 基本断言格式（向后兼容）

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `should_call_tool` | 字符串：工具名称 | 验证 Agent 调用了指定工具 |
| `should_produce_file` | 字符串：文件路径 | 验证产生了指定文件 |
| `file_content_contains` | `{ file, text }` | 验证文件内容包含指定文本 |
| `response_contains` | 字符串：文本 | 验证响应包含指定文本 |

### Matcher 模式（灵活匹配）

所有断言类型都支持 **Matcher 对象**，提供更灵活的匹配方式：

```yaml
expected:
  - should_call_tool:
      name: { regex: ".*skill.*" }     # 正则匹配工具名
      input:
        name: { contains: "debug" }    # 包含匹配 input 参数
      status: completed                 # 状态匹配

  - should_produce_file: { regex: ".*\\.json$" }  # 正则匹配文件名

  - file_content_contains:
      file: { equals: "config.json" }
      text: { regex: ".*apiKey.*" }

  - response_contains: { oneOf: ["success", "done", "完成"] }
```

### Matcher 类型

| Matcher 字段 | 匹配方式 | 示例 |
|-------------|---------|------|
| `equals` | 精确匹配 | `{ equals: "Write" }` |
| `contains` | 包含匹配（字符串） | `{ contains: "debugging" }` |
| `regex` | 正则表达式匹配 | `{ regex: ".*skill.*" }` |
| `oneOf` | 候选值匹配（任意一个） | `{ oneOf: ["success", "done"] }` |

**简写规则：**
- 字符串值自动推断为 `{ equals: value }`
- Matcher 对象只有一个字段有效，按优先级：equals > contains > regex > oneOf

### 多技能激活断言

当 Agent 在一次执行中激活多个 Skill 时，使用多条 `should_call_tool` 断言：

```yaml
steps:
  - input: "请帮我设计并实现一个功能"
    expected:
      # 验证 brainstorming 技能被激活
      - should_call_tool:
          name: Skill
          input:
            name: brainstorming
          status: completed

      # 验证 writing-plans 技能被激活（正则匹配）
      - should_call_tool:
          name: Skill
          input:
            name: { regex: ".*writing.*" }
          status: completed
```

每条断言独立匹配一次工具调用，两条都通过表示两个技能都被激活。

### ToolCallAssertion 详细格式

```typescript
interface ToolCallAssertion {
  name: string | Matcher;                       // 工具名
  input?: Record<string, string | Matcher>;     // input 参数匹配
  status?: 'completed' | 'error' | 'pending';   // 状态匹配
}
```

**完整示例：**

```yaml
expected:
  # 简单格式（向后兼容）
  - should_call_tool: Write

  # 精确匹配 tool + input + status
  - should_call_tool:
      name: Skill
      input:
        name: brainstorming
      status: completed

  # Matcher 组合使用
  - should_call_tool:
      name: { oneOf: [Skill, skill] }
      input:
        name: { regex: ".*debugging.*" }
      status: error  # 验证技能调用失败
```

### 验证结果示例

Matcher 模式的断言结果会包含实际值，便于调试：

```json
{
  "type": "should_call_tool",
  "value": {
    "name": "Skill",
    "input": { "name": { "regex": ".*writing.*" } },
    "status": "completed"
  },
  "passed": true,
  "actual": {
    "tool": "skill",
    "input": { "name": "writing-plans" },
    "status": "completed"
  },
  "message": "Found matching tool call: skill(name matches regex '.*writing.*')"
}
```

## Agent CLI 配置

Agent VCR 支持配置自定义 CLI 命令名，适用于企业环境封装场景。在 YAML 测试文件的 `config.agent_cli` 中配置：

```yaml
name: my-test-suite
config:
  agent_cli:
    runner: opencode      # Agent 类型 (opencode, claude, gemini)
    command: mycode       # 实际执行的 CLI 命令名
```

### 默认值

若未配置 `agent_cli`，默认使用：
```yaml
agent_cli:
  runner: opencode
  command: opencode
```

### suggest 命令配置

`suggest` 命令需要 YAML 配置文件来获取 runner 配置：

```bash
# 创建最小配置文件
cat > config.yaml << EOF
name: my-project
config:
  agent_cli:
    runner: opencode
    command: mycode
EOF

# 使用配置文件生成测试
agentvcr suggest config.yaml --latest -o tests/my-test.yaml
agentvcr suggest config.yaml -s ses_xxx -o tests/my-test.yaml
```

### 未来扩展

`runner` 字段预留支持其他 Agent CLI：
- `opencode` — 当前支持
- `claude` — 未来支持
- `gemini` — 未来支持

## CLI 命令

### agentvcr init

初始化测试目录结构。

```bash
agentvcr init [directory] [--with-example]
```

### agentvcr suggest

从 opencode session 生成测试用例（需要 YAML 配置文件）。

```bash
agentvcr suggest <testFile> [-s sessionId] [--latest] [-o file] [--skill name] [--name name]
```

**参数**：
- `<testFile>` — YAML 配置文件路径（包含 agent_cli 配置）

**选项**：
- `-s, --session <sessionId>` — 指定 Session ID
- `--latest` — 使用最近的 session
- `-o, --output <file>` — 输出到文件
- `--skill <name>` — 目标 Skill 名称
- `--name <name>` — 测试套件名称

### agentvcr run

运行测试用例。

```bash
agentvcr run <testFile> [-f format] [-o file] [-s scenario] [--verbose]
```

**选项**：
- `-f, --format <format>` - 输出格式 (json, markdown, html, jest)，默认 json
- `-o, --output <file>` - 输出到文件
- `-s, --scenario <name>` - 只运行指定场景
- `--parallel` - 并行运行场景
- `-m, --model <model>` - 覆盖模型配置
- `-a, --agent <agent>` - 覆盖 agent 配置
- `--verbose` - 显示详细输出

### agentvcr report

生成格式化报告。

```bash
agentvcr report -i <jsonFile> -f <format> [-o file]
```

### 实时日志输出

运行测试时，CLI 会在控制台实时输出测试进度：

```
Running test suite: my-test-suite (2 scenarios)

Running scenario 1/2: create-file
[create-file] Preparing environment...
[create-file] Setup: copy ./fixtures/empty -> /tmp/test-workdir
[create-file] ✓ Environment ready (15ms)
[create-file] Step 1/1: "创建 hello.txt 文件"
[create-file] ⏳ executing...
[create-file] ✓ Step 1/1 passed (12.5s)
[create-file] Cleaning up...
✓ create-file passed (12.6s)

Running scenario 2/2: read-file
[read-file] Preparing environment...
[read-file] Setup: copy ./fixtures/with-hello -> /tmp/test-workdir
[read-file] ✓ Environment ready (10ms)
[read-file] Step 1/1: "读取 hello.txt 文件内容"
[read-file] ⏳ executing...
[read-file] ✓ Step 1/1 passed (8.3s)
[read-file] Cleaning up...
✓ read-file passed (8.4s)

Summary: 2 passed, 0 failed (total 21s)
```

日志信息包括：
- **场景准备**：环境初始化、fixture 复制操作
- **步骤执行**：每个步骤的输入、执行状态和结果
- **执行中状态**：`⏳ executing...` 表示 Agent 正在处理
- **清理操作**：测试结束后的临时目录清理
- **汇总统计**：通过/失败数量和总耗时

## 输出格式

- `json` - 结构化 JSON（默认）
- `markdown` - 人类可读的 Markdown
- `html` - 带样式的 HTML 报告
- `jest` - Jest 兼容格式，便于 CI 集成

### 会话内容展示

使用 `--verbose` 参数时，markdown 和 html 格式的测试报告会包含完整的会话内容：

- **Request**: 用户的输入请求
- **Response**: Agent 的文本响应
- **Tool Calls**: 工具调用列表（工具名、状态、输入参数）
- **Raw Output**: 原始 JSON 输出（折叠显示）

示例：

```bash
agentvcr run ./tests/ --verbose -f markdown -o report.md
agentvcr run ./tests/ --verbose -f html -o report.html
```

## CI/CD 集成

```bash
# 运行测试并输出 Jest 格式
agentvcr run ./tests/ -f jest -o results.json

# 退出码：0 表示全部通过，1 表示有失败
```

## 开发

```bash
# 安装依赖
npm install

# 运行测试
npm test

# 构建
npm run build

# 本地链接测试
npm link
agentvcr --help
```

## 许可证

ISC