# setup.copy 灵活复制配置设计

## 概述

扩展 YAML 配置中 `environments.setup` 的 `copy` 字段，支持灵活的 source/target 配置，移除 `config.target` 的默认复制行为，实现更高的灵活度和功能复用。

## 背景

### 当前问题

1. **setup.copy 限制**：只支持单一路径复制，目标固定为工作目录根
2. **config.target 硬编码**：`skill` 字段被硬编码复制到 `.opencode/agents/`，无法自定义
3. **路径基准不一致**：不同字段使用不同的路径基准，增加配置复杂度

### 目标

1. 支持任意 source -> target 的复制配置
2. 统一所有相对路径基准为 YAML 文件位置
3. 移除 config.target，让用户通过 setup 自行配置

## 设计

### 配置语法

**setup.copy 新语法**：
```yaml
setup:
  - copy: "source -> target"
  - run: "npm install"
  - agent: "my-agent"  # 可选，显式指定 agent 名称
```

- `source`：复制源路径，相对于 YAML 文件
- `target`：复制目标路径，相对于 YAML 文件，支持 `$WORKDIR` 变量替换
- `agent`：可选，显式指定 agent 名称（如不指定，自动推导）

**示例**：
```yaml
environments:
  empty:
    directory: ../fixtures/empty
    setup:
      - copy: "../fixtures/templates/hello.txt -> $WORKDIR/hello.txt"
      - copy: "../skills/file-operations.md -> $WORKDIR/.opencode/agents/"
    agent: "file-operations"

config:
  default_timeout: 120000
  parallel: false
  # target 已移除
```

### $WORKDIR 变量

`$WORKDIR` 表示测试执行时的临时工作目录（动态生成）。

执行时替换逻辑：
- 临时工作目录格式：`.agentvcr/temp/{scenario-name}-{uuid}-{timestamp}/`
- `$WORKDIR` 替换为实际临时目录绝对路径

### 类型定义变更

**src/types/index.ts**：

```typescript
export interface SetupAction {
  copy?: string;   // "source -> target" 格式，target 支持 $WORKDIR
  run?: string;
  agent?: string;  // 可选，显式指定 agent 名称
}

export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  // target 字段已移除
}
```

### 解析逻辑

新增辅助函数解析 copy 字段：

```typescript
interface CopySpec {
  source: string;
  target: string;
}

function parseCopyAction(copyValue: string, workDir: string): CopySpec {
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

### 执行逻辑变更

**src/executor/fixture.ts**：

1. **移除**：`copySkillToTarget` 函数
2. **移除**：`PrepareEnvironmentOptions.skill` 参数
3. **修改**：`executeSetup` 支持新语法

```typescript
export async function executeSetup(
  actions: SetupAction[],
  workDir: string,
  yamlDirectory: string
): Promise<void> {
  for (const action of actions) {
    if (action.copy) {
      const spec = parseCopyAction(action.copy, workDir);

      // 解析路径（相对于 YAML 文件）
      const sourcePath = path.resolve(yamlDirectory, spec.source);
      const targetPath = path.resolve(yamlDirectory, spec.target);

      // 确保目标目录存在
      await fs.ensureDir(path.dirname(targetPath));

      // 复制
      await fs.copy(sourcePath, targetPath, { overwrite: true });
    }

    if (action.run) {
      // 执行命令（在工作目录中）
      execSync(action.run, { cwd: workDir, ... });
    }
  }
}
```

### agent 名称推导

**src/commands/run.ts**：

原有逻辑保留：从复制到 `.opencode/agents/` 的文件名自动推导 agent 名称。

新增优先级：
1. `setup.agent` 显式指定 → 使用指定值
2. 复制到 `.opencode/agents/` 的文件 → 从文件名推导
3. 无 → 不设置 agent

```typescript
// 获取 agent 名称
let agent = envConfig.agent;  // 优先使用 setup.agent

if (!agent) {
  // 从 setup.copy 中查找复制到 .opencode/agents/ 的文件
  const agentCopy = actions.find(a =>
    a.copy && a.copy.includes('->') &&
    a.copy.split('->')[1].trim().includes('.opencode/agents')
  );
  if (agentCopy) {
    const source = agentCopy.split('->')[0].trim();
    agent = path.basename(source, '.md');
  }
}
```

### 验证逻辑变更

**src/parser/yaml.ts**：

验证 setup.copy 格式：

```typescript
for (const action of envConfig.setup) {
  if (action.copy && !action.copy.includes('->')) {
    throw new ValidationError(
      `setup.copy must use "source -> target" format`,
      `environments.${envName}.setup.copy`
    );
  }
}
```

## 迁移指南

### 旧配置

```yaml
environments:
  empty:
    directory: ../fixtures/empty
    setup: []

  with-hello:
    directory: ../fixtures/with-hello
    setup:
      - copy: ../fixtures/templates/hello.txt

config:
  target:
    skill: ../skills/file-operations.md
  default_timeout: 120000
```

### 新配置

```yaml
environments:
  empty:
    directory: ../fixtures/empty
    setup:
      - copy: "../skills/file-operations.md -> $WORKDIR/.opencode/agents/"

  with-hello:
    directory: ../fixtures/with-hello
    setup:
      - copy: "../fixtures/templates/hello.txt -> $WORKDIR/"

config:
  default_timeout: 120000
```

## 测试计划

1. **单元测试**：
   - `parseCopyAction` 解析正确性
   - 格式验证错误处理
   - `$WORKDIR` 替换逻辑

2. **集成测试**：
   - 复制文件到工作目录
   - 复制目录到工作目录
   - agent 名称推导

3. **示例配置测试**：
   - 更新 `example/tests/file-operations.yaml`
   - 验证完整流程

## 影响范围

- `src/types/index.ts`：类型定义变更
- `src/parser/yaml.ts`：验证逻辑变更
- `src/executor/fixture.ts`：执行逻辑变更，移除 `copySkillToTarget`
- `src/commands/run.ts`：agent 推导逻辑变更
- `example/tests/file-operations.yaml`：示例配置更新
- 相关测试文件更新