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

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `should_call_tool` | 字符串：工具名称 | 验证 Agent 调用了指定工具 |
| `should_produce_file` | 字符串：文件路径 | 验证产生了指定文件 |
| `file_content_contains` | `{ file, text }` | 验证文件内容包含指定文本 |
| `response_contains` | 字符串：文本 | 验证响应包含指定文本 |

## CLI 命令

### agentvcr init

初始化测试目录结构。

```bash
agentvcr init [directory] [--with-example]
```

### agentvcr suggest

从 opencode session 生成测试用例。

```bash
agentvcr suggest [sessionId] [--latest] [-o file] [--skill name] [--name name]
```

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