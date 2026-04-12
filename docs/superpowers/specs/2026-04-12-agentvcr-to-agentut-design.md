---
name: agentvcr-to-agentut-rename
description: 项目重命名设计文档 - agentvcr → agentut
type: project
---

# 项目重命名设计：agentvcr → agentut

**日期**: 2026-04-12
**决策**: 完全替换所有 "Agent VCR" 相关内容，包括概念说明

## 修改范围

### 1. 核心代码

| 文件 | 当前内容 | 修改后 |
|------|----------|--------|
| `package.json` | name: agentut (已修改), description: "Agent VCR - Test framework..." | description: "Agentut - Test framework for opencode Agent behaviors" |
| `src/cli.ts` | `.name('agentvcr')`, `.description('Agent VCR...')` | `.name('agentut')`, `.description('Agentut - Test framework...')` |
| `src/commands/run.ts` | `path.resolve(yamlDirectory, '.agentvcr', 'temp')` | `path.resolve(yamlDirectory, '.agentut', 'temp')` |
| `.gitignore` | `.agentvcr/` | `.agentut/` |

### 2. 临时目录

- **新格式**: `.agentut/temp/{scenario-name}-{uuid}-{timestamp}/`
- **向后兼容**: 无需兼容，这是内部路径，不影响用户

### 3. 文档文件

| 文件 | 修改策略 |
|------|----------|
| `README.md` | 全文替换 CLI 命令 `agentvcr` → `agentut`，概念说明 "Agent VCR" → "Agentut 测试框架" |
| `docs/superpowers/specs/*.md` (6个) | 替换 CLI 命令示例和路径引用 |
| `docs/superpowers/plans/*.md` (6个) | 替换 CLI 命令示例和路径引用 |
| `skill/SKILL.md` | 替换引用 |
| `.claude/settings.local.json` | 替换路径引用 |

### 4. 不需要修改

- `example/tests/.agentvcr/temp/` - 临时运行目录，运行时会自动创建 `.agentut/`
- 历史设计文档标题 - 保持历史准确性（如 `2026-03-29-agent-vcr-design.md`）

## Why

用户决定将项目名称从 "agentvcr" 更改为 "agentut"，需要全面更新所有相关引用以保持一致性。

## How to apply

按照上述表格逐文件修改，使用精确字符串替换。