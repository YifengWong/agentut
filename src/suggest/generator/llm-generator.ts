import type { AgentRunner, RunOptions } from '../../runner/types.js';
import type { YamlTestSuite } from '../../types/index.js';
import type { DistilledSession } from '../distiller/types.js';
import { buildPrompt, parseResponse } from './prompt.js';

export interface GeneratorOptions {
  model?: string;
  agent?: string;
}

/**
 * 使用 LLM 推理分析 DistilledSession，生成包含语义断言的 YamlTestSuite。
 *
 * @param session - 蒸馏后的会话
 * @param runner - Agent runner 实例（用于调用 LLM）
 * @param options - 可选的 model/agent 覆盖
 * @returns 包含语义断言的 YamlTestSuite
 * @throws {MalformedResponseError} LLM 响应格式不符合要求时
 */
export async function generateAssertions(
  session: DistilledSession,
  runner: AgentRunner,
  options: GeneratorOptions = {}
): Promise<YamlTestSuite> {
  const prompt = buildPrompt(session);

  const runOpts: RunOptions = {
    input: prompt,
    timeout: 180000
  };

  if (options.model) {
    runOpts.model = options.model;
  }
  if (options.agent) {
    runOpts.agent = options.agent;
  }

  const result = runner.run(runOpts);

  // Extract text content from runner outputs
  const textOutputs: string[] = [];
  for (const output of result.outputs) {
    if (output.part?.text && output.part.text.trim()) {
      textOutputs.push(output.part.text);
    }
    if (output.data?.content && output.data.content.trim()) {
      textOutputs.push(output.data.content);
    }
  }

  if (textOutputs.length === 0) {
    throw new Error('No text output from LLM');
  }

  const combinedOutput = textOutputs.join('\n');
  return parseResponse(combinedOutput);
}
