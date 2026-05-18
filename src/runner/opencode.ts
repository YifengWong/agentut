// src/runner/opencode.ts

import { execSync, spawn } from 'child_process';
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
  async run(options: RunOptions): Promise<RunResult> {
    const spawnArgs = ['run'];

    if (options.directory) {
      spawnArgs.push('--dir', options.directory);
    }
    if (options.sessionId) {
      spawnArgs.push('--session', options.sessionId);
    }
    if (options.fork) {
      spawnArgs.push('--fork');
    }
    if (options.file) {
      spawnArgs.push('-f', options.file);
    }
    spawnArgs.push('--format', 'json');
    if (options.model) {
      spawnArgs.push('--model', options.model);
    }
    if (options.agent) {
      spawnArgs.push('--agent', options.agent);
    }

    const timeout = options.timeout || 120000;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.command, spawnArgs, {
        cwd: options.directory || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      proc.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      if (options.input) {
        proc.stdin?.write(options.input);
        proc.stdin?.end();
      }

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);

        // Parse collected output
        const outputs: OpenCodeRunOutput[] = [];
        const lines = stdout.trim().split('\n');
        let lastSessionId = '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line) as OpenCodeRunOutput;
              outputs.push(parsed);
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

        if (timedOut) {
          if (lastSessionId) {
            resolve({ outputs, sessionId: lastSessionId });
          } else {
            reject(new TimeoutError(
              `OpenCode execution timed out after ${timeout}ms`,
              timeout
            ));
          }
        } else if (code === 0) {
          resolve({ outputs, sessionId: lastSessionId });
        } else {
          reject(new ExecutionError(
            `OpenCode execution failed with code ${code}: ${stderr}`,
            `${this.command} ${spawnArgs.join(' ')}`
          ));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(new ExecutionError(
          `OpenCode execution failed: ${err.message}`,
          `${this.command} ${spawnArgs.join(' ')}`
        ));
      });
    });
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