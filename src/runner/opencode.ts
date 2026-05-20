// src/runner/opencode.ts

import { spawn, execSync, type ChildProcess } from 'child_process';
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
import { processManager, treeKill } from '../process/index.js';

/**
 * 收集 spawn 进程的 stdout 输出直到进程关闭
 */
function collectOutput(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    proc.stdout?.on('data', (data: Buffer | string) => {
      stdout += data.toString();
    });
    proc.on('close', () => {
      resolve(stdout);
    });
    proc.on('error', reject);
  });
}


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
  async run(options: RunOptions): Promise<RunResult> {
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
    let exitCode: number | null = null;
    let proc: ChildProcess | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      fs.writeFileSync(tmpFile, options.input, 'utf-8');

      const commandWithInput = `${fullCommand} < "${tmpFile}"`;

      // Windows 上不使用 detached，taskkill /T 已能杀进程树
      // Unix 上需要 detached 以支持 process.kill(-pid) 杀进程组
      const isWindows = process.platform === 'win32';

      proc = spawn(commandWithInput, [], {
        shell: true,
        detached: !isWindows,
        cwd: options.directory || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      processManager.register(proc.pid!);

      proc.on('close', (code) => {
        exitCode = code;
      });

      // 超时定时器：到期时杀进程树，但不中断收集输出
      timeoutId = setTimeout(() => {
        timedOut = true;
        if (proc?.pid != null) treeKill(proc.pid!);
      }, timeout);

      // 始终等待进程关闭（正常退出或被 treeKill 杀死）
      const stdout = await collectOutput(proc);

      if (timedOut) {
        // 超时退出：尝试从已收集的输出中恢复会话信息
        // 实际已有对话和行为发生，应尽可能保留以供后续断言
        const partial = parseJsonStream(stdout);
        if (partial.sessionId) {
          return partial;
        }
        throw new TimeoutError(
          `OpenCode execution timed out after ${timeout}ms (no session info recovered)`,
          timeout
        );
      }

      return parseJsonStream(stdout);
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new ExecutionError(
          `OpenCode execution failed: ${error.message}`,
          fullCommand
        );
      }
      throw new ExecutionError('Unknown error during OpenCode execution', fullCommand);
    } finally {
      // 取消超时定时器，防止在进程正常结束后误触发 treeKill
      if (timeoutId) clearTimeout(timeoutId);

      // 仅在异常退出时 treeKill（非零 exitCode），避免误杀被 OS 复用的 PID
      if (proc?.pid != null && exitCode !== 0 && exitCode !== null) {
        treeKill(proc.pid);
      }
      if (proc?.pid != null) {
        processManager.unregister(proc.pid);
      }

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