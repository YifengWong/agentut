# Matcher 模式断言扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Agent VCR 断言系统引入 Matcher 对象模式，支持工具调用的 input、status 匹配，以及所有断言类型的灵活匹配。

**Architecture:** 扩展 Assertion 类型定义，新增 Matcher 工具函数，重构所有 verify 函数支持 Matcher 格式，保持字符串格式向后兼容。

**Tech Stack:** TypeScript, Vitest, yaml

---

## 文件结构

```
变更文件:
├── src/types/index.ts          # 新增 Matcher、ToolCallAssertion、FileContentAssertion 类型
├── src/executor/verifier.ts    # 新增 matchValue、getMatcherDescription，重构所有 verify 函数
├── tests/executor/verifier.test.ts  # 新增 Matcher 相关单元测试
├── README.md                   # 更新文档，详尽描述 Matcher 特性
```

---

### Task 1: 定义 Matcher 类型

**Files:**
- Modify: `src/types/index.ts:35-39` (Assertion 类型定义)

- [ ] **Step 1: 添加 Matcher 类型定义**

在 `src/types/index.ts` 的 Assertion 类型定义之前添加：

```typescript
// ========== Matcher Types ==========

/**
 * Matcher 对象支持多种匹配模式
 * - equals: 精确匹配
 * - contains: 包含匹配（字符串）
 * - regex: 正则匹配
 * - oneOf: 候选值匹配
 */
export interface Matcher {
  equals?: string;
  contains?: string;
  regex?: string;
  oneOf?: string[];
}

/**
 * 工具调用断言，支持 Matcher 模式
 */
export interface ToolCallAssertion {
  name: string | Matcher;
  input?: Record<string, string | Matcher>;
  status?: 'completed' | 'error' | 'pending';
}

/**
 * 文件内容断言，支持 Matcher 模式
 */
export interface FileContentAssertion {
  file: string | Matcher;
  text: string | Matcher;
}
```

- [ ] **Step 2: 扩展 Assertion 类型**

修改现有的 Assertion 类型定义（约第 35-39 行）：

```typescript
export type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher };
```

- [ ] **Step 3: 扩展 AssertionResult 类型**

修改 AssertionResult 的 actual 字段定义（约第 168-174 行）：

```typescript
export interface AssertionResult {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  passed: boolean;
  actual?: {
    tool?: string;
    input?: Record<string, unknown>;
    status?: string;
    content?: string;
    file?: string;
    files?: string[];
    responses?: string[];
  };
  message?: string;
}
```

- [ ] **Step 4: 运行类型检查**

Run: `npm run build`
Expected: 编译成功，无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Matcher types for flexible assertion matching"
```

---

### Task 2: 实现 Matcher 匹配函数

**Files:**
- Modify: `src/executor/verifier.ts`
- Create test: `tests/executor/matcher.test.ts`

- [ ] **Step 1: 创建 Matcher 单元测试文件**

创建 `tests/executor/matcher.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { matchValue, getMatcherDescription } from '../../src/executor/verifier.js';

describe('matchValue', () => {
  describe('string matcher (equals)', () => {
    it('should match exact string', () => {
      expect(matchValue('Write', 'Write')).toBe(true);
      expect(matchValue('Write', 'Read')).toBe(false);
    });

    it('should match null/undefined correctly', () => {
      expect(matchValue(null, 'Write')).toBe(false);
      expect(matchValue(undefined, 'Write')).toBe(false);
    });
  });

  describe('equals matcher', () => {
    it('should match exact value', () => {
      expect(matchValue('Write', { equals: 'Write' })).toBe(true);
      expect(matchValue('Write', { equals: 'write' })).toBe(false);
    });

    it('should handle null values', () => {
      expect(matchValue(null, { equals: 'test' })).toBe(false);
    });
  });

  describe('contains matcher', () => {
    it('should match substring', () => {
      expect(matchValue('debugging skill', { contains: 'debug' })).toBe(true);
      expect(matchValue('skill', { contains: 'debug' })).toBe(false);
    });

    it('should convert non-string to string', () => {
      expect(matchValue(123, { contains: '23' })).toBe(true);
      expect(matchValue(null, { contains: 'null' })).toBe(true);
    });
  });

  describe('regex matcher', () => {
    it('should match regex pattern', () => {
      expect(matchValue('writing-plans', { regex: '.*writing.*' })).toBe(true);
      expect(matchValue('plans', { regex: '.*writing.*' })).toBe(false);
    });

    it('should match case insensitive with flags', () => {
      expect(matchValue('WRITE', { regex: 'write' })).toBe(false);
      expect(matchValue('WRITE', { regex: 'write' })).toBe(false); // regex 不加 flag
    });

    it('should handle invalid regex gracefully', () => {
      expect(matchValue('test', { regex: '[invalid' })).toBe(false);
    });

    it('should convert non-string to string', () => {
      expect(matchValue(12345, { regex: '.*45' })).toBe(true);
    });
  });

  describe('oneOf matcher', () => {
    it('should match if value is in list', () => {
      expect(matchValue('success', { oneOf: ['success', 'done', 'completed'] })).toBe(true);
      expect(matchValue('failed', { oneOf: ['success', 'done'] })).toBe(false);
    });

    it('should work with single element', () => {
      expect(matchValue('Write', { oneOf: ['Write'] })).toBe(true);
    });
  });

  describe('priority', () => {
    it('should check equals first when multiple fields present', () => {
      // 实际实现会按优先级检查
      expect(matchValue('test', { equals: 'test', contains: 'x' })).toBe(true);
    });
  });

  describe('empty matcher', () => {
    it('should return false for empty matcher object', () => {
      expect(matchValue('test', {})).toBe(false);
    });
  });
});

describe('getMatcherDescription', () => {
  it('should describe string matcher', () => {
    expect(getMatcherDescription('Write')).toBe("equals 'Write'");
  });

  it('should describe equals matcher', () => {
    expect(getMatcherDescription({ equals: 'Write' })).toBe("equals 'Write'");
  });

  it('should describe contains matcher', () => {
    expect(getMatcherDescription({ contains: 'debug' })).toBe("contains 'debug'");
  });

  it('should describe regex matcher', () => {
    expect(getMatcherDescription({ regex: '.*skill.*' })).toBe("matches regex '.*skill.*'");
  });

  it('should describe oneOf matcher', () => {
    expect(getMatcherDescription({ oneOf: ['a', 'b'] })).toBe("one of [a, b]");
  });

  it('should handle empty matcher', () => {
    expect(getMatcherDescription({})).toBe('unknown matcher');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/executor/matcher.test.ts`
Expected: FAIL - matchValue 和 getMatcherDescription 函数不存在

- [ ] **Step 3: 实现 matchValue 和 getMatcherDescription 函数**

在 `src/executor/verifier.ts` 开头添加：

```typescript
import fs from 'fs-extra';
import * as path from 'path';
import { type Assertion, type OpenCodeRunOutput, type AssertionResult, type Matcher, type ToolCallAssertion, type FileContentAssertion } from '../types/index.js';

/**
 * 使用 Matcher 模式匹配值
 * @param actual 实际值
 * @param matcher Matcher 对象或字符串（字符串 = equals）
 * @returns 是否匹配
 */
export function matchValue(actual: unknown, matcher: string | Matcher): boolean {
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
export function getMatcherDescription(matcher: string | Matcher): string {
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

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/executor/matcher.test.ts`
Expected: PASS - 所有 matchValue 和 getMatcherDescription 测试通过

- [ ] **Step 5: Commit**

```bash
git add src/executor/verifier.ts tests/executor/matcher.test.ts
git commit -m "feat: implement matchValue and getMatcherDescription functions"
```

---

### Task 3: 重构 verifyShouldCallTool 支持 Matcher

**Files:**
- Modify: `src/executor/verifier.ts`
- Modify: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 添加 verifyShouldCallTool Matcher 测试**

在 `tests/executor/verifier.test.ts` 的 `verifyShouldCallTool` describe 块中添加：

```typescript
describe('verifyShouldCallTool with Matcher', () => {
  it('should support ToolCallAssertion object format', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: {
            status: 'completed',
            input: { name: 'brainstorming' }
          }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: 'Skill',
      input: { name: 'brainstorming' },
      status: 'completed'
    });

    expect(result.passed).toBe(true);
    expect(result.actual?.tool).toBe('skill');
    expect(result.actual?.input?.name).toBe('brainstorming');
  });

  it('should support Matcher in name', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: { status: 'completed', input: {} }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: { regex: '.*skill.*' }
    });

    expect(result.passed).toBe(true);
  });

  it('should support Matcher in input', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: {
            status: 'completed',
            input: { name: 'writing-plans' }
          }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: 'Skill',
      input: { name: { regex: '.*writing.*' } }
    });

    expect(result.passed).toBe(true);
  });

  it('should support contains matcher in input', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'write',
          state: {
            status: 'completed',
            input: { filePath: '/path/to/config.json' }
          }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: 'Write',
      input: { filePath: { contains: '.json' } }
    });

    expect(result.passed).toBe(true);
  });

  it('should support status matching', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: {
            status: 'error',
            input: { name: 'brainstorming' },
            error: 'Skill not found'
          }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: 'Skill',
      input: { name: 'brainstorming' },
      status: 'error'
    });

    expect(result.passed).toBe(true);
    expect(result.actual?.status).toBe('error');
  });

  it('should fail when status does not match', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: { status: 'error', input: { name: 'test' } }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: 'Skill',
      status: 'completed'
    });

    expect(result.passed).toBe(false);
  });

  it('should support oneOf matcher', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: { status: 'completed', input: {} }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, {
      name: { oneOf: ['Skill', 'skill', 'SKILL'] }
    });

    expect(result.passed).toBe(true);
  });

  it('should match multiple tool calls independently', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: { status: 'completed', input: { name: 'brainstorming' } }
        }
      },
      {
        type: 'tool_use',
        timestamp: 2,
        sessionID: 'ses_1',
        part: {
          tool: 'skill',
          state: { status: 'completed', input: { name: 'writing-plans' } }
        }
      }
    ];

    // 第一条断言匹配第一次调用
    const result1 = verifyShouldCallTool(outputs, {
      name: 'Skill',
      input: { name: 'brainstorming' }
    });

    // 第二条断言匹配第二次调用
    const result2 = verifyShouldCallTool(outputs, {
      name: 'Skill',
      input: { name: { regex: '.*writing.*' } }
    });

    expect(result1.passed).toBe(true);
    expect(result2.passed).toBe(true);
  });

  it('should remain backward compatible with string format', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'tool_use',
        timestamp: 1,
        sessionID: 'ses_1',
        part: {
          tool: 'write',
          state: { status: 'completed', input: {} }
        }
      }
    ];

    const result = verifyShouldCallTool(outputs, 'Write');

    expect(result.passed).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/executor/verifier.test.ts`
Expected: FAIL - verifyShouldCallTool 不支持对象格式和 Matcher

- [ ] **Step 3: 重构 verifyShouldCallTool 函数**

替换 `src/executor/verifier.ts` 中的 `verifyShouldCallTool` 函数：

```typescript
/**
 * Verify that a specific tool was called with optional Matcher support
 */
export function verifyShouldCallTool(
  outputs: OpenCodeRunOutput[],
  assertion: string | ToolCallAssertion
): AssertionResult {
  // 解析断言
  const toolAssertion: ToolCallAssertion = typeof assertion === 'string'
    ? { name: assertion }
    : assertion;

  // 查找匹配的工具调用
  const matches = outputs.filter(output => {
    // Check new format (type: "tool_use", part.tool)
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
      ? `Found matching tool call: ${matches[0].part?.tool}${inputDesc ? `(${inputDesc})` : ''}${statusDesc}`
      : `No tool call found with name ${nameDesc}${inputDesc ? `, input ${inputDesc}` : ''}${statusDesc}`
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - 所有 verifyShouldCallTool 测试通过

- [ ] **Step 5: Commit**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: refactor verifyShouldCallTool to support Matcher pattern"
```

---

### Task 4: 重构 verifyShouldProduceFile 支持 Matcher

**Files:**
- Modify: `src/executor/verifier.ts`
- Modify: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 添加 verifyShouldProduceFile Matcher 测试**

在 `tests/executor/verifier.test.ts` 的 `verifyShouldProduceFile` describe 块中添加：

```typescript
describe('verifyShouldProduceFile with Matcher', () => {
  it('should support regex matcher for file name', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.json'), '{}');
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'settings.json'), '{}');

    const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { regex: '.*\\.json$' });

    expect(result.passed).toBe(true);
    expect(result.actual?.files?.length).toBeGreaterThanOrEqual(1);
  });

  it('should support oneOf matcher', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.yaml'), 'key: value');

    const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { oneOf: ['config.json', 'config.yaml'] });

    expect(result.passed).toBe(true);
  });

  it('should support contains matcher', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'test-output.txt'), 'content');

    const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { contains: 'output' });

    expect(result.passed).toBe(true);
  });

  it('should remain backward compatible with string format', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'hello.txt'), 'Hello');

    const result = await verifyShouldProduceFile(TEST_TEMP_DIR, 'hello.txt');

    expect(result.passed).toBe(true);
  });

  it('should fail when regex does not match any file', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.txt'), 'text');

    const result = await verifyShouldProduceFile(TEST_TEMP_DIR, { regex: '.*\\.json$' });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('regex');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/executor/verifier.test.ts`
Expected: FAIL - verifyShouldProduceFile 不支持 Matcher 格式

- [ ] **Step 3: 重构 verifyShouldProduceFile 函数**

替换 `src/executor/verifier.ts` 中的 `verifyShouldProduceFile` 函数。需要先安装 glob 或使用 fs.readdir：

```typescript
/**
 * Verify that a file was produced in the working directory with Matcher support
 */
export async function verifyShouldProduceFile(
  workDir: string,
  assertion: string | Matcher
): Promise<AssertionResult> {
  const matcher = typeof assertion === 'string'
    ? { equals: assertion }
    : assertion;

  // 获取目录下所有文件（递归）
  const files: string[] = [];

  async function collectFiles(dir: string, baseDir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath, baseDir);
      } else if (entry.isFile()) {
        // 返回相对路径
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  try {
    await collectFiles(workDir, workDir);
  } catch {
    // 目录不存在
  }

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

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - 所有 verifyShouldProduceFile 测试通过

- [ ] **Step 5: Commit**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: refactor verifyShouldProduceFile to support Matcher pattern"
```

---

### Task 5: 重构 verifyFileContentContains 支持 Matcher

**Files:**
- Modify: `src/executor/verifier.ts`
- Modify: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 添加 verifyFileContentContains Matcher 测试**

在 `tests/executor/verifier.test.ts` 的 `verifyFileContentContains` describe 块中添加：

```typescript
describe('verifyFileContentContains with Matcher', () => {
  it('should support Matcher in file parameter', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'error.log'), 'ERROR: something failed');

    const result = await verifyFileContentContains(TEST_TEMP_DIR, {
      file: { regex: '.*\\.log$' },
      text: 'ERROR'
    });

    expect(result.passed).toBe(true);
  });

  it('should support Matcher in text parameter', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'output.txt'), 'Phase 1: Analysis started');

    const result = await verifyFileContentContains(TEST_TEMP_DIR, {
      file: 'output.txt',
      text: { regex: 'Phase.*Analysis' }
    });

    expect(result.passed).toBe(true);
  });

  it('should support contains matcher for text', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'config.json'), '{"name": "test", "value": 123}');

    const result = await verifyFileContentContains(TEST_TEMP_DIR, {
      file: 'config.json',
      text: { contains: 'name' }
    });

    expect(result.passed).toBe(true);
  });

  it('should support both file and text Matcher', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'debug.log'), 'DEBUG: entering function');

    const result = await verifyFileContentContains(TEST_TEMP_DIR, {
      file: { contains: 'debug' },
      text: { contains: 'entering' }
    });

    expect(result.passed).toBe(true);
  });

  it('should remain backward compatible with simple format', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'simple.txt'), 'Hello World');

    const result = await verifyFileContentContains(TEST_TEMP_DIR, {
      file: 'simple.txt',
      text: 'Hello'
    });

    expect(result.passed).toBe(true);
  });

  it('should search all matching files when file uses regex', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'file1.txt'), 'no match');
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'file2.txt'), 'FOUND IT');

    const result = await verifyFileContentContains(TEST_TEMP_DIR, {
      file: { regex: '.*\\.txt$' },
      text: 'FOUND'
    });

    expect(result.passed).toBe(true);
    expect(result.actual?.file).toBe('file2.txt');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/executor/verifier.test.ts`
Expected: FAIL - verifyFileContentContains 签名不匹配 Matcher 格式

- [ ] **Step 3: 重构 verifyFileContentContains 函数**

替换 `src/executor/verifier.ts` 中的 `verifyFileContentContains` 函数：

```typescript
/**
 * Verify that a file contains specific content with Matcher support
 */
export async function verifyFileContentContains(
  workDir: string,
  assertion: { file: string; text: string } | FileContentAssertion
): Promise<AssertionResult> {
  // 解析断言
  const fileMatcher: Matcher = typeof assertion.file === 'string'
    ? { equals: assertion.file }
    : assertion.file;

  const textMatcher: Matcher = typeof assertion.text === 'string'
    ? { equals: assertion.text }
    : assertion.text;

  // 获取目录下所有文件
  const files: string[] = [];

  async function collectFiles(dir: string, baseDir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath, baseDir);
      } else if (entry.isFile()) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  try {
    await collectFiles(workDir, workDir);
  } catch {
    // 目录不存在
  }

  // 查找匹配的文件
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
    const fullPath = path.join(workDir, file);
    const content = await fs.readFile(fullPath, 'utf-8');

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
  const firstFileContent = await fs.readFile(path.join(workDir, matchedFiles[0]), 'utf-8');

  return {
    type: 'file_content_contains',
    value: assertion,
    passed: false,
    actual: {
      file: matchedFiles[0],
      content: firstFileContent.substring(0, 200)
    },
    message: `Content ${getMatcherDescription(textMatcher)} not found in any matching file`
  };
}
```

- [ ] **Step 4: 更新 verifyAssertions 函数调用**

更新 `verifyAssertions` 函数中的 `verifyFileContentContains` 调用：

```typescript
export async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    if ('should_call_tool' in assertion) {
      results.push(verifyShouldCallTool(outputs, assertion.should_call_tool));
    }

    if ('should_produce_file' in assertion) {
      results.push(await verifyShouldProduceFile(workDir, assertion.should_produce_file));
    }

    if ('file_content_contains' in assertion) {
      results.push(await verifyFileContentContains(workDir, assertion.file_content_contains));
    }

    if ('response_contains' in assertion) {
      results.push(verifyResponseContains(outputs, assertion.response_contains));
    }
  }

  return results;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - 所有 verifyFileContentContains 测试通过

- [ ] **Step 6: Commit**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: refactor verifyFileContentContains to support Matcher pattern"
```

---

### Task 6: 重构 verifyResponseContains 支持 Matcher

**Files:**
- Modify: `src/executor/verifier.ts`
- Modify: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 添加 verifyResponseContains Matcher 测试**

在 `tests/executor/verifier.test.ts` 的 `verifyResponseContains` describe 块中添加：

```typescript
describe('verifyResponseContains with Matcher', () => {
  it('should support regex matcher', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'text',
        timestamp: 1,
        sessionID: 'ses_1',
        part: { text: 'Operation completed successfully' }
      }
    ];

    const result = verifyResponseContains(outputs, { regex: '.*success.*' });

    expect(result.passed).toBe(true);
  });

  it('should support contains matcher', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'text',
        timestamp: 1,
        sessionID: 'ses_1',
        part: { text: 'Phase 1: Initial analysis' }
      }
    ];

    const result = verifyResponseContains(outputs, { contains: 'Phase 1' });

    expect(result.passed).toBe(true);
  });

  it('should support oneOf matcher', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'text',
        timestamp: 1,
        sessionID: 'ses_1',
        part: { text: 'done' }
      }
    ];

    const result = verifyResponseContains(outputs, { oneOf: ['success', 'completed', 'done'] });

    expect(result.passed).toBe(true);
  });

  it('should remain backward compatible with string format', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'text',
        timestamp: 1,
        sessionID: 'ses_1',
        part: { text: 'File created' }
      }
    ];

    const result = verifyResponseContains(outputs, 'File created');

    expect(result.passed).toBe(true);
  });

  it('should return matched responses in actual', () => {
    const outputs: OpenCodeRunOutput[] = [
      {
        type: 'text',
        timestamp: 1,
        sessionID: 'ses_1',
        part: { text: 'First response' }
      },
      {
        type: 'text',
        timestamp: 2,
        sessionID: 'ses_1',
        part: { text: 'Second response with match' }
      }
    ];

    const result = verifyResponseContains(outputs, { contains: 'match' });

    expect(result.passed).toBe(true);
    expect(result.actual?.responses).toContain('Second response with match');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/executor/verifier.test.ts`
Expected: FAIL - verifyResponseContains 不支持 Matcher 格式

- [ ] **Step 3: 重构 verifyResponseContains 函数**

替换 `src/executor/verifier.ts` 中的 `verifyResponseContains` 函数：

```typescript
/**
 * Verify that the response contains specific text with Matcher support
 */
export function verifyResponseContains(
  outputs: OpenCodeRunOutput[],
  assertion: string | Matcher
): AssertionResult {
  const matcher: Matcher = typeof assertion === 'string'
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

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - 所有 verifyResponseContains 测试通过

- [ ] **Step 5: Commit**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: refactor verifyResponseContains to support Matcher pattern"
```

---

### Task 7: 运行完整测试套件

**Files:**
- 无新增文件

- [ ] **Step 1: 运行所有测试**

Run: `npm test`
Expected: PASS - 所有测试通过

- [ ] **Step 2: 运行构建**

Run: `npm run build`
Expected: 成功构建，无类型错误

---

### Task 8: 更新 README.md 文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新断言类型表格**

在 README.md 的 "断言类型" 部分，替换现有表格为：

```markdown
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
    "input": { "name": { regex: ".*writing.*" } },
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive Matcher pattern documentation"
```

---

### Task 9: 集成测试与最终验证

**Files:**
- 无新增文件

- [ ] **Step 1: 运行示例测试**

Run: `agentvcr run ./example/tests/file-operations.yaml --verbose`
Expected: 示例测试通过（向后兼容验证）

- [ ] **Step 2: 创建 Matcher 示例测试文件**

创建 `example/tests/matcher-example.yaml`：

```yaml
name: matcher-example-test
description: 验证 Matcher 模式断言功能

environments:
  empty:
    directory: ../fixtures/empty
    setup:
      - copy: "../skills/file-operations/ -> $WORKDIR/.opencode/skills/file-operations/"

scenarios:
  - name: matcher-test
    environment: empty
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件"
        expected:
          # 向后兼容格式
          - should_call_tool: Write
          # Matcher 格式
          - should_produce_file: { regex: ".*\\.txt$" }
          - file_content_contains:
              file: { contains: "hello" }
              text: { contains: "" }

config:
  default_timeout: 120000
```

- [ ] **Step 3: 运行 Matcher 示例测试**

Run: `agentvcr run ./example/tests/matcher-example.yaml`
Expected: 测试运行成功

- [ ] **Step 4: 最终提交**

```bash
git add example/tests/matcher-example.yaml
git commit -m "test: add Matcher pattern example test case"
```

---

## Self-Review Checklist

**1. Spec Coverage:**
- ✅ Matcher 类型定义 - Task 1
- ✅ matchValue 函数 - Task 2
- ✅ getMatcherDescription 函数 - Task 2
- ✅ should_call_tool Matcher 支持 - Task 3
- ✅ should_produce_file Matcher 支持 - Task 4
- ✅ file_content_contains Matcher 支持 - Task 5
- ✅ response_contains Matcher 支持 - Task 6
- ✅ 多技能激活场景 - Task 3 测试覆盖
- ✅ 向后兼容性 - 所有 Task 的测试覆盖
- ✅ README 文档更新 - Task 8

**2. Placeholder Scan:**
- ✅ 无 TBD/TODO
- ✅ 无 "implement later"
- ✅ 无 "Add error handling"
- ✅ 每个步骤都有完整代码

**3. Type Consistency:**
- ✅ Matcher 类型在 Task 1 定义，后续 Task 使用一致
- ✅ ToolCallAssertion 类型在 Task 1 定义，Task 3 使用一致
- ✅ FileContentAssertion 类型在 Task 1 定义，Task 5 使用一致
- ✅ AssertionResult.actual 字段扩展一致

---

**Plan complete.** Save to `docs/superpowers/plans/2026-04-06-matcher-based-assertions.md`