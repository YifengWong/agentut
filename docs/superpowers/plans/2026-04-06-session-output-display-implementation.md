# Session Output Display Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 markdown 和 html 格式测试报告中展示会话详细内容（Request、Response、Tool Calls、Raw Output）。

**Architecture:** 扩展现有的 markdown.ts 和 html.ts 格式化器，添加 `formatSessionOutput` 函数及其辅助函数，在 `formatStep` 中调用。

**Tech Stack:** TypeScript

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/output/formatters/markdown.ts` | 修改 | 添加会话输出格式化函数 |
| `src/output/formatters/html.ts` | 修改 | 添加会话输出格式化函数和样式 |
| `tests/output/formatters/markdown.test.ts` | 修改 | 添加会话输出测试用例 |
| `tests/output/formatters/html.test.ts` | 修改 | 添加会话输出测试用例 |

---

### Task 1: 添加 Markdown 会话输出格式化

**Files:**
- Modify: `src/output/formatters/markdown.ts`

- [ ] **Step 1: 添加辅助函数类型定义**

在文件顶部 import 之后添加：

```typescript
interface ToolCallInfo {
  tool: string;
  status: string;
  input: Record<string, unknown>;
  error?: string;
}
```

- [ ] **Step 2: 添加 extractTextResponses 辅助函数**

```typescript
function extractTextResponses(outputs: OpenCodeRunOutput[]): string[] {
  return outputs
    .filter(output => output.type === 'text' && output.part?.text)
    .map(output => output.part!.text as string);
}
```

- [ ] **Step 3: 添加 extractToolCalls 辅助函数**

```typescript
function extractToolCalls(outputs: OpenCodeRunOutput[]): ToolCallInfo[] {
  return outputs
    .filter(output => output.type === 'tool_use' && output.part?.tool)
    .map(output => ({
      tool: output.part!.tool as string,
      status: output.part?.state?.status || 'unknown',
      input: output.part?.state?.input || {},
      error: output.part?.state?.error
    }));
}
```

- [ ] **Step 4: 添加 formatSessionOutputMarkdown 主函数**

```typescript
function formatSessionOutputMarkdown(
  outputs: OpenCodeRunOutput[] | undefined,
  request: string
): string {
  if (!outputs || outputs.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const texts = extractTextResponses(outputs);
  const toolCalls = extractToolCalls(outputs);

  // Request
  lines.push('**Request:**');
  lines.push(`> ${request}`);
  lines.push('');

  // Response
  if (texts.length > 0) {
    lines.push('**Response:**');
    for (const text of texts) {
      lines.push(`> ${text.replace(/\n/g, '\n> ')}`);
    }
    lines.push('');
  }

  // Tool Calls
  if (toolCalls.length > 0) {
    lines.push('**Tool Calls:**');
    lines.push('');
    lines.push('| Tool | Status | Input |');
    lines.push('|------|--------|-------|');
    for (const tc of toolCalls) {
      const statusIcon = tc.status === 'completed' ? '✓' : '✗';
      const inputStr = Object.entries(tc.input)
        .map(([k, v]) => `${k}: \`${String(v).replace(/\n/g, ' ')}\``)
        .join('<br>');
      const errorStr = tc.error ? `<br>**Error:** ${tc.error}` : '';
      lines.push(`| ${tc.tool} | ${statusIcon} ${tc.status} | ${inputStr}${errorStr} |`);
    }
    lines.push('');
  }

  // Raw Output (collapsible)
  lines.push('<details>');
  lines.push('<summary>Raw Output</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(outputs, null, 2));
  lines.push('```');
  lines.push('</details>');
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 5: 在 formatStep 中调用 formatSessionOutputMarkdown**

在 `formatStep` 函数的断言输出之后、返回之前添加：

```typescript
// Session Output
if (step.actual_output && step.actual_output.length > 0) {
  lines.push(formatSessionOutputMarkdown(step.actual_output, step.input));
}
```

- [ ] **Step 6: 添加 import**

在文件顶部确保导入了 `OpenCodeRunOutput` 类型：

```typescript
import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput } from '../../types/index.js';
```

- [ ] **Step 7: 提交**

```bash
git add src/output/formatters/markdown.ts
git commit -m "feat: add session output formatting for markdown

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: 添加 HTML 会话输出格式化

**Files:**
- Modify: `src/output/formatters/html.ts`

- [ ] **Step 1: 添加辅助函数类型定义**

在文件顶部添加：

```typescript
interface ToolCallInfo {
  tool: string;
  status: string;
  input: Record<string, unknown>;
  error?: string;
}

function extractTextResponses(outputs: OpenCodeRunOutput[]): string[] {
  return outputs
    .filter(output => output.type === 'text' && output.part?.text)
    .map(output => output.part!.text as string);
}

function extractToolCalls(outputs: OpenCodeRunOutput[]): ToolCallInfo[] {
  return outputs
    .filter(output => output.type === 'tool_use' && output.part?.tool)
    .map(output => ({
      tool: output.part!.tool as string,
      status: output.part?.state?.status || 'unknown',
      input: output.part?.state?.input || {},
      error: output.part?.state?.error
    }));
}
```

- [ ] **Step 2: 添加 formatSessionOutputHtml 函数**

```typescript
function formatSessionOutputHtml(
  outputs: OpenCodeRunOutput[] | undefined,
  request: string
): string {
  if (!outputs || outputs.length === 0) {
    return '';
  }

  const texts = extractTextResponses(outputs);
  const toolCalls = extractToolCalls(outputs);

  const requestHtml = `
    <div class="session-request">
      <strong>Request:</strong>
      <blockquote>${escapeHtml(request)}</blockquote>
    </div>`;

  const responseHtml = texts.length > 0 ? `
    <div class="session-response">
      <strong>Response:</strong>
      ${texts.map(t => `<blockquote>${escapeHtml(t).replace(/\n/g, '<br>')}</blockquote>`).join('\n')}
    </div>` : '';

  const toolCallsHtml = toolCalls.length > 0 ? `
    <div class="session-tool-calls">
      <strong>Tool Calls:</strong>
      <table>
        <tr><th>Tool</th><th>Status</th><th>Input</th></tr>
        ${toolCalls.map(tc => {
          const statusIcon = tc.status === 'completed' ? '✓' : '✗';
          const inputStr = Object.entries(tc.input)
            .map(([k, v]) => `${k}: <code>${escapeHtml(String(v).replace(/\n/g, ' '))}</code>`)
            .join('<br>');
          const errorStr = tc.error ? `<br><strong>Error:</strong> ${escapeHtml(tc.error)}` : '';
          return `<tr>
            <td>${escapeHtml(tc.tool)}</td>
            <td>${statusIcon} ${escapeHtml(tc.status)}</td>
            <td>${inputStr}${errorStr}</td>
          </tr>`;
        }).join('\n')}
      </table>
    </div>` : '';

  const rawOutputHtml = `
    <details class="session-raw">
      <summary>Raw Output</summary>
      <pre><code>${escapeHtml(JSON.stringify(outputs, null, 2))}</code></pre>
    </details>`;

  return `
    <div class="step-session">
      ${requestHtml}
      ${responseHtml}
      ${toolCallsHtml}
      ${rawOutputHtml}
    </div>`;
}
```

- [ ] **Step 3: 添加 CSS 样式**

在 `<style>` 标签内添加：

```css
.step-session { margin: 15px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; }
.session-request, .session-response { margin: 10px 0; }
.session-request blockquote, .session-response blockquote {
  margin: 5px 0; padding: 10px; background: #fff; border-left: 3px solid #3498db;
}
.session-tool-calls table { width: 100%; border-collapse: collapse; margin: 10px 0; }
.session-tool-calls th, .session-tool-calls td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.session-tool-calls td code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
.session-raw { margin-top: 10px; }
.session-raw pre { background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; }
```

- [ ] **Step 4: 在 formatStep 中调用 formatSessionOutputHtml**

在 `formatStep` 函数的断言输出之后添加：

```typescript
// Session Output
if (step.actual_output && step.actual_output.length > 0) {
  return `
    <div class="step">
      ...
      ${step.assertions.length > 0 ? `...` : ''}
      ${formatSessionOutputHtml(step.actual_output, step.input)}
    </div>`;
}
```

- [ ] **Step 5: 更新 import**

```typescript
import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput } from '../../types/index.js';
```

- [ ] **Step 6: 提交**

```bash
git add src/output/formatters/html.ts
git commit -m "feat: add session output formatting for html

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: 添加 Markdown 格式化器单元测试

**Files:**
- Modify: `tests/output/formatters/markdown.test.ts`

- [ ] **Step 1: 添加测试 fixtures**

在文件中添加：

```typescript
const mockSessionOutput: OpenCodeRunOutput[] = [
  { type: 'text', part: { text: '好的，我来帮你创建这个文件。' } },
  { type: 'tool_use', part: { tool: 'write', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt', content: 'Hello World' }
  }}},
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt' }
  }}},
  { type: 'text', part: { text: '文件已成功创建。' } }
];

const mockErrorOutput: OpenCodeRunOutput[] = [
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'error',
    input: { filePath: '/nonexistent.txt' },
    error: 'File not found'
  }}}
];
```

- [ ] **Step 2: 添加测试用例**

```typescript
describe('formatSessionOutput (Markdown)', () => {
  it('should format complete session with text and tool calls', () => {
    const result = formatSessionOutputMarkdown(mockSessionOutput, '创建文件');
    expect(result).toContain('**Request:**');
    expect(result).toContain('创建文件');
    expect(result).toContain('**Response:**');
    expect(result).toContain('好的，我来帮你创建这个文件。');
    expect(result).toContain('**Tool Calls:**');
    expect(result).toContain('| write | ✓ completed |');
    expect(result).toContain('| read | ✓ completed |');
  });

  it('should format tool call with error status', () => {
    const result = formatSessionOutputMarkdown(mockErrorOutput, '读取文件');
    expect(result).toContain('| read | ✗ error |');
    expect(result).toContain('File not found');
  });

  it('should return empty string for empty output', () => {
    const result = formatSessionOutputMarkdown([], 'test');
    expect(result).toBe('');
  });
});
```

- [ ] **Step 3: 导出 formatSessionOutputMarkdown 用于测试**

在 `src/output/formatters/markdown.ts` 底部添加导出：

```typescript
export { formatSessionOutputMarkdown };
```

- [ ] **Step 4: 提交**

```bash
git add tests/output/formatters/markdown.test.ts src/output/formatters/markdown.ts
git commit -m "test: add session output tests for markdown formatter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: 添加 HTML 格式化器单元测试

**Files:**
- Modify: `tests/output/formatters/html.test.ts`

- [ ] **Step 1: 添加测试 fixtures**

```typescript
const mockSessionOutput: OpenCodeRunOutput[] = [
  { type: 'text', part: { text: '好的，我来帮你创建这个文件。' } },
  { type: 'tool_use', part: { tool: 'write', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt', content: 'Hello World' }
  }}}
];

const mockErrorOutput: OpenCodeRunOutput[] = [
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'error',
    input: { filePath: '/nonexistent.txt' },
    error: 'File not found'
  }}}
];
```

- [ ] **Step 2: 添加测试用例**

```typescript
describe('formatSessionOutput (HTML)', () => {
  it('should format complete session with proper HTML structure', () => {
    const result = formatSessionOutputHtml(mockSessionOutput, '创建文件');
    expect(result).toContain('<div class="step-session">');
    expect(result).toContain('<div class="session-request">');
    expect(result).toContain('<div class="session-response">');
    expect(result).toContain('<div class="session-tool-calls">');
    expect(result).toContain('<td>write</td>');
    expect(result).toContain('✓ completed');
  });

  it('should escape HTML special characters', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Test <script>alert("xss")</script>' } }
    ];
    const result = formatSessionOutputHtml(output, 'test');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('should format error status', () => {
    const result = formatSessionOutputHtml(mockErrorOutput, '读取文件');
    expect(result).toContain('✗ error');
    expect(result).toContain('File not found');
  });

  it('should return empty string for empty output', () => {
    const result = formatSessionOutputHtml([], 'test');
    expect(result).toBe('');
  });
});
```

- [ ] **Step 3: 导出 formatSessionOutputHtml 用于测试**

在 `src/output/formatters/html.ts` 底部添加导出：

```typescript
export { formatSessionOutputHtml };
```

- [ ] **Step 4: 提交**

```bash
git add tests/output/formatters/html.test.ts src/output/formatters/html.ts
git commit -m "test: add session output tests for html formatter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: 集成测试验证

**Files:**
- None (manual verification)

- [ ] **Step 1: 运行单元测试**

```bash
npm test
```

预期：所有测试通过。

- [ ] **Step 2: 运行集成测试（Markdown）**

```bash
cd D:/Projects/agentut && node dist/cli.js run ./example/tests/file-operations.yaml --verbose -f markdown -o report.md
```

检查 `report.md` 是否包含：
- `**Request:**` 部分
- `**Response:**` 部分
- `**Tool Calls:**` 表格
- `<details>` 折叠的 Raw Output

- [ ] **Step 3: 运行集成测试（HTML）**

```bash
cd D:/Projects/agentut && node dist/cli.js run ./example/tests/file-operations.yaml --verbose -f html -o report.html
```

在浏览器中打开 `report.html`，检查：
- 会话内容卡片样式正确
- Request/Response 显示完整
- Tool Calls 表格格式正确
- Raw Output 可折叠展开

---

### Task 6: 更新 README.md 文档

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在输出格式部分添加会话内容说明**

在 README.md 的 `## 输出格式` 部分之后添加：

```markdown
### 会话内容展示

使用 `--verbose` 参数时，markdown 和 html 格式的测试报告会包含完整的会话内容：

- **Request**: 用户的输入请求
- **Response**: Agent 的文本响应
- **Tool Calls**: 工具调用列表（工具名、状态、输入参数）
- **Raw Output**: 原始 JSON 输出（折叠显示）

示例：

\`\`\`bash
agentut run ./tests/ --verbose -f markdown -o report.md
agentut run ./tests/ --verbose -f html -o report.html
\`\`\`
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: update README with session output display feature

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## 验证清单

- [ ] 单元测试全部通过
- [ ] Markdown 报告包含 Request/Response/Tool Calls/Raw Output
- [ ] HTML 报告包含格式化的会话内容卡片
- [ ] HTML 正确转义特殊字符
- [ ] 错误状态正确显示 ✗ error
- [ ] README.md 已更新会话内容展示说明