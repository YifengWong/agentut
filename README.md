# Agent UT

Agent UT 是一个为 opencode Agent 工程提供单元测试能力的 TypeScript CLI 工具。通过记录用户输入序列和关键检查点，每次完整重放测试，验证 Agent 行为是否符合预期。

## 核心理念

**只记录输入，不记录响应**。测试用例存储用户输入序列和预期断言，每次运行都使用最新的 Skills/Rules 从头执行，确保测试始终验证当前行为。

## 安装

```bash
npm install -g agentut
```

## 快速开始

### 1. 初始化测试目录

```bash
agentut init ./tests --with-example
```

这会创建：
- `fixtures/example-env/` - 示例测试环境
- `tests/example-test.yaml` - 示例测试用例

### 2. 运行测试

```bash
agentut run ./tests/example-test.yaml
```

### 3. 从 Session 生成测试

```bash
# 从最近的 opencode session 生成测试用例
agentut suggest --latest -o ./tests/my-test.yaml

# 从指定 session 生成
agentut suggest ses_xxx -o ./tests/my-test.yaml
```

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
    cleanup: true  # @deprecated - 清理策略已改为 CLI 控制
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
    cleanup: true
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

## 断言类型

### 基本断言格式（向后兼容）

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `should_call_tool` | 字符串：工具名称 | 验证 Agent 调用了指定工具 |
| `should_produce_file` | 字符串：文件路径 | 验证产生了指定文件 |
| `file_content_contains` | `{ file, text }` | 验证文件内容包含指定文本 |
| `response_contains` | 字符串：文本 | 验证响应包含指定文本 |
| `judged_by` | `{ judge, prompt, timeout?, min_pass? }` | AI裁判语义评判 |
| `exec_command` | `{ command, expect, timeout?, cwd? }` | 执行命令并验证输出 |

### Matcher 模式（灵活匹配）

所有断言类型都支持 **Matcher 对象**，提供更灵活的匹配方式：

```yaml
expected:
  - should_call_tool:
      name: { regex: ".*skill.*" }     # 正则匹配工具名
      input:
        name: { contains: "debug" }    # 包含匹配 input 参数
      output: { contains: "SUCCESS" }  # 包含匹配 output 结果
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
  output?: string | Matcher;                    // output 结果匹配
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

  # output 匹配 — 验证工具执行结果输出
  - should_call_tool:
      name: bash
      output: { contains: "BUILD SUCCESS" }  # 验证命令输出包含指定文本
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
    "status": "completed",
    "output": "plan written to docs/plans/..."
  },
  "message": "Found matching tool call: skill(name matches regex '.*writing.*'), status='completed'"
}
```

## AI裁判断言

Agent UT 支持 AI裁判断言，允许用户指定一个 Agent CLI 来对测试结果进行语义级别的评判。

### 全局裁判声明

在 `config.judges` 中声明裁判配置：

```yaml
config:
  judges:
    code-reviewer:
      runner: opencode
      command: opencode    # 或企业封装名如 mycode
      
    quality-checker:
      runner: opencode
      command: mycode
```

### 断言级别使用

```yaml
expected:
  - should_call_tool: Write
  - judged_by:
      judge: code-reviewer            # 引用全局声明的裁判名
      prompt: "检查生成的代码是否符合项目规范"
      timeout: 120000                 # 可选，复用 default_timeout 逻辑
```

### 裁判 CLI 输入输出格式

裁判 CLI 接收：
- **prompt**: 通过命令行参数传递（复用现有 input 机制）
- **outputs**: 通过 `-f` 参数传入 outputs.json 文件路径

裁判 CLI 返回 JSON 格式：
```json
{"passed": true, "reason": "代码质量良好"}
```

或失败时：
```json
{"passed": false, "reason": "缺少必要的文档注释"}
```

### 使用场景

AI裁判断言适用于：
- 代码质量评估（是否符合编码规范）
- 文档完整性检查
- 逻辑正确性验证（需要语义理解）
- 输出风格一致性检查

### 概率测试支持

`judged_by` 断言支持 `min_pass` 配置：

```yaml
expected:
  - judged_by:
      judge: code-reviewer
      prompt: "检查代码质量"
      min_pass: 4  # 5次运行中至少4次通过
```

### 完整示例

```yaml
name: ai-judge-demo
config:
  judges:
    reviewer:
      runner: opencode
      command: opencode

environments:
  default:
    directory: ./fixtures/test-env
    setup: []

scenarios:
  - name: code-generation-test
    environment: default
    cleanup: true
    steps:
      - input: "创建一个排序函数"
        expected:
          - should_call_tool: Write
          - judged_by:
              judge: reviewer
              prompt: "检查函数是否正确处理边界情况，是否有适当的注释"
              timeout: 60000
```

## Mock 功能

Agent UT 支持在步骤级别 mock 工具调用。基于 OpenCode Plugin 机制，测试执行时自动向工作目录注入插件，通过 `tool.execute.before` 无害化参数 + `tool.execute.after` 替换返回值，实现对 Agent 工具调用的拦截。

### 使用场景

- **mock 工具返回值**：拦截 Write/Read/Bash 等工具，返回预设结果，Agent 以为操作已完成，验证后续行为
- **mock 工具失败**：模拟权限拒绝、网络超时等错误场景，验证 Agent 容错能力
- **隔离外部依赖**：mock 网络请求、数据库操作、文件系统调用，使测试完全自包含

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

### 完整示例（来自 example/tests/file-operations.yaml 场景 1）

```yaml
scenarios:
  - name: create-file
    environment: empty
    initial_session: ".agentut/my_test_init_session.json"
    steps:
      - input: "使用 'file-operations' 技能，创建 hello.txt 文件，内容为 'Hello World'。再使用mkdir temp命令创建一个temp目录"
        mock:
          - tool: write
            when:
              - file_path: { contains: "hello.txt" }
            output: "file written successfully (mocked)"
          - tool: bash
            when:
              - command: { contains: "mkdir" }
            output: "directory created (mocked)"
        expected:
          - should_call_tool: Write
          - should_call_tool:
              name: Skill
              input:
                name: file-operations
              status: completed
          - judged_by:
              judge: simple-judge
              prompt: "检查 Agent 是否正确使用了 file-operations 技能来完成创建文件的任务，包括调用了 Skill 和 Write 工具"
```

这个示例中，Write 工具和 Bash(mkdir) 命令都被 mock 了——文件不会真正写入，目录不会被真正创建，但 Agent 会认为操作成功并继续执行。断言验证 Agent 确实调用了这些工具。

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mock[].tool` | string | 是 | 要拦截的工具名（read/write/bash/grep/glob/edit 等） |
| `mock[].when` | Matcher 数组 | 否 | AND 条件数组，每个元素匹配工具 input 的一个字段。所有条件满足才触发 mock。省略则匹配该工具所有调用 |
| `mock[].output` | string | 与 error 二选一 | mock 成功返回值，Agent 看到工具执行成功 + 此内容 |
| `mock[].error` | string | 与 output 二选一 | mock 错误信息，Agent 看到工具执行失败 + 此内容 |

### 匹配逻辑

- `when` 数组中的每个元素匹配工具 input 的一个字段（如 Read 的 `file_path`、Bash 的 `command`、Write 的 `file_path`）
- **所有条件都满足（AND 逻辑）**才触发 mock
- 需要 OR 逻辑时，配置多条 mock 规则即可
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
  6. tool.execute.before: 匹配规则 → 无害化 args（Read→读空文件、Bash→echo mock）
  7. 工具执行（无害化 args，无副作用）
  8. tool.execute.after: 命中规则 → 替换 output 为 mock 结果
  9. Agent 收到 mock 结果，继续后续推理
```

### Mock 与断言配合

Mock 只控制工具执行结果，不影响断言验证。推荐配合使用：

- **`should_call_tool`**：验证 Agent 确实调用了被 mock 的工具
- **`response_contains`**：验证 Agent 基于 mock 结果给出了预期响应
- **`judged_by`**：AI 裁判评估 Agent 在 mock 上下文中的整体行为

### 校验提示

Agent UT 在步骤执行后自动检查 mock 配置是否实际生效。若发现：
- mock 配置了但从未命中（`when` 条件未匹配到任何工具调用）
- mock 命中但实际 output/error 与配置不一致

会输出 `⚠ warning` 日志并提示检查 `when` 条件和工具调用配置。Warning 不影响测试结果，仅作为诊断辅助。

## 场景评分

Agent UT 在每个场景执行完毕后自动计算评分（0-100），并在所有输出格式中展示场景得分和总评分。

### 两种评分方式

#### 1. AI 裁判评分

当配置了 `score.prompt` 时，**每个 run 独立评分**：裁判进入该 run 的工作目录评估，各 run 产生独立的 `{score, reason}`。

```yaml
scenarios:
  - name: code-quality-test
    environment: default
    score:
      judge: code-reviewer        # prompt 存在时必填，必须存在于 config.judges
      prompt: "检查生成的代码是否符合项目规范，代码结构是否清晰，是否有适当的注释"
      priority: 10               # 可选，权重，默认 10
      min_score: 70              # 可选，最低分数线，默认 0
    steps:
      - input: "创建一个排序函数"
        expected:
          - should_call_tool: Write
```

裁判必须返回 JSON 格式：（内置prompt实现）
```json
{"score": 85, "reason": "代码结构清晰，但缺少边界情况注释"}
```

- `score`：0-100 的整数值，超出范围自动修正
- `reason`：评分理由简述

#### 2. 断言评分（默认）

当**未配置** `score.prompt` 时，自动基于断言结果计算得分。这是默认行为，无需额外配置。

**计算公式（每个 run）：**
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
      priority: 20     # 更高权重
      min_score: 80    # 更严格的门槛
    steps: [...]
```

### 总评分计算

一个 YAML 文件中的所有场景按权重加权平均，得出总评分：

```
总评分 = Σ(场景得分 × priority) / Σ(priority)
```

默认权重为 10。总评分始终在 json/markdown/html/jest 所有输出中展示。

### 多次运行评分

当 `runs > 1` 时，每个 run 独立评分并存储在 `RunExecution.score` 中：

- **AI 模式**：每个 run 的 temp 目录被独立裁判评估
- **断言模式**：每个 run 计算自己的断言通过率

场景最终得分 = **所有 run 得分的平均值**。`min_score` 应用于最终平均分。

Per-run 评分信息展示：
- **JSON**：`runDetails[].score` 字段
- **HTML**：Run Details 每个 tab 内显示 `Score: XX/100 - reason`
- **Markdown**：Run Details 表格含 Score 和 Reason 列
- **Jest**：`runScores` 数组

### 通过判定

场景通过需**同时满足**两个条件：
1. **所有断言通过**（现有行为）
2. **得分 >= min_score**（新增，默认 0 即不设门槛）

### 配置字段说明

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `score.judge` | 条件必填 | - | 仅当 `prompt` 存在时必填，引用 `config.judges` 中的裁判名 |
| `score.prompt` | 否 | - | 评分提示词。为空/不填 → 使用断言评分 |
| `score.priority` | 否 | `10` | 权重，用于加权平均计算总评分 |
| `score.min_score` | 否 | `0` | 最低分数线，得分低于此值场景直接失败 |

### 完整示例

```yaml
name: scoring-demo
description: 演示场景评分功能

environments:
  default:
    directory: ./fixtures/test-env
    setup: []

scenarios:
  # 场景 1：AI 裁判评分
  - name: code-generation
    environment: default
    score:
      judge: reviewer
      prompt: "检查代码质量：1) 函数是否正确处理边界情况；2) 是否有注释；3) 命名是否规范"
      priority: 10
      min_score: 70
    steps:
      - input: "创建一个排序函数"
        expected:
          - should_call_tool: Write

  # 场景 2：默认断言评分
  - name: basic-operations
    environment: default
    steps:
      - input: "读取配置文件"
        expected:
          - should_call_tool: Read
          - response_contains: "config"

config:
  judges:
    reviewer:
      runner: opencode
      command: opencode
      model: openai/gpt-4o
  default_timeout: 120000
```

**日志输出示例：**
```
[code-generation] ⏳ scoring...
[code-generation] ✓ Score: 85/100 (min_score: 70) - 代码结构清晰，但缺少边界情况注释

[basic-operations] ✓ Score: 100/100 (assertion-based) (min_score: 0) - judge score by assertion
```

### 命令执行断言

`exec_command` 断言用于执行外部命令并验证命令输出内容，适用于：
- Java 编译验证（javac 命令）
- 单元测试验证（mvn test、npm test）
- 构建验证（gradle build、make）

#### 配置格式

```yaml
expected:
  - exec_command:
      command: "mvn test"               # 必填：要执行的命令
      expect: { contains: "BUILD SUCCESS" }  # 必填：Matcher 模式匹配输出
      timeout: 300000                   # 可选：超时覆盖
      cwd: "./subproject"               # 可选：执行目录
```

#### 字段说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `command` | string | 是 | - | 要执行的命令 |
| `expect` | Matcher | 是 | - | 输出匹配条件，支持 equals/contains/regex/oneOf |
| `timeout` | number | 否 | global.default_timeout | 命令执行超时（毫秒） |
| `cwd` | string | 否 | 场景工作目录 | 执行目录，相对路径基于 YAML 文件 |

#### 使用示例

**Java 编译验证：**

```yaml
steps:
  - input: "创建一个 Java 类 Main.java"
    expected:
      - should_call_tool: Write
      - should_produce_file: Main.java
      - exec_command:
          command: "javac Main.java"
          expect: { contains: "compiled successfully" }
```

**Maven 单元测试验证：**

```yaml
steps:
  - input: "创建一个带有单元测试的项目"
    expected:
      - exec_command:
          command: "mvn test"
          expect: { contains: "BUILD SUCCESS" }
          timeout: 300000
```

**指定子目录执行：**

```yaml
steps:
  - input: "在 src 目录下创建代码"
    expected:
      - exec_command:
          command: "npm test"
          cwd: "./src"
          expect: { regex: ".*passing.*" }
```

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
            min_pass: 9  # 断言覆盖
```

### 配置优先级

配置按以下优先级确定：
1. CLI 参数（`--runs`, `--min-pass`）
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

Agent UT 支持配置自定义 CLI 命令名，适用于企业环境封装场景。在 YAML 测试文件的 `config.agent_cli` 中配置：

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
agentut suggest config.yaml --latest -o tests/my-test.yaml
agentut suggest config.yaml -s ses_xxx -o tests/my-test.yaml
```

### 未来扩展

`runner` 字段预留支持其他 Agent CLI：
- `opencode` — 当前支持
- `claude` — 未来支持
- `gemini` — 未来支持

## CLI 命令

### agentut init

初始化测试目录结构。

```bash
agentut init [directory] [--with-example]
```

### agentut suggest

从 opencode session 生成测试用例（需要 YAML 配置文件）。

```bash
agentut suggest <testFile> [-s sessionId] [--latest] [-o file] [--skill name] [--name name]
```

**参数**：
- `<testFile>` — YAML 配置文件路径（包含 agent_cli 配置）

**选项**：
- `-s, --session <sessionId>` — 指定 Session ID
- `--latest` — 使用最近的 session
- `-o, --output <file>` — 输出到文件
- `--skill <name>` — 目标 Skill 名称
- `--name <name>` — 测试套件名称

### agentut run

运行测试用例。

```bash
agentut run <testFile> [-f format] [-o file] [-s scenario] [--clean]
```

**选项**：
- `-f, --format <format>` - 输出格式 (json, markdown, html, jest)，默认 json
- `-o, --output <file>` - 输出到文件
- `-s, --scenario <name>` - 只运行指定场景
- `--parallel` - 并行运行场景
- `-m, --model <model>` - 覆盖模型配置
- `-a, --agent <agent>` - 覆盖 agent 配置
- `--clean` - 运行结束后清理临时目录（默认保留）

### agentut clean

清理临时目录。

```bash
agentut clean [-d directory]
```

**选项**：
- `-d, --directory <path>` — 起始目录，默认当前目录

**行为**：
- 递归查找起始目录及所有子目录下的 `.agentut/temp/` 目录
- 清理找到的所有临时测试目录
- 输出清理数量和位置数

### agentut report

生成格式化报告。

```bash
agentut report -i <jsonFile> -f <format> [-o file]
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
✓ create-file passed (12.6s)

Running scenario 2/2: read-file
[read-file] Preparing environment...
[read-file] Setup: copy ./fixtures/with-hello -> /tmp/test-workdir
[read-file] ✓ Environment ready (10ms)
[read-file] Step 1/1: "读取 hello.txt 文件内容"
[read-file] ⏳ executing...
[read-file] ✓ Step 1/1 passed (8.3s)
✓ read-file passed (8.4s)

Summary: 2 passed, 0 failed (total 21s)
```

日志信息包括：
- **场景准备**：环境初始化、fixture 复制操作
- **步骤执行**：每个步骤的输入、执行状态和结果
- **执行中状态**：`⏳ executing...` 表示 Agent 正在处理
- **汇总统计**：通过/失败数量和总耗时

**注意**：临时目录默认保留（便于调试），路径记录在结果的 `tempDirectory` 字段中。使用 `--clean` 参数或 `agentut clean` 命令清理。

## 临时目录清理

测试运行会在 `.agentut/temp/` 下创建临时工作目录。清理策略：

| 方式 | 说明 |
|------|------|
| 默认行为 | 不清理，保留临时目录供事后检查 |
| `--clean` 参数 | 运行结束后立即清理 |
| `agentut clean` | 事后清理所有临时目录 |

**推荐用法**：
- **本地开发调试**：默认不清理，检查失败现场
- **CI 环境**：使用 `--clean` 参数自动清理

```bash
# CI 环境：运行后自动清理
agentut run ./tests/ --clean

# 本地调试：事后手动清理
agentut clean
```

## 输出格式

Agent UT 提供四种输出格式，各有不同的默认详细程度：

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