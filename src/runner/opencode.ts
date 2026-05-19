// src/runner/opencode.ts

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ExecutionError,
  TimeoutError,
  type OpenCodeRunOutput,
  type ExportedSession,
  type SessionInfo
} from '../types/index.js';
import type { AgentRunner, RunOptions, RunResult } from './types.js';

/**
 * 解析 OpenCode JSON 流输出（每行一个 JSON 对象）
 */
function parseJsonStream(stdout: string): { outputs: OpenCodeRunOutput[]; sessionId: string } {
  const outputs: OpenCodeRunOutput[] = [];
  const lines = stdout.trim().split('\n');
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

  return { outputs, sessionId: lastSessionId };
}

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
   * @throws TimeoutError 当命令执行超时且无会话信息时
   */
  run(options: RunOptions): RunResult {
    const args = [`${this.command} run`];

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

    // Add optional model (quoted for special characters like / and .)
    if (options.model) {
      args.push(`--model "${options.model}"`);
    }

    // Add optional agent (quoted for safety)
    if (options.agent) {
      args.push(`--agent "${options.agent}"`);
    }

    const fullCommand = args.join(' ');
    const timeout = options.timeout || 120000;

    // 将 input 写入临时文件，通过 < 重定向传入，避免部分 opencode 发行版无法接受 stdin input
    const tmpFile = path.join(os.tmpdir(), `agentut-input-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);

    try {
      fs.writeFileSync(tmpFile, options.input, 'utf-8');

      const commandWithInput = `${fullCommand} < "${tmpFile}"`;

      const output = execSync(commandWithInput, {
        encoding: 'utf-8',
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        cwd: options.directory || process.cwd()
      });

      return parseJsonStream(output);
    } catch (error) {
      if (error instanceof Error) {
        const nodeError = error as Error & { code?: string; stdout?: string };
        if (nodeError.code === 'ETIMEDOUT') {
          // 尝试从部分输出中恢复：如果已有 session 信息，说明工具实际已执行，
          // 只是卡在交互步骤，该次运行仍视为有效，继续后续测试动作
          const partial = parseJsonStream(nodeError.stdout || '');
          if (partial.sessionId) {
            return partial;
          }
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
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
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
    const tmpFile = path.join(os.tmpdir(), `agentut-export-${sessionId}.json`);
    const fullCommand = `${this.command} export ${sessionId} > "${tmpFile}"`;

    try {
      execSync(fullCommand, { timeout: 30000 });
      const content = fs.readFileSync(tmpFile, 'utf-8');
      return JSON.parse(content) as ExportedSession;
    } catch (error) {
      if (error instanceof Error) {
        throw new ExecutionError(
          `Failed to export session ${sessionId}: ${error.message}`,
          fullCommand
        );
      }
      throw new ExecutionError(`Failed to export session ${sessionId}`, fullCommand);
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // Ignore cleanup errors (file may not exist if execSync failed)
      }
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