---
name: exec-command-assertion
description: 新增命令执行断言类型，支持配置命令并对输出内容进行Matcher模式匹配
type: project
---

# exec_command 断言类型设计

## 背景

Agent UT 测试框架当前支持 5 种断言类型：
- `should_call_tool` - 验证工具调用
- `should_produce_file` - 验证文件产生
- `file_content_contains` - 验证文件内容
- `response_contains` - 验证响应内容
- `judged_by` - AI裁判断言

用户需要一种新的断言类型，用于执行外部命令并验证命令输出内容，适用于：
- Java 编译验证（javac 命令）
- 单元测试验证（mvn test、npm test）
- 构建验证（gradle build、make）
- 其他需要通过命令执行结果判断成功/失败的场景

## 设计目标

1. 支持配置任意命令执行
2. 使用 Matcher 模式验证输出内容（equals/contains/regex/oneOf）
3. 支持超时配置（复用全局 default_timeout，允许覆盖）
4. 支持执行目录配置（默认场景工作目录，允许指定）
5. 支持概率测试（min_pass）

## 配置格式

```yaml
expected:
  - exec_command:
      command: "mvn test"               # 必填：要执行的命令
      expect: { contains: "BUILD SUCCESS" }  # 必填：Matcher 模式匹配输出
      timeout: 300000                   # 可选：超时覆盖
      cwd: "./subproject"               # 可选：执行目录
      min_pass: 4                       # 可选：概率测试支持
```

### 字段说明

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `command` | string | 是 | - | 要执行的命令 |
| `expect` | Matcher | 是 | - | 输出匹配条件，支持 equals/contains/regex/oneOf |
| `timeout` | number | 否 | global.default_timeout | 命令执行超时（毫秒） |
| `cwd` | string | 否 | 场景工作目录 | 执行目录，相对路径基于 YAML 文件 |

### Matcher 模式

复用现有 Matcher 类型，与 `response_contains` 等断言保持一致：

| Matcher 字段 | 匹配方式 | 示例 |
|-------------|---------|------|
| `equals` | 精确匹配 | `{ equals: "BUILD SUCCESS" }` |
| `contains` | 包含匹配 | `{ contains: "BUILD SUCCESS" }` |
| `regex` | 正则表达式匹配 | `{ regex: ".*SUCCESS.*" }` |
| `oneOf` | 候选值匹配 | `{ oneOf: ["BUILD SUCCESS", "Tests run: 5"] }` |

## 使用示例

### Java 编译验证

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

### Maven 单元测试验证

```yaml
steps:
  - input: "创建一个带有单元测试的项目"
    expected:
      - exec_command:
          command: "mvn test"
          expect: { contains: "BUILD SUCCESS" }
          timeout: 300000
```

### 指定子目录执行

```yaml
steps:
  - input: "在 src 目录下创建代码"
    expected:
      - exec_command:
          command: "npm test"
          cwd: "./src"
          expect: { regex: ".*passing.*" }
```

### 多种成功模式匹配

```yaml
expected:
  - exec_command:
      command: "gradle build"
      expect: { oneOf: ["BUILD SUCCESSFUL", "build completed"] }
```

## 类型定义

### ExecCommandAssertion

在 `src/types/index.ts` 中新增：

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

### Assertion 类型扩展

```typescript
export type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher }
  | { judged_by: JudgedByAssertion }
  | { exec_command: ExecCommandAssertion };  // 新增
```

### AssertionResult 扩展

在 `AssertionResult.actual` 中新增字段：

```typescript
actual?: {
  // 现有字段...
  stdout?: string;      // 命令标准输出
  stderr?: string;      // 命令错误输出
  exitCode?: number;    // 命令退出码
};
```

## 验证逻辑

### verifyExecCommand 函数

在 `src/executor/verifier.ts` 中新增：

```typescript
/**
 * 执行命令并验证输出
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
      : `Command '${assertion.command}' output does not match. Actual: ${output.substring(0, 200)}`
  };
}
```

### executeCommand 辅助函数

```typescript
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function executeCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<CommandResult> {
  // 使用 child_process.spawn 执行命令
  // 设置超时，超时后终止进程
  // 返回 stdout、stderr 和 exitCode
}
```

### verifyAssertions 更新

```typescript
export async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string,
  config?: GlobalConfig,
  tempRoot?: string,
  yamlDir?: string  // 新增参数
): Promise<AssertionResult[]> {
  // ...
  for (const assertion of assertions) {
    // 现有断言处理...

    if ('exec_command' in assertion) {
      results.push(await verifyExecCommand(
        assertion.exec_command,
        workDir,
        defaultTimeout,
        yamlDir || workDir
      ));
    }
  }
  return results;
}
```

## 调用链修改

需要在调用链中传递 YAML 文件目录路径：

### commands/run.ts

```typescript
const yamlDir = path.dirname(testFile);
const assertionResults = await verifyAssertions(
  step.expected,
  outputs,
  workDir,
  testSuite.config,
  tempRoot,
  yamlDir
);
```

## 文档更新

### README.md

在断言类型表格新增：

| 断言类型 | 参数格式 | 验证内容 |
|----------|----------|----------|
| `exec_command` | `{ command, expect, timeout?, cwd? }` | 执行命令并验证输出 |

添加使用示例章节。

### AGENTS.md

更新模块职责表、依赖关系图、断言验证表。

## 实现影响范围

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/types/index.ts` | 新增类型 | ExecCommandAssertion、Assertion 扩展 |
| `src/executor/verifier.ts` | 新增函数 | verifyExecCommand、executeCommand |
| `src/executor/verifier.ts` | 修改函数 | verifyAssertions 参数扩展 |
| `src/commands/run.ts` | 修改调用 | 传递 yamlDir 参数 |
| `README.md` | 文档更新 | 断言类型说明和示例 |
| `AGENTS.md` | 文档更新 | 架构文档 |

## 测试策略

1. **单元测试**：verifyExecCommand 函数测试
   - 正常命令执行（输出匹配成功）
   - 输出不匹配（断言失败）
   - 超时处理（命令超时终止）
   - 执行目录指定（cwd 配置）
   - Matcher 各种模式验证

2. **集成测试**：完整测试用例验证
   - 创建示例 YAML 测试用例
   - 包含 exec_command 断言
   - 运行验证整体流程

## 设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 断言名称 | `exec_command` | 语义清晰，强调执行命令并验证结果 |
| 输出匹配方式 | Matcher 模式 | 复用现有设计，保持一致性 |
| 输出合并方式 | stdout + stderr | 大多数场景需要整体输出验证 |
| 执行目录默认值 | 场景工作目录 | Agent 产生的文件在工作目录，便于后续验证 |
| cwd 解析基准 | YAML 文件目录 | 与 setup.copy 的路径解析逻辑一致 |
| 不支持简写格式 | 完整配置格式 | expect 字段是必填的，简写语义不明确 |