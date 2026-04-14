---
title: 测试资源清理策略重设计
date: 2026-04-13
status: draft
---

# 测试资源清理策略重设计

## 背景

原设计使用 `cleanup: boolean` 配置项在每次运行结束时立即清理临时目录。但立即清理存在以下问题：

1. 用户可能希望保留异常现场以事后检查
2. 清理时机不应固化在测试用例中（CI 和本地调试需求不同）
3. `cleanupEnvironment` 函数静默忽略删除失败，用户无法感知

## 设计目标

1. 用户完全控制清理时机
2. 清理操作有明确反馈（成功/失败/清理数量）
3. 函数签名简化，返回清理结果

## 核心变更

### 清理策略

| 组件 | 行为 |
|------|------|
| 默认运行 | 不清理临时目录，路径记录在 `ScenarioResult.tempDirectory` |
| `--clean` 参数 | 运行结束后立即清理 `.agentut/temp/` |
| `agentut clean` 命令 | 事后清理 `.agentut/temp/` 目录 |

### 废弃 cleanup 字段

YAML 中 `cleanup: boolean` 配置项废弃：
- 解析器仍接受该字段（向后兼容），但忽略其值
- 文档中标注为 deprecated
- 未来版本可完全移除

理由：清理策略是运行时决策，不应固化在测试用例中。同一个测试用例，CI 运行时想清理，本地调试时想保留。

## CLI 变更

### 运行命令

```bash
# 运行测试（默认不清理）
agentut run <test-file>

# 运行测试并立即清理
agentut run <test-file> --clean
```

### 清理命令

```bash
# 清理当前目录及子目录下所有临时目录
agentut clean

# 清理指定目录及其子目录下的临时目录
agentut clean -d ./tests/
```

**行为**：
- 递归查找当前目录及所有子目录下的 `.agentut/temp/` 目录
- 清理找到的所有临时目录及其子目录
- 输出清理结果：清理了哪些目录、清理数量、是否有失败
- 如果未找到任何 `.agentut/temp/` 目录，提示"无临时目录需清理"

## 代码变更

### cleanupEnvironment 函数重设计

**原签名**：
```typescript
export async function cleanupEnvironment(
  directory: string,
  shouldCleanup: boolean,
  scenarioName?: string
): Promise<void>
```

**新签名**：
```typescript
export interface CleanupResult {
  cleaned: boolean;
  path: string;
  error?: string;
}

export async function cleanupEnvironment(
  directory: string
): Promise<CleanupResult>
```

**变更要点**：
- 移除 `shouldCleanup` 参数（清理由调用方决定是否执行）
- 移除 `scenarioName` 参数（日志由调用方处理）
- 返回 `CleanupResult`，包含成功/失败信息
- 不再静默忽略错误，返回错误信息供调用方处理

### 变更文件列表

| 文件 | 变更内容 |
|------|----------|
| `src/executor/fixture.ts` | 重设计 `cleanupEnvironment` 函数 |
| `src/commands/run.ts` | 移除 cleanup 相关逻辑，添加 `--clean` 参数处理 |
| `src/commands/clean.ts` | 新增文件，实现 clean 命令 |
| `src/cli.ts` | 注册 clean 命令 |
| `src/types/index.ts` | `ScenarioConfig.cleanup` 标记 deprecated，新增 `CleanupResult` 类型 |
| `tests/executor/fixture.test.ts` | 更新 `cleanupEnvironment` 测试，新增失败场景测试 |

## 单元测试变更

### cleanupEnvironment 测试

**移除的测试**：
- `cleanup: false` 保留目录（函数不再有此参数）
- logger 调用测试（函数不再有此参数）

**新增的测试**：

| 测试场景 | 输入 | 预期结果 |
|---------|------|----------|
| 删除存在的目录 | 有效目录路径 | `{ cleaned: true, path: ... }` |
| 删除不存在的目录 | 无效路径 | `{ cleaned: false, path: ..., error: ... }` |
| 删除失败（模拟权限问题） | Mock fs.remove 抛错 | `{ cleaned: false, path: ..., error: ... }` |

### clean 命令测试

| 测试场景 | 输入 | 预期结果 |
|---------|------|----------|
| 清理存在的临时目录 | `.agentut/temp/` 有内容 | 输出清理数量，目录被删除 |
| 清理空目录 | `.agentut/temp/` 为空 | 提示无内容需清理 |
| 目录不存在 | `.agentut/temp/` 不存在 | 提示无临时目录 |
| 清理部分失败 | 某个子目录删除失败 | 输出失败信息，继续清理其他 |

## 实现优先级

1. 重设计 `cleanupEnvironment` 函数 + 单元测试
2. 实现 `agentut clean` 命令 + 单元测试
3. 更新 `run.ts`：移除 cleanup 逻辑 + 添加 `--clean` 参数
4. 更新类型定义：废弃 cleanup 字段
5. 更新文档