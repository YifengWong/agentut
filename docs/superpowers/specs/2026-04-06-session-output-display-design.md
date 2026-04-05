# Session Output Display Enhancement Design

## Goal

在 markdown 和 html 格式测试报告中展示会话详细内容，便于测试回溯和验证。

## Background

当前状态：
- `--verbose` 模式下，JSON 格式输出包含 `actual_output`（完整的 opencode 会话输出）
- markdown 和 html 格式化器未处理 `actual_output` 字段
- 用户无法在可读性更好的格式中查看会话内容

## Design

### 展示内容

从 `actual_output: OpenCodeRunOutput[]` 中提取并展示（按顺序）：

1. **Request** - 用户的输入请求（step.input）
2. **Response** - Agent 的文本响应（完整展示，不截断）
3. **Tool Calls** - 工具调用列表（完整输入参数）
4. **Raw Output** - 原始 JSON（折叠，可选）

### 数据提取逻辑

**文本响应提取：**
```typescript
// type === 'text' 的输出
{
  type: 'text',
  part: { text: '...' }
}
```

**工具调用提取：**
```typescript
// type === 'tool_use' 的输出
{
  type: 'tool_use',
  part: {
    tool: 'write',
    state: {
      status: 'completed',  // 或 'error'
      input: { ... },       // 完整输入参数
      output: '...',        // 工具输出摘要
      error: '...'          // 错误信息（如有）
    }
  }
}
```

**不展示的事件类型：**
- `step_start` / `step_finish` - 仅标记，无实质内容

### Markdown 格式

```markdown
#### Step 1

**Request:**
> 创建 hello.txt 文件，内容为 'Hello World'

**Response:**
> 文件已成功创建。hello.txt 现在包含指定的内容 "Hello World"。

**Tool Calls:**

| Tool | Status | Input |
|------|--------|-------|
| write | ✓ completed | filePath: `hello.txt`<br>content: `Hello World` |

<details>
<summary>Raw Output</summary>

```json
[{"type":"tool_use","part":{...}}]
```
</details>
```

### HTML 格式

使用卡片样式展示 Request/Response/Tool Calls：

```html
<div class="step-session">
  <div class="request">
    <strong>Request:</strong>
    <blockquote>创建 hello.txt 文件...</blockquote>
  </div>
  <div class="response">
    <strong>Response:</strong>
    <blockquote>文件已成功创建...</blockquote>
  </div>
  <div class="tool-calls">
    <strong>Tool Calls:</strong>
    <table>
      <tr><th>Tool</th><th>Status</th><th>Input</th></tr>
      <tr><td>write</td><td>✓ completed</td><td>filePath: hello.txt<br>content: Hello World</td></tr>
    </table>
  </div>
  <details>
    <summary>Raw Output</summary>
    <pre><code>...</code></pre>
  </details>
</div>
```

### CSS 样式（HTML）

```css
.step-session { margin: 15px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; }
.request, .response { margin: 10px 0; }
.request blockquote, .response blockquote {
  margin: 5px 0; padding: 10px; background: #fff; border-left: 3px solid #3498db;
}
.tool-calls table { width: 100%; border-collapse: collapse; margin: 10px 0; }
.tool-calls th, .tool-calls td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.tool-calls td code { background: #f4f4f4; padding: 2px 4px; }
```

## Implementation

修改文件：
1. `src/output/formatters/markdown.ts` - 添加 `formatSessionOutput` 函数
2. `src/output/formatters/html.ts` - 添加 `formatSessionOutput` 函数和样式

### 函数签名

```typescript
// 在两个格式化器中添加
function formatSessionOutput(
  outputs: OpenCodeRunOutput[] | undefined,
  request: string
): string

// 辅助函数
function extractTextResponses(outputs: OpenCodeRunOutput[]): string[]
function extractToolCalls(outputs: OpenCodeRunOutput[]): ToolCallInfo[]

interface ToolCallInfo {
  tool: string;
  status: string;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
}
```

### 调用位置

在 `formatStep` 函数中，断言列表之后添加会话输出展示：

```typescript
function formatStep(step: StepResult, index: number): string {
  // ... 现有代码 ...

  // 新增：会话输出
  if (step.actual_output && step.actual_output.length > 0) {
    lines.push(formatSessionOutput(step.actual_output, step.input));
  }
}
```

## Testing

### Unit Tests

测试文件位置：`tests/output/formatters/session-output.test.ts`

#### Test Fixtures

```typescript
// 完整会话输出（含文本响应 + 工具调用）
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

// 工具调用错误
const mockErrorOutput: OpenCodeRunOutput[] = [
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'error',
    input: { filePath: '/nonexistent.txt' },
    error: 'File not found'
  }}}
];
```

#### Test Cases

| 场景 | 输入 | 预期输出 |
|------|------|----------|
| 完整会话（Markdown） | mockSessionOutput, request="创建文件" | 包含 Request/Response/Tool Calls 表格，状态 ✓ completed |
| 完整会话（HTML） | mockSessionOutput, request="创建文件" | 包含 `<div class="step-session">` 结构，表格含工具调用 |
| 工具错误 | mockErrorOutput | 状态显示 ✗ error，包含错误信息 |
| 空输出 | [] | 返回空字符串 |
| HTML 转义 | text 含 `<script>` | 输出中 `<` 转义为 `&lt;` |

#### Running Tests

```bash
npm test -- tests/output/formatters/session-output.test.ts
```

### Integration Tests

使用现有 example 测试验证：
```bash
agentvcr run ./example/tests/file-operations.yaml --verbose -f markdown -o report.md
agentvcr run ./example/tests/file-operations.yaml --verbose -f html -o report.html
```

预期结果：
- report.md 包含完整的 Request/Response/Tool Calls
- report.html 包含格式化的会话内容卡片