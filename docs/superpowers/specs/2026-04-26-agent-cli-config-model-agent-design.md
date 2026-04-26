# AgentCliConfig Model/Agent 配置扩展设计

## 概述

在 `AgentCliConfig` 中增加 `model` 和 `agent` 可选字段，允许 YAML 配置默认值，CLI 参数 `--model` 和 `--agent` 可覆盖。

## 需求背景

- 当前 `opencode run` 命令支持 `--model` 和 `--agent` CLI 参数
- 但 YAML 配置文件无法设置默认值，每次运行都需要手动指定
- model 值常包含 `/` 或 `.` 字符（如 `anthropic/claude-3.5-sonnet`），需确保命令行正确传递

## 设计方案

### 1. 类型定义变更

**文件**: `src/types/index.ts`

扩展 `AgentCliConfig` 接口：

```typescript
export interface AgentCliConfig {
  runner: 'opencode' | 'claude' | 'gemini';
  command: string;
  model?: string;   // 新增：默认 model
  agent?: string;   // 新增：默认 agent
}
```

### 2. YAML 配置示例

```yaml
config:
  agent_cli:
    runner: opencode
    command: opencode
    model: anthropic/claude-3.5-sonnet
    agent: my-custom-agent
  judges:
    strict-judge:
      runner: opencode
      command: opencode
      model: openai/gpt-4o         # AI裁判使用的model
      agent: judge-agent           # AI裁判使用的agent
```

### 3. 优先级逻辑

**Model 优先级**：
1. CLI 参数 `--model`
2. YAML `config.agent_cli.model`
3. YAML `config.target.model`（已废弃，向后兼容）

**Agent 优先级**：
1. CLI 参数 `--agent`
2. Environment 配置 `agent` 字段
3. 从 `setup.copy` 推导（复制到 `.opencode/agents`）
4. YAML `config.agent_cli.agent`
5. YAML `config.target.agent`（已废弃）

### 4. 代码变更

#### 4.1 `src/commands/run.ts`

在 `executeScenario` 函数中调整获取逻辑：

```typescript
// Model: CLI > agent_cli.model > target.model
const model = options?.model 
  || suite.config?.agent_cli?.model 
  || suite.config?.target?.model;

// Agent: 保持现有优先级，在推导逻辑后添加 agent_cli.agent
if (!agent && suite.config?.agent_cli?.agent) {
  agent = suite.config.agent_cli.agent;
}
if (!agent && suite.config?.target?.agent) {
  agent = suite.config.target.agent;
}
```

#### 4.2 `src/runner/opencode.ts`

为 model 和 agent 参数添加引号：

```typescript
if (options.model) {
  args.push(`--model "${options.model}"`);
}

if (options.agent) {
  args.push(`--agent "${options.agent}"`);
}
```

#### 4.3 `src/executor/verifier.ts`

在 `verifyJudgedBy` 函数中，将 judge 配置的 model/agent 传递给 runner：

```typescript
// 当前实现（verifier.ts:544-548）
const result = runner.run({
  input: combinedPrompt,
  directory: judgeDir,
  timeout
});

// 变更后
const result = runner.run({
  input: combinedPrompt,
  directory: judgeDir,
  timeout,
  model: judgeConfig.model,    // 传递 judge 的 model
  agent: judgeConfig.agent     // 传递 judge 的 agent
});
```

**说明**：judge 配置使用 `AgentCliConfig` 类型，扩展后自动支持 model/agent 字段。

### 5. 无需变更的部分

- `src/parser/yaml.ts`：无需新增验证，可选字段自动解析
- `src/runner/types.ts`：`RunOptions` 已有 `model` 和 `agent` 字段
- `src/cli.ts`：CLI 参数定义已存在

## 影响范围

| 文件 | 变更类型 |
|------|---------|
| `src/types/index.ts` | 扩展接口 |
| `src/commands/run.ts` | 修改优先级逻辑 |
| `src/runner/opencode.ts` | 添加引号处理 |
| `src/executor/verifier.ts` | 传递 judge 的 model/agent |
| `AGENTS.md` | 文档更新 |

## 测试要点

1. YAML 配置 model/agent，无 CLI 参数时生效
2. CLI 参数覆盖 YAML 配置
3. model 值含 `/` 和 `.` 字符时正确传递
4. 向后兼容：不配置时行为不变
5. `config.target` 废弃字段仍生效（向后兼容）
6. AI Judge 配置 model/agent 后，裁判执行时使用指定配置