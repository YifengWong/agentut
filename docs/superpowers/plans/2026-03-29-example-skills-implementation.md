# Example Skills 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建示例 Skill 和测试用例，用于端到端验证 Agent VCR 工具运行效果。

**Architecture:** 创建 `example/` 目录，包含 Skill 定义、测试 fixtures 和 YAML 测试用例，覆盖所有四种断言类型。

**Tech Stack:** YAML 测试用例格式、Markdown Skill 文件

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `example/skills/file-operations.md` | Skill 定义，描述创建和读取文件的行为 |
| `example/fixtures/templates/hello.txt` | 预置模板文件，内容为 "Hello World" |
| `example/fixtures/empty/.gitkeep` | 空目录占位文件，保持 git 能追踪空目录 |
| `example/tests/file-operations.yaml` | 测试用例，三个场景覆盖全部断言类型 |

---

### Task 1: 创建 Skill 定义文件

**Files:**
- Create: `example/skills/file-operations.md`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p example/skills
```

- [ ] **Step 2: 创建 Skill 文件**

```markdown
---
name: file-operations
description: 简单的文件操作 Skill，用于演示创建和读取文件的基本行为
---

# File Operations

一个极简 Skill，展示基本的文件操作能力。

## 行为

### 创建文件
当用户请求创建文件时：
1. 使用 Write 工具创建指定文件
2. 写入用户指定的内容（如果未指定内容，写入空字符串）
3. 确认文件已创建

### 读取文件
当用户请求读取文件时：
1. 使用 Read 工具读取指定文件
2. 显示文件内容给用户
```

- [ ] **Step 3: 提交**

```bash
git add example/skills/file-operations.md
git commit -m "feat: add file-operations skill example

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 创建 fixtures 目录和模板文件

**Files:**
- Create: `example/fixtures/templates/hello.txt`
- Create: `example/fixtures/empty/.gitkeep`

- [ ] **Step 1: 创建 fixtures 目录结构**

```bash
mkdir -p example/fixtures/templates
mkdir -p example/fixtures/empty
```

- [ ] **Step 2: 创建 hello.txt 模板文件**

```
Hello World
```

- [ ] **Step 3: 创建 .gitkeep 保持空目录可被 git 追踪**

```bash
touch example/fixtures/empty/.gitkeep
```

- [ ] **Step 4: 提交**

```bash
git add example/fixtures/
git commit -m "feat: add fixtures for example tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 创建测试用例文件

**Files:**
- Create: `example/tests/file-operations.yaml`

- [ ] **Step 1: 创建 tests 目录**

```bash
mkdir -p example/tests
```

- [ ] **Step 2: 创建测试用例 YAML 文件**

```yaml
name: file-operations-test
description: 验证文件操作 Skill 的基本行为

environments:
  empty:
    directory: ./fixtures/empty
    setup: []

  with-hello:
    directory: ./fixtures/with-hello
    setup:
      - copy: ./fixtures/templates/hello

scenarios:
  # 场景 1：创建文件（验证 Write + 文件产生）
  - name: create-file
    environment: empty
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件，内容为 'Hello World'"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
          - file_content_contains:
              file: hello.txt
              text: "Hello World"
        timeout: 30000

  # 场景 2：读取文件（验证 Read + 响应内容）
  - name: read-file
    environment: with-hello
    cleanup: true
    steps:
      - input: "读取 hello.txt 文件内容"
        expected:
          - should_call_tool: Read
          - response_contains: "Hello"
        timeout: 30000

  # 场景 3：多步骤串联（先创建再读取）
  - name: create-then-read
    environment: empty
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件，内容为 'Test Content'"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt

      - input: "读取 hello.txt 文件"
        expected:
          - should_call_tool: Read
          - response_contains: "Test Content"

config:
  default_timeout: 60000
  parallel: false
```

- [ ] **Step 3: 提交**

```bash
git add example/tests/file-operations.yaml
git commit -m "feat: add file-operations test cases

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 更新项目文档

**Files:**
- Modify: `README.md` (添加示例使用说明)
- Modify: `AGENTS.md` (添加 example 目录说明)

- [ ] **Step 1: 更新 README.md 添加示例说明**

在 README.md 的"快速开始"部分之后添加：

```markdown
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
```

- [ ] **Step 2: 更新 AGENTS.md 添加 example 目录说明**

在 AGENTS.md 的目录结构部分添加 example 目录：

在现有目录结构说明中添加：

```markdown
example/                        # 示例 Skill 和测试用例
├── skills/
│   └── file-operations.md     # 示例 Skill 定义
├── fixtures/
│   ├── templates/             # 测试模板文件
│   └── empty/                 # 空环境目录
└── tests/
    └── file-operations.yaml   # 示例测试用例
```

- [ ] **Step 3: 提交**

```bash
git add README.md AGENTS.md
git commit -m "docs: document example directory structure

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 验证

完成所有任务后：

```bash
# 验证目录结构
ls -la example/

# 验证文件内容
cat example/skills/file-operations.md
cat example/fixtures/templates/hello.txt
cat example/tests/file-operations.yaml

# 运行示例测试（如果 agentvcr 已构建）
npm run build
agentvcr run ./example/tests/file-operations.yaml --verbose
```

预期：目录结构正确，文件内容完整，测试运行正常。