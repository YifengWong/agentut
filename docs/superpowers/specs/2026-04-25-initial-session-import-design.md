---
name: initial-session-import
description: 场景级配置参数，支持导入初始 session 文件
type: project
---

# initial_session 功能设计

## 背景

`opencode run` 命令支持 `--session` 参数指定已有会话 ID 继续对话。本功能新增场景级配置参数 `initial_session`，允许用户指定一个 session 文件，在场景启动前导入该 session，获得 session ID，使后续 step 步骤基于该对话继续工作。

## 功能目的

- **延续对话上下文** — 让测试场景能够基于已有的对话历史继续
- **复用已完成的工作** — 避免重复执行已有的准备步骤
- **调试/测试特定场景** — 从某个特定的对话状态开始测试

## 设计细节

### 1. 类型定义扩展

#### ScenarioConfig 新增字段

文件：`src/types/index.ts`

```typescript
export interface ScenarioConfig {
  name: string;
  environment: string;
  cleanup: boolean;
  steps: StepConfig[];
  runs?: number;
  min_pass?: number;
  initial_session?: string;  // 新增：session 文件路径（相对于 YAML 文件所在目录）
}
```

#### AgentRunner 接口新增方法

文件：`src/runner/types.ts`

```typescript
export interface AgentRunner {
  readonly runnerType: string;
  run(options: RunOptions): RunResult;
  exportSession(sessionId: string): Promise<ExportedSession>;
  listSessions(): Promise<SessionInfo[]>;
  importSession(sessionFile: string): Promise<string>;  // 新增：导入 session 文件，返回 session ID
}
```

### 2. OpenCodeRunner 实现

文件：`src/runner/opencode.ts`

新增 `importSession` 方法：

```typescript
/**
 * 导入会话文件
 *
 * @param sessionFile - session 文件的绝对路径
 * @returns 导入后的 session ID
 * @throws ExecutionError 当导入失败时
 */
async importSession(sessionFile: string): Promise<string> {
  const fullCommand = `${this.command} import "${sessionFile}"`;

  try {
    const output = execSync(fullCommand, {
      encoding: 'utf-8',
      timeout: 30000
    });

    // opencode import 输出格式: "Imported session: xxx"
    const match = output.trim().match(/Imported session:\s*(\S+)/);
    if (!match) {
      throw new ExecutionError(
        `Failed to parse session ID from import output: ${output}`,
        fullCommand
      );
    }
    return match[1];
  } catch (error) {
    if (error instanceof Error) {
      throw new ExecutionError(
        `Failed to import session from ${sessionFile}: ${error.message}`,
        fullCommand
      );
    }
    throw new ExecutionError(`Failed to import session from ${sessionFile}`, fullCommand);
  }
}
```

**说明：**
- 方法接收 session 文件的**绝对路径**
- 使用 `opencode import` 命令导入
- 输出格式为 `Imported session: xxx`，提取其中的 session ID
- 超时设为 30 秒，与 `exportSession` 保持一致

### 3. 其他 Runner 实现

对于不支持 session 导入的 runner，实现时抛出明确错误：

```typescript
async importSession(sessionFile: string): Promise<string> {
  throw new ExecutionError(
    `Session import is not supported by ${this.runnerType} runner`,
    ''
  );
}
```

### 4. 场景执行流程修改

文件：`src/commands/run.ts`

在 `executeScenario` 函数中，环境准备完成后增加 session 导入逻辑：

```typescript
// 为每次运行准备独立环境
const scenarioNameForRun = isTraditionalSingleRun ? scenario.name : `${scenario.name}-run${runIndex}`;
const envResult = await prepareEnvironment(envConfig, scenarioNameForRun, tempRoot, {
  yamlDirectory
});
tempDirectory = envResult.tempDirectory;

// 新增：导入 initial_session（如果有）
let sessionId: string | undefined;
if (scenario.initial_session) {
  const sessionFilePath = path.resolve(yamlDirectory, scenario.initial_session);
  if (!await fs.pathExists(sessionFilePath)) {
    throw new ExecutionError(
      `Session file not found: ${scenario.initial_session}`,
      sessionFilePath
    );
  }
  logger.importSession(scenario.initial_session);
  sessionId = await runner.importSession(sessionFilePath);
}

// Execute steps
...
```

**流程说明：**
- 路径解析：使用 `path.resolve(yamlDirectory, scenario.initial_session)`，相对于 YAML 文件所在目录
- 导入时机：环境准备完成后、steps 执行前
- 文件存在性检查：导入前验证文件是否存在
- 如果配置了 `initial_session`，导入后 `sessionId` 就有值，第一个 step 执行时会继续该对话
- 如果没有配置，`sessionId` 为 `undefined`，第一个 step 会创建新 session（保持现有行为）

### 5. 日志输出

文件：`src/output/logger.ts`

新增日志方法：

```typescript
importSession(sessionFile: string): void {
  console.log(`  Importing session: ${sessionFile}`);
}
```

### 6. YAML 解析验证

文件：`src/parser/yaml.ts`

在 `validateScenario` 函数中新增验证：

```typescript
// 验证 initial_session（可选）
if (scenario.initial_session !== undefined) {
  if (typeof scenario.initial_session !== 'string') {
    throw new ValidationError(
      `Scenario '${scenario.name}' at index ${index}: initial_session must be a string`,
      'initial_session'
    );
  }
  if (scenario.initial_session.trim() === '') {
    throw new ValidationError(
      `Scenario '${scenario.name}' at index ${index}: initial_session cannot be empty`,
      'initial_session'
    );
  }
}
```

**验证规则：**
- `initial_session` 是可选字段
- 如果存在，必须是字符串类型
- 不能为空字符串
- 不需要验证路径是否存在（执行时检查）

### 7. 文档说明

新增 `initial_session` 使用文档：

```markdown
### initial_session - 导入初始会话

场景级配置，指定一个 session 文件路径，在场景执行前导入该 session。

**用途：**
- 延续已有对话上下文，无需从零开始
- 复用已完成的环境准备工作
- 从特定对话状态开始测试

**配置示例：**
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

**注意事项：**
- 路径相对于 YAML 文件所在目录
- 推荐将 session 文件存放于 `.agentut/sessions/` 目录下
- session 文件需符合 opencode export 格式

**session 文件获取方式：**
```bash
# 导出已有 session
opencode export ses_xxx > .agentut/sessions/base-session.json
```
```

## 配置位置

- **场景级 (`scenarios[].initial_session`)** — 每个场景可以指定自己的 session 文件

## 路径解析规则

- 相对于 YAML 文件所在目录
- 推荐存放于 `.agentut/` 目录下

## 执行顺序

session 导入与环境准备是**独立流程**：
- 环境准备完成后，再导入 session（如果配置了 `initial_session`）
- session 导入只影响后续 steps 的起始对话，不影响环境准备

## 实现影响范围

| 文件 | 改动内容 |
|------|---------|
| `src/types/index.ts` | `ScenarioConfig` 新增 `initial_session` 字段 |
| `src/runner/types.ts` | `AgentRunner` 接口新增 `importSession` 方法 |
| `src/runner/opencode.ts` | 实现 `importSession` 方法 |
| `src/runner/claude.ts` | 实现 `importSession` 方法（抛出不支持错误） |
| `src/runner/gemini.ts` | 实现 `importSession` 方法（抛出不支持错误） |
| `src/commands/run.ts` | 执行流程中增加 session 导入逻辑 |
| `src/output/logger.ts` | 新增 `importSession` 日志方法 |
| `src/parser/yaml.ts` | 新增 `initial_session` 字段验证 |