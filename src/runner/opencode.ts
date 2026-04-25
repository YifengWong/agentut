// src/runner/opencode.ts

import { execSync } from 'child_process';
import {
  ExecutionError,
  TimeoutError,
  type OpenCodeRunOutput,
  type ExportedSession,
  type SessionInfo
} from '../types/index.js';
import type { AgentRunner, RunOptions, RunResult } from './types.js';

/**
 * OpenCodeRunner - 实现 AgentRunner 接口，用于与 OpenCode CLI 交互
 *
 * 该类封装了与 OpenCode CLI 的所有交互逻辑，支持自定义命令名。
 */
export class OpenCodeRunner implements AgentRunner {
  readonly runnerType = 'opencode';

  /**
   * @param command - CLI 命令名称（默认 'opencode'，可自定义）
   */
  constructor(private readonly command: string = 'opencode') {}

  /**
   * 执行 OpenCode run 命令
   *
   * @param options - 运行选项
   * @returns 运行结果，包含输出和会话 ID
   * @throws ExecutionError 当命令执行失败时
   * @throws TimeoutError 当命令执行超时时
   */
  run(options: RunOptions): RunResult {
    const args = [`${this.command} run`];

    // Add the input message (escaped, including newlines for multi-line prompts)
    // Replace newlines with escaped \n to preserve multi-line content in shell
    const escapedInput = options.input
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
    args.push(`"${escapedInput}"`);

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

    // Add -f flag for additional file (judge outputs)
    if (options.file) {
      args.push(`-f "${options.file}"`);
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

    const fullCommand = args.join(' ');
    const timeout = options.timeout || 120000;

    try {
      const output = execSync(fullCommand, {
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
          fullCommand
        );
      }
      throw new ExecutionError('Unknown error during OpenCode execution', fullCommand);
    }
  }

  /**
   * 导出会话数据
   *
   * @param sessionId - 会话 ID
   * @returns 导出的会话数据
   * @throws ExecutionError 当导出失败时
   */
  async exportSession(sessionId: string): Promise<ExportedSession> {
    const fullCommand = `${this.command} export ${sessionId}`;

    try {
      const output = execSync(fullCommand, {
        encoding: 'utf-8',
        timeout: 30000
      });

      return JSON.parse(output) as ExportedSession;
    } catch (error) {
      if (error instanceof Error) {
        throw new ExecutionError(
          `Failed to export session ${sessionId}: ${error.message}`,
          fullCommand
        );
      }
      throw new ExecutionError(`Failed to export session ${sessionId}`, fullCommand);
    }
  }

  /**
   * 列出所有会话
   *
   * @returns 会话信息数组
   */
  async listSessions(): Promise<SessionInfo[]> {
    const fullCommand = `${this.command} session list`;

    try {
      const output = execSync(fullCommand, {
        encoding: 'utf-8',
        timeout: 10000
      });

      // Parse the table output
      const lines = output.trim().split('\n');
      const sessions: SessionInfo[] = [];

      for (const line of lines) {
        // Match lines starting with 'ses_' (session ID pattern)
        if (line.startsWith('ses_')) {
          // Extract session ID (first column)
          const match = line.match(/^(ses_\S+)/);
          if (match) {
            sessions.push({
              id: match[1]
            });
          }
        }
      }

      return sessions;
    } catch {
      // Return empty array on error (e.g., no sessions exist)
      return [];
    }
  }

  /**
   * 导入会话文件
   *
   * @param sessionFile - session 文件的绝对路径
   * @returns 导入后的 session ID
   * @throws ExecutionError 当导入失败时
   */
  async importSession(sessionFile: string): Promise<string> {
    const fullCommand = `${this.command} import "${sessionFile}"`;

    try {
      const output = execSync(fullCommand, {
        encoding: 'utf-8',
        timeout: 30000
      });

      // opencode import 输出格式: "Imported session: xxx"
      const match = output.trim().match(/Imported session:\s*(\S+)/);
      if (!match) {
        throw new ExecutionError(
          `Failed to parse session ID from import output: ${output}`,
          fullCommand
        );
      }
      return match[1];
    } catch (error) {
      if (error instanceof ExecutionError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ExecutionError(
          `Failed to import session from ${sessionFile}: ${error.message}`,
          fullCommand
        );
      }
      throw new ExecutionError(`Failed to import session from ${sessionFile}`, fullCommand);
    }
  }
}