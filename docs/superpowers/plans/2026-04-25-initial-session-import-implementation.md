# initial_session 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增场景级配置参数 `initial_session`，允许用户指定 session 文件在场景执行前导入，使后续 steps 基于该对话继续工作。

**Architecture:** 在现有架构上扩展：AgentRunner 接口新增 importSession 方法，OpenCodeRunner 实现该方法，executeScenario 函数在环境准备后增加导入步骤。

**Tech Stack:** TypeScript, vitest, child_process.execSync

---

## File Structure

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/types/index.ts` | Modify | ScenarioConfig 新增 initial_session 字段 |
| `src/runner/types.ts` | Modify | AgentRunner 接口新增 importSession 方法 |
| `src/runner/opencode.ts` | Modify | 实现 importSession 方法 |
| `src/commands/run.ts` | Modify | executeScenario 增加 session 导入逻辑 |
| `src/output/logger.ts` | Modify | 新增 importSession 日志方法 |
| `src/parser/yaml.ts` | Modify | 新增 initial_session 字段验证 |
| `tests/runner/opencode.test.ts` | Modify | 新增 importSession 测试 |
| `tests/parser/yaml.test.ts` | Modify | 新增 initial_session 验证测试 |

---

### Task 1: 类型定义扩展

**Files:**
- Modify: `src/types/index.ts:22-30`
- Modify: `src/runner/types.ts:8-14`

- [ ] **Step 1: ScenarioConfig 新增字段**

在 `src/types/index.ts` 的 `ScenarioConfig` 接口中新增 `initial_session` 字段：

```typescript
// 找到 ScenarioConfig 接口（约 22-30 行），在 min_pass 字段后添加：
export interface ScenarioConfig {
  name: string;
  environment: string;
  /** @deprecated Cleanup strategy is now controlled by CLI --clean parameter or agentut clean command */
  cleanup: boolean;
  steps: StepConfig[];
  runs?: number;      // 概率测试：覆盖全局设置
  min_pass?: number;  // 概率测试：覆盖全局设置
  initial_session?: string;  // 新增：session 文件路径（相对于 YAML 文件所在目录）
}
```

- [ ] **Step 2: AgentRunner 接口新增方法**

在 `src/runner/types.ts` 的 `AgentRunner` 接口中新增 `importSession` 方法：

```typescript
// 找到 AgentRunner 接口（约 8-14 行），在 listSessions 方法后添加：
export interface AgentRunner {
  readonly runnerType: string;

  run(options: RunOptions): RunResult;
  exportSession(sessionId: string): Promise<ExportedSession>;
  listSessions(): Promise<SessionInfo[]>;
  importSession(sessionFile: string): Promise<string>;  // 新增：导入 session 文件，返回 session ID
}
```

- [ ] **Step 3: 运行类型测试确认无破坏性改动**

Run: `npm test tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/runner/types.ts
git commit -m "feat: add initial_session field to ScenarioConfig and importSession to AgentRunner interface

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: OpenCodeRunner 实现 importSession 方法

**Files:**
- Modify: `src/runner/opencode.ts`（在 listSessions 方法后新增）

- [ ] **Step 1: 编写 importSession 测试**

在 `tests/runner/opencode.test.ts` 中新增 importSession 测试（在 listSessions describe block 后添加）：

```typescript
describe('importSession', () => {
  it('should call CLI import with session file', async () => {
    vi.mocked(execSync).mockReturnValue('Imported session: ses_abc123\n');

    const result = await runner.importSession('/path/to/session.json');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('opencode import "/path/to/session.json"'),
      expect.any(Object)
    );
    expect(result).toBe('ses_abc123');
  });

  it('should use custom command name', async () => {
    const customRunner = new OpenCodeRunner('mycode');
    vi.mocked(execSync).mockReturnValue('Imported session: ses_xyz\n');

    await customRunner.importSession('/path/to/session.json');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('mycode import'),
      expect.any(Object)
    );
  });

  it('should parse session ID from output format', async () => {
    vi.mocked(execSync).mockReturnValue('Imported session: ses_123abc\n');

    const result = await runner.importSession('/path/to/session.json');

    expect(result).toBe('ses_123abc');
  });

  it('should handle session ID without ses_ prefix', async () => {
    vi.mocked(execSync).mockReturnValue('Imported session: abc123xyz\n');

    const result = await runner.importSession('/path/to/session.json');

    expect(result).toBe('abc123xyz');
  });

  it('should throw ExecutionError when import fails', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Import failed');
    });

    await expect(runner.importSession('/path/to/session.json')).rejects.toThrow(ExecutionError);
  });

  it('should throw ExecutionError when output format is invalid', async () => {
    vi.mocked(execSync).mockReturnValue('Invalid output format\n');

    await expect(runner.importSession('/path/to/session.json')).rejects.toThrow(ExecutionError);
  });

  it('should throw ExecutionError when output does not start with Imported session:', async () => {
    vi.mocked(execSync).mockReturnValue('ses_abc123\n');

    await expect(runner.importSession('/path/to/session.json')).rejects.toThrow(ExecutionError);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/runner/opencode.test.ts`
Expected: FAIL with "importSession is not defined" 或类似错误

- [ ] **Step 3: 实现 importSession 方法**

在 `src/runner/opencode.ts` 中，`listSessions` 方法后新增 `importSession` 方法：

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

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/runner/opencode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/opencode.ts tests/runner/opencode.test.ts
git commit -m "feat: implement importSession method in OpenCodeRunner

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Logger 新增 importSession 方法

**Files:**
- Modify: `src/output/logger.ts`（在 cleanup 方法后新增）

- [ ] **Step 1: 新增 importSession 日志方法**

在 `src/output/logger.ts` 的 Logger 类中，`cleanup` 方法后新增 `importSession` 方法：

```typescript
/**
 * 导入 session
 */
importSession(sessionFile: string): void {
  console.log(`  Importing session: ${sessionFile}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/output/logger.ts
git commit -m "feat: add importSession log method to Logger

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: YAML 解析验证 initial_session

**Files:**
- Modify: `src/parser/yaml.ts`（在 scenario 验证循环中新增）
- Modify: `tests/parser/yaml.test.ts`（新增验证测试）

- [ ] **Step 1: 编写 initial_session 验证测试**

在 `tests/parser/yaml.test.ts` 中新增测试（在文件末尾添加）：

```typescript
describe('validateYamlTestSuite initial_session', () => {
  it('should accept valid initial_session string', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [],
        initial_session: '.agentut/sessions/base.json'
      }]
    };
    expect(() => validateYamlTestSuite(suite)).not.toThrow();
  });

  it('should accept scenario without initial_session', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }]
    };
    expect(() => validateYamlTestSuite(suite)).not.toThrow();
  });

  it('should throw ValidationError for non-string initial_session', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [],
        initial_session: 123 as unknown as string
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for empty initial_session', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [],
        initial_session: ''
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for whitespace-only initial_session', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [],
        initial_session: '   '
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });
});

describe('parseYaml initial_session', () => {
  it('should parse initial_session from YAML', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    initial_session: .agentut/sessions/base.json
    steps: []
`;
    const result = parseYaml(yaml);
    expect(result.scenarios[0].initial_session).toBe('.agentut/sessions/base.json');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test tests/parser/yaml.test.ts`
Expected: 部分测试 FAIL（因为验证逻辑未实现）

- [ ] **Step 3: 实现 initial_session 验证**

在 `src/parser/yaml.ts` 的 `validateYamlTestSuite` 函数中，找到 scenario 验证循环（约 96-151 行），在 `if (scenario.min_pass !== undefined)` 验证块后添加：

```typescript
// 在 scenario.min_pass 验证块后（约 130 行附近）添加：

// 验证 initial_session（可选）
if (scenario.initial_session !== undefined) {
  if (typeof scenario.initial_session !== 'string') {
    throw new ValidationError(
      `Scenario "${scenario.name}": initial_session must be a string`,
      `scenarios.${scenario.name}.initial_session`
    );
  }
  if (scenario.initial_session.trim() === '') {
    throw new ValidationError(
      `Scenario "${scenario.name}": initial_session cannot be empty`,
      `scenarios.${scenario.name}.initial_session`
    );
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test tests/parser/yaml.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/yaml.ts tests/parser/yaml.test.ts
git commit -m "feat: add initial_session validation in YAML parser

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: executeScenario 增加 session 导入逻辑

**Files:**
- Modify: `src/commands/run.ts:213-224`

- [ ] **Step 1: 在 executeScenario 中增加导入逻辑**

找到 `src/commands/run.ts` 中 `executeScenario` 函数的环境准备代码块（约 213-220 行），在 `tempDirectory = envResult.tempDirectory;` 后添加 session 导入逻辑。

找到以下代码：
```typescript
      const envResult = await prepareEnvironment(envConfig, scenarioNameForRun, tempRoot, {
        yamlDirectory
      });
      tempDirectory = envResult.tempDirectory;

      // Execute steps
      const totalSteps = scenario.steps.length;
```

修改为：
```typescript
      const envResult = await prepareEnvironment(envConfig, scenarioNameForRun, tempRoot, {
        yamlDirectory
      });
      tempDirectory = envResult.tempDirectory;

      // 导入 initial_session（如果有配置）
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
      const totalSteps = scenario.steps.length;
```

注意：这段代码在 runIndex 循环内部（约 208 行开始），sessionId 变量在约 209 行已声明为 `let sessionId: string | undefined;`，所以可以直接使用。

- [ ] **Step 2: 运行所有测试确认无破坏性改动**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/run.ts
git commit -m "feat: add initial_session import logic in executeScenario

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: 集成测试与文档更新

**Files:**
- Create: `docs/features/initial-session.md`

- [ ] **Step 1: 创建功能文档**

创建 `docs/features/initial-session.md`：

```markdown
# initial_session - 导入初始会话

场景级配置，指定一个 session 文件路径，在场景执行前导入该 session。

## 用途

- **延续对话上下文** — 让测试场景能够基于已有的对话历史继续，无需从零开始
- **复用已完成的工作** — 避免重复执行已有的准备步骤
- **调试/测试特定场景** — 从某个特定的对话状态开始测试

## 配置示例

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

## 注意事项

- 路径相对于 YAML 文件所在目录
- 推荐将 session 文件存放于 `.agentut/sessions/` 目录下
- session 文件需符合 opencode export 格式

## session 文件获取方式

```bash
# 导出已有 session
opencode export ses_xxx > .agentut/sessions/base-session.json
```
```

- [ ] **Step 2: 运行完整测试套件**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/features/initial-session.md
git commit -m "docs: add initial_session feature documentation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] ScenarioConfig 新增 initial_session 字段 — Task 1
- [x] AgentRunner 接口新增 importSession 方法 — Task 1
- [x] OpenCodeRunner 实现 importSession — Task 2
- [x] Logger 新增 importSession 方法 — Task 3
- [x] YAML 验证 initial_session — Task 4
- [x] executeScenario 导入逻辑 — Task 5
- [x] 文档说明 — Task 6

**2. Placeholder scan:** 无 TBD、TODO、未实现步骤

**3. Type consistency:**
- `initial_session` 字段在 ScenarioConfig 中定义为 `string | undefined`
- `importSession` 方法签名在接口和实现中一致：`Promise<string>`
- Logger 方法名 `importSession` 与调用处一致