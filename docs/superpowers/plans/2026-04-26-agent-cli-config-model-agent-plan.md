# AgentCliConfig Model/Agent 配置扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AgentCliConfig 中增加 model 和 agent 可选字段，支持 YAML 配置默认值，CLI 参数可覆盖，同时支持 AI Judge 配置。

**Architecture:** 扩展 AgentCliConfig 接口添加可选字段，修改优先级逻辑实现 CLI > YAML 配置的覆盖机制，为命令行参数添加引号处理特殊字符，在 verifier.ts 中传递 judge 配置的 model/agent。

**Tech Stack:** TypeScript, Vitest, Node.js

---

## 文件结构

| 文件 | 职责 | 变更类型 |
|------|------|---------|
| `src/types/index.ts` | AgentCliConfig 类型定义 | 扩展接口 |
| `tests/types/index.test.ts` | 类型测试 | 新增测试 |
| `src/commands/run.ts:136-165` | model/agent 获取优先级 | 修改逻辑 |
| `src/runner/opencode.ts:68-75` | 命令行参数构建 | 添加引号 |
| `tests/runner/opencode.test.ts` | runner 测试 | 新增测试 |
| `src/executor/verifier.ts:544-548` | judge 参数传递 | 添加参数 |
| `tests/executor/verifier.test.ts` | verifier 测试 | 新增测试 |
| `AGENTS.md` | 架构文档 | 更新文档 |

---

### Task 1: 扩展 AgentCliConfig 类型定义

**Files:**
- Modify: `src/types/index.ts:96-99`
- Test: `tests/types/index.test.ts:127-151`

- [ ] **Step 1: Write the failing test**

在 `tests/types/index.test.ts` 的 `AgentCliConfig type` describe block 中添加测试：

```typescript
  it('should allow optional model field', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      model: 'anthropic/claude-3.5-sonnet'
    };
    expect(config.model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('should allow optional agent field', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      agent: 'my-custom-agent'
    };
    expect(config.agent).toBe('my-custom-agent');
  });

  it('should allow both model and agent fields', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      model: 'openai/gpt-4o',
      agent: 'judge-agent'
    };
    expect(config.model).toBe('openai/gpt-4o');
    expect(config.agent).toBe('judge-agent');
  });

  it('should allow model with special characters (slash and dot)', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode',
      model: 'anthropic/claude-3.5-sonnet-20240620'
    };
    expect(config.model).toContain('/');
    expect(config.model).toContain('.');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/types/index.test.ts`
Expected: TypeScript 编译错误或类型检查失败

- [ ] **Step 3: Write minimal implementation**

在 `src/types/index.ts:96-99` 修改 AgentCliConfig 接口：

```typescript
export interface AgentCliConfig {
  runner: 'opencode' | 'claude' | 'gemini';  // Agent 类型
  command: string;                           // 实际执行的 CLI 命令名
  model?: string;   // 可选：默认 model（如 "anthropic/claude-3.5-sonnet"）
  agent?: string;   // 可选：默认 agent 名称
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "feat: extend AgentCliConfig with optional model and agent fields"
```

---

### Task 2: 修改 run.ts 优先级逻辑 - Model

**Files:**
- Modify: `src/commands/run.ts:136`
- Test: `tests/commands/run.test.ts`

- [ ] **Step 1: Write the failing test**

查看现有 run.test.ts 了解测试模式，需要新增优先级测试。由于 run.ts 直接调用 runner，测试需要 mock runner 和 YAML 解析。先检查现有测试结构：

Run: `npm test tests/commands/run.test.ts -- --reporter=verbose`

查看测试后，确定测试策略。本任务先实现 model 优先级逻辑，下一任务处理 agent。

- [ ] **Step 2: Modify model priority logic**

在 `src/commands/run.ts:136` 修改 model 获取逻辑：

**当前代码:**
```typescript
// Get model from options or config (backwards compatibility)
const model = options?.model || suite.config?.target?.model;
```

**变更后:**
```typescript
// Get model with priority: CLI > agent_cli.model > target.model (deprecated)
const model = options?.model 
  || suite.config?.agent_cli?.model 
  || suite.config?.target?.model;
```

- [ ] **Step 3: Run tests to verify existing behavior preserved**

Run: `npm test tests/commands/run.test.ts`
Expected: 所有现有测试 PASS（向后兼容）

- [ ] **Step 4: Commit**

```bash
git add src/commands/run.ts
git commit -m "feat: add agent_cli.model to model priority chain"
```

---

### Task 3: 修改 run.ts 优先级逻辑 - Agent

**Files:**
- Modify: `src/commands/run.ts:146-165`
- Test: `tests/commands/run.test.ts`

- [ ] **Step 1: Modify agent priority logic**

在 `src/commands/run.ts:146-165` 的 agent 获取逻辑中添加 `agent_cli.agent` 来源：

**当前代码（约 146-165 行）:**
```typescript
  if (!agent && envConfig.agent) {
    agent = envConfig.agent;
  }

  if (!agent) {
    const agentCopy = envConfig.setup.find(a =>
      a.copy && a.copy.includes('->') &&
      a.copy.split('->')[1].trim().includes('.opencode/agents')
    );
    if (agentCopy) {
      const source = agentCopy.copy!.split('->')[0].trim();
      agent = path.basename(source, '.md');
    }
  }

  if (!agent && suite.config?.target?.agent) {
    agent = suite.config.target.agent;
  }
```

**变更后:**
```typescript
  if (!agent && envConfig.agent) {
    agent = envConfig.agent;
  }

  if (!agent) {
    const agentCopy = envConfig.setup.find(a =>
      a.copy && a.copy.includes('->') &&
      a.copy.split('->')[1].trim().includes('.opencode/agents')
    );
    if (agentCopy) {
      const source = agentCopy.copy!.split('->')[0].trim();
      agent = path.basename(source, '.md');
    }
  }

  // 新增：从 agent_cli.agent 获取
  if (!agent && suite.config?.agent_cli?.agent) {
    agent = suite.config.agent_cli.agent;
  }

  if (!agent && suite.config?.target?.agent) {
    agent = suite.config.target.agent;
  }
```

- [ ] **Step 2: Run tests to verify existing behavior preserved**

Run: `npm test tests/commands/run.test.ts`
Expected: PASS（向后兼容）

- [ ] **Step 3: Commit**

```bash
git add src/commands/run.ts
git commit -m "feat: add agent_cli.agent to agent priority chain"
```

---

### Task 4: 为 opencode.ts model/agent 参数添加引号

**Files:**
- Modify: `src/runner/opencode.ts:68-75`
- Test: `tests/runner/opencode.test.ts:142-168`

- [ ] **Step 1: Write the failing test**

在 `tests/runner/opencode.test.ts` 中添加测试：

```typescript
    it('should quote model value with special characters', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        model: 'anthropic/claude-3.5-sonnet'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--model "anthropic/claude-3.5-sonnet"'),
        expect.any(Object)
      );
    });

    it('should quote agent value', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        agent: 'my-agent'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--agent "my-agent"'),
        expect.any(Object)
      );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/runner/opencode.test.ts -- --grep "should quote"`
Expected: FAIL - 当前实现没有引号

- [ ] **Step 3: Write minimal implementation**

在 `src/runner/opencode.ts:68-75` 修改：

**当前代码:**
```typescript
    // Add optional model
    if (options.model) {
      args.push(`--model ${options.model}`);
    }

    // Add optional agent
    if (options.agent) {
      args.push(`--agent ${options.agent}`);
    }
```

**变更后:**
```typescript
    // Add optional model (quoted for special characters like / and .)
    if (options.model) {
      args.push(`--model "${options.model}"`);
    }

    // Add optional agent (quoted for safety)
    if (options.agent) {
      args.push(`--agent "${options.agent}"`);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/runner/opencode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/opencode.ts tests/runner/opencode.test.ts
git commit -m "fix: quote model/agent parameters for special character support"
```

---

### Task 5: 在 verifier.ts 中传递 judge 的 model/agent

**Files:**
- Modify: `src/executor/verifier.ts:544-548`
- Test: `tests/executor/verifier.test.ts`

- [ ] **Step 1: Write the failing test**

在 `tests/executor/verifier.test.ts` 的 `verifyJudgedBy` describe block 中添加：

```typescript
  it('should pass model from judge config to runner', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-model'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const judgesWithModel: Record<string, AgentCliConfig> = {
      'gpt-judge': {
        runner: 'opencode',
        command: 'opencode',
        model: 'openai/gpt-4o'
      }
    };

    const assertion: JudgedByAssertion = {
      judge: 'gpt-judge',
      prompt: 'Evaluate'
    };

    await verifyJudgedBy(
      [],
      assertion,
      judgesWithModel,
      defaultTimeout,
      tempRoot,
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-4o'
      })
    );
  });

  it('should pass agent from judge config to runner', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-agent'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const judgesWithAgent: Record<string, AgentCliConfig> = {
      'custom-judge': {
        runner: 'opencode',
        command: 'opencode',
        agent: 'reviewer-agent'
      }
    };

    const assertion: JudgedByAssertion = {
      judge: 'custom-judge',
      prompt: 'Review'
    };

    await verifyJudgedBy(
      [],
      assertion,
      judgesWithAgent,
      defaultTimeout,
      tempRoot,
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'reviewer-agent'
      })
    );
  });

  it('should pass both model and agent from judge config', async () => {
    const mockRunner = {
      runnerType: 'opencode',
      run: vi.fn().mockReturnValue({
        outputs: [
          { type: 'text', part: { text: '{"passed":true,"reason":"OK"}' } }
        ],
        sessionId: 'judge-session-both'
      }),
      exportSession: vi.fn(),
      listSessions: vi.fn()
    };

    vi.mocked(createRunner).mockReturnValue(mockRunner as any);

    const judgesWithBoth: Record<string, AgentCliConfig> = {
      'full-judge': {
        runner: 'opencode',
        command: 'opencode',
        model: 'anthropic/claude-3.5-sonnet',
        agent: 'strict-reviewer'
      }
    };

    const assertion: JudgedByAssertion = {
      judge: 'full-judge',
      prompt: 'Full review'
    };

    await verifyJudgedBy(
      [],
      assertion,
      judgesWithBoth,
      defaultTimeout,
      tempRoot,
      tempRoot
    );

    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-3.5-sonnet',
        agent: 'strict-reviewer'
      })
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/executor/verifier.test.ts -- --grep "should pass model from judge"`
Expected: FAIL - 当前未传递 model/agent

- [ ] **Step 3: Write minimal implementation**

在 `src/executor/verifier.ts:544-548` 修改 runner.run 调用：

**当前代码:**
```typescript
    const result = runner.run({
      input: combinedPrompt,
      directory: judgeDir,  // AI裁判运行在场景临时目录
      timeout
    });
```

**变更后:**
```typescript
    const result = runner.run({
      input: combinedPrompt,
      directory: judgeDir,  // AI裁判运行在场景临时目录
      timeout,
      model: judgeConfig.model,    // 传递 judge 配置的 model
      agent: judgeConfig.agent     // 传递 judge 配置的 agent
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/executor/verifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: pass judge config model/agent to runner in verifyJudgedBy"
```

---

### Task 6: 更新 AGENTS.md 文档

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AgentCliConfig documentation**

在 `AGENTS.md` 的 `## Agent CLI 配置` 部分（约 285-305 行），更新 `AgentCliConfig` 说明：

**当前内容:**
```markdown
### YAML 配置

```yaml
config:
  agent_cli:
    runner: opencode      # Agent 类型
    command: mycode       # 自定义命令名
```

验证层自动设置默认值 `{ runner: 'opencode', command: 'opencode' }`。
```

**变更后:**
```markdown
### YAML 配置

```yaml
config:
  agent_cli:
    runner: opencode      # Agent 类型
    command: mycode       # 自定义命令名
    model: anthropic/claude-3.5-sonnet  # 可选：默认 model
    agent: my-custom-agent              # 可选：默认 agent
  judges:
    code-reviewer:
      runner: opencode
      command: opencode
      model: openai/gpt-4o              # AI裁判使用的 model
      agent: reviewer-agent             # AI裁判使用的 agent
```

验证层自动设置默认值 `{ runner: 'opencode', command: 'opencode' }`。

### Model/Agent 优先级

**Model 优先级：**
1. CLI 参数 `--model`
2. YAML `config.agent_cli.model`
3. YAML `config.target.model`（已废弃）

**Agent 优先级：**
1. CLI 参数 `--agent`
2. Environment 配置 `agent` 字段
3. 从 `setup.copy` 推导（复制到 `.opencode/agents`）
4. YAML `config.agent_cli.agent`
5. YAML `config.target.agent`（已废弃）

**注意：** model 值可能包含 `/` 或 `.` 字符（如 `anthropic/claude-3.5-sonnet`），CLI 参数会自动添加引号处理。
```

- [ ] **Step 2: Commit documentation update**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with model/agent config documentation"
```

---

### Task 7: 运行全量测试并最终验证

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 所有测试 PASS

- [ ] **Step 2: Verify backward compatibility**

确保以下场景正常工作：
1. 不配置 model/agent 时，行为不变
2. CLI 参数覆盖 YAML 配置
3. AI Judge 正常工作

- [ ] **Step 3: Final commit (if needed)**

如果有遗漏的变更，补充提交。

---

## Self-Review Checklist

**1. Spec coverage:**
- Task 1-3 覆盖类型定义和优先级逻辑 ✓
- Task 4 覆盖命令行引号处理 ✓
- Task 5 覆盖 AI Judge 参数传递 ✓
- Task 6 覆盖文档更新 ✓

**2. Placeholder scan:**
- 无 TBD/TODO ✓
- 所有步骤有具体代码 ✓
- 无模糊描述 ✓

**3. Type consistency:**
- AgentCliConfig.model/agent 定义在 Task 1
- verifier.ts 使用同一类型定义 ✓
- 优先级逻辑使用一致属性名 ✓