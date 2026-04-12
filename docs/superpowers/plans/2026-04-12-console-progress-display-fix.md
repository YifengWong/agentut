# 控制台进度显示修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复多轮执行时控制台进度不实时刷新的问题，实现步骤+运行双重进度显示。

**Architecture:** 将 `showProgress` 调用从 `runIndex === 0` 条件块中移出，使其每次运行都能动态覆盖显示进度。消息格式调整为 `Step X/Y, Run Z/N...`。

**Tech Stack:** TypeScript, Vitest 测试框架

---

## 文件结构

| 文件 | 责责 |
|------|------|
| `src/commands/run.ts:218-228` | 进度显示逻辑修改 |
| `tests/commands/run.test.ts` | 添加多轮进度显示测试 |

---

### Task 1: 修改 run.ts 进度显示逻辑

**Files:**
- Modify: `src/commands/run.ts:218-228`

- [ ] **Step 1: 找到目标代码位置**

查看 `src/commands/run.ts` 第 218-228 行，确认需要修改的代码块：

```typescript
// 当前代码（需要修改）
// Log step start (只在第一次运行时显示详细日志，避免重复)
if (runIndex === 0) {
  logger.startStep(scenario.name, step.input, stepNumber, totalSteps);
  const progressMsg = isTraditionalSingleRun ? 'executing...' : `executing run ${runIndex + 1}/${effectiveRuns}...`;
  logger.showProgress(scenario.name, progressMsg);
}
```

- [ ] **Step 2: 执行修改**

将代码修改为：

```typescript
// Log step start (只在第一次运行时显示步骤标题)
if (runIndex === 0) {
  logger.startStep(scenario.name, step.input, stepNumber, totalSteps);
}

// 每次运行都显示进度（动态覆盖）
const progressMsg = isTraditionalSingleRun
  ? 'executing...'
  : `Step ${stepNumber}/${totalSteps}, Run ${runIndex + 1}/${effectiveRuns}...`;
logger.showProgress(scenario.name, progressMsg);
```

改动要点：
- `startStep` 保持只在 `runIndex === 0` 时调用
- `showProgress` 移出条件块，每次运行都调用
- 消息格式调整为 `Step X/Y, Run Z/N...`

---

### Task 2: 添加测试验证多轮进度显示

**Files:**
- Modify: `tests/commands/run.test.ts`

- [ ] **Step 1: 在 probabilistic test execution 测试组中添加进度显示测试**

在 `tests/commands/run.test.ts` 的 `describe('probabilistic test execution', () => {...})` 块末尾添加测试：

```typescript
it('should showProgress for each run with step and run progress format', async () => {
  const mockSuite: YamlTestSuite = {
    name: 'test',
    environments: {
      default: { directory: './test', setup: [] }
    },
    scenarios: [{
      name: 'multi-run-progress',
      environment: 'default',
      cleanup: true,
      steps: [{
        input: 'Create file',
        expected: [{ should_call_tool: 'Write' }],
        timeout: 60000
      }]
    }],
    config: {
      runs: 3,
      min_pass: 2,
      agent_cli: { runner: 'opencode', command: 'opencode' }
    }
  };

  vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
  vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
  mockRunner.run.mockReturnValue({
    outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
    sessionId: 'ses_1'
  });
  vi.mocked(verifyAssertions).mockResolvedValue([
    { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
  ]);

  const yamlPath = path.join(TEST_DIR, 'test.yaml');
  await fs.writeFile(yamlPath, 'name: test');

  await runTests(yamlPath);

  // startStep 只在第一次运行时调用
  expect(logger.startStep).toHaveBeenCalledTimes(1);
  expect(logger.startStep).toHaveBeenCalledWith('multi-run-progress', 'Create file', 1, 1);

  // showProgress 每次运行都调用（3 次）
  expect(logger.showProgress).toHaveBeenCalledTimes(3);
  expect(logger.showProgress).toHaveBeenNthCalledWith(1, 'multi-run-progress', 'Step 1/1, Run 1/3...');
  expect(logger.showProgress).toHaveBeenNthCalledWith(2, 'multi-run-progress', 'Step 1/1, Run 2/3...');
  expect(logger.showProgress).toHaveBeenNthCalledWith(3, 'multi-run-progress', 'Step 1/1, Run 3/3...');

  // endStep 只在第一次运行时调用
  expect(logger.endStep).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: 运行测试验证修改**

Run: `npm test tests/commands/run.test.ts`

Expected: 所有测试通过

- [ ] **Step 3: 运行完整测试套件**

Run: `npm test`

Expected: 所有测试通过

---

### Task 3: 提交修改

**Files:**
- 无文件改动，仅 git 操作

- [ ] **Step 1: 查看修改状态**

Run: `git status`

Expected: 显示 `src/commands/run.ts` 和 `tests/commands/run.test.ts` 已修改

- [ ] **Step 2: 提交修改**

Run: `git add src/commands/run.ts tests/commands/run.test.ts docs/superpowers/specs/2026-04-12-console-progress-display-fix-design.md && git commit -m "$(cat <<'EOF'
fix: 多轮执行时控制台进度实时刷新

- 移除 showProgress 的 runIndex === 0 条件限制
- 调整进度消息格式为 Step X/Y, Run Z/N...
- startStep 保持只在第一次运行时调用
- 添加多轮进度显示测试验证

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"`

---

## 自检清单

- ✅ Spec 覆盖：所有设计要求已实现
- ✅ 无 Placeholder：所有步骤包含具体代码
- ✅ 类型一致性：消息格式在各处一致