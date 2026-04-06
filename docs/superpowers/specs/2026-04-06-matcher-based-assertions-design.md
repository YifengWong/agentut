---
title: Matcher 模式断言扩展设计文档
date: 2026-04-06
status: draft
---

# Matcher 模式断言扩展设计文档

## 概述

本设计文档描述如何为 Agent VCR 的断言系统引入 Matcher 对象模式，支持更灵活的工具调用验证，包括：

1. 工具名、输入参数、状态的多模式匹配（精确、包含、正则、候选值）
2. 多技能激活场景的断言支持
3. 统一扩展所有断言类型，使其都支持 Matcher 模式

## 背景

当前断言系统只支持简单的字符串匹配：

| 断言类型 | 当前格式 | 局限性 |
|---------|---------|--------|
| `should_call_tool` | 字符串：工具名 | 只能精确匹配，无法验证 input 参数和 status |
| `should_produce_file` | 字符串：文件路径 | 只能精确匹配 |
| `file_content_contains` | `{ file, text }` | text 只能精确匹配 |
| `response_contains` | 字符串 | 只能精确匹配 |

**典型问题场景：**

1. Skill 工具被多次调用，需要分别验证每次调用的 `input.name` 参数
2. 文件名需要正则匹配（如 `*.json`）
3. 响应内容需要包含匹配而非精确匹配

## 设计目标

1. **向后兼容**：字符串格式继续工作，自动推断为精确匹配
2. **统一语法**：所有断言类型使用相同的 Matcher 对象模式
3. **灵活组合**：支持多技能激活、正则匹配、候选值匹配等场景
4. **调试友好**：AssertionResult 显示实际值，便于定位问题

## Matcher 对象定义

```typescript
interface Matcher {
  equals?: string;         // 精确匹配
  contains?: string;       // 包含匹配（字符串）
  regex?: string;          // 正则匹配
  oneOf?: string[];        // 候选值匹配（任意一个匹配即可）
}
```

**匹配逻辑：**

| Matcher 字段 | 匹配方式 | 示例 |
|-------------|---------|------|
| `equals` | `actual === expected` | `{ equals: "Write" }` |
| `contains` | `actual.includes(expected)` | `{ contains: "debugging" }` |
| `regex` | `new RegExp(expected).test(actual)` | `{ regex: ".*skill.*" }` |
| `oneOf` | `expected.includes(actual)` | `{ oneOf: ["success", "done"] }` |

**简写规则：**

- 字符串值自动推断为 `{ equals: value }`
- Matcher 对象只有一个字段有效，按优先级：equals > contains > regex > oneOf

## Assertion 类型扩展

### 1. should_call_tool

```typescript
interface ToolCallAssertion {
  name: string | Matcher;                           // 工具名
  input?: Record<string, string | Matcher>;         // input 参数匹配
  status?: 'completed' | 'error' | 'pending';       // 状态匹配
}

type Assertion =
  | { should_call_tool: string | ToolCallAssertion }  // 扩展：支持对象格式
  | ...
```

**YAML 示例：**

```yaml
expected:
  # 简单格式（向后兼容）
  - should_call_tool: Write

  # 精确匹配 tool name + input
  - should_call_tool:
      name: Skill
      input:
        name: brainstorming
      status: completed

  # Matcher 模式
  - should_call_tool:
      name: { regex: ".*skill.*" }
      input:
        name: { contains: debugging }
      status: completed

  # 多候选值
  - should_call_tool:
      name: { oneOf: [Skill, skill] }
      input:
        name: { regex: ".*writing.*" }
```

### 2. 多技能激活场景

**场景：Agent 在一次执行中先后调用了 brainstorming 和 writing-plans 两个 Skill**

```yaml
steps:
  - input: "请帮我设计并实现一个功能"
    expected:
      # 第一次 Skill 调用：精确匹配
      - should_call_tool:
          name: Skill
          input:
            name: brainstorming
          status: completed

      # 第二次 Skill 调用：Matcher 模式
      - should_call_tool:
          name: Skill
          input:
            name: { regex: ".*writing.*" }
          status: completed
```

**验证逻辑：**

每条 `should_call_tool` 断言独立匹配一次工具调用：
- 第一条断言检查是否存在 `tool=Skill` 且 `input.name=brainstorming` 的调用
- 第二条断言检查是否存在 `tool=Skill` 且 `input.name` 匹配正则的调用
- 两条都通过 = 两个技能都被激活

### 3. should_produce_file

```typescript
type ProduceFileAssertion = string | Matcher;

type Assertion =
  | { should_produce_file: ProduceFileAssertion }
  | ...
```

**YAML 示例：**

```yaml
expected:
  # 简单格式（向后兼容）
  - should_produce_file: config.json

  # Matcher 格式
  - should_produce_file: { regex: ".*\\.json$" }
  - should_produce_file: { oneOf: [config.json, settings.json] }
```

### 4. file_content_contains

```typescript
interface FileContentAssertion {
  file: string | Matcher;
  text: string | Matcher;
}

type Assertion =
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | ...
```

**YAML 示例：**

```yaml
expected:
  # 简单格式（向后兼容）
  - file_content_contains:
      file: hello.txt
      text: "Hello World"

  # Matcher 格式
  - file_content_contains:
      file: { equals: hello.txt }
      text: { regex: "Hello.*World" }

  - file_content_contains:
      file: { regex: ".*\\.log$" }
      text: { contains: "ERROR" }
```

### 5. response_contains

```typescript
type ResponseAssertion = string | Matcher;

type Assertion =
  | { response_contains: ResponseAssertion }
  | ...
```

**YAML 示例：**

```yaml
expected:
  # 简单格式（向后兼容）
  - response_contains: "已完成"

  # Matcher 格式
  - response_contains: { regex: ".*成功.*" }
  - response_contains: { oneOf: ["成功", "已完成", "done"] }
  - response_contains: { contains: "Phase 1" }
```

## 类型定义汇总

```typescript
// ========== Matcher 定义 ==========

interface Matcher {
  equals?: string;
  contains?: string;
  regex?: string;
  oneOf?: string[];
}

// ========== 扩展后的 Assertion 类型 ==========

interface ToolCallAssertion {
  name: string | Matcher;
  input?: Record<string, string | Matcher>;
  status?: 'completed' | 'error' | 'pending';
}

interface FileContentAssertion {
  file: string | Matcher;
  text: string | Matcher;
}

type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher };

// ========== AssertionResult 扩展 ==========

interface AssertionResult {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion;
  passed: boolean;
  actual?: {
    tool?: string;
    input?: Record<string, unknown>;
    status?: string;
    content?: string;
    file?: string;
    files?: string[];      // should_produce_file 匹配时的候选文件列表
    responses?: string[];  // response_contains 匹配时的响应片段
  };
  message?: string;
}
```

## 验证函数实现

### Matcher 匹配函数

```typescript
/**
 * 使用 Matcher 模式匹配值
 * @param actual 实际值
 * @param matcher Matcher 对象或字符串（字符串 = equals）
 * @returns 是否匹配
 */
function matchValue(actual: unknown, matcher: string | Matcher): boolean {
  // 字符串 = 精确匹配
  if (typeof matcher === 'string') {
    return actual === matcher;
  }

  // 转换 actual 为字符串（用于 contains/regex）
  const actualStr = String(actual ?? '');

  // Matcher 对象（按优先级检查）
  if (matcher.equals !== undefined) {
    return actual === matcher.equals;
  }

  if (matcher.contains !== undefined) {
    return actualStr.includes(matcher.contains);
  }

  if (matcher.regex !== undefined) {
    try {
      return new RegExp(matcher.regex).test(actualStr);
    } catch {
      return false; // 无效正则返回 false
    }
  }

  if (matcher.oneOf !== undefined) {
    return matcher.oneOf.includes(actual as string);
  }

  return false;
}

/**
 * 获取匹配类型描述（用于 message）
 */
function getMatcherDescription(matcher: string | Matcher): string {
  if (typeof matcher === 'string') {
    return `equals '${matcher}'`;
  }

  if (matcher.equals) return `equals '${matcher.equals}'`;
  if (matcher.contains) return `contains '${matcher.contains}'`;
  if (matcher.regex) return `matches regex '${matcher.regex}'`;
  if (matcher.oneOf) return `one of [${matcher.oneOf.join(', ')}]`;

  return 'unknown matcher';
}
```

### should_call_tool 验证函数

```typescript
function verifyShouldCallTool(
  outputs: OpenCodeRunOutput[],
  assertion: string | ToolCallAssertion
): AssertionResult {
  // 解析断言
  const toolAssertion: ToolCallAssertion = typeof assertion === 'string'
    ? { name: assertion }
    : assertion;

  // 查找匹配的工具调用
  const matches = outputs.filter(output => {
    if (output.type !== 'tool_use') return false;

    const tool = output.part?.tool?.toLowerCase() || '';
    const input = output.part?.state?.input || {};
    const status = output.part?.state?.status || '';

    // 验证 name（工具名通常是小写）
    const expectedName = typeof toolAssertion.name === 'string'
      ? toolAssertion.name.toLowerCase()
      : toolAssertion.name;

    if (!matchValue(tool, expectedName)) return false;

    // 验证 input
    if (toolAssertion.input) {
      for (const [key, valueMatcher] of Object.entries(toolAssertion.input)) {
        if (!matchValue(input[key], valueMatcher)) return false;
      }
    }

    // 验证 status
    if (toolAssertion.status && status !== toolAssertion.status) return false;

    return true;
  });

  // 构建结果
  const passed = matches.length > 0;

  // 获取第一个匹配的实际值（用于调试）
  const actual = matches.length > 0 ? {
    tool: matches[0].part?.tool,
    input: matches[0].part?.state?.input,
    status: matches[0].part?.state?.status
  } : undefined;

  // 构建描述
  const nameDesc = getMatcherDescription(toolAssertion.name);
  const inputDesc = toolAssertion.input
    ? Object.entries(toolAssertion.input)
        .map(([k, v]) => `${k} ${getMatcherDescription(v)}`)
        .join(', ')
    : '';
  const statusDesc = toolAssertion.status ? `, status='${toolAssertion.status}'` : '';

  return {
    type: 'should_call_tool',
    value: toolAssertion,
    passed,
    actual,
    message: passed
      ? `Found matching tool call: ${matches[0].part?.tool}(${inputDesc})${statusDesc}`
      : `No tool call found with name ${nameDesc}${inputDesc ? `, input ${inputDesc}` : ''}${statusDesc}`
  };
}
```

### should_produce_file 验证函数

```typescript
async function verifyShouldProduceFile(
  workDir: string,
  assertion: string | Matcher
): Promise<AssertionResult> {
  const matcher = typeof assertion === 'string'
    ? { equals: assertion }
    : assertion;

  // 获取目录下所有文件
  const files = await glob(workDir, '**/*');

  // 查找匹配的文件
  const matches = files.filter(file => matchValue(file, matcher));

  const passed = matches.length > 0;

  return {
    type: 'should_produce_file',
    value: assertion,
    passed,
    actual: { files: matches },
    message: passed
      ? `Found matching file(s): ${matches.join(', ')}`
      : `No file found matching ${getMatcherDescription(matcher)}`
  };
}
```

### file_content_contains 验证函数

```typescript
async function verifyFileContentContains(
  workDir: string,
  assertion: { file: string; text: string } | FileContentAssertion
): Promise<AssertionResult> {
  // 解析断言
  const fileMatcher = typeof assertion.file === 'string'
    ? { equals: assertion.file }
    : assertion.file;

  const textMatcher = typeof assertion.text === 'string'
    ? { equals: assertion.text }
    : assertion.text;

  // 查找匹配的文件
  const files = await glob(workDir, '**/*');
  const matchedFiles = files.filter(f => matchValue(f, fileMatcher));

  if (matchedFiles.length === 0) {
    return {
      type: 'file_content_contains',
      value: assertion,
      passed: false,
      actual: { files: [] },
      message: `No file found matching ${getMatcherDescription(fileMatcher)}`
    };
  }

  // 检查文件内容
  for (const file of matchedFiles) {
    const content = await fs.readFile(path.join(workDir, file), 'utf-8');

    if (matchValue(content, textMatcher)) {
      return {
        type: 'file_content_contains',
        value: assertion,
        passed: true,
        actual: { file, content: content.substring(0, 200) },
        message: `Content ${getMatcherDescription(textMatcher)} found in '${file}'`
      };
    }
  }

  // 所有匹配文件都不包含指定内容
  return {
    type: 'file_content_contains',
    value: assertion,
    passed: false,
    actual: {
      file: matchedFiles[0],
      content: matchedFiles[0]
        ? await fs.readFile(path.join(workDir, matchedFiles[0]), 'utf-8')
          .then(c => c.substring(0, 200))
        : undefined
    },
    message: `Content ${getMatcherDescription(textMatcher)} not found in any matching file`
  };
}
```

### response_contains 验证函数

```typescript
function verifyResponseContains(
  outputs: OpenCodeRunOutput[],
  assertion: string | Matcher
): AssertionResult {
  const matcher = typeof assertion === 'string'
    ? { equals: assertion }
    : assertion;

  // 收集所有文本响应
  const responses = outputs
    .filter(o => o.type === 'text' && o.part?.text)
    .map(o => o.part?.text || '');

  // 检查是否有匹配的响应
  const matches = responses.filter(r => matchValue(r, matcher));

  const passed = matches.length > 0;

  return {
    type: 'response_contains',
    value: assertion,
    passed,
    actual: { responses: matches },
    message: passed
      ? `Found response ${getMatcherDescription(matcher)}`
      : `No response found matching ${getMatcherDescription(matcher)}`
  };
}
```

## YAML 测试用例示例

```yaml
name: skill-activation-test
description: 验证多技能激活和 Matcher 模式断言

environments:
  empty:
    directory: ./fixtures/empty
    setup:
      - copy: "../skills/brainstorming.md -> $WORKDIR/.opencode/agents/"

scenarios:
  - name: multi-skill-activation
    environment: empty
    cleanup: true
    steps:
      - input: "请帮我设计并规划一个用户认证功能"
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

          # 验证响应包含设计相关内容
          - response_contains: { contains: "设计" }

  - name: flexible-file-matching
    environment: empty
    cleanup: true
    steps:
      - input: "创建一个配置文件"
        expected:
          # 验证 Write 工具被调用
          - should_call_tool:
              name: Write
              input:
                filePath: { regex: ".*\\.json$" }

          # 验证产生了 JSON 文件
          - should_produce_file: { regex: ".*\\.json$" }

          # 验证文件内容包含特定字段
          - file_content_contains:
              file: { regex: ".*\\.json$" }
              text: { contains: "name" }

config:
  default_timeout: 120000
  parallel: false
```

## 实现影响范围

| 文件 | 变更内容 |
|------|---------|
| `src/types/index.ts` | 扩展 Assertion 类型定义，新增 Matcher、ToolCallAssertion、FileContentAssertion |
| `src/executor/verifier.ts` | 新增 matchValue 函数，重构所有 verify 函数支持 Matcher |
| `src/parser/yaml.ts` | 更新断言解析逻辑，支持对象格式的断言 |
| `README.md` | 更新断言类型文档，添加 Matcher 模式说明 |

## 向后兼容性

- 字符串格式断言继续工作，自动推断为 `{ equals: value }`
- 所有现有测试用例无需修改
- 新功能为可选扩展，不强制使用 Matcher 格式

## 测试计划

| 测试场景 | 输入 | 预期结果 |
|---------|------|---------|
| 字符串格式向后兼容 | `should_call_tool: Write` | 正常工作，精确匹配 |
| Tool name equals 匹配 | `{ name: { equals: Write } }` | 精确匹配 |
| Tool name regex 匹配 | `{ name: { regex: ".*skill.*" } }` | 正则匹配成功 |
| Tool input 包含匹配 | `{ input: { name: { contains: debug } } }` | 包含匹配成功 |
| Tool status 匹配 | `{ status: completed }` | 状态匹配成功 |
| 多技能激活断言 | 两条 should_call_tool 分别匹配 | 两条都通过 |
| 文件名正则匹配 | `{ regex: ".*\\.json$" }` | 匹配 JSON 文件 |
| 响应包含匹配 | `{ contains: "Phase" }` | 包含匹配成功 |
| 无效正则处理 | `{ regex: "[invalid" }` | 返回 false，不抛错 |

---

**文档版本**: 1.0-draft
**创建日期**: 2026-04-06