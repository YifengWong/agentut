import type { ExportedSession, Message } from '../types/index.js';
import type { SessionDistiller, DistilledSession, DistilledStep, FileChange } from './types.js';
import { extractToolInfo, truncateOutput } from './extract.js';

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
