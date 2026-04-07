// src/runner/factory.ts

import type { AgentCliConfig } from '../types/index.js';
import type { AgentRunner } from './types.js';
import { OpenCodeRunner } from './opencode.js';

/**
 * 创建 Agent Runner 实例
 */
export function createRunner(config: AgentCliConfig): AgentRunner {
  switch (config.runner) {
    case 'opencode':
      return new OpenCodeRunner(config.command);
    // Future runners:
    // case 'claude': return new ClaudeRunner(config.command);
    // case 'gemini': return new GeminiRunner(config.command);
    default:
      throw new Error(`Unknown runner type: ${config.runner}`);
  }
}