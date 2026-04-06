# setup.copy 灵活复制配置实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 setup.copy 支持灵活的 source -> target 配置，移除 config.target 默认复制行为。

**Architecture:** 统一相对路径基准为 YAML 文件，通过 $WORKDIR 变量支持动态临时工作目录，让用户完全控制复制行为。

**Tech Stack:** TypeScript, fs-extra, vitest

---

## 文件结构

| 文件 | 变更 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | 移除 GlobalConfig.target，添加 SetupAction.agent |
| `src/parser/yaml.ts` | 修改 | 添加 setup.copy 格式验证 |
| `src/executor/fixture.ts` | 修改 | 添加 parseCopyAction，修改 executeSetup，移除 copySkillToTarget |
| `src/commands/run.ts` | 修改 | agent 推导逻辑变更 |
| `example/tests/file-operations.yaml` | 修改 | 示例配置更新为新语法 |
| `tests/parser/yaml.test.ts` | 修改 | 添加格式验证测试 |
| `tests/executor/fixture.test.ts` | 修改 | 添加 parseCopyAction 和新语法测试 |
| `tests/commands/run.test.ts` | 修改 | agent 推导测试（如存在） |
| `README.md` | 修改 | 文档更新 |

---

## Task 1: 类型定义变更

**Files:**
- Modify: `src/types/index.ts:16-19` (SetupAction)
- Modify: `src/types/index.ts:40-48` (GlobalConfig)
- Test: `tests/types/index.test.ts`（如果需要）

- [ ] **Step 1: 修改 SetupAction 接口，添加 agent 字段**

```typescript
// src/types/index.ts:16-19
export interface SetupAction {
  copy?: string;   // "source -> target" 格式，target 支持 $WORKDIR
  run?: string;
  agent?: string;  // 可选，显式指定 agent 名称
}
```

- [ ] **Step 2: 修改 GlobalConfig 接口，移除 target 字段**

```typescript
// src/types/index.ts:40-48
export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  // target 字段已移除
}
```

- [ ] **Step 3: 运行类型检查验证无编译错误**

Run: `npm run build`
Expected: 无 TypeScript 编译错误

- [ ] **Step 4: 提交类型变更**

```bash
git add src/types/index.ts
git commit -m "refactor: remove GlobalConfig.target, add SetupAction.agent field"
```

---

## Task 2: 验证逻辑变更

**Files:**
- Modify: `src/parser/yaml.ts:35-49` (validateYamlTestSuite)
- Test: `tests/parser/yaml.test.ts`

- [ ] **Step 1: 编写 setup.copy 格式验证的失败测试**

```typescript
// tests/parser/yaml.test.ts - 添加到 describe('validateYamlTestSuite')
it('should throw ValidationError for setup.copy without -> separator', () => {
  const suite: YamlTestSuite = {
    name: 'test',
    environments: {
      default: {
        directory: './test',
        setup: [
          { copy: './templates/base' }  // 缺少 -> 分隔符
        ]
      }
    },
    scenarios: [{
      name: 'scenario-1',
      environment: 'default',
      cleanup: true,
      steps: []
    }]
  };
  expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
});

it('should pass for valid setup.copy with -> separator', () => {
  const suite: YamlTestSuite = {
    name: 'test',
    environments: {
      default: {
        directory: './test',
        setup: [
          { copy: './templates/base -> $WORKDIR/' }
        ]
      }
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
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test tests/parser/yaml.test.ts`
Expected: 新测试失败，显示 "should throw ValidationError for setup.copy without -> separator"

- [ ] **Step 3: 在 validateYamlTestSuite 中添加 copy 格式验证**

```typescript
// src/parser/yaml.ts:35-49 - 在环境验证循环中添加
// Validate each environment has required fields
for (const [envName, envConfig] of Object.entries(suite.environments)) {
  if (!envConfig.directory || typeof envConfig.directory !== 'string') {
    throw new ValidationError(
      `Environment "${envName}" is missing required field: directory`,
      `environments.${envName}.directory`
    );
  }
  if (!Array.isArray(envConfig.setup)) {
    throw new ValidationError(
      `Environment "${envName}" is missing required field: setup (must be an array)`,
      `environments.${envName}.setup`
    );
  }

  // Validate setup.copy format
  for (const action of envConfig.setup) {
    if (action.copy && !action.copy.includes('->')) {
      throw new ValidationError(
        `setup.copy must use "source -> target" format: ${action.copy}`,
        `environments.${envName}.setup.copy`
      );
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test tests/parser/yaml.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: 提交验证逻辑变更**

```bash
git add src/parser/yaml.ts tests/parser/yaml.test.ts
git commit -m "feat: add setup.copy format validation"
```

---

## Task 3: fixture.ts 执行逻辑变更

**Files:**
- Modify: `src/executor/fixture.ts` (多处变更)
- Test: `tests/executor/fixture.test.ts`

- [ ] **Step 1: 编写 parseCopyAction 单元测试**

```typescript
// tests/executor/fixture.test.ts - 新增 describe 块
import { parseCopyAction } from '../../src/executor/fixture.js';

describe('parseCopyAction', () => {
  it('should parse valid copy action with -> separator', () => {
    const result = parseCopyAction('./source/file.txt -> $WORKDIR/target/', '/temp/workdir');
    expect(result.source).toBe('./source/file.txt');
    expect(result.target).toBe('/temp/workdir/target/');
  });

  it('should throw ValidationError for copy without -> separator', () => {
    expect(() => parseCopyAction('./source/file.txt', '/temp'))
      .toThrow('copy must use "source -> target" format');
  });

  it('should replace $WORKDIR with actual work directory', () => {
    const result = parseCopyAction('./source -> $WORKDIR/.opencode/agents/', '/tmp/test-123');
    expect(result.target).toBe('/tmp/test-123/.opencode/agents/');
  });

  it('should handle paths with spaces around ->', () => {
    const result = parseCopyAction('./source/file.txt   ->   ./target/', '/temp');
    expect(result.source).toBe('./source/file.txt');
    expect(result.target).toBe('./target/');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test tests/executor/fixture.test.ts`
Expected: parseCopyAction 相关测试失败

- [ ] **Step 3: 在 fixture.ts 中添加 parseCopyAction 函数和 CopySpec 接口**

```typescript
// src/executor/fixture.ts - 在文件顶部 import 之后添加
import { SetupError, ValidationError, type EnvironmentConfig, type SetupAction, type GlobalConfig } from '../types/index.js';

interface CopySpec {
  source: string;
  target: string;
}

export function parseCopyAction(copyValue: string, workDir: string): CopySpec {
  // 验证格式
  if (!copyValue.includes('->')) {
    throw new ValidationError(
      `copy must use "source -> target" format: ${copyValue}`,
      'setup.copy'
    );
  }

  // 分割并清理
  const parts = copyValue.split('->').map(s => s.trim());
  const source = parts[0];
  const target = parts[1];

  // 替换 $WORKDIR
  const resolvedTarget = target.replace('$WORKDIR', workDir);

  return { source, target: resolvedTarget };
}
```

- [ ] **Step 4: 运行 parseCopyAction 测试验证通过**

Run: `npm test tests/executor/fixture.test.ts`
Expected: parseCopyAction 测试通过

- [ ] **Step 5: 编写 executeSetup 新语法的失败测试**

```typescript
// tests/executor/fixture.test.ts - 在 describe('executeSetup') 中添加
it('should copy file to target path with -> syntax', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'work');
  const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');
  const yamlDir = TEST_TEMP_DIR;

  await fs.ensureDir(workDir);
  await fs.ensureDir(sourceDir);
  await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

  const actions: SetupAction[] = [
    { copy: `${sourceDir} -> ${workDir}/copied-file.txt` }
  ];

  await executeSetup(actions, workDir, yamlDir);

  expect(await fs.pathExists(path.join(workDir, 'copied-file.txt'))).toBe(true);
  expect(await fs.readFile(path.join(workDir, 'copied-file.txt'), 'utf-8')).toBe('content');
});

it('should replace $WORKDIR in target path', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'work');
  const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');
  const yamlDir = TEST_TEMP_DIR;

  await fs.ensureDir(workDir);
  await fs.ensureDir(sourceDir);
  await fs.writeFile(path.join(sourceDir, 'skill.md'), 'skill content');

  const actions: SetupAction[] = [
    { copy: `${sourceDir}/skill.md -> $WORKDIR/.opencode/agents/skill.md` }
  ];

  await executeSetup(actions, workDir, yamlDir);

  expect(await fs.pathExists(path.join(workDir, '.opencode/agents/skill.md'))).toBe(true);
});

it('should create target directory if it does not exist', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'work');
  const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');
  const yamlDir = TEST_TEMP_DIR;

  await fs.ensureDir(workDir);
  await fs.ensureDir(sourceDir);
  await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

  const actions: SetupAction[] = [
    { copy: `${sourceDir}/file.txt -> ${workDir}/deep/nested/path/file.txt` }
  ];

  await executeSetup(actions, workDir, yamlDir);

  expect(await fs.pathExists(path.join(workDir, 'deep/nested/path/file.txt'))).toBe(true);
});
```

- [ ] **Step 6: 运行测试验证失败**

Run: `npm test tests/executor/fixture.test.ts`
Expected: 新的 executeSetup 测试失败

- [ ] **Step 7: 修改 executeSetup 函数支持新语法**

```typescript
// src/executor/fixture.ts:60-90 - 替换整个 executeSetup 函数
export async function executeSetup(
  actions: SetupAction[],
  workDir: string,
  yamlDirectory: string
): Promise<void> {
  for (const action of actions) {
    if (action.copy) {
      const spec = parseCopyAction(action.copy, workDir);

      // 解析路径（相对于 YAML 文件）
      const sourcePath = path.isAbsolute(spec.source)
        ? spec.source
        : path.resolve(yamlDirectory, spec.source);
      const targetPath = path.isAbsolute(spec.target)
        ? spec.target
        : path.resolve(yamlDirectory, spec.target);

      // 确保目标目录存在
      await fs.ensureDir(path.dirname(targetPath));

      // 复制
      await fs.copy(sourcePath, targetPath, { overwrite: true });
    }

    if (action.run) {
      try {
        execSync(action.run, {
          cwd: workDir,
          encoding: 'utf-8',
          timeout: 60000,
          stdio: 'pipe'
        });
      } catch (error) {
        throw new SetupError(
          `Setup command failed: ${action.run}`,
          action
        );
      }
    }
  }
}
```

- [ ] **Step 8: 运行测试验证通过**

Run: `npm test tests/executor/fixture.test.ts`
Expected: 所有 executeSetup 测试通过

- [ ] **Step 9: 移除 copySkillToTarget 函数和 PrepareEnvironmentOptions.skill**

```typescript
// src/executor/fixture.ts - 删除以下内容：
// 1. 删除 copySkillToTarget 函数（第106-127行）
// 2. 删除 PrepareEnvironmentOptions 中的 skill 字段（第129-132行）
// 3. 删除 prepareEnvironment 中复制 skill 的逻辑（第156-161行）

// PrepareEnvironmentOptions 修改为：
export interface PrepareEnvironmentOptions {
  yamlDirectory?: string;
}

// prepareEnvironment 函数修改为：
export async function prepareEnvironment(
  config: EnvironmentConfig,
  scenarioName: string,
  tempRoot: string,
  options?: PrepareEnvironmentOptions
): Promise<PrepareEnvironmentResult> {
  const yamlDirectory = options?.yamlDirectory || process.cwd();

  // Create temp directory
  const tempDir = await createTempDirectory(scenarioName, tempRoot);

  // Resolve source directory (relative to yaml file location)
  const sourceDir = yamlDirectory
    ? path.resolve(yamlDirectory, config.directory)
    : path.resolve(config.directory);

  // Copy environment
  await copyEnvironment(sourceDir, tempDir);

  // Execute setup actions
  await executeSetup(config.setup, tempDir, yamlDirectory);

  return {
    tempDirectory: tempDir
  };
}
```

- [ ] **Step 10: 更旧语法测试（现有的 executeSetup copy 测试需要更新）**

```typescript
// tests/executor/fixture.test.ts - 更新现有测试
it('should execute copy action with new syntax', async () => {
  const workDir = path.join(TEST_TEMP_DIR, 'work');
  const sourceDir = path.resolve(TEST_TEMP_DIR, 'source');

  await fs.ensureDir(workDir);
  await fs.ensureDir(sourceDir);
  await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

  const actions: SetupAction[] = [
    { copy: `${sourceDir} -> ${workDir}` }
  ];

  await executeSetup(actions, workDir, TEST_TEMP_DIR);

  expect(await fs.pathExists(path.join(workDir, 'file.txt'))).toBe(true);
});
```

- [ ] **Step 11: 运行所有 fixture 测试验证通过**

Run: `npm test tests/executor/fixture.test.ts`
Expected: 所有测试通过

- [ ] **Step 12: 提交 fixture.ts 变更**

```bash
git add src/executor/fixture.ts tests/executor/fixture.test.ts
git commit -m "feat: support flexible copy syntax with source -> target format"
```

---

## Task 4: run.ts agent 推导逻辑变更

**Files:**
- Modify: `src/commands/run.ts:86-95` (agent 推导逻辑)
- Modify: `src/commands/run.ts:100-104` (prepareEnvironment 调用)

- [ ] **Step 1: 编写 agent 推导逻辑的失败测试**

```typescript
// tests/commands/run.test.ts - 如果文件存在则添加，否则创建
import { describe, it, expect } from 'vitest';
// 需要根据现有测试结构添加

it('should derive agent name from setup.copy targeting .opencode/agents', async () => {
  // 测试从 setup.copy 中推导 agent 名称
});

it('should use explicit agent name from environment config', async () => {
  // 测试显式指定的 agent 名称优先
});
```

- [ ] **Step 2: 运行测试验证失败（或确认测试结构）**

Run: `npm test tests/commands/run.test.ts`
Expected: 确认测试文件结构

- [ ] **Step 3: 修改 run.ts 中的 agent 推导逻辑**

```typescript
// src/commands/run.ts:86-95 - 替换 agent 推导逻辑
// Get model from options or config
const model = options?.model || suite.config?.target?.model;

// Get agent name with new priority:
// 1. CLI options --agent
// 2. Environment config agent field (从 setup 中)
// 3. Derive from setup.copy targeting .opencode/agents
// 4. Config target.agent (deprecated, for backwards compatibility)
let agent = options?.agent;

// Get environment config for agent derivation
const envConfig = suite.environments[scenario.environment];

if (!agent && envConfig.agent) {
  // Priority 2: explicit agent in environment config
  agent = envConfig.agent;
}

if (!agent) {
  // Priority 3: derive from setup.copy targeting .opencode/agents
  const agentCopy = envConfig.setup.find(a =>
    a.copy && a.copy.includes('->') &&
    a.copy.split('->')[1].trim().includes('.opencode/agents')
  );
  if (agentCopy) {
    const source = agentCopy.copy!.split('->')[0].trim();
    agent = path.basename(source, '.md');
  }
}

// Priority 4: backwards compatibility with config.target
if (!agent && suite.config?.target?.agent) {
  agent = suite.config.target.agent;
}
```

- [ ] **Step 4: 修改 prepareEnvironment 调用，移除 skill 参数**

```typescript
// src/commands/run.ts:100-104
const envResult = await prepareEnvironment(envConfig, scenario.name, tempRoot, {
  yamlDirectory
  // skill 参数已移除
});
```

- [ ] **Step 5: 运行构建验证无编译错误**

Run: `npm run build`
Expected: 无 TypeScript 编译错误

- [ ] **Step 6: 提交 run.ts 变更**

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "feat: derive agent name from setup.copy, remove skill parameter"
```

---

## Task 5: 更新示例配置文件

**Files:**
- Modify: `example/tests/file-operations.yaml`

- [ ] **Step 1: 更新 file-operations.yaml 使用新语法**

```yaml
# example/tests/file-operations.yaml
name: file-operations-test
description: 验证文件操作 Skill 的基本行为

environments:
  empty:
    directory: ../fixtures/empty
    setup:
      - copy: "../skills/file-operations.md -> $WORKDIR/.opencode/agents/"

  with-hello:
    directory: ../fixtures/with-hello
    setup:
      - copy: "../fixtures/templates/hello.txt -> $WORKDIR/hello.txt"
      - copy: "../skills/file-operations.md -> $WORKDIR/.opencode/agents/"

scenarios:
  # 场景 1：创建文件（验证 Write + 文件产生）
  - name: create-file
    environment: empty
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件，内容为 'Hello World'，必须使用技能完成。"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
          - file_content_contains:
              file: hello.txt
              text: "Hello World"

  # 场景 2：读取文件（验证 Read + 响应内容）
  - name: read-file
    environment: with-hello
    cleanup: true
    steps:
      - input: "读取 hello.txt 文件内容"
        expected:
          - should_call_tool: Read
          - response_contains: "Hello"

  # 场景 3：多步骤串联（先创建再读取）
  - name: create-then-read
    environment: empty
    cleanup: true
    steps:
      - input: "使用 'file-operations' 技能，创建 hello.txt 文件，内容为 'Test Content'"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt

      - input: "读取 hello.txt 文件"
        expected:
          - should_call_tool: Read
          - response_contains: "Test Content"

config:
  default_timeout: 120000
  parallel: false
```

- [ ] **Step 2: 提交示例配置更新**

```bash
git add example/tests/file-operations.yaml
git commit -m "feat: update example config to use new copy syntax"
```

---

## Task 6: 更新测试文件

**Files:**
- Modify: `tests/parser/yaml.test.ts`
- Modify: `tests/executor/fixture.test.ts`
- Modify: `tests/commands/run.test.ts` (如存在)

- [ ] **Step 1: 更新 yaml.test.ts 中的旧语法测试**

删除或更新使用旧 copy 语法的测试：

```typescript
// tests/parser/yaml.test.ts:35-50 - 更新 setup actions 测试
it('should parse setup actions correctly', () => {
  const yaml = `
name: test-suite
environments:
  env1:
    directory: ./test
    setup:
      - copy: "./templates/base -> $WORKDIR/"
      - run: npm install
scenarios: []
`;
  const result = parseYaml(yaml);
  expect(result.environments.env1.setup).toHaveLength(2);
  expect(result.environments.env1.setup[0]).toEqual({ copy: './templates/base -> $WORKDIR/' });
  expect(result.environments.env1.setup[1]).toEqual({ run: 'npm install' });
});
```

- [ ] **Step 2: 运行所有测试验证通过**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 3: 提交测试更新**

```bash
git add tests/
git commit -m "test: update tests for new copy syntax"
```

---

## Task 7: README.md 文档更新

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README.md 中的测试用例格式说明**

```markdown
# README.md - 更新测试用例格式部分

## 测试用例格式

测试用例使用 YAML 格式定义：

```yaml
name: my-test-suite
description: 测试描述

environments:
  default:
    directory: ./fixtures/test-env
    setup:
      - copy: "./templates/base -> $WORKDIR/"
      - copy: "./skills/my-skill.md -> $WORKDIR/.opencode/agents/"
      - run: npm install
    agent: "my-skill"  # 可选，显式指定 agent 名称

scenarios:
  - name: create-file
    environment: default
    cleanup: true
    steps:
      - input: "创建 hello.txt 文件"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
        timeout: 60000

config:
  default_timeout: 120000
  parallel: false
```

### setup.copy 配置

`setup.copy` 使用 `source -> target` 格式：

- `source`: 复制源路径，相对于 YAML 文件
- `target`: 复制目标路径，相对于 YAML 文件，支持 `$WORKDIR` 变量

**$WORKDIR 变量**：表示测试执行的临时工作目录。例如：

```yaml
setup:
  - copy: "./skills/skill.md -> $WORKDIR/.opencode/agents/"
```

会将 skill.md 复制到临时工作目录的 `.opencode/agents/` 下。

### agent 名称推导

agent 名称按以下优先级确定：

1. CLI `--agent` 参数
2. 环境 `setup.agent` 字段显式指定
3. 从复制到 `.opencode/agents/` 的文件名推导
```

- [ ] **Step 2: 提交 README 更新**

```bash
git add README.md
git commit -m "docs: update README for new setup.copy syntax"
```

---

## Task 8: 最终验证与集成测试

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行构建**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 3: 运行示例测试验证功能**

Run: `node dist/cli.js run ./example/tests/file-operations.yaml`
Expected: 测试执行成功（如果 opencode 可用）

- [ ] **Step 4: 创建汇总提交（如有遗漏文件）**

```bash
git status
# 确认所有变更已提交
```

---

## Self-Review Checklist

完成后检查：

1. **Spec coverage**: 每个 spec 要求都有对应任务实现
2. **Placeholder scan**: 无 TBD/TODO
3. **Type consistency**: parseCopyAction 返回 CopySpec，各处使用一致
4. **Backwards compatibility**: 已移除，所有配置需更新为新语法