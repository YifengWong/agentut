import type { DistilledSession, DistilledStep } from '../distiller/types.js';
import type { YamlTestSuite } from '../../types/index.js';

export class MalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedResponseError';
  }
}

/**
 * 构造 LLM prompt，将 DistilledSession 格式化为结构化的分析请求。
 */
export function buildPrompt(session: DistilledSession): string {
  const parts: string[] = [];

  parts.push('你是一个测试用例生成专家。分析以下 Agent 会话，为每个步骤生成合适的断言。');
  parts.push('**禁止使用任何工具**');
  parts.push('');
  parts.push('## 会话信息');
  parts.push(`- 工作目录: ${session.workingDirectory}`);
  parts.push(`- 标题: ${session.title}`);
  parts.push('');

  parts.push('## 对话流程');
  for (const step of session.steps) {
    parts.push(formatStep(step));
  }

  parts.push('## 可用的断言类型');
  parts.push('1. should_call_tool: 验证调用了指定工具（支持字符串或 ToolCallAssertion 对象，含 Matcher 模式）');
  parts.push('2. should_produce_file: 验证文件存在（支持字符串或 Matcher 模式）');
  parts.push('3. file_content_contains: 验证文件内容包含指定文本（格式: {file: string, text: string}）');
  parts.push('4. response_contains: 验证 Agent 响应包含指定文本（支持字符串或 Matcher 模式）');
  parts.push('5. exec_command: 执行命令并验证输出（格式: {command: string, expect: Matcher}）');
  parts.push('6. judged_by: AI 裁判语义判断（格式: {judge: "default", prompt: string}）');
  parts.push('');

  parts.push('## 输出要求');
  parts.push('返回严格的 JSON（不要 markdown 代码块），格式如下：');
  parts.push('{');
  parts.push('  "name": "测试套件名称（中文，简洁描述测试目标）",');
  parts.push('  "description": "测试套件描述（可选）",');
  parts.push('  "scenarios": [{');
  parts.push('    "name": "场景名称",');
  parts.push('    "steps": [{');
  parts.push('      "input": "用户输入文本",');
  parts.push('      "expected": [');
  parts.push('        {"should_call_tool": "write"},');
  parts.push('        {"should_produce_file": "hello.txt"},');
  parts.push('        {"file_content_contains": {"file": "hello.txt", "text": "Hello"}},');
  parts.push('        {"response_contains": "创建成功"},');
  parts.push('        {"exec_command": {"command": "echo hello", "expect": {"contains": "hello"}}},');
  parts.push('        {"judged_by": {"judge": "default", "prompt": "检查文件是否正确创建"}}');
  parts.push('      ]');
  parts.push('    }]');
  parts.push('  }]');
  parts.push('}');

  return parts.join('\n');
}

function formatStep(step: DistilledStep): string {
  const lines: string[] = [];
  lines.push(`### Step ${step.index}`);
  lines.push(`- 用户输入: ${step.userInput}`);

  if (step.reasoning) {
    lines.push(`- 推理过程: ${step.reasoning}`);
  }

  if (step.toolCalls.length > 0) {
    lines.push('- 工具调用:');
    for (let i = 0; i < step.toolCalls.length; i++) {
      const tc = step.toolCalls[i];
      const statusLabel = tc.error ? `${tc.status} (错误: ${tc.error})` : tc.status;
      lines.push(`  ${i + 1}. ${tc.toolName} [${statusLabel}]`);
      if (Object.keys(tc.input).length > 0) {
        lines.push(`     输入: ${JSON.stringify(tc.input)}`);
      }
      if (tc.output) {
        lines.push(`     输出: ${tc.output}`);
      }
    }
  }

  if (step.fileChanges.length > 0) {
    const files = step.fileChanges.map(f => `${f.path} (${f.status})`).join(', ');
    lines.push(`- 文件变更: ${files}`);
  }

  if (step.assistantResponse) {
    lines.push(`- Agent 响应: ${step.assistantResponse}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 解析 LLM 原始响应为 YamlTestSuite 结构。
 *
 * @throws {MalformedResponseError} 当响应无法解析或缺少必需字段时
 */
export function parseResponse(rawResponse: string): YamlTestSuite {
  let jsonStr = rawResponse.trim();

  // Strip markdown code block if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new MalformedResponseError('Failed to parse LLM response as JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new MalformedResponseError('LLM response is not a valid JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (!obj['name'] || typeof obj['name'] !== 'string') {
    throw new MalformedResponseError('Missing required field: name');
  }

  if (!obj['scenarios']) {
    throw new MalformedResponseError('Missing required field: scenarios');
  }

  if (!Array.isArray(obj['scenarios'])) {
    throw new MalformedResponseError('scenarios must be an array');
  }

  for (let i = 0; i < obj['scenarios'].length; i++) {
    const scenario = obj['scenarios'][i] as Record<string, unknown>;
    const scenarioName = typeof scenario['name'] === 'string' ? scenario['name'] : `at index ${i}`;

    if (!scenario['name'] || typeof scenario['name'] !== 'string') {
      throw new MalformedResponseError(`Scenario at index ${i} is missing required field: name`);
    }

    if (!scenario['steps']) {
      throw new MalformedResponseError(`Scenario "${scenarioName}" is missing required field: steps`);
    }

    if (!Array.isArray(scenario['steps'])) {
      throw new MalformedResponseError(`Scenario "${scenarioName}" steps must be an array`);
    }

    for (let j = 0; j < (scenario['steps'] as unknown[]).length; j++) {
      const step = (scenario['steps'] as unknown[])[j] as Record<string, unknown>;
      if (!step['input'] || typeof step['input'] !== 'string') {
        throw new MalformedResponseError(
          `Step at index ${j} in scenario "${scenarioName}" is missing required field: input`
        );
      }
      if (!step['expected']) {
        throw new MalformedResponseError(
          `Step at index ${j} in scenario "${scenarioName}" is missing required field: expected`
        );
      }
    }
  }

  return parsed as YamlTestSuite;
}
