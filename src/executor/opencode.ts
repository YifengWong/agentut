import { execSync } from 'child_process';
import {
  ExecutionError,
  TimeoutError,
  type OpenCodeRunOutput,
  type ExportedSession
} from '../types/index.js';

interface RunOpenCodeOptions {
  input: string;
  directory?: string;
  sessionId?: string;
  fork?: boolean;
  timeout?: number;
  model?: string;
  agent?: string;
}

interface RunOpenCodeResult {
  outputs: OpenCodeRunOutput[];
  sessionId: string;
}

export function runOpenCode(options: RunOpenCodeOptions): RunOpenCodeResult {
  const args = ['opencode run'];

  // Add the input message (escaped)
  args.push(`"${options.input.replace(/"/g, '\\"')}"`);

  // Add directory for first step
  if (options.directory) {
    args.push(`--dir "${options.directory}"`);
  }

  // Add session for continuation
  if (options.sessionId) {
    args.push(`--session ${options.sessionId}`);
  }

  // Add fork flag
  if (options.fork) {
    args.push('--fork');
  }

  // Always use JSON format
  args.push('--format json');

  // Add optional model
  if (options.model) {
    args.push(`--model ${options.model}`);
  }

  // Add optional agent
  if (options.agent) {
    args.push(`--agent ${options.agent}`);
  }

  const command = args.join(' ');
  const timeout = options.timeout || 120000;

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      cwd: options.directory || process.cwd()
    });

    // Parse JSON stream output
    const outputs: OpenCodeRunOutput[] = [];
    const lines = output.trim().split('\n');
    let lastSessionId = '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line) as OpenCodeRunOutput;
          outputs.push(parsed);
          // Check both new format (sessionID) and legacy format (session_id)
          const sessionId = (parsed as { sessionID?: string; session_id?: string }).sessionID ||
                           (parsed as { session_id?: string }).session_id;
          if (sessionId) {
            lastSessionId = sessionId;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    return {
      outputs,
      sessionId: lastSessionId
    };
  } catch (error) {
    if (error instanceof Error) {
      const nodeError = error as Error & { code?: string };
      if (nodeError.code === 'ETIMEDOUT') {
        throw new TimeoutError(
          `OpenCode execution timed out after ${timeout}ms`,
          timeout
        );
      }
      throw new ExecutionError(
        `OpenCode execution failed: ${error.message}`,
        command
      );
    }
    throw new ExecutionError('Unknown error during OpenCode execution', command);
  }
}

export async function exportSession(sessionId: string): Promise<ExportedSession> {
  const command = `opencode export ${sessionId}`;

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000
    });

    return JSON.parse(output) as ExportedSession;
  } catch (error) {
    if (error instanceof Error) {
      throw new ExecutionError(
        `Failed to export session ${sessionId}: ${error.message}`,
        command
      );
    }
    throw new ExecutionError(`Failed to export session ${sessionId}`, command);
  }
}

export async function getLatestSessionId(): Promise<string | null> {
  const command = 'opencode session list';

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 10000
    });

    // Parse the table output
    const lines = output.trim().split('\n');

    // Skip header lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('ses_')) {
        // Extract session ID (first column)
        const match = line.match(/^(ses_\S+)/);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}