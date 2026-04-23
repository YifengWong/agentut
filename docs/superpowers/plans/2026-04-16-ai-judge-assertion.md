# AI Judge Assertion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `judged_by` assertion type allowing users to specify an Agent CLI as judge to evaluate run results.

**Architecture:** Extend existing Runner and Verifier infrastructure. Reuse `AgentCliConfig` for judge configuration. Judge CLI receives outputs via `-f` parameter, returns `{ passed: boolean, reason?: string }` JSON.

**Tech Stack:** TypeScript, Vitest, fs-extra, child_process

---

## File Structure

```
新增文件：
- src/executor/temp-file.ts         # writeTempJson 辅助函数
- tests/executor/temp-file.test.ts  # 临时文件处理测试

修改文件：
- src/types/index.ts                # 新增 JudgedByAssertion 类型
- src/runner/types.ts               # RunOptions 新增 file 参数
- src/runner/opencode.ts            # run() 新增 -f 参数处理
- src/executor/verifier.ts          # 新增 verifyJudgedBy 等函数
- src/commands/run.ts               # verifyAssertions 调用扩展
- README.md                         # 文档更新

新增测试（扩展现有文件）：
- tests/executor/verifier.test.ts   # verifyJudgedBy 测试
- tests/runner/opencode.test.ts     # -f 参数测试
```

---

### Task 1: 类型定义扩展

**Files:**
- Modify: `src/types/index.ts`
- Test: `tests/types/index.test.ts`

- [ ] **Step 1: 添加 JudgedByAssertion 类型定义**

```typescript
// src/types/index.ts - 在 Matcher 类型定义后添加

/**
 * AI裁判断言配置
 */
export interface JudgedByAssertion {
  judge: string;       // 引用全局 judges 中的裁判名
  prompt: string;      // 给裁判的输入提示
  timeout?: number;    // 可选超时覆盖
  min_pass?: number;   // 概率测试支持
}
```

- [ ] **Step 2: 扩展 Assertion 联合类型**

```typescript
// src/types/index.ts - 修改 Assertion 类型（约第73行）

export type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher }
  | { judged_by: JudgedByAssertion };  // 新增
```

- [ ] **Step 3: 扩展 GlobalConfig 类型**

```typescript
// src/types/index.ts - 修改 GlobalConfig 类型（约第89行）

export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;
  runs?: number;
  min_pass?: number;
  judges?: Record<string, AgentCliConfig>;  // 新增：裁判配置
  /** @deprecated Use environment.agent and setup.copy with $WORKDIR instead */
  target?: {
    skill?: string;
    agent?: string;
    model?: string;
  };
}
```

- [ ] **Step 4: 运行类型测试验证**

Run: `npm test tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: 提交类型定义变更**

```bash
git add src/types/index.ts
git commit -m "feat: add JudgedByAssertion type and extend Assertion/GlobalConfig"
```

---

### Task 2: Runner 扩展 - RunOptions 新增 file 参数

**Files:**
- Modify: `src/runner/types.ts`
- Test: `tests/runner/types.test.ts`

- [ ] **Step 1: 扩展 RunOptions 接口**

```typescript
// src/runner/types.ts - 修改 RunOptions 接口（约第18行）

export interface RunOptions {
  input: string;
  directory?: string;
  sessionId?: string;
  fork?: boolean;
  timeout?: number;
  model?: string;
  agent?: string;
  file?: string;  // 新增：-f 参数，传递附加文件路径
}
```

- [ ] **Step 2: 运行 Runner 类型测试验证**

Run: `npm test tests/runner/types.test.ts`
Expected: PASS

- [ ] **Step 3: 提交 RunOptions 扩展**

```bash
git add src/runner/types.ts
git commit -m "feat: add file parameter to RunOptions for judge CLI support"
```

---

### Task 3: OpenCodeRunner 扩展 - 支持 -f 参数

**Files:**
- Modify: `src/runner/opencode.ts`
- Test: `tests/runner/opencode.test.ts`

- [ ] **Step 1: 编写 -f 参数测试（失败）**

```typescript
// tests/runner/opencode.test.ts - 在 describe('run') 块末尾添加

it('should use -f flag when file option is specified', () => {
  vi.mocked(execSync).mockReturnValue('{}');

  runner.run({
    input: 'Test',
    file: '/path/to/outputs.json'
  });

  expect(execSync).toHaveBeenCalledWith(
    expect.stringContaining('-f "/path/to/outputs.json"'),
    expect.any(Object)
  );
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test tests/runner/opencode.test.ts`
Expected: FAIL - "should use -f flag" test fails

- [ ] **Step 3: 实现 -f 参数处理**

```typescript
// src/runner/opencode.ts - 在 run() 方法中添加（约第49行，在 fork 处理之后）

// Add -f flag for additional file (judge outputs)
if (options.file) {
  args.push(`-f "${options.file}"`);
}
```

完整修改后的 run() 方法参数处理部分：

```typescript
run(options: RunOptions): RunResult {
  const args = [`${this.command} run`];

  // Add the input message (escaped)
  args.push(`"${options.input.replace(/"/g, '\\"')}"`);

  // Add directory for first step
  if (options.directory) {
    args.push(`--dir "${options.directory}"`);
  }

  // Add session for continuation
  if (options.sessionId) {
    args.push(`--session ${options.sessionId}`);
  }

  // Add fork flag
  if (options.fork) {
    args.push('--fork');
  }

  // Add -f flag for additional file (judge outputs)
  if (options.file) {
    args.push(`-f "${options.file}"`);
  }

  // Always use JSON format
  args.push('--format json');

  // ... rest unchanged
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test tests/runner/opencode.test.ts`
Expected: PASS - "should use -f flag" test passes

- [ ] **Step 5: 提交 OpenCodeRunner 扩展**

```bash
git add src/runner/opencode.ts tests/runner/opencode.test.ts
git commit -m "feat: add -f parameter support in OpenCodeRunner for judge CLI"
```

---

### Task 4: 临时文件处理 - writeTempJson

**Files:**
- Create: `src/executor/temp-file.ts`
- Create: `tests/executor/temp-file.test.ts`

- [ ] **Step 1: 编写 writeTempJson 测试**

```typescript
// tests/executor/temp-file.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { writeTempJson } from '../../src/executor/temp-file.js';
import type { OpenCodeRunOutput } from '../../src/types/index.js';

const TEST_TEMP_DIR = './test-temp-file';

describe('writeTempJson', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  it('should write outputs to temp JSON file', async () => {
    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', data: { content: 'Hello' }, session_id: 'ses_1', timestamp: 1 }
    ];

    const filePath = await writeTempJson(outputs, TEST_TEMP_DIR);

    expect(await fs.pathExists(filePath)).toBe(true);
    expect(filePath).toContain('.judges');
    
    const content = await fs.readJson(filePath);
    expect(content).toEqual(outputs);
  });

  it('should create .judges subdirectory', async () => {
    const outputs: OpenCodeRunOutput[] = [];

    const filePath = await writeTempJson(outputs, TEST_TEMP_DIR);

    const judgeDir = path.join(TEST_TEMP_DIR, '.judges');
    expect(await fs.pathExists(judgeDir)).toBe(true);
  });

  it('should generate unique filenames', async () => {
    const outputs: OpenCodeRunOutput[] = [{ type: 'text', data: { content: 'test' }, session_id: 'ses_1', timestamp: 1 }];

    const file1 = await writeTempJson(outputs, TEST_TEMP_DIR);
    const file2 = await writeTempJson(outputs, TEST_TEMP_DIR);

    expect(file1).not.toBe(file2);
  });

  it('should write JSON without indentation', async () => {
    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', data: { content: 'Test' }, session_id: 'ses_1', timestamp: 1 }
    ];

    const filePath = await writeTempJson(outputs, TEST_TEMP_DIR);

    const rawContent = await fs.readFile(filePath, 'utf-8');
    // 无缩进意味着 JSON 是紧凑格式
    expect(rawContent).not.toContain('\n  ');
    expect(rawContent).toContain('"type":"text"');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test tests/executor/temp-file.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: 实现 writeTempJson 函数**

```typescript
// src/executor/temp-file.ts

import fs from 'fs-extra';
import * as path from 'path';
import type { OpenCodeRunOutput } from '../types/index.js';

/**
 * 将 outputs 写入临时 JSON 文件
 * 文件存放在测试临时目录下的 .judges/ 子目录
 */
export async function writeTempJson(
  outputs: OpenCodeRunOutput[],
  tempRoot: string
): Promise<string> {
  // 创建裁判子目录
  const judgeDir = path.join(tempRoot, '.judges');
  await fs.ensureDir(judgeDir);

  // 生成唯一文件名（使用时间戳 + 随机数）
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `outputs-${timestamp}-${random}.json`;
  const filePath = path.join(judgeDir, fileName);

  // 写入 JSON（无缩进，减小文件大小）
  await fs.writeJson(filePath, outputs, { spaces: 0 });

  return filePath;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test tests/executor/temp-file.test.ts`
Expected: PASS

- [ ] **Step 5: 提交临时文件处理模块**

```bash
git add src/executor/temp-file.ts tests/executor/temp-file.test.ts
git commit -m "feat: add writeTempJson helper for judge outputs file"
```

---

### Task 5: Verifier 扩展 - verifyJudgedBy 函数

**Files:**
- Modify: `src/executor/verifier.ts`
- Test: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 编写 verifyJudgedBy 测试 - 裁判未配置**

```typescript
// tests/executor/verifier.test.ts - 新增 describe('verifyJudgedBy') 块

import { verifyJudgedBy } from '../../src/executor/verifier.js';
import type { JudgedByAssertion, AgentCliConfig, OpenCodeRunOutput } from '../../src/types/index.js';

// Mock createRunner
vi.mock('../../src/runner/factory.js', () => ({
  createRunner: vi.fn()
}));

import { createRunner } from '../../src/runner/factory.js';

describe('verifyJudgedBy', () => {
  const outputs: OpenCodeRunOutput[] = [
    { type: 'text', data: { content: 'Test output' }, session_id: 'ses_1', timestamp: 1 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return failed when judge not found in config', async () => {
    const assertion: JudgedByAssertion = {
      judge: 'non-existent',
      prompt: 'Check quality'
    };
    const judges: Record<string, AgentCliConfig> = {};

    const result = await verifyJudgedBy(outputs, assertion, judges, 120000, TEST_TEMP_DIR);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('not found');
    expect(result.type).toBe('judged_by');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test tests/executor/verifier.test.ts`
Expected: FAIL - verifyJudgedBy not exported

- [ ] **Step 3: 实现 verifyJudgedBy 函数（裁判未配置场景）**

```typescript
// src/executor/verifier.ts - 在文件开头添加导入

import fs from 'fs-extra';
import { createRunner } from '../runner/factory.js';
import { writeTempJson } from './temp-file.js';
import {
  type Assertion,
  type OpenCodeRunOutput,
  type AssertionResult,
  type Matcher,
  type ToolCallAssertion,
  type FileContentAssertion,
  type JudgedByAssertion,    // 新增
  type AgentCliConfig,        // 新增
  type GlobalConfig           // 新增
} from '../types/index.js';
```

```typescript
// src/executor/verifier.ts - 在文件末尾添加内置格式引导和 verifyJudgedBy

// 内置格式引导 prompt
const JUDGE_OUTPUT_FORMAT_PROMPT = `Please evaluate the input content. Your response must strictly use the following JSON format, without any other content:
{"passed":boolean,"reason":"string"}

Where:
- passed: evaluation result, true means pass, false means fail
- reason: brief explanation of the evaluation`;

/**
 * 从裁判输出中提取 JSON 结果
 */
function extractJudgeResult(outputs: OpenCodeRunOutput[]): { passed: boolean; reason?: string } {
  for (const output of outputs) {
    if (output.type === 'text') {
      const text = output.part?.text || output.data?.content || '';
      try {
        const parsed = JSON.parse(text.trim());
        if (typeof parsed.passed === 'boolean') {
          return parsed;
        }
      } catch {
        // Non-JSON, continue searching
      }
    }
  }

  return { passed: false, reason: 'No valid judge result found in output' };
}

/**
 * AI裁判断言验证
 */
export async function verifyJudgedBy(
  outputs: OpenCodeRunOutput[],
  assertion: JudgedByAssertion,
  judges: Record<string, AgentCliConfig>,
  defaultTimeout: number,
  tempRoot: string
): Promise<AssertionResult> {
  const judgeName = assertion.judge;

  // 1. 检查裁判配置是否存在
  const judgeConfig = judges[judgeName];
  if (!judgeConfig) {
    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Judge '${judgeName}' not found in config.judges`
    };
  }

  // 2. 写入临时文件
  let tempFile: string;
  try {
    tempFile = await writeTempJson(outputs, tempRoot);
  } catch (err) {
    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Failed to write temp file: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }

  // 3. 组合 prompt（内置格式引导 + 用户 prompt）
  const combinedPrompt = `${JUDGE_OUTPUT_FORMAT_PROMPT}\n\n${assertion.prompt}`;

  // 4. 创建 Runner 并执行
  const runner = createRunner(judgeConfig);
  const timeout = assertion.timeout || defaultTimeout;

  try {
    const result = runner.run({
      input: combinedPrompt,
      file: tempFile,
      timeout
    });

    // 5. 解析裁判输出
    const judgeResult = extractJudgeResult(result.outputs);

    return {
      type: 'judged_by',
      value: assertion,
      passed: judgeResult.passed,
      actual: { reason: judgeResult.reason },
      message: judgeResult.passed
        ? `Judge '${judgeName}' passed: ${judgeResult.reason || 'OK'}`
        : `Judge '${judgeName}' failed: ${judgeResult.reason || 'No reason provided'}`
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Judge '${judgeName}' execution error: ${errorMessage}`
    };

  } finally {
    // 6. 清理临时文件
    try {
      await fs.remove(tempFile);
    } catch {
      // 清理失败不影响结果
    }
  }
}
```

- [ ] **Step 4: 运行测试验证裁判未配置场景通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - "should return failed when judge not found" test passes

- [ ] **Step 5: 编写更多测试场景**

```typescript
// tests/executor/verifier.test.ts - 在 describe('verifyJudgedBy') 块中继续添加

it('should execute judge CLI and return passed result', async () => {
  const assertion: JudgedByAssertion = {
    judge: 'code-reviewer',
    prompt: 'Check code quality'
  };
  const judges: Record<string, AgentCliConfig> = {
    'code-reviewer': { runner: 'opencode', command: 'opencode' }
  };

  // Mock runner.run() to return judge output
  const mockRunner = {
    run: vi.fn().mockReturnValue({
      outputs: [
        { type: 'text', part: { text: '{"passed":true,"reason":"Code looks good"}' }, sessionID: 'ses_judge', timestamp: 1 }
      ],
      sessionId: 'ses_judge'
    })
  };
  vi.mocked(createRunner).mockReturnValue(mockRunner as any);

  const result = await verifyJudgedBy(outputs, assertion, judges, 120000, TEST_TEMP_DIR);

  expect(result.passed).toBe(true);
  expect(result.message).toContain('passed');
  expect(result.actual?.reason).toBe('Code looks good');
  expect(mockRunner.run).toHaveBeenCalledWith(
    expect.objectContaining({
      input: expect.stringContaining('Check code quality'),
      file: expect.stringContaining('.judges')
    })
  );
});

it('should return failed when judge returns passed=false', async () => {
  const assertion: JudgedByAssertion = {
    judge: 'quality-checker',
    prompt: 'Verify standards'
  };
  const judges: Record<string, AgentCliConfig> = {
    'quality-checker': { runner: 'opencode', command: 'opencode' }
  };

  const mockRunner = {
    run: vi.fn().mockReturnValue({
      outputs: [
        { type: 'text', part: { text: '{"passed":false,"reason":"Missing documentation"}' }, sessionID: 'ses_judge', timestamp: 1 }
      ],
      sessionId: 'ses_judge'
    })
  };
  vi.mocked(createRunner).mockReturnValue(mockRunner as any);

  const result = await verifyJudgedBy(outputs, assertion, judges, 120000, TEST_TEMP_DIR);

  expect(result.passed).toBe(false);
  expect(result.message).toContain('failed');
  expect(result.actual?.reason).toBe('Missing documentation');
});

it('should handle execution error', async () => {
  const assertion: JudgedByAssertion = {
    judge: 'slow-judge',
    prompt: 'Evaluate'
  };
  const judges: Record<string, AgentCliConfig> = {
    'slow-judge': { runner: 'opencode', command: 'opencode' }
  };

  const mockRunner = {
    run: vi.fn().mockImplementation(() => {
      throw new Error('Command timed out');
    })
  };
  vi.mocked(createRunner).mockReturnValue(mockRunner as any);

  const result = await verifyJudgedBy(outputs, assertion, judges, 120000, TEST_TEMP_DIR);

  expect(result.passed).toBe(false);
  expect(result.message).toContain('execution error');
  expect(result.message).toContain('timed out');
});

it('should handle invalid JSON output', async () => {
  const assertion: JudgedByAssertion = {
    judge: 'broken-judge',
    prompt: 'Test'
  };
  const judges: Record<string, AgentCliConfig> = {
    'broken-judge': { runner: 'opencode', command: 'opencode' }
  };

  const mockRunner = {
    run: vi.fn().mockReturnValue({
      outputs: [
        { type: 'text', part: { text: 'This is not JSON' }, sessionID: 'ses_judge', timestamp: 1 }
      ],
      sessionId: 'ses_judge'
    })
  };
  vi.mocked(createRunner).mockReturnValue(mockRunner as any);

  const result = await verifyJudgedBy(outputs, assertion, judges, 120000, TEST_TEMP_DIR);

  expect(result.passed).toBe(false);
  expect(result.message).toContain('No valid judge result');
});

it('should use assertion timeout when provided', async () => {
  const assertion: JudgedByAssertion = {
    judge: 'timeout-judge',
    prompt: 'Quick check',
    timeout: 5000
  };
  const judges: Record<string, AgentCliConfig> = {
    'timeout-judge': { runner: 'opencode', command: 'opencode' }
  };

  const mockRunner = {
    run: vi.fn().mockReturnValue({
      outputs: [{ type: 'text', part: { text: '{"passed":true}' }, sessionID: 'ses_judge', timestamp: 1 }],
      sessionId: 'ses_judge'
    })
  };
  vi.mocked(createRunner).mockReturnValue(mockRunner as any);

  await verifyJudgedBy(outputs, assertion, judges, 120000, TEST_TEMP_DIR);

  expect(mockRunner.run).toHaveBeenCalledWith(
    expect.objectContaining({ timeout: 5000 })
  );
});

it('should use default timeout when assertion timeout not provided', async () => {
  const assertion: JudgedByAssertion = {
    judge: 'default-timeout-judge',
    prompt: 'Check'
  };
  const judges: Record<string, AgentCliConfig> = {
    'default-timeout-judge': { runner: 'opencode', command: 'opencode' }
  };

  const mockRunner = {
    run: vi.fn().mockReturnValue({
      outputs: [{ type: 'text', part: { text: '{"passed":true}' }, sessionID: 'ses_judge', timestamp: 1 }],
      sessionId: 'ses_judge'
    })
  };
  vi.mocked(createRunner).mockReturnValue(mockRunner as any);

  await verifyJudgedBy(outputs, assertion, judges, 60000, TEST_TEMP_DIR);

  expect(mockRunner.run).toHaveBeenCalledWith(
    expect.objectContaining({ timeout: 60000 })
  );
});
```

- [ ] **Step 6: 运行所有 verifyJudgedBy 测试验证通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - all verifyJudgedBy tests pass

- [ ] **Step 7: 提交 verifyJudgedBy 实现**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: add verifyJudgedBy function for AI judge assertion"
```

---

### Task 6: Verifier 扩展 - verifyAssertions 函数

**Files:**
- Modify: `src/executor/verifier.ts`
- Test: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 编写 verifyAssertions 扩展测试**

```typescript
// tests/executor/verifier.test.ts - 在 describe('verifyAssertions') 块中添加

describe('verifyAssertions', () => {
  // ... 现有测试保留

  it('should verify judged_by assertion', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'work');
    await fs.ensureDir(workDir);

    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', data: { content: 'Test output' }, session_id: 'ses_1', timestamp: 1 }
    ];

    const config: GlobalConfig = {
      judges: {
        'test-judge': { runner: 'opencode', command: 'opencode' }
      }
    };

    // Mock runner
    const mockRunner = {
      run: vi.fn().mockReturnValue({
        outputs: [{ type: 'text', part: { text: '{"passed":true,"reason":"OK"}' }, sessionID: 'ses_j', timestamp: 1 }],
        sessionId: 'ses_j'
      })
    };
    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertions: Assertion[] = [
      { judged_by: { judge: 'test-judge', prompt: 'Check' } }
    ];

    const results = await verifyAssertions(assertions, outputs, workDir, config, TEST_TEMP_DIR);

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].type).toBe('judged_by');
  });

  it('should handle mixed assertions including judged_by', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'work-mixed');
    await fs.ensureDir(workDir);
    await fs.writeFile(path.join(workDir, 'test.txt'), 'content');

    const outputs: OpenCodeRunOutput[] = [
      { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 },
      { type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 2 }
    ];

    const config: GlobalConfig = {
      judges: {
        'reviewer': { runner: 'opencode', command: 'opencode' }
      }
    };

    const mockRunner = {
      run: vi.fn().mockReturnValue({
        outputs: [{ type: 'text', part: { text: '{"passed":true}' }, sessionID: 'ses_j', timestamp: 1 }],
        sessionId: 'ses_j'
      })
    };
    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const assertions: Assertion[] = [
      { should_call_tool: 'Write' },
      { should_produce_file: 'test.txt' },
      { judged_by: { judge: 'reviewer', prompt: 'Review' } }
    ];

    const results = await verifyAssertions(assertions, outputs, workDir, config, TEST_TEMP_DIR);

    expect(results).toHaveLength(3);
    expect(results[0].passed).toBe(true);  // should_call_tool
    expect(results[1].passed).toBe(true);  // should_produce_file
    expect(results[2].passed).toBe(true);  // judged_by
  });

  it('should handle empty judges config', async () => {
    const workDir = TEST_TEMP_DIR;
    const outputs: OpenCodeRunOutput[] = [];

    const assertions: Assertion[] = [
      { judged_by: { judge: 'missing', prompt: 'Test' } }
    ];

    const results = await verifyAssertions(assertions, outputs, workDir, {}, TEST_TEMP_DIR);

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain('not found');
  });

  it('should work without config parameter (backward compatibility)', async () => {
    const workDir = path.join(TEST_TEMP_DIR, 'work-no-config');
    await fs.ensureDir(workDir);

    const outputs: OpenCodeRunOutput[] = [
      { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 }
    ];

    const assertions: Assertion[] = [
      { should_call_tool: 'Read' }
    ];

    // 不传 config 参数
    const results = await verifyAssertions(assertions, outputs, workDir);

    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test tests/executor/verifier.test.ts`
Expected: FAIL - verifyAssertions missing judged_by handling

- [ ] **Step 3: 扩展 verifyAssertions 函数**

```typescript
// src/executor/verifier.ts - 修改 verifyAssertions 函数签名和实现

/**
 * Verify all assertions against outputs and working directory
 */
export async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string,
  config?: GlobalConfig,      // 新增：全局配置
  tempRoot?: string           // 新增：临时目录根路径
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  const judges = config?.judges || {};
  const defaultTimeout = config?.default_timeout || 120000;

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

    // 新增：judged_by 断言
    if ('judged_by' in assertion) {
      results.push(await verifyJudgedBy(
        outputs,
        assertion.judged_by,
        judges,
        defaultTimeout,
        tempRoot || workDir
      ));
    }
  }

  return results;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS - all tests pass

- [ ] **Step 5: 提交 verifyAssertions 扩展**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: extend verifyAssertions to support judged_by with config parameter"
```

---

### Task 7: run.ts 调用链修改

**Files:**
- Modify: `src/commands/run.ts`

- [ ] **Step 1: 修改 verifyAssertions 调用**

```typescript
// src/commands/run.ts - 在 executeScenario 函数中修改 verifyAssertions 调用（约第257行）

// 原代码：
const assertionResults = await verifyAssertions(step.expected, runResult.outputs, tempDirectory);

// 修改为：
const assertionResults = await verifyAssertions(
  step.expected,
  runResult.outputs,
  tempDirectory,
  suite.config,  // 新增：传入全局配置
  tempRoot       // 新增：传入临时目录根路径
);
```

- [ ] **Step 2: 运行整体测试验证**

Run: `npm test`
Expected: PASS - all tests pass

- [ ] **Step 3: 提交 run.ts 调用链修改**

```bash
git add src/commands/run.ts
git commit -m "feat: pass config and tempRoot to verifyAssertions in executeScenario"
```

---

### Task 8: YAML 解析支持

**Files:**
- Modify: `src/parser/yaml.ts`
- Test: `tests/parser/yaml.test.ts`

- [ ] **Step 1: 编写 judges 配置解析测试**

```typescript
// tests/parser/yaml.test.ts - 在现有测试块中添加

describe('judges config parsing', () => {
  it('should parse judges config', async () => {
    const yamlContent = `
name: test-suite
config:
  judges:
    code-reviewer:
      runner: opencode
      command: opencode
    quality-checker:
      runner: opencode
      command: mycode
scenarios:
  - name: test
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected: []
environments:
  default:
    directory: ./test
    setup: []
`;

    const result = parseAndValidateYaml(yamlContent);

    expect(result.config?.judges).toBeDefined();
    expect(result.config?.judges?.['code-reviewer']).toEqual({
      runner: 'opencode',
      command: 'opencode'
    });
    expect(result.config?.judges?.['quality-checker']).toEqual({
      runner: 'opencode',
      command: 'mycode'
    });
  });

  it('should parse judged_by assertion', async () => {
    const yamlContent = `
name: test-suite
scenarios:
  - name: test
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - judged_by:
              judge: code-reviewer
              prompt: "Check quality"
              timeout: 60000
environments:
  default:
    directory: ./test
    setup: []
`;

    const result = parseAndValidateYaml(yamlContent);

    const assertion = result.scenarios[0].steps[0].expected[0];
    expect('judged_by' in assertion).toBe(true);
    if ('judged_by' in assertion) {
      expect(assertion.judged_by.judge).toBe('code-reviewer');
      expect(assertion.judged_by.prompt).toBe('Check quality');
      expect(assertion.judged_by.timeout).toBe(60000);
    }
  });

  it('should parse judged_by with min_pass', async () => {
    const yamlContent = `
name: test-suite
scenarios:
  - name: test
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - judged_by:
              judge: reviewer
              prompt: "Review"
              min_pass: 4
environments:
  default:
    directory: ./test
    setup: []
`;

    const result = parseAndValidateYaml(yamlContent);

    const assertion = result.scenarios[0].steps[0].expected[0];
    if ('judged_by' in assertion) {
      expect(assertion.judged_by.min_pass).toBe(4);
    }
  });
});
```

- [ ] **Step 2: 运行测试验证 YAML 解析是否需要修改**

Run: `npm test tests/parser/yaml.test.ts`

如果测试通过，说明 YAML 解析器已经支持新类型（因为 zod 会自动解析新字段）。如果失败，需要检查 schema 定义。

- [ ] **Step 3: 检查并更新 YAML schema（如需要）**

检查 `src/parser/yaml.ts` 是否有 zod schema 需要更新。通常如果使用宽松的类型定义，不需要修改。如果有严格的 zod schema，需要添加：

```typescript
// 如果存在 zod schema，需要添加 JudgedByAssertion schema
const JudgedByAssertionSchema = z.object({
  judge: z.string(),
  prompt: z.string(),
  timeout: z.number().optional(),
  min_pass: z.number().optional()
});

// 在 Assertion schema 中添加
const AssertionSchema = z.union([
  // ... 现有 schemas
  z.object({ judged_by: JudgedByAssertionSchema })
]);

// 在 GlobalConfig schema 中添加
const GlobalConfigSchema = z.object({
  // ... 现有字段
  judges: z.record(z.object({
    runner: z.enum(['opencode', 'claude', 'gemini']),
    command: z.string()
  })).optional()
});
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test tests/parser/yaml.test.ts`
Expected: PASS

- [ ] **Step 5: 提交 YAML 解析支持**

```bash
git add src/parser/yaml.ts tests/parser/yaml.test.ts
git commit -m "feat: add YAML parsing support for judges config and judged_by assertion"
```

---

### Task 9: README 文档更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 添加 AI裁判断言章节**

在 README.md 的"断言类型"章节后添加：

```markdown
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
```

- [ ] **Step 2: 更新断言类型表格**

在"断言类型"章节的表格中添加：

```markdown
| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `judged_by` | `{ judge, prompt, timeout?, min_pass? }` | AI裁判语义评判 |
```

- [ ] **Step 3: 提交 README 更新**

```bash
git add README.md
git commit -m "docs: add AI judge assertion documentation"
```

---

### Task 10: 集成测试与验证

**Files:**
- Test: 整体测试套件

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`
Expected: PASS - all tests pass

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `npm run build` 或 `tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: 验证文档一致性**

检查 README 中的示例是否与类型定义一致。

- [ ] **Step 4: 最终提交（如有遗漏）**

```bash
git status
# 如有未提交的更改，提交它们
git commit -m "chore: finalize AI judge assertion implementation"
```

---

## Spec Coverage Check

| Spec Section | Task Coverage |
|--------------|---------------|
| YAML Configuration Structure | Task 1, Task 8 |
| Type Definitions | Task 1 |
| Runner Extension (RunOptions) | Task 2 |
| Runner Extension (-f parameter) | Task 3 |
| Temp File Handling | Task 4 |
| Built-in Format Guidance | Task 5 |
| Verification Logic (verifyJudgedBy) | Task 5, Task 6 |
| Error Handling | Task 5 |
| Probabilistic Test Support | Task 1, Task 8 |
| Call Chain Modification | Task 7 |
| README Documentation | Task 9 |
| Unit Tests | Task 3, Task 4, Task 5, Task 6, Task 8 |

---

## Placeholder Scan Result

✅ No placeholders found
✅ All code blocks contain complete implementation
✅ All test cases have actual code
✅ All file paths are exact
✅ All commands are explicit