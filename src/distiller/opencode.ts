import type { ExportedSession, Part, Message } from '../types/index.js';
import type { SessionDistiller, DistilledSession, DistilledStep, DistilledToolCall, FileChange } from './types.js';

const MAX_OUTPUT_LENGTH = 500;
const MAX_REASONING_LENGTH = 200;

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
        const userInput = this.extractUserInput(message);
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
            currentStep.toolCalls.push(this.extractToolCall(part));
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

  private extractUserInput(message: Message): string {
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

  private extractToolCall(part: Part): DistilledToolCall {
    const p = part as unknown as {
      tool?: string;
      state?: {
        status?: string;
        input?: Record<string, unknown>;
        output?: string;
        error?: string;
      };
    };

    const toolName = p.tool || 'unknown';
    const status = (p.state?.status as DistilledToolCall['status']) || 'completed';
    const input = p.state?.input || {};
    let output = p.state?.output;
    const error = p.state?.error;

    if (toolName === 'skill' && input['name']) {
      output = `[Loaded skill: ${input['name']}]`;
    } else if (output && output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH) + '...';
    }

    return { toolName, status, input, output, error };
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
