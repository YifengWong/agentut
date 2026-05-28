# Agent UT

Agent UT 是一个为 AI Agent 工程提供单元测试能力的 TypeScript CLI 工具。通过记录用户输入序列和关键检查点，每次完整重放测试，验证 Agent 行为是否符合预期。

## 目录

- [核心理念](#核心理念)
- [安装](#安装)
- [快速开始](#快速开始)
- [示例](#示例)
- [测试用例格式](#测试用例格式)
- [环境配置](#环境配置)
- [导入初始会话](#导入初始会话-initial_session)
- [断言系统](#断言系统)
- [Mock 功能](#mock-功能)
- [自定义 CLI 参数](#自定义-cli-参数-run_args)
- [场景评分](#场景评分)
- [概率性测试](#概率性测试)
- [Agent CLI 配置](#agent-cli-配置)
- [CLI 命令参考](#cli-命令参考)
- [输出格式](#输出格式)
- [CI/CD 集成](#cicd-集成)
- [开发](#开发)
- [许可证](#许可证)

## 核心理念

**只记录输入，不记录响应**。测试用例存储用户输入序列和预期断言，每次运行都使用最新的 Skills/Rules 从头执行，确保测试始终验证当前行为。

## 安装

```bash
npm install -g agentut
```

## 快速开始

### 1. 从 Session 生成测试

```bash
agentut suggest --latest -o ./tests/my-test.yaml
```

从最近的 opencode session 自动生成测试用例。

### 2. 运行测试

```bash
agentut run ./tests/my-test.yaml
```

> **提示**：如果想快速体验，可以直接运行项目自带的示例：
> ```bash
> agentut run ./example/tests/file-operations.yaml
> ```

## 示例

项目包含示例 Skill 和测试用例，位于 `example/` 目录：

```bash
# 运行示例测试
agentut run ./example/tests/file-operations.yaml
```

示例覆盖：
- 创建文件（Write 工具 + 文件断言）
- 读取文件（Read 工具 + 响应断言）
- 多步骤串联（步骤间会话保持）
- Mock 工具返回值（文件操作 mock + 断言验证）
- 场景评分（AI 裁判评分 + 断言评分）

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
    cleanup: true  # @deprecated — 清理策略已改为 CLI 控制
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

## 环境配置

### environments

每个环境必须指定 `directory`（fixture 目录路径，相对于 YAML 文件）：

```yaml
environments:
  default:
    directory: ./fixtures/test-env
```

### setup.copy

`setup.copy` 使用 `source -> target` 格式：

- `source`: 复制源路径，相对于 YAML 文件
- `target`: 复制目标路径，支持 `$WORKDIR` 变量

**$WORKDIR** 变量表示测试执行的临时工作目录。例如：

```yaml
setup:
  - copy: "./skills/skill.md -> $WORKDIR/.opencode/agents/"
```

会将 skill.md 复制到临时工作目录的 `.opencode/agents/` 下。

### setup.run

在环境准备阶段执行 shell 命令：

```yaml
setup:
  - run: npm install
```

命令在 `$WORKDIR` 下执行，超时 60 秒。

### agent 名称推导

agent 名称按以下优先级确定：

1. CLI `--agent` 参数
2. 环境 `agent` 字段显式指定
3. 从复制到 `.opencode/agents/` 的文件名推导
4. `config.agent_cli.agent`
5. `config.target.agent` (@deprecated)

## 导入初始会话 (initial_session)

场景级配置 `initial_session` 允许在场景执行前导入已有的 session 文件，使后续 steps 基于该对话继续工作。

### 用途

- **延续对话上下文** — 让测试场景能够基于已有的对话历史继续，无需从零开始
- **复用已完成的工作** — 避免重复执行已有的准备步骤
- **调试/测试特定场景** — 从某个特定的对话状态开始测试

### 配置示例

```yaml
scenarios:
  - name: test-feature
    environment: default
    cleanup: true  # @deprecated
    initial_session: ".agentut/sessions/base-session.json"
    steps:
      - input: "继续实现功能 X"
        expected:
          - response_contains: "功能 X 已完成"
```

### 注意事项

- 路径相对于 YAML 文件所在目录
- 推荐将 session 文件存放于 `.agentut/sessions/` 目录下
- session 文件需符合 opencode export 格式

### session 文件获取

```bash
# 导出已有 session
opencode export ses_xxx > .agentut/sessions/base-session.json
```

## 断言系统

### 断言速查表

Agent UT 支持 7 种断言类型：

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `should_call_tool` | 字符串或 ToolCallAssertion 对象 | 验证 Agent 调用了指定工具 |
| `should_not_call_tool` | 字符串或 ToolCallAssertion 对象 | 验证 Agent **未**调用指定工具 |
| `should_produce_file` | 字符串或 Matcher | 验证工作目录中产生了指定文件 |
| `file_content_contains` | `{ file, text }` 或 FileContentAssertion | 验证文件内容包含指定文本 |
| `response_contains` | 字符串或 Matcher | 验证 Agent 文本响应包含指定内容 |
| `exec_command` | `{ command, expect, timeout?, cwd? }` | 执行命令并验证输出 |
| `judged_by` | `{ judge, prompt, timeout?, min_pass? }` | AI 裁判语义评判 |

### Matcher 模式

所有断言类型都支持 **Matcher 对象**，提供灵活的匹配方式：

| Matcher 字段 | 匹配方式 | 示例 |
|-------------|---------|------|
| `equals` | 精确匹配 | `{ equals: "Write" }` |
| `contains` | 包含匹配（字符串） | `{ contains: "debugging" }` |
| `containsOneOf` | 包含任一个子串 | `{ containsOneOf: ["success", "error"] }` |
| `regex` | 正则表达式匹配 | `{ regex: ".*skill.*" }` |
| `oneOf` | 候选值匹配（任意一个） | `{ oneOf: ["success", "done"] }` |

**简写规则：**
- 字符串值自动推断为 `{ equals: value }`（`response_contains` 除外，默认 `contains`）
- Matcher 对象只有一个字段有效，按优先级：equals > contains > containsOneOf > regex > oneOf

### should_call_tool

验证 Agent 调用了指定工具。支持简单格式和详细 Matcher 格式：

```yaml
expected:
  # 简单格式（向后兼容）
  - should_call_tool: Write

  # 详细格式：匹配 tool + input + status + output
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
      output: { contains: "SUCCESS" }

  # 多技能激活 — 多条断言验证多个 Skill 被激活
  - should_call_tool:
      name: Skill
      input:
        name: brainstorming
      status: completed
  - should_call_tool:
      name: Skill
      input:
        name: { regex: ".*writing.*" }
      status: completed
```

**ToolCallAssertion 详细格式：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string \| Matcher | 工具名（大小写不敏感） |
| `input` | `Record<string, string \| Matcher>` | 匹配工具 input 参数 |
| `output` | string \| Matcher | 匹配工具执行结果输出 |
| `status` | `'completed' \| 'error' \| 'pending'` | 匹配工具执行状态 |
| `min_pass` | number | 概率测试：断言级最小通过次数 |

### should_not_call_tool

验证 Agent **未**调用指定工具或技能。与 `should_call_tool` 完全对称，语义相反 — 只要匹配到任何工具调用，断言即失败。

```yaml
expected:
  # 简单格式：禁止调用 Bash
  - should_not_call_tool: Bash

  # 详细格式：禁止激活特定 Skill
  - should_not_call_tool:
      name: Skill
      input:
        name: debugging
      status: completed

  # Matcher 组合：禁止调用任何名称匹配的 Skill
  - should_not_call_tool:
      name: Skill
      input:
        name: { regex: ".*debugging.*" }
```

**使用场景：**
- 验证某操作未引入不期望的工具调用（如确保纯内存操作不涉及 Write）
- 验证 Skill 隔离性（如确保 file-operations skill 不触发 debugging skill）
- 回归测试保证（如确保重构后不再使用废弃的工具）

### should_produce_file

验证工作目录中产生了指定文件：

```yaml
expected:
  # 精确匹配文件名
  - should_produce_file: hello.txt

  # 正则匹配
  - should_produce_file: { regex: ".*\\.json$" }
```

### file_content_contains

验证文件内容包含指定文本：

```yaml
expected:
  # 简单格式
  - file_content_contains:
      file: config.json
      text: apiKey

  # Matcher 格式
  - file_content_contains:
      file: { equals: "config.json" }
      text: { regex: ".*apiKey.*" }
```

### response_contains

验证 Agent 的文本响应包含指定内容：

```yaml
expected:
  # 简单格式（默认为 contains 匹配）
  - response_contains: "success"

  # Matcher 格式
  - response_contains: { oneOf: ["success", "done", "完成"] }
  - response_contains: { containsOneOf: ["success", "completed", "通过"] }
```

### exec_command

执行外部命令并验证命令输出，适用于编译验证、单元测试验证、构建验证等场景：

```yaml
expected:
  - exec_command:
      command: "mvn test"               # 必填：要执行的命令
      expect: { contains: "BUILD SUCCESS" }  # 必填：Matcher 匹配输出
      timeout: 300000                   # 可选：超时覆盖
      cwd: "./subproject"               # 可选：执行目录
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `command` | string | 是 | - | 要执行的命令 |
| `expect` | Matcher | 是 | - | 输出匹配条件 |
| `timeout` | number | 否 | default_timeout | 超时（毫秒） |
| `cwd` | string | 否 | 场景工作目录 | 执行目录，相对路径基于 YAML 文件 |

### judged_by（AI 裁判）

AI 裁判断言允许指定一个 Agent CLI 对测试结果进行语义级别的评判。

#### 全局裁判声明

在 `config.judges` 中声明裁判配置：

```yaml
config:
  judges:
    code-reviewer:
      runner: opencode
      command: opencode
```

#### 断言级使用

```yaml
expected:
  - judged_by:
      judge: code-reviewer            # 引用全局声明的裁判名
      prompt: "检查生成的代码是否符合项目规范"
      timeout: 120000                 # 可选
      min_pass: 4                     # 可选，概率测试支持
```

#### 裁判 CLI 输入输出格式

裁判 CLI 接收内置格式引导 + 用户 prompt，通过 stdin 传入。返回 JSON：

```json
{"passed": true, "reason": "代码质量良好"}
```

或失败时：

```json
{"passed": false, "reason": "缺少必要的文档注释"}
```

#### 使用场景

- 代码质量评估（是否符合编码规范）
- 文档完整性检查
- 逻辑正确性验证（需要语义理解）
- 输出风格一致性检查

## Mock 功能

Agent UT 支持在步骤级别 mock 工具调用。基于 OpenCode Plugin 机制，测试执行时自动向工作目录注入插件，通过 `tool.execute.before` 无害化参数 + `tool.execute.after` 替换返回值，实现对 Agent 工具调用的拦截。

### 使用场景

- **mock 工具返回值**：拦截 Write/Read/Bash 等工具，返回预设结果
- **mock 工具失败**：模拟权限拒绝、网络超时等错误场景
- **隔离外部依赖**：mock 网络请求、数据库操作、文件系统调用

### 配置

在步骤的 `mock` 字段中声明 mock 规则：

```yaml
steps:
  - input: "读取 .env 文件"
    mock:
      - tool: read
        when:
          - file_path: { contains: ".env" }
        output: "MOCKED: DATABASE_URL=localhost\nAPI_KEY=test-123"

      - tool: bash
        when:
          - command: { contains: "git push" }
        error: "fatal: Permission denied"

      - tool: write
        # 无 when → 匹配该步骤中所有 Write 调用
        output: "file written successfully (mocked)"
    expected:
      - should_call_tool: read
      - should_call_tool: bash
      - should_call_tool: write
      - response_contains: "MOCKED"
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mock[].tool` | string | 是 | 要拦截的工具名（read/write/bash/grep/glob/edit 等） |
| `mock[].when` | Matcher 数组 | 否 | AND 条件数组，所有条件满足才触发 mock。省略则匹配该工具所有调用 |
| `mock[].output` | string | 与 error 二选一 | mock 成功返回值 |
| `mock[].error` | string | 与 output 二选一 | mock 错误信息 |

### 匹配逻辑

- `when` 数组中的每个元素匹配工具 input 的一个字段
- **所有条件都满足（AND 逻辑）**才触发 mock
- 需要 OR 逻辑时，配置多条 mock 规则
- 多条 mock 规则中第一条匹配的生效（短路匹配）

### 工作原理

```
agentut fixture setup:
  1. 复制测试环境到临时目录
  2. 写入 .opencode/plugins/agentut-plugins.ts (插件代码)
  3. 写入 .opencode/plugins/mock-rules.json  (mock 规则)
  4. 写入 .opencode/plugins/.mock-empty     (无害化空文件)

opencode 启动:
  5. 自动加载 .opencode/plugins/ 下的插件
  6. tool.execute.before: 匹配规则 → 无害化 args
  7. 工具执行（无害化 args，无副作用）
  8. tool.execute.after: 命中规则 → 替换 output 为 mock 结果
  9. Agent 收到 mock 结果，继续后续推理
```

### Mock 与断言配合

- **`should_call_tool`**：验证 Agent 确实调用了被 mock 的工具
- **`response_contains`**：验证 Agent 基于 mock 结果给出了预期响应
- **`judged_by`**：AI 裁判评估 Agent 在 mock 上下文中的整体行为

### 校验提示

Agent UT 在步骤执行后自动检查 mock 配置是否实际生效。若发现 mock 配置了但从未命中，或命中但实际 output/error 与配置不一致，会输出 `⚠ warning` 日志。Warning 不影响测试结果，仅作为诊断辅助。

## 自定义 CLI 参数 (run_args)

`run_args` 字段支持在 Scenario 或 Step 级别向 opencode 命令追加自定义 CLI 参数。

### 作用域

- **Scenario 级别**：该场景的所有 steps 都会追加此参数
- **Step 级别**：仅当前 step 追加此参数
- **合并规则**：Scenario 和 Step 都配置时，拼接合并（Scenario 在前，Step 在后）

### 示例

```yaml
scenarios:
  - name: custom-command-test
    environment: default
    run_args: '--verbose'                       # Scenario 级别
    steps:
      - input: "创建文件"
        run_args: '--command "my-command"'      # Step 级别，与 Scenario 拼接
        expected:
          - should_call_tool: Write
```

实际生成的命令：
```
opencode run "创建文件" --dir "..." --format json --model "..." --verbose --command "my-command"
```

### 注意事项

- `run_args` 是透明透传的 opaque 字符串，不做格式校验
- 用户需通过 YAML 语法自行控制引号（如单引号包裹含双引号的值）
- 不做参数去重

## 场景评分

Agent UT 在每个场景执行完毕后自动计算评分（0-100）。

### 两种评分方式

#### 1. AI 裁判评分

当配置了 `score.prompt` 时，**每个 run 独立评分**：

```yaml
scenarios:
  - name: code-quality-test
    environment: default
    score:
      judge: code-reviewer        # prompt 存在时必填，必须存在于 config.judges
      prompt: "检查生成的代码是否符合项目规范，代码结构是否清晰"
      priority: 10               # 可选，权重，默认 10
      min_score: 70              # 可选，最低分数线，默认 0
    steps:
      - input: "创建一个排序函数"
        expected:
          - should_call_tool: Write
```

裁判返回 JSON 格式：

```json
{"score": 85, "reason": "代码结构清晰，但缺少边界情况注释"}
```

#### 2. 断言评分（默认）

当**未配置** `score.prompt` 时，自动基于断言结果计算得分：

```
单 run 得分 = round(该 run 通过的断言数 / 该 run 总断言数 × 100)
```

场景最终得分 = 所有 run 得分的平均值。此时 `score_reason` 固定为 `"judge score by assertion"`。

```yaml
# 完全不配置 score → 自动断言评分 + 默认权重 10 + 默认 min_score 0
scenarios:
  - name: simple-test
    steps: [...]

# 只调整权重和分数线（仍使用断言评分）
scenarios:
  - name: important-test
    score:
      priority: 20
      min_score: 80
    steps: [...]
```

### 总评分计算

一个 YAML 文件中的所有场景按权重加权平均：

```
总评分 = Σ(场景得分 × priority) / Σ(priority)
```

默认权重为 10。总评分在所有输出格式中展示。

### 多次运行评分

当 `runs > 1` 时，每个 run 独立评分：

- **AI 模式**：每个 run 的 temp 目录被独立裁判评估
- **断言模式**：每个 run 计算自己的断言通过率

场景最终得分 = **所有 run 得分的平均值**。`min_score` 应用于最终平均分。

### 通过判定

场景通过需**同时满足**两个条件：
1. 所有断言通过
2. 得分 >= min_score（默认 0 即不设门槛）

### 配置字段说明

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `score.judge` | 条件必填 | - | 仅当 `prompt` 存在时必填，引用 `config.judges` 中的裁判名 |
| `score.prompt` | 否 | - | 评分提示词。为空/不填 → 使用断言评分 |
| `score.priority` | 否 | `10` | 权重，用于加权平均计算总评分 |
| `score.min_score` | 否 | `0` | 最低分数线，得分低于此值场景直接失败 |

## 概率性测试

在 AI 时代，测试结果可能存在不确定性。Agent UT 支持概率性测试，允许配置多次运行和通过阈值。

### 配置

```yaml
config:
  runs: 5          # 运行次数，默认 5
  min_pass: 4      # 最少通过次数，默认 4（80%）

scenarios:
  - name: my-scenario
    runs: 10       # 场景覆盖
    min_pass: 8
    steps:
      - input: "创建文件"
        expected:
          - should_call_tool: Write
            min_pass: 9  # 断言级覆盖
```

### 配置优先级

按以下优先级确定（CLI 最高）：

1. CLI 参数（`--runs`, `--min-pass`, `--quick`）
2. 场景级别配置
3. 全局配置
4. 默认值（runs=5, min_pass=4）

### CLI 快速测试

```bash
# 快速单次测试（用于调试）
agentut run ./tests/my-test.yaml --quick

# 临时调整运行次数
agentut run ./tests/my-test.yaml --runs 3 --min-pass 2
```

### 判定规则

场景通过需满足两个条件：
1. 场景整体通过次数 >= min_pass
2. 每个断言的通过次数 >= 断言各自的 min_pass

## Agent CLI 配置

Agent UT 支持配置自定义 CLI 命令名，适用于企业环境封装场景：

```yaml
name: my-test-suite
config:
  agent_cli:
    runner: opencode      # Agent 类型 (opencode, claude, gemini)
    command: mycode       # 实际执行的 CLI 命令名
    model: "anthropic/claude-sonnet-4-6"  # 可选：默认 model
    agent: "plan"         # 可选：默认 agent 名称
```

### 默认值

若未配置 `agent_cli`，默认使用：

```yaml
agent_cli:
  runner: opencode
  command: opencode
```

### suggest 命令配置

`suggest` 命令通过 `--base` 指定包含 agent_cli 配置的 YAML 文件：

```bash
agentut suggest --latest --base config.yaml -o tests/my-test.yaml
```

### 未来扩展

`runner` 字段预留支持其他 Agent CLI：
- `opencode` — 当前支持
- `claude` — 未来支持
- `gemini` — 未来支持

## CLI 命令参考

### agentut run

运行测试用例，最核心的命令。

```bash
agentut run <testFile> [-f format] [-o file] [-s scenario ...] [--clean]
```

**选项**：

| 选项 | 说明 |
|------|------|
| `-f, --format <format>` | 输出格式 (json, markdown, html, jest)，默认 json |
| `-o, --output <file>` | 输出到文件 |
| `-s, --scenario <name>` | 只运行指定场景（可重复传入） |
| `--parallel` | 并行运行场景 |
| `-m, --model <model>` | 覆盖模型配置 |
| `-a, --agent <agent>` | 覆盖 agent 配置 |
| `--runs <n>` | 覆盖运行次数 |
| `--min-pass <n>` | 覆盖最小通过次数 |
| `--quick` | 快速模式：单次运行 (runs=1, min_pass=1) |
| `--clean` | 运行结束后清理临时目录（默认保留） |

#### 实时日志输出

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
✓ create-file passed (12.6s)

Running scenario 2/2: read-file
[read-file] Preparing environment...
[read-file] ✓ Environment ready (10ms)
[read-file] Step 1/1: "读取 hello.txt 文件内容"
[read-file] ⏳ executing...
[read-file] ✓ Step 1/1 passed (8.3s)
✓ read-file passed (8.4s)

Summary: 2 passed, 0 failed (total 21s)
```

日志信息包括场景准备、步骤执行状态（`⏳ executing...` 表示 Agent 正在处理）、汇总统计。

#### 临时目录清理

测试运行会在 `.agentut/temp/` 下创建临时工作目录。

| 方式 | 说明 |
|------|------|
| 默认行为 | 不清理，保留临时目录供事后检查 |
| `--clean` 参数 | 运行结束后立即清理 |
| `agentut clean` | 事后清理所有临时目录 |

```bash
# CI 环境：运行后自动清理
agentut run ./tests/ --clean

# 本地调试：事后手动清理
agentut clean
```

### agentut suggest

从 opencode session 生成测试用例。

```bash
agentut suggest [--session id] [--latest] [--base file] [-o file] [--name name]
```

**选项**：

| 选项 | 说明 |
|------|------|
| `-s, --session <id>` | 指定 Session ID |
| `--latest` | 使用最近的 session |
| `--base <file>` | 包含 agent_cli 配置的 YAML 文件 |
| `-o, --output <file>` | 输出到文件 |
| `--name <name>` | 测试套件名称 |
| `--model <model>` | 覆盖 LLM model |
| `--agent <agent>` | 覆盖 agent |
| `--no-llm` | 使用规则引擎模式（不从 session 推理，直接提取工具调用） |

`suggest` 有两种工作模式：

- **LLM 推理模式（默认）**：蒸馏 session 数据 → 调用 LLM 推理生成语义断言
- **规则引擎模式（`--no-llm`）**：直接从 session 中提取工具调用和文件变更记录

### agentut report

从 JSON 结果文件生成格式化报告。

```bash
agentut report -i <jsonFile> -f <format> [-o file]
```

**选项**：

| 选项 | 说明 |
|------|------|
| `-i, --input <file>` | 输入 JSON 文件（必填） |
| `-f, --format <format>` | 输出格式：markdown, html, jest（必填） |
| `-o, --output <file>` | 输出到文件 |

### agentut clean

清理临时目录。

```bash
agentut clean [-d directory]
```

**选项**：

| 选项 | 说明 |
|------|------|
| `-d, --directory <path>` | 起始目录，默认当前目录 |

递归查找起始目录及所有子目录下的 `.agentut/temp/` 目录并清理。

### agentut init

创建 `fixtures/` 和 `tests/` 目录结构。

```bash
agentut init [directory] [--with-example]
```

> **通常不需要此命令**。推荐直接使用 `example/` 目录作为模板，或通过 `suggest` 从 session 生成测试用例。

## 输出格式

Agent UT 提供四种输出格式：

| 格式 | 详细程度 | 说明 | 适用场景 |
|------|---------|------|---------|
| `json` | 详尽 | 完整结构化数据，包含所有运行详情 | 程序处理、存档 |
| `html` | 详尽 | 可视化报告，步骤统计表格 + 可折叠 Tab 运行详情 | 可视化浏览、团队分享 |
| `markdown` | 简洁 | 仅展示基本结果和汇总统计 | PR 评论、文档嵌入 |
| `jest` | 简洁 | Jest 兼容格式 | CI 集成 |

### JSON 输出

JSON 输出始终包含完整数据：
- `scenarios[].runDetails` - 每次运行的完整对话过程和断言详情
- `scenarios[].steps[].assertionStats` - 步骤级断言统计（通过次数、通过率）

### HTML 报告

HTML 输出提供丰富的可视化：
- **步骤统计表格** - 展示每个断言的通过次数和通过率
- **运行详情折叠块** - Tab 切换查看各次运行的完整对话过程
- **颜色编码** - 通过率 ≥80% 绿色，50-79% 黄色，<50% 红色

```bash
# 生成 HTML 报告
agentut run ./tests/ -f html -o report.html

# 生成 Markdown 简要报告
agentut run ./tests/ -f markdown -o report.md

# 生成 Jest 格式用于 CI
agentut run ./tests/ -f jest -o results.json
```

## CI/CD 集成

```bash
# 运行测试并输出 Jest 格式
agentut run ./tests/ -f jest -o results.json

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
agentut --help
```

## 许可证

ISC
