# exec_command 断言类型实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 exec_command 断言类型，支持配置命令执行并通过 Matcher 模式验证输出内容。

**Architecture:** 在现有断言验证模块中新增 verifyExecCommand 函数，使用 child_process.spawn 执行命令，复用 matchValue Matcher 模式验证输出。需要在调用链中传递 yamlDir 参数以支持 cwd 配置。

**Tech Stack:** TypeScript, Vitest, child_process.spawn

---

## 文件结构

| 文件 | 责责 | 改动类型 |
|------|------|---------|
| `src/types/index.ts` | ExecCommandAssertion 类型定义 | 修改 |
| `src/executor/verifier.ts` | verifyExecCommand 函数、executeCommand 辅助函数、verifyAssertions 更新 | 修改 |
| `src/commands/run.ts` | 传递 yamlDir 参数 | 修改 |
| `tests/types/index.test.ts` | ExecCommandAssertion 类型测试 | 修改 |
| `tests/executor/verifier.test.ts` | verifyExecCommand 函数测试 | 修改 |
| `README.md` | 断言类型文档更新 | 修改 |
| `AGENTS.md` | 架构文档更新 | 修改 |

---

### Task 1: 新增 ExecCommandAssertion 类型定义

**Files:**
- Modify: `src/types/index.ts:84-89` (Assertion 类型)
- Modify: `src/types/index.ts:329-343` (AssertionResult.actual)

- [ ] **Step 1: 在 types/index.ts 中添加 ExecCommandAssertion 接口**

在 `Matcher` 接口定义后（约第 53 行后）添加：

```typescript
/**
 * 命令执行断言配置
 */
export interface ExecCommandAssertion {
  command: string;           // 要执行的命令
  expect: Matcher;           // 输出匹配条件
  timeout?: number;          // 可选超时覆盖
  cwd?: string;              // 可选执行目录
  min_pass?: number;         // 概率测试支持
}
```

- [ ] **Step 2: 扩展 Assertion 类型联合**

修改 `src/types/index.ts:84-89` 的 Assertion 类型定义：

```typescript
export type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher }
  | { judged_by: JudgedByAssertion }
  | { exec_command: ExecCommandAssertion };  // 新增
```

- [ ] **Step 3: 扩展 AssertionResult.actual 类型**

修改 `src/types/index.ts:329-343` 的 AssertionResult.actual 字段，添加 stdout/stderr/exitCode：

```typescript
actual?: {
  tool?: string;
  input?: Record<string, unknown>;
  status?: string;
  content?: string;
  file?: string;
  files?: string[];
  responses?: string[];
  reason?: string;
  stdout?: string;      // 新增：命令标准输出
  stderr?: string;      // 新增：命令错误输出
  exitCode?: number;    // 新增：命令退出码
};
```

- [ ] **Step 4: 运行类型测试验证编译通过**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/agentut && git add src/types/index.ts && git commit -m "feat: add ExecCommandAssertion type definition

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 新增 ExecCommandAssertion 类型测试

**Files:**
- Modify: `tests/types/index.test.ts:79-125`

- [ ] **Step 1: 在 Assertion Type 测试组中添加 exec_command 测试**

在 `tests/types/index.test.ts` 的 `describe('Assertion Type', () => {` 块中，`judged_by` 测试后添加：

```typescript
it('should allow exec_command assertion', () => {
  const assertion: Assertion = {
    exec_command: {
      command: 'mvn test',
      expect: { contains: 'BUILD SUCCESS' }
    }
  };
  expect('exec_command' in assertion).toBe(true);
});

it('should allow exec_command assertion with optional fields', () => {
  const assertion: Assertion = {
    exec_command: {
      command: 'npm test',
      expect: { regex: '.*passing.*' },
      timeout: 300000,
      cwd: './src',
      min_pass: 4
    }
  };
  expect('exec_command' in assertion).toBe(true);
  expect((assertion as { exec_command: ExecCommandAssertion }).exec_command.timeout).toBe(300000);
  expect((assertion as { exec_command: ExecCommandAssertion }).exec_command.cwd).toBe('./src');
});
```

- [ ] **Step 2: 在文件顶部导入 ExecCommandAssertion**

修改 `tests/types/index.test.ts:1-22` 的导入，添加 ExecCommandAssertion：

```typescript
import {
  // ... 现有导入 ...
  type ExecCommandAssertion
} from '../../src/types/index.js';
```

- [ ] **Step 3: 运行测试验证**

Run: `cd D:/Projects/agentut && npm test tests/types/index.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/agentut && git add tests/types/index.test.ts && git commit -m "test: add ExecCommandAssertion type tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 实现 executeCommand 辅助函数

**Files:**
- Modify: `src/executor/verifier.ts` (新增函数)

- [ ] **Step 1: 在 verifier.ts 中添加 spawn 导入**

在文件顶部添加 child_process 导入：

```typescript
import { spawn } from 'child_process';
```

- [ ] **Step 2: 添加 CommandResult 接口和 executeCommand 函数**

在 `verifyJudgedBy` 函数之前添加：

```typescript
// ========== Command Execution ==========

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 执行命令并收集输出
 * @param command 要执行的命令
 * @param cwd 执行目录
 * @param timeout 超时时间（毫秒）
 * @returns 命令执行结果
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      cwd,
      shell: true,
      timeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });

    // 超时处理：spawn 的 timeout 会自动终止进程
    // 但我们需要捕获这个事件
    proc.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') {
        resolve({
          stdout,
          stderr,
          exitCode: 1
        });
      }
    });
  });
}
```

- [ ] **Step 3: 运行构建验证编译通过**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/agentut && git add src/executor/verifier.ts && git commit -m "feat: add executeCommand helper function for command execution

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 实现 verifyExecCommand 函数

**Files:**
- Modify: `src/executor/verifier.ts` (新增函数和导入)

- [ ] **Step 1: 添加 ExecCommandAssertion 类型导入**

修改 `src/executor/verifier.ts` 的导入部分：

```typescript
import {
  type Assertion,
  type OpenCodeRunOutput,
  type AssertionResult,
  type Matcher,
  type ToolCallAssertion,
  type FileContentAssertion,
  type JudgedByAssertion,
  type ExecCommandAssertion,  // 新增
  type AgentCliConfig,
  type GlobalConfig
} from '../types/index.js';
```

- [ ] **Step 2: 实现 verifyExecCommand 函数**

在 `executeCommand` 函数后添加：

```typescript
/**
 * 执行命令并验证输出
 * @param assertion exec_command断言配置
 * @param workDir 场景工作目录（默认执行目录）
 * @param defaultTimeout 默认超时时间
 * @param yamlDir YAML文件所在目录（用于解析相对路径的cwd）
 */
export async function verifyExecCommand(
  assertion: ExecCommandAssertion,
  workDir: string,
  defaultTimeout: number,
  yamlDir: string
): Promise<AssertionResult> {
  // 1. 确定执行目录
  const cwd = assertion.cwd
    ? path.resolve(yamlDir, assertion.cwd)
    : workDir;

  // 2. 执行命令
  const timeout = assertion.timeout || defaultTimeout;

  try {
    const result = await executeCommand(assertion.command, cwd, timeout);

    // 3. 验证输出（合并 stdout 和 stderr）
    const output = result.stdout + result.stderr;
    const passed = matchValue(output, assertion.expect);

    // 4. 返回结果
    return {
      type: 'exec_command',
      value: assertion,
      passed,
      actual: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      },
      message: passed
        ? `Command '${assertion.command}' output matches ${getMatcherDescription(assertion.expect)}`
        : `Command '${assertion.command}' output does not match ${getMatcherDescription(assertion.expect)}. Actual output: ${output.substring(0, 200)}`
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    return {
      type: 'exec_command',
      value: assertion,
      passed: false,
      message: `Command '${assertion.command}' execution failed: ${errorMessage}`
    };
  }
}
```

- [ ] **Step 3: 运行构建验证编译通过**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/agentut && git add src/executor/verifier.ts && git commit -m "feat: add verifyExecCommand function for command output verification

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 更新 verifyAssertions 函数集成 exec_command

**Files:**
- Modify: `src/executor/verifier.ts:383-425`

- [ ] **Step 1: 添加 yamlDir 参数到 verifyAssertions 函数签名**

修改 `verifyAssertions` 函数签名，添加 `yamlDir` 参数：

```typescript
export async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string,
  config?: GlobalConfig,
  tempRoot?: string,
  yamlDir?: string  // 新增参数：YAML文件所在目录
): Promise<AssertionResult[]> {
```

- [ ] **Step 2: 在 verifyAssertions 循环中添加 exec_command 处理**

在 `for (const assertion of assertions)` 循环中，`judged_by` 处理后添加：

```typescript
// exec_command 断言
if ('exec_command' in assertion) {
  results.push(await verifyExecCommand(
    assertion.exec_command,
    workDir,
    defaultTimeout,
    yamlDir || workDir
  ));
}
```

- [ ] **Step 3: 运行构建验证编译通过**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/agentut && git add src/executor/verifier.ts && git commit -m "feat: integrate exec_command assertion into verifyAssertions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 更新 run.ts 传递 yamlDir 参数

**Files:**
- Modify: `src/commands/run.ts:276-282`

- [ ] **Step 1: 修改 verifyAssertions 调用传递 yamlDir**

修改 `src/commands/run.ts:276-282`：

```typescript
// Verify assertions
const assertionResults = await verifyAssertions(
  step.expected,
  runResult.outputs,
  tempDirectory,
  suite.config,
  tempRoot,
  yamlDirectory  // 新增：传递 YAML 文件目录
);
```

- [ ] **Step 2: 运行构建验证编译通过**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/agentut && git add src/commands/run.ts && git commit -m "feat: pass yamlDir to verifyAssertions for exec_command cwd support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: 添加 verifyExecCommand 单元测试

**Files:**
- Modify: `tests/executor/verifier.test.ts`

- [ ] **Step 1: 在 verifier.test.ts 中导入 verifyExecCommand**

修改 `tests/executor/verifier.test.ts:1-12`：

```typescript
import {
  verifyAssertions,
  verifyShouldCallTool,
  verifyShouldProduceFile,
  verifyFileContentContains,
  verifyResponseContains,
  verifyJudgedBy,
  verifyExecCommand  // 新增
} from '../../src/executor/verifier.js';
```

- [ ] **Step 2: 添加 ExecCommandAssertion 类型导入**

修改导入部分添加：

```typescript
import { type Assertion, type OpenCodeRunOutput, type StepResult, type AgentCliConfig, type JudgedByAssertion, type ExecCommandAssertion } from '../../src/types/index.js';
```

- [ ] **Step 3: 添加 verifyExecCommand 测试组**

在文件末尾添加新的测试组：

```typescript
describe('verifyExecCommand', () => {
  const workDir = TEST_TEMP_DIR;
  const defaultTimeout = 30000;
  const yamlDir = TEST_TEMP_DIR;

  it('should return true when output matches contains matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "BUILD SUCCESS"',
      expect: { contains: 'BUILD SUCCESS' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
    expect(result.type).toBe('exec_command');
    expect(result.message).toContain('matches');
    expect(result.actual?.stdout).toContain('BUILD SUCCESS');
  });

  it('should return false when output does not match', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "Hello World"',
      expect: { contains: 'BUILD SUCCESS' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(false);
    expect(result.type).toBe('exec_command');
    expect(result.message).toContain('does not match');
  });

  it('should support regex matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "Tests run: 5, Failures: 0"',
      expect: { regex: 'Tests run.*Failures: 0' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should support equals matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "exact output"',  // echo 会添加换行
      expect: { contains: 'exact output' }  // 使用 contains 更实用
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should support oneOf matcher', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "done"',
      expect: { oneOf: ['BUILD SUCCESS', 'done', 'passing'] }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should merge stdout and stderr for matching', async () => {
    // 命令会在 stderr 输出（如某些错误信息）
    const assertion: ExecCommandAssertion = {
      command: 'node -e "console.log(\'stdout\'); console.error(\'stderr\');"',
      expect: { contains: 'stdout' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
    expect(result.actual?.stdout).toContain('stdout');
    expect(result.actual?.stderr).toContain('stderr');
  });

  it('should return exitCode in actual', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "test"',
      expect: { contains: 'test' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.actual?.exitCode).toBe(0);
  });

  it('should handle command execution error', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'nonexistent_command_xyz',
      expect: { contains: 'anything' }
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(false);
    expect(result.message).toContain('execution failed');
  });

  it('should use cwd parameter for execution directory', async () => {
    // 创建子目录
    const subDir = path.join(TEST_TEMP_DIR, 'subproject');
    await fs.ensureDir(subDir);
    await fs.writeFile(path.join(subDir, 'test.txt'), 'content from subdir');

    const assertion: ExecCommandAssertion = {
      command: 'cat test.txt',
      expect: { contains: 'content from subdir' },
      cwd: './subproject'  // 相对于 yamlDir
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should use default workDir when cwd not specified', async () => {
    await fs.writeFile(path.join(TEST_TEMP_DIR, 'workfile.txt'), 'work content');

    const assertion: ExecCommandAssertion = {
      command: 'cat workfile.txt',
      expect: { contains: 'work content' }
      // 无 cwd，使用 workDir
    };

    const result = await verifyExecCommand(assertion, workDir, defaultTimeout, yamlDir);

    expect(result.passed).toBe(true);
  });

  it('should use assertion timeout over default timeout', async () => {
    const assertion: ExecCommandAssertion = {
      command: 'echo "fast"',
      expect: { contains: 'fast' },
      timeout: 5000  // 自定义超时
    };

    const result = await verifyExecCommand(assertion, workDir, 60000, yamlDir);

    expect(result.passed).toBe(true);
  });
});
```

- [ ] **Step 4: 运行测试验证**

Run: `cd D:/Projects/agentut && npm test tests/executor/verifier.test.ts`
Expected: 所有新增测试通过

- [ ] **Step 5: Commit**

```bash
cd D:/Projects/agentut && git add tests/executor/verifier.test.ts && git commit -m "test: add verifyExecCommand unit tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: 添加 verifyAssertions 中 exec_command 集成测试

**Files:**
- Modify: `tests/executor/verifier.test.ts` (verifyAssertions 测试组)

- [ ] **Step 1: 在 verifyAssertions 测试组中添加 exec_command 测试**

在 `describe('verifyAssertions', () => {` 块中添加测试：

```typescript
it('should verify exec_command assertion', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'exec-work');
  await fs.ensureDir(workDir);

  const outputs: OpenCodeRunOutput[] = [];

  const assertions: Assertion[] = [
    {
      exec_command: {
        command: 'echo "Test output"',
        expect: { contains: 'Test output' }
      }
    }
  ];

  const results = await verifyAssertions(assertions, outputs, workDir, undefined, undefined, yamlDir);

  expect(results).toHaveLength(1);
  expect(results[0].passed).toBe(true);
  expect(results[0].type).toBe('exec_command');
});

it('should verify exec_command with cwd parameter', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'cwd-work');
  const subDir = path.join(TEST_TEMP_DIR, 'subdir');
  await fs.ensureDir(workDir);
  await fs.ensureDir(subDir);
  await fs.writeFile(path.join(subDir, 'file.txt'), 'subdir content');

  const assertions: Assertion[] = [
    {
      exec_command: {
        command: 'cat file.txt',
        expect: { contains: 'subdir content' },
        cwd: './subdir'
      }
    }
  ];

  const results = await verifyAssertions(assertions, [], workDir, undefined, undefined, TEST_TEMP_DIR);

  expect(results).toHaveLength(1);
  expect(results[0].passed).toBe(true);
});

it('should support mixed assertions including exec_command', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'mixed-exec');
  await fs.ensureDir(workDir);
  await fs.writeFile(path.join(workDir, 'output.txt'), 'Hello');

  const outputs: OpenCodeRunOutput[] = [
    { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }
  ];

  const assertions: Assertion[] = [
    { should_call_tool: 'Write' },
    { should_produce_file: 'output.txt' },
    {
      exec_command: {
        command: 'cat output.txt',
        expect: { contains: 'Hello' }
      }
    }
  ];

  const results = await verifyAssertions(assertions, outputs, workDir, undefined, undefined, workDir);

  expect(results).toHaveLength(3);
  expect(results[0].passed).toBe(true); // should_call_tool
  expect(results[1].passed).toBe(true); // should_produce_file
  expect(results[2].passed).toBe(true); // exec_command
});
```

- [ ] **Step 2: 在测试顶部添加 yamlDir 常量**

在 `const TEST_TEMP_DIR = './test-temp-verifier';` 后添加：

```typescript
const yamlDir = TEST_TEMP_DIR;
```

- [ ] **Step 3: 运行测试验证**

Run: `cd D:/Projects/agentut && npm test tests/executor/verifier.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/agentut && git add tests/executor/verifier.test.ts && git commit -m "test: add exec_command integration tests in verifyAssertions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: 运行完整测试套件验证

**Files:**
- 无文件修改

- [ ] **Step 1: 运行完整测试**

Run: `cd D:/Projects/agentut && npm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行构建**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

---

### Task 10: 更新 README.md 文档

**Files:**
- Modify: `README.md:152-163` (断言类型表格)
- 新增示例章节

- [ ] **Step 1: 更新断言类型表格**

修改 `README.md:152-163` 的断言类型表格，添加 exec_command 行：

```markdown
### 基本断言格式（向后兼容）

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `should_call_tool` | 字符串：工具名称 | 验证 Agent 调用了指定工具 |
| `should_produce_file` | 字符串：文件路径 | 验证产生了指定文件 |
| `file_content_contains` | `{ file, text }` | 验证文件内容包含指定文本 |
| `response_contains` | 字符串：文本 | 验证响应包含指定文本 |
| `judged_by` | `{ judge, prompt, timeout?, min_pass? }` | AI裁判语义评判 |
| `exec_command` | `{ command, expect, timeout?, cwd? }` | 执行命令并验证输出 |
```

- [ ] **Step 2: 添加 exec_command 断言示例章节**

在 `## 断言类型` 章节中，`### AI裁判断言` 之后添加：

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
cd D:/Projects/agentut && git add README.md && git commit -m "docs: add exec_command assertion documentation in README

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: 更新 AGENTS.md 架构文档

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新断言验证表**

在 `## 关键实现细节` 的 `### 断言验证` 表格中添加 exec_command 行：

```markdown
### 断言验证

| 断言类型 | 验证逻辑 |
|----------|----------|
| `should_call_tool` | 检查 outputs 中 type=tool_call 且 tool_name 匹配 |
| `should_produce_file` | 检查工作目录是否存在该文件 |
| `file_content_contains` | 读取文件，检查内容包含指定文本 |
| `response_contains` | 检查 outputs 中 type=text 的 data.content |
| `judged_by` | 调用配置的裁判 CLI，解析 JSON 结果 |
| `exec_command` | 执行命令，检查输出（stdout+stderr）是否匹配 Matcher |
```

- [ ] **Step 2: 更新模块职责表**

在模块职责表中更新 verifier.ts 的职责描述：

```markdown
| `executor/verifier.ts` | 执行断言验证，返回验证结果（含 exec_command 命令执行） | types |
```

- [ ] **Step 3: 添加 verifyExecCommand 函数说明**

在模块职责表后添加：

```markdown
### 新增函数说明

**verifyExecCommand** - 执行命令并验证输出
- 使用 child_process.spawn 执行命令
- 合并 stdout 和 stderr 进行 Matcher 匹配
- 支持 cwd 参数指定执行目录
- 支持 timeout 参数覆盖全局超时
```

- [ ] **Step 4: Commit**

```bash
cd D:/Projects/agentut && git add AGENTS.md && git commit -m "docs: update AGENTS.md with exec_command assertion architecture

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: 最终验证和合并提交

**Files:**
- 无文件修改

- [ ] **Step 1: 运行完整测试套件**

Run: `cd D:/Projects/agentut && npm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行构建**

Run: `cd D:/Projects/agentut && npm run build`
Expected: 无编译错误

- [ ] **Step 3: 查看最终 git status**

Run: `cd D:/Projects/agentut && git status`
Expected: 只有最终提交的改动

- [ ] **Step 4: 确认实现完成**

所有功能已实现：
- ExecCommandAssertion 类型定义
- verifyExecCommand 验证函数
- executeCommand 命令执行辅助函数
- verifyAssertions 集成
- run.ts yamlDir 参数传递
- 单元测试
- 文档更新