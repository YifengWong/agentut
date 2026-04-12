# agentvcr → agentut 重命名实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目中所有 agentvcr 相关命名替换为 agentut

**Architecture:** 简单的文本替换任务，按文件类型分组执行

**Tech Stack:** TypeScript, Node.js CLI

---

## 文件修改清单

| 文件 | 修改类型 |
|------|----------|
| `package.json` | description 替换 |
| `src/cli.ts` | CLI name 和 description |
| `src/commands/run.ts` | 临时目录路径 |
| `.gitignore` | 目录名 |
| `README.md` | CLI 命令和概念说明 |
| `docs/superpowers/specs/*.md` (6个) | CLI 命令示例 |
| `docs/superpowers/plans/*.md` (6个) | CLI 命令示例 |
| `skill/SKILL.md` | CLI 命令引用 |
| `.claude/settings.local.json` | 路径引用 |

---

### Task 1: 核心代码文件修改

**Files:**
- Modify: `package.json`
- Modify: `src/cli.ts`
- Modify: `src/commands/run.ts`
- Modify: `.gitignore`

- [ ] **Step 1: 修改 package.json description**

替换第 3 行：
```json
"description": "Agentut - Test framework for opencode Agent behaviors",
```

- [ ] **Step 2: 修改 src/cli.ts CLI 名称和描述**

替换第 15-17 行：
```typescript
program
  .name('agentut')
  .description('Agentut - Test framework for opencode Agent behaviors')
  .version('1.0.0');
```

- [ ] **Step 3: 修改 src/commands/run.ts 临时目录路径**

替换第 67 行：
```typescript
const tempRoot = path.resolve(yamlDirectory, '.agentut', 'temp');
```

- [ ] **Step 4: 修改 .gitignore**

替换第 5 行：
```
.agentut/
```

- [ ] **Step 5: 验证构建**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 6: 提交核心代码修改**

```bash
git add package.json src/cli.ts src/commands/run.ts .gitignore
git commit -m "refactor: rename CLI from agentvcr to agentut"
```

---

### Task 2: README.md 修改

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 替换标题和概念说明**

替换第 1-7 行：
```markdown
# Agentut

Agentut 是一个为 opencode Agent 工程提供单元测试能力的 TypeScript CLI 工具。通过记录用户输入序列和关键检查点，每次完整重放测试，验证 Agent 行为是否符合预期。

## 核心理念

**只记录输入，不记录响应**。测试用例存储用户输入序列和预期断言，每次运行都使用最新的 Skills/Rules 从头执行，确保测试始终验证当前行为。
```

- [ ] **Step 2: 替换安装命令**

替换第 11-12 行：
```markdown
```bash
npm install -g agentut
```
```

- [ ] **Step 3: 替换所有 CLI 命令示例**

使用全局替换：
- `agentvcr init` → `agentut init`
- `agentvcr suggest` → `agentut suggest`
- `agentvcr run` → `agentut run`
- `agentvcr report` → `agentut report`

- [ ] **Step 4: 替换 CLI 命令章节标题**

替换第 332 行：
```markdown
### agentut init
```

替换第 344 行：
```markdown
### agentut suggest
```

替换第 359 行：
```markdown
### agentut run
```

替换第 379 行：
```markdown
### agentut report
```

- [ ] **Step 5: 提交 README 修改**

```bash
git add README.md
git commit -m "docs: update README with agentut branding"
```

---

### Task 3: 设计文档修改

**Files:**
- Modify: `docs/superpowers/specs/2026-04-08-probabilistic-test-threshold-design.md`
- Modify: `docs/superpowers/specs/2026-04-08-probabilistic-test-threshold-design.md`
- Modify: `docs/superpowers/specs/2026-04-06-setup-copy-flexible-config-design.md`
- Modify: `docs/superpowers/specs/2026-04-06-session-output-display-design.md`
- Modify: `docs/superpowers/specs/2026-04-06-run-command-console-logging-design.md`
- Modify: `docs/superpowers/specs/2026-03-29-example-skills-design.md`

- [ ] **Step 1: 批量替换 specs 目录 CLI 命令**

对每个 specs 文件执行替换：
- `agentvcr run` → `agentut run`
- `agentvcr suggest` → `agentut suggest`
- `.agentvcr/` → `.agentut/`

- [ ] **Step 2: 提交 specs 修改**

```bash
git add docs/superpowers/specs/*.md
git commit -m "docs: update specs with agentut CLI commands"
```

---

### Task 4: 实现计划文档修改

**Files:**
- Modify: `docs/superpowers/plans/2026-04-11-output-verbosity-optimization.md`
- Modify: `docs/superpowers/plans/2026-04-08-probabilistic-test-threshold.md`
- Modify: `docs/superpowers/plans/2026-04-07-agent-runner-abstraction.md`
- Modify: `docs/superpowers/plans/2026-04-06-run-command-console-logging.md`
- Modify: `docs/superpowers/plans/2026-04-06-matcher-based-assertions.md`
- Modify: `docs/superpowers/plans/2026-04-06-session-output-display-implementation.md`
- Modify: `docs/superpowers/plans/2026-03-29-example-skills-implementation.md`

- [ ] **Step 1: 批量替换 plans 目录 CLI 命令**

对每个 plans 文件执行替换：
- `agentvcr run` → `agentut run`
- `agentvcr suggest` → `agentut suggest`
- `.agentvcr/` → `.agentut/`

- [ ] **Step 2: 提交 plans 修改**

```bash
git add docs/superpowers/plans/*.md
git commit -m "docs: update plans with agentut CLI commands"
```

---

### Task 5: 其他文件修改

**Files:**
- Modify: `skill/SKILL.md`
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: 修改 skill/SKILL.md**

替换所有 `agentvcr` → `agentut`

- [ ] **Step 2: 修改 .claude/settings.local.json**

替换路径中的 `agentvcr` → `agentut`

- [ ] **Step 3: 提交其他文件修改**

```bash
git add skill/SKILL.md .claude/settings.local.json
git commit -m "refactor: update skill and settings with agentut name"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 搜索确认无遗漏**

Run: `grep -r "agentvcr" --include="*.ts" --include="*.md" --include="*.json" .`
Expected: 只剩临时运行目录 `example/tests/.agentvcr/temp/` (无需修改)

- [ ] **Step 2: 构建验证**

Run: `npm run build && npm test`
Expected: 构建和测试均成功

- [ ] **Step 3: 最终提交汇总（可选）**

如果需要合并提交：
```bash
# 合并所有提交为一个
git rebase -i HEAD~5
```