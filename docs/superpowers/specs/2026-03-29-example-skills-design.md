# Example Skills 端到端测试设计

## 目标

创建示例 Skill 和测试用例，用于端到端验证 Agent VCR 工具的运行效果。

## 设计原则

- **极简级**：单一功能的小 Skill，便于快速验证
- **覆盖全面**：示例需覆盖所有断言类型
- **可组合**：支持独立测试和多步骤串联测试

## 文件结构

```
example/
├── skills/
│   └── file-operations.md    # 一个 Skill，包含创建和读取两个行为
├── fixtures/
│   ├── templates/
│   │   └── hello.txt         # 模板文件，用于 setup 复制
│   └── empty/                # 空目录，用于创建文件测试
└── tests/
    └── file-operations.yaml  # 测试用例，包含多个场景
```

## Skill 设计

### file-operations.md

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

## 测试用例设计

### file-operations.yaml

| 场景 | 环境 | 步骤 | 断言类型覆盖 |
|------|------|------|--------------|
| create-file | empty | 创建 hello.txt | `should_call_tool: Write`, `should_produce_file`, `file_content_contains` |
| read-file | with-hello | 读取 hello.txt | `should_call_tool: Read`, `response_contains` |
| create-then-read | empty | 创建 → 读取 | 全四种断言串联验证 |

### 环境 setup

- **empty**：空目录，无需 setup
- **with-hello**：从 templates/hello 复制预置文件

### 断言覆盖矩阵

| 断言类型 | create-file | read-file | create-then-read |
|----------|-------------|-----------|------------------|
| `should_call_tool` | Write | Read | Write + Read |
| `should_produce_file` | hello.txt | - | hello.txt |
| `file_content_contains` | "Hello World" | - | - |
| `response_contains` | - | "Hello" | "Test Content" |

## 实现步骤

1. 创建 `example/skills/file-operations.md`
2. 创建 `example/fixtures/templates/hello.txt`（内容："Hello World"）
3. 创建 `example/fixtures/empty/` 目录（空）
4. 创建 `example/tests/file-operations.yaml`

## 验证方式

完成实现后，运行：

```bash
agentvcr run ./example/tests/file-operations.yaml
```

预期结果：所有场景 passed。