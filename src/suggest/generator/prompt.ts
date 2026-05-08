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

  parts.push('【任务】仅输出 JSON，不使用任何工具，不执行任何命令。');
  parts.push('');
  parts.push('以下是一段已结束的 Agent 会话的历史记录。');
  parts.push('整个会话为一个「场景 (scenario)」，会话中的每一轮用户输入为一个「步骤 (step)」。');
  parts.push(`该会话共 ${session.steps.length} 个步骤，你必须输出恰好 ${session.steps.length} 个 step。`);
  parts.push('');

  parts.push('注意：这是「静态分析」，不是「继续执行」。你看到的所有工具调用、');
  parts.push('文件路径、命令都是「历史记录中已经发生的事」，你只需要「描述期望」，');
  parts.push('不需要重复执行它们。');
  parts.push('');

  parts.push('---');
  parts.push('');
  parts.push('【会话元信息】');
  parts.push(`工作目录: ${session.workingDirectory}`);
  parts.push(`标题: ${session.title}`);
  parts.push('');

  parts.push('【会话记录】');
  for (const step of session.steps) {
    parts.push(formatStep(step));
  }

  parts.push('---');
  parts.push('');
  parts.push('【断言类型参考】');
  parts.push('- should_call_tool:   验证 Agent 调用了指定工具');
  parts.push('- should_produce_file: 验证工作目录中产生了指定文件');
  parts.push('- file_content_contains: 验证文件内容包含指定文本');
  parts.push('- response_contains:  验证 Agent 的文本响应中包含指定字符串');
  parts.push('- exec_command:       执行命令并验证其输出');
  parts.push('- judged_by:          AI 裁判语义判断');
  parts.push('');

  parts.push('【输出格式】');
  parts.push('1 个会话 = 1 个 scenario，每个用户输入 = 1 个 step。仅输出 JSON：');
  parts.push('{"name":"测试名称","description":"可选描述","scenarios":[{"name":"场景名","steps":[');
  parts.push(`  {"input":"用户输入原文","expected":[{"断言类型":"断言值"}]}  // 共 ${session.steps.length} 个 step`);
  parts.push(']}]}');
  parts.push('');
  parts.push('现在输出 JSON：');

  return parts.join('\n');
}

/** 命令类工具 —— 输入中的 command 字段容易被 LLM 误执行，只展示描述 */
const COMMAND_TOOLS = new Set(['bash', 'shell', 'exec', 'execute_command']);

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  if (COMMAND_TOOLS.has(toolName) && input['description']) {
    return `[描述: ${input['description']}]`;
  }
  return JSON.stringify(input);
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
        lines.push(`     输入: ${formatToolInput(tc.toolName, tc.input)}`);
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
