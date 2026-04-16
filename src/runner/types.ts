// src/runner/types.ts

import type { OpenCodeRunOutput, ExportedSession, SessionInfo } from '../types/index.js';

/**
 * Agent Runner 接口，定义统一的 Agent CLI 操作
 */
export interface AgentRunner {
  readonly runnerType: string;

  run(options: RunOptions): RunResult;
  exportSession(sessionId: string): Promise<ExportedSession>;
  listSessions(): Promise<SessionInfo[]>;
}

/**
 * Run 命令选项
 */
export interface RunOptions {
  input: string;
  directory?: string;
  sessionId?: string;
  fork?: boolean;
  timeout?: number;
  model?: string;
  agent?: string;
  file?: string;  // -f 参数，传递附加文件路径（用于 AI Judge 断言）
}

/**
 * Run 命令结果
 */
export interface RunResult {
  outputs: OpenCodeRunOutput[];
  sessionId: string;
}