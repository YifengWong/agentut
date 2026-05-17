import type { ExportedSession, Message, OpenCodeRunOutput } from '../types/index.js';
import type { SessionDistiller, DistilledSession, DistilledStep, DistilledToolCall, FileChange } from './types.js';
import { extractText, extractToolInfo, truncateOutput } from './extract.js';

const MAX_REASONING_LENGTH = 200;

function extractUserInputFromMessage(message: Message): string {
  for (const part of message.parts) {
    if (part.type === 'text' && part.text) {
      let text = part.text.trim();
      if ((text.startsWith('"') && text.endsWith('"')) ||
          (text.startsWith("'") && text.endsWith("'"))) {
        text = text.slice(1, -1);
      }
      return text;
    }
  }
  return '';
}

export class OpenCodeDistiller implements SessionDistiller {
  readonly runnerType = 'opencode';

  distill(rawSession: unknown): DistilledSession {
    const session = rawSession as ExportedSession;

    const steps: DistilledStep[] = [];
    let currentStep: DistilledStep | null = null;
    let stepIndex = 0;
    const seenFiles = new Set<string>();

    for (const message of session.messages) {
      if (message.info.role === 'user') {
        if (currentStep) {
          steps.push(currentStep);
        }

        stepIndex++;
        const userInput = extractUserInputFromMessage(message);
        const fileChanges = this.extractFileChanges(message, seenFiles);

        currentStep = {
          index: stepIndex,
          userInput,
          toolCalls: [],
          fileChanges
        };
      }

      if (message.info.role === 'assistant' && currentStep) {
        for (const part of message.parts) {
          if (part.type === 'reasoning' && part.text) {
            const text = part.text;
            currentStep.reasoning = text.length > MAX_REASONING_LENGTH
              ? text.slice(0, MAX_REASONING_LENGTH) + '...'
              : text;
          }

          if (part.type === 'tool' && part.tool) {
            const info = extractToolInfo(part);
            if (info) {
              currentStep.toolCalls.push({
                toolName: info.toolName,
                status: info.status,
                input: info.input,
                output: truncateOutput(info.toolName, info.input, info.output),
                error: info.error,
              });
            }
          }

          if (part.type === 'text' && part.text && part.text.trim()) {
            currentStep.assistantResponse = part.text.trim();
          }
        }
      }
    }

    if (currentStep) {
      steps.push(currentStep);
    }

    return {
      workingDirectory: session.info.directory,
      title: session.info.title,
      steps
    };
  }

  /**
   * 从 OpenCodeRunOutput[] 直接蒸馏为 DistilledSession
   * 将整个 outputs 数组当作一个步骤处理
   */
  distillOutputs(outputs: OpenCodeRunOutput[], workingDir: string = ''): DistilledSession {
    const toolCalls: DistilledToolCall[] = [];
    const textResponses: string[] = [];
    let lastTextResponse: string | undefined;

    for (const output of outputs) {
      // 提取文本响应
      if (output.type === 'text') {
        const text = extractText(output);
        if (text) {
          textResponses.push(text);
          lastTextResponse = text;
        }
      }

      // 提取工具调用
      if (output.type === 'tool_use') {
        const info = extractToolInfo(output);
        if (info) {
          toolCalls.push({
            toolName: info.toolName,
            status: info.status,
            input: info.input,
            output: truncateOutput(info.toolName, info.input, info.output),
            error: info.error,
          });
        }
      }
    }

    return {
      workingDirectory: workingDir,
      title: '',
      steps: [{
        index: 1,
        userInput: '',
        toolCalls,
        assistantResponse: lastTextResponse,
        fileChanges: [],
      }]
    };
  }

  private extractFileChanges(message: Message, seenFiles: Set<string>): FileChange[] {
    const changes: FileChange[] = [];
    const diffs = message.info.summary?.diffs;

    if (diffs) {
      for (const diff of diffs) {
        const raw = diff as unknown as { file?: string; status?: string };
        if (raw.file && !seenFiles.has(raw.file)) {
          seenFiles.add(raw.file);
          changes.push({
            path: raw.file,
            status: (raw.status as FileChange['status']) || 'modified'
          });
        }
      }
    }
    return changes;
  }
}

/**
 * 将 DistilledSession 格式化为嵌入 judge prompt 的精炼文本
 * 只输出事实描述，不含任何指令
 */
export function formatForJudge(session: DistilledSession): string {
  const parts: string[] = [];
  parts.push('---');
  parts.push('');
  parts.push('## Step Execution Summary');
  parts.push('');

  for (const step of session.steps) {
    // 文本响应
    if (step.assistantResponse) {
      parts.push('### Agent Response');
      parts.push(step.assistantResponse);
      parts.push('');
    }

    // 工具调用
    if (step.toolCalls.length > 0) {
      parts.push('### Tool Calls');
      for (let i = 0; i < step.toolCalls.length; i++) {
        const tc = step.toolCalls[i];
        const inputSummary = Object.keys(tc.input).length > 0
          ? ` → ${JSON.stringify(tc.input)}`
          : '';
        parts.push(`${i + 1}. **${tc.toolName}**${inputSummary}`);
        if (tc.output) {
          parts.push(`   Output: ${tc.output}`);
        }
        if (tc.error) {
          parts.push(`   Error: ${tc.error}`);
        }
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}
