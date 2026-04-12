# Agent Runner Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstract CLI runner layer with configurable command names, supporting future multi-runner extensibility.

**Architecture:** Create `src/runner/` module with AgentRunner interface, OpenCodeRunner implementation, and factory function. Migrate executor/opencode.ts logic to runner/opencode.ts. Both run and suggest commands read agent_cli config from YAML.

**Tech Stack:** TypeScript, Vitest for testing, ESM modules

---

## File Structure

**New files:**
- `src/runner/types.ts` — AgentRunner interface, RunOptions, RunResult, SessionInfo types
- `src/runner/opencode.ts` — OpenCodeRunner implementation (migrated from executor/opencode.ts)
- `src/runner/factory.ts` — createRunner factory function
- `src/runner/index.ts` — Module exports
- `tests/runner/types.test.ts` — Interface compliance tests
- `tests/runner/opencode.test.ts` — OpenCodeRunner unit tests
- `tests/runner/factory.test.ts` — Factory function tests

**Deleted files:**
- `src/executor/opencode.ts` — Migrated to runner/opencode.ts
- `tests/executor/opencode.test.ts` — Migrated to tests/runner/opencode.test.ts

**Modified files:**
- `src/types/index.ts:74-83` — Add AgentCliConfig and SessionInfo types
- `src/parser/yaml.ts:89-95` — Add agent_cli default value handling
- `src/commands/run.ts:166-174` — Use createRunner instead of runOpenCode
- `src/commands/suggest.ts` — Read YAML config, use runner
- `src/cli.ts:39-65` — Change suggest command signature to require testFile
- `tests/parser/yaml.test.ts` — Add agent_cli default value tests
- `tests/commands/run.test.ts` — Update mock to use runner
- `tests/commands/suggest.test.ts` — Update mock, add testFile parameter tests
- `README.md` — Add agent_cli configuration section
- `AGENTS.md` — Update architecture with runner module

---

## Task 1: Types — AgentCliConfig and SessionInfo

**Files:**
- Modify: `src/types/index.ts:74-83`
- Test: `tests/types/index.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/types/index.test.ts — Add after existing tests

describe('AgentCliConfig type', () => {
  it('should allow valid runner types', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'mycode'
    };
    expect(config.runner).toBe('opencode');
    expect(config.command).toBe('mycode');
  });

  it('should allow claude as runner type (for future)', () => {
    const config: AgentCliConfig = {
      runner: 'claude',
      command: 'claude'
    };
    expect(config.runner).toBe('claude');
  });

  it('should allow gemini as runner type (for future)', () => {
    const config: AgentCliConfig = {
      runner: 'gemini',
      command: 'gemini'
    };
    expect(config.runner).toBe('gemini');
  });
});

describe('SessionInfo type', () => {
  it('should have required id field', () => {
    const info: SessionInfo = {
      id: 'ses_123'
    };
    expect(info.id).toBe('ses_123');
  });

  it('should allow optional fields', () => {
    const info: SessionInfo = {
      id: 'ses_123',
      title: 'Test Session',
      created: 1234567890,
      updated: 1234567891
    };
    expect(info.title).toBe('Test Session');
    expect(info.created).toBe(1234567890);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/types/index.test.ts`
Expected: FAIL with "Cannot find name 'AgentCliConfig'" and "Cannot find name 'SessionInfo'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/types/index.ts — Add after GlobalConfig interface (around line 83)

// ========== Agent CLI Configuration ==========

/**
 * Agent CLI 配置，支持自定义命令名和多 runner 支持
 */
export interface AgentCliConfig {
  runner: 'opencode' | 'claude' | 'gemini';  // Agent 类型
  command: string;                           // 实际执行的 CLI 命令名
}

/**
 * Session 信息结构
 */
export interface SessionInfo {
  id: string;
  title?: string;
  created?: number;
  updated?: number;
}

// Modify GlobalConfig interface to include agent_cli
export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;  // 新增：Agent CLI 配置
  /** @deprecated Use environment.agent and setup.copy with $WORKDIR instead */
  target?: {
    skill?: string;
    agent?: string;
    model?: string;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "feat: add AgentCliConfig and SessionInfo types for runner abstraction"
```

---

## Task 2: Validation Layer — agent_cli Default Value

**Files:**
- Modify: `src/parser/yaml.ts:89-95`
- Test: `tests/parser/yaml.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/parser/yaml.test.ts — Add after existing tests in validateYamlTestSuite describe block

describe('agent_cli default value', () => {
  it('should set default agent_cli when not provided', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: []
        }]
      }]
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.agent_cli?.runner).toBe('opencode');
    expect(suite.config?.agent_cli?.command).toBe('opencode');
  });

  it('should preserve user-configured agent_cli', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: []
        }]
      }],
      config: {
        agent_cli: {
          runner: 'opencode',
          command: 'mycode'
        }
      }
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.agent_cli?.command).toBe('mycode');
  });

  it('should set agent_cli default even when other config fields exist', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: []
        }]
      }],
      config: {
        default_timeout: 90000
      }
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.agent_cli?.runner).toBe('opencode');
    expect(suite.config?.agent_cli?.command).toBe('opencode');
    expect(suite.config?.default_timeout).toBe(90000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/parser/yaml.test.ts`
Expected: FAIL with "expected undefined to be 'opencode'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/parser/yaml.ts — Add after line 94 (after step timeout default handling)

export function validateYamlTestSuite(suite: YamlTestSuite): void {
  // ... existing validation code ...

  // Set default agent_cli if not provided
  if (!suite.config?.agent_cli) {
    suite.config = suite.config || {};
    suite.config.agent_cli = {
      runner: 'opencode',
      command: 'opencode'
    };
  }

  // Validate assertions in steps
  for (const scenario of suite.scenarios) {
    // ... existing step validation ...
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/parser/yaml.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser/yaml.ts tests/parser/yaml.test.ts
git commit -m "feat: add agent_cli default value handling in validation"
```

---

## Task 3: Runner Interface Types

**Files:**
- Create: `src/runner/types.ts`
- Test: `tests/runner/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/runner/types.test.ts

import { describe, it, expect } from 'vitest';
import type { AgentRunner, RunOptions, RunResult } from '../../src/runner/types.js';

describe('AgentRunner interface', () => {
  it('should define runnerType as readonly string', () => {
    // This test verifies interface structure at compile time
    const mockRunner: AgentRunner = {
      runnerType: 'opencode',
      run: (options: RunOptions) => ({ outputs: [], sessionId: 'ses_1' }),
      exportSession: async (id: string) => ({ info: { id }, messages: [] }),
      listSessions: async () => []
    };
    expect(mockRunner.runnerType).toBe('opencode');
  });
});

describe('RunOptions interface', () => {
  it('should have required input field', () => {
    const options: RunOptions = {
      input: 'Create file'
    };
    expect(options.input).toBe('Create file');
  });

  it('should allow optional fields', () => {
    const options: RunOptions = {
      input: 'Test',
      directory: '/tmp/test',
      sessionId: 'ses_123',
      fork: true,
      timeout: 30000,
      model: 'claude-sonnet',
      agent: 'my-skill'
    };
    expect(options.directory).toBe('/tmp/test');
    expect(options.sessionId).toBe('ses_123');
  });
});

describe('RunResult interface', () => {
  it('should have outputs and sessionId', () => {
    const result: RunResult = {
      outputs: [{ type: 'text', sessionID: 'ses_1' }],
      sessionId: 'ses_1'
    };
    expect(result.outputs).toHaveLength(1);
    expect(result.sessionId).toBe('ses_1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/runner/types.test.ts`
Expected: FAIL with "Cannot find module '../../src/runner/types.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
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
}

/**
 * Run 命令结果
 */
export interface RunResult {
  outputs: OpenCodeRunOutput[];
  sessionId: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/runner/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/types.ts tests/runner/types.test.ts
git commit -m "feat: add AgentRunner interface and related types"
```

---

## Task 4: OpenCodeRunner Implementation

**Files:**
- Create: `src/runner/opencode.ts`
- Test: `tests/runner/opencode.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/runner/opencode.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeRunner } from '../../src/runner/opencode.js';
import { ExecutionError, TimeoutError } from '../../src/types/index.js';
import type { RunOptions } from '../../src/runner/types.js';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

import { execSync } from 'child_process';

describe('OpenCodeRunner', () => {
  let runner: OpenCodeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new OpenCodeRunner('opencode');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should store runnerType as opencode', () => {
      expect(runner.runnerType).toBe('opencode');
    });

    it('should accept custom command name', () => {
      const customRunner = new OpenCodeRunner('mycode');
      expect(customRunner.runnerType).toBe('opencode');
      // Command name used internally, verified in run tests
    });
  });

  describe('run', () => {
    it('should call CLI with correct arguments for first step', () => {
      const mockOutput = JSON.stringify({
        type: 'text',
        data: { content: 'Hello' },
        session_id: 'ses_123',
        timestamp: 1234567890
      });
      vi.mocked(execSync).mockReturnValue(mockOutput);

      const options: RunOptions = {
        input: 'Hello',
        directory: '/test/project'
      };
      const result = runner.run(options);

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('opencode run'),
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--dir "/test/project"'),
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--format json'),
        expect.any(Object)
      );
      expect(result.sessionId).toBe('ses_123');
    });

    it('should use custom command name when configured', () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('{}');

      customRunner.run({ input: 'Test', directory: '/test' });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode run'),
        expect.any(Object)
      );
    });

    it('should use --session flag for subsequent steps', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Continue',
        sessionId: 'ses_123'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--session ses_123'),
        expect.any(Object)
      );
    });

    it('should use --fork flag when sessionId is provided', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        sessionId: 'ses_123',
        fork: true
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--fork'),
        expect.any(Object)
      );
    });

    it('should add --model flag when model is specified', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        model: 'claude-sonnet'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--model claude-sonnet'),
        expect.any(Object)
      );
    });

    it('should add --agent flag when agent is specified', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Test',
        agent: 'my-skill'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--agent my-skill'),
        expect.any(Object)
      );
    });

    it('should escape quotes in input', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({
        input: 'Say "Hello World"'
      });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('"Say \\\"Hello World\\\""'),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError on failure', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      expect(() => runner.run({ input: 'Test' })).toThrow(ExecutionError);
    });

    it('should throw TimeoutError when ETIMEDOUT', () => {
      vi.mocked(execSync).mockImplementation(() => {
        const error = new Error('Timeout') as Error & { code?: string };
        error.code = 'ETIMEDOUT';
        throw error;
      });

      expect(() => runner.run({ input: 'Test', timeout: 5000 })).toThrow(TimeoutError);
    });

    it('should parse JSON stream output', () => {
      const mockOutput = [
        JSON.stringify({ type: 'message', data: { role: 'user' }, session_id: 'ses_1', timestamp: 1 }),
        JSON.stringify({ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 2 }),
        JSON.stringify({ type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 3 })
      ].join('\n');
      vi.mocked(execSync).mockReturnValue(mockOutput);

      const result = runner.run({ input: 'Create file' });

      expect(result.outputs).toHaveLength(3);
      expect(result.outputs[0].type).toBe('message');
      expect(result.outputs[1].type).toBe('tool_call');
      expect(result.sessionId).toBe('ses_1');
    });

    it('should use default timeout of 120000ms', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({ input: 'Test' });

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 120000 })
      );
    });

    it('should use custom timeout when specified', () => {
      vi.mocked(execSync).mockReturnValue('{}');

      runner.run({ input: 'Test', timeout: 30000 });

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 30000 })
      );
    });
  });

  describe('exportSession', () => {
    it('should call CLI export with session ID', async () => {
      const mockSession = {
        info: { id: 'ses_123', directory: '/test' },
        messages: []
      };
      vi.mocked(execSync).mockReturnValue(JSON.stringify(mockSession));

      const result = await runner.exportSession('ses_123');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('opencode export ses_123'),
        expect.any(Object)
      );
      expect(result.info.id).toBe('ses_123');
    });

    it('should use custom command name', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('{}');

      await customRunner.exportSession('ses_123');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode export ses_123'),
        expect.any(Object)
      );
    });

    it('should throw ExecutionError for invalid session', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Session not found');
      });

      await expect(runner.exportSession('invalid')).rejects.toThrow(ExecutionError);
    });
  });

  describe('listSessions', () => {
    it('should parse session list table output', async () => {
      const mockOutput = `Session ID                      Title                                   Updated
ses_abc123                      Test Session                            10:30
ses_def456                      Another Session                         09:00`;
      vi.mocked(execSync).mockReturnValue(mockOutput);

      const result = await runner.listSessions();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ses_abc123');
      expect(result[1].id).toBe('ses_def456');
    });

    it('should use custom command name', async () => {
      const customRunner = new OpenCodeRunner('mycode');
      vi.mocked(execSync).mockReturnValue('Session ID\n');

      await customRunner.listSessions();

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('mycode session list'),
        expect.any(Object)
      );
    });

    it('should return empty array for no sessions', async () => {
      vi.mocked(execSync).mockReturnValue('Session ID                      Title                                   Updated');

      const result = await runner.listSessions();

      expect(result).toHaveLength(0);
    });

    it('should handle exec error gracefully', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Failed');
      });

      const result = await runner.listSessions();

      expect(result).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/runner/opencode.test.ts`
Expected: FAIL with "Cannot find module '../../src/runner/opencode.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
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

export class OpenCodeRunner implements AgentRunner {
  readonly runnerType = 'opencode';
  private command: string;

  constructor(command: string) {
    this.command = command;
  }

  run(options: RunOptions): RunResult {
    const args = [`${this.command} run`];

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
            `${this.command} execution timed out after ${timeout}ms`,
            timeout
          );
        }
        throw new ExecutionError(
          `${this.command} execution failed: ${error.message}`,
          fullCommand
        );
      }
      throw new ExecutionError('Unknown error during execution', fullCommand);
    }
  }

  async exportSession(sessionId: string): Promise<ExportedSession> {
    const command = `${this.command} export ${sessionId}`;

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

  async listSessions(): Promise<SessionInfo[]> {
    const command = `${this.command} session list`;

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        timeout: 10000
      });

      // Parse the table output
      const lines = output.trim().split('\n');
      const sessions: SessionInfo[] = [];

      for (const line of lines) {
        if (line.startsWith('ses_')) {
          // Extract session ID (first column)
          const match = line.match(/^(ses_\S+)/);
          if (match) {
            sessions.push({ id: match[1] });
          }
        }
      }

      return sessions;
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/runner/opencode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/opencode.ts tests/runner/opencode.test.ts
git commit -m "feat: implement OpenCodeRunner with configurable command name"
```

---

## Task 5: Factory Function

**Files:**
- Create: `src/runner/factory.ts`
- Test: `tests/runner/factory.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/runner/factory.test.ts

import { describe, it, expect } from 'vitest';
import { createRunner } from '../../src/runner/factory.js';
import { OpenCodeRunner } from '../../src/runner/opencode.js';
import type { AgentCliConfig } from '../../src/types/index.js';

describe('createRunner', () => {
  it('should create OpenCodeRunner for opencode type', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'opencode'
    };
    const runner = createRunner(config);
    expect(runner).toBeInstanceOf(OpenCodeRunner);
    expect(runner.runnerType).toBe('opencode');
  });

  it('should pass custom command to OpenCodeRunner', () => {
    const config: AgentCliConfig = {
      runner: 'opencode',
      command: 'mycode'
    };
    const runner = createRunner(config) as OpenCodeRunner;
    expect(runner.runnerType).toBe('opencode');
    // Command name is private, verified through run behavior
  });

  it('should throw error for unknown runner type', () => {
    const config = {
      runner: 'unknown',
      command: 'test'
    } as unknown as AgentCliConfig;
    expect(() => createRunner(config)).toThrow('Unknown runner type: unknown');
  });

  // Future runner placeholders - verify error handling
  it('should throw error for claude runner (not yet implemented)', () => {
    const config: AgentCliConfig = {
      runner: 'claude',
      command: 'claude'
    };
    // Will throw when ClaudeRunner is not implemented
    // Update this test when ClaudeRunner is added
    expect(() => createRunner(config)).toThrow('Unknown runner type: claude');
  });

  it('should throw error for gemini runner (not yet implemented)', () => {
    const config: AgentCliConfig = {
      runner: 'gemini',
      command: 'gemini'
    };
    expect(() => createRunner(config)).toThrow('Unknown runner type: gemini');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/runner/factory.test.ts`
Expected: FAIL with "Cannot find module '../../src/runner/factory.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/runner/factory.ts

import type { AgentCliConfig } from '../types/index.js';
import type { AgentRunner } from './types.js';
import { OpenCodeRunner } from './opencode.js';

/**
 * 创建 Agent Runner 实例
 * @param config Agent CLI 配置
 * @returns AgentRunner 实例
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/runner/factory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runner/factory.ts tests/runner/factory.test.ts
git commit -m "feat: add createRunner factory function"
```

---

## Task 6: Runner Module Index

**Files:**
- Create: `src/runner/index.ts`

- [ ] **Step 1: Write minimal implementation**

```typescript
// src/runner/index.ts

export { AgentRunner, RunOptions, RunResult } from './types.js';
export { OpenCodeRunner } from './opencode.js';
export { createRunner } from './factory.js';
```

- [ ] **Step 2: Verify imports work**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/runner/index.ts
git commit -m "feat: add runner module exports"
```

---

## Task 7: run.ts Integration

**Files:**
- Modify: `src/commands/run.ts:1-10, 166-174`
- Test: `tests/commands/run.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/commands/run.test.ts — Update mock and add test

// Change mock from:
vi.mock('../../src/executor/opencode.js', () => ({
  runOpenCode: vi.fn()
}));

// To:
vi.mock('../../src/runner/factory.js', () => ({
  createRunner: vi.fn()
}));

// Add import:
import { createRunner } from '../../src/runner/factory.js';
import { OpenCodeRunner } from '../../src/runner/opencode.js';

// In beforeEach, setup mock runner:
const mockRunner = {
  runnerType: 'opencode',
  run: vi.fn(),
  exportSession: vi.fn(),
  listSessions: vi.fn()
};
vi.mocked(createRunner).mockReturnValue(mockRunner as unknown as AgentRunner);

// Update existing tests to use mockRunner.run instead of runOpenCode
// Example update for 'should run a single test file':
vi.mocked(mockRunner.run).mockReturnValue({
  outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
  sessionId: 'ses_1'
});

// Add new test:
describe('runner integration', () => {
  it('should create runner from suite config', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test',
          expected: [],
          timeout: 60000
        }]
      }],
      config: {
        agent_cli: {
          runner: 'opencode',
          command: 'mycode'
        }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(mockRunner.run).mockReturnValue({
      outputs: [],
      sessionId: 'ses_1'
    });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await runTests(yamlPath);

    expect(createRunner).toHaveBeenCalledWith({
      runner: 'opencode',
      command: 'mycode'
    });
  });

  it('should use default agent_cli when not configured', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test',
          expected: [],
          timeout: 60000
        }]
      }]
    };
    // Validation layer will add default agent_cli
    mockSuite.config = {
      agent_cli: { runner: 'opencode', command: 'opencode' }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(mockRunner.run).mockReturnValue({
      outputs: [],
      sessionId: 'ses_1'
    });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await runTests(yamlPath);

    expect(createRunner).toHaveBeenCalledWith({
      runner: 'opencode',
      command: 'opencode'
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/commands/run.test.ts`
Expected: FAIL with module import or mock errors

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/commands/run.ts — Modify imports and usage

// Change import:
import { runOpenCode } from '../executor/opencode.js';
// To:
import { createRunner } from '../runner/factory.js';

// In executeScenario function, after model/agent resolution:
// Add runner creation:
const runner = createRunner(suite.config!.agent_cli!);

// Replace runOpenCode call:
const runResult = runOpenCode({
  input: step.input,
  directory: tempDirectory,
  sessionId,
  fork: !!sessionId,
  timeout: step.timeout,
  model,
  agent
});
// With:
const runResult = runner.run({
  input: step.input,
  directory: tempDirectory,
  sessionId,
  fork: !!sessionId,
  timeout: step.timeout,
  model,
  agent
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/commands/run.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "refactor: integrate runner abstraction in run command"
```

---

## Task 8: suggest.ts Integration

**Files:**
- Modify: `src/commands/suggest.ts`
- Test: `tests/commands/suggest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/commands/suggest.test.ts — Update for YAML-based config

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { suggestTest } from '../../src/commands/suggest.js';

const TEST_DIR = './test-temp-suggest';

vi.mock('../../src/runner/factory.js', () => ({
  createRunner: vi.fn()
}));

vi.mock('../../src/parser/yaml.js', () => ({
  parseAndValidateYaml: vi.fn()
}));

import { createRunner } from '../../src/runner/factory.js';
import { parseAndValidateYaml } from '../../src/parser/yaml.js';
import type { YamlTestSuite, AgentCliConfig } from '../../src/types/index.js';

describe('suggest command', () => {
  const mockRunner = {
    runnerType: 'opencode',
    run: vi.fn(),
    exportSession: vi.fn(),
    listSessions: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
    vi.mocked(createRunner).mockReturnValue(mockRunner as any);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should read YAML config and create runner', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test-project',
      environments: {},
      scenarios: [],
      config: {
        agent_cli: {
          runner: 'opencode',
          command: 'mycode'
        }
      }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(mockRunner.exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test Session',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
        time: { created: Date.now(), updated: Date.now() }
      },
      messages: [
        {
          info: { role: 'user', time: { created: 1 }, id: 'm1', sessionID: 'ses_123' },
          parts: [{ type: 'text', text: 'Create file', id: 'p1', sessionID: 'ses_123', messageID: 'm1' }]
        }
      ]
    });

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const yaml = await suggestTest(yamlPath, { session: 'ses_123' });

    expect(parseAndValidateYaml).toHaveBeenCalled();
    expect(createRunner).toHaveBeenCalledWith({
      runner: 'opencode',
      command: 'mycode'
    });
    expect(mockRunner.exportSession).toHaveBeenCalledWith('ses_123');
  });

  it('should use listSessions for --latest option', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: [],
      config: {
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(mockRunner.listSessions).mockResolvedValue([
      { id: 'ses_latest', title: 'Latest' }
    ]);
    vi.mocked(mockRunner.exportSession).mockResolvedValue({
      info: {
        id: 'ses_latest',
        slug: 'latest',
        projectID: 'global',
        directory: '/test',
        title: 'Latest Session',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await suggestTest(yamlPath, { latest: true });

    expect(mockRunner.listSessions).toHaveBeenCalled();
    expect(mockRunner.exportSession).toHaveBeenCalledWith('ses_latest');
  });

  it('should throw error if YAML file not found', async () => {
    const nonExistentPath = path.join(TEST_DIR, 'missing.yaml');

    await expect(suggestTest(nonExistentPath, { session: 'ses_123' }))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/commands/suggest.test.ts`
Expected: FAIL with signature mismatch or module errors

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/commands/suggest.ts — Complete rewrite

import fs from 'fs-extra';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { createRunner } from '../runner/factory.js';
import { analyzeSession, generateYaml } from '../parser/session.js';
import { ExecutionError } from '../types/index.js';
import type { YamlTestSuite, SuggestOptions } from '../types/index.js';

export interface SuggestOptions {
  session?: string;
  latest?: boolean;
  output?: string;
  skill?: string;
  name?: string;
}

export async function suggestTest(testFile: string, options: SuggestOptions = {}): Promise<string> {
  // Check if YAML file exists
  if (!await fs.pathExists(testFile)) {
    throw new ExecutionError(`Test file not found: ${testFile}`, testFile);
  }

  // Read and parse YAML to get runner config
  const yamlContent = await fs.readFile(testFile, 'utf-8');
  const suite = parseAndValidateYaml(yamlContent);

  // Create runner from config
  const runner = createRunner(suite.config!.agent_cli!);

  // Get session ID
  let sessionId = options.session;
  if (options.latest) {
    const sessions = await runner.listSessions();
    if (sessions.length === 0) {
      throw new ExecutionError('No sessions found', 'listSessions');
    }
    sessionId = sessions[0].id;
  }

  if (!sessionId) {
    throw new ExecutionError('Session ID required (--session or --latest)', 'suggest');
  }

  // Export session
  const session = await runner.exportSession(sessionId);

  // Analyze and generate YAML
  const analysis = analyzeSession(session);
  const yaml = generateYaml(analysis, {
    name: options.name,
    skill: options.skill
  });

  // Write to output file if specified
  if (options.output) {
    await fs.writeFile(options.output, yaml);
  }

  return yaml;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/commands/suggest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/suggest.ts tests/commands/suggest.test.ts
git commit -m "refactor: suggest command reads YAML config, uses runner abstraction"
```

---

## Task 9: CLI Signature Change

**Files:**
- Modify: `src/cli.ts:39-65`

- [ ] **Step 1: Write minimal implementation**

```typescript
// src/cli.ts — Modify suggest command definition

// Change from:
program
  .command('suggest [sessionId]')
  .description('Generate test case suggestion from session')
  .option('--latest', 'Use the most recent session')
  .option('-o, --output <file>', 'Output file path')
  .option('--skill <name>', 'Target skill name')
  .option('--name <name>', 'Test suite name')
  .action(async (sessionId, options) => {
    // ...
  });

// To:
program
  .command('suggest <testFile>')
  .description('Generate test case suggestion from session (reads runner config from YAML)')
  .option('-s, --session <sessionId>', 'Session ID to analyze')
  .option('--latest', 'Use the most recent session')
  .option('-o, --output <file>', 'Output file path')
  .option('--skill <name>', 'Target skill name')
  .option('--name <name>', 'Test suite name')
  .action(async (testFile, options) => {
    try {
      const yaml = await suggestTest(testFile, {
        session: options.session,
        latest: options.latest,
        output: options.output,
        skill: options.skill,
        name: options.name
      });

      if (!options.output) {
        console.log(yaml);
      } else {
        console.log(`✓ Generated test case: ${options.output}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });
```

- [ ] **Step 2: Verify CLI help output**

Run: `npm run build && node dist/cli.js suggest --help`
Expected: Shows `<testFile>` as required argument

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "refactor: change suggest command to require testFile for runner config"
```

---

## Task 10: Delete Old Files

**Files:**
- Delete: `src/executor/opencode.ts`
- Delete: `tests/executor/opencode.test.ts`

- [ ] **Step 1: Delete old executor file**

```bash
git rm src/executor/opencode.ts
```

- [ ] **Step 2: Delete old test file**

```bash
git rm tests/executor/opencode.test.ts
```

- [ ] **Step 3: Verify no broken imports**

Run: `npm run build && npm test`
Expected: Build and tests pass

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove old executor/opencode.ts (migrated to runner)"
```

---

## Task 11: Update README Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add agent_cli configuration section**

```markdown
## Agent CLI 配置

Agent VCR 支持配置自定义 CLI 命令名，适用于企业环境封装场景。在 YAML 测试文件的 `config.agent_cli` 中配置：

```yaml
name: my-test-suite
config:
  agent_cli:
    runner: opencode      # Agent 类型 (opencode, claude, gemini)
    command: mycode       # 实际执行的 CLI 命令名
```

### 默认值

若未配置 `agent_cli`，默认使用：
```yaml
agent_cli:
  runner: opencode
  command: opencode
```

### suggest 命令变更

`suggest` 命令现在需要 YAML 配置文件作为参数：

```bash
# 创建最小配置文件
cat > config.yaml << EOF
name: my-project
config:
  agent_cli:
    runner: opencode
    command: mycode
EOF

# 使用配置文件生成测试
agentut suggest config.yaml --latest -o tests/my-test.yaml
agentut suggest config.yaml -s ses_xxx -o tests/my-test.yaml
```

### 未来扩展

`runner` 字段预留支持其他 Agent CLI：
- `opencode` — 当前支持
- `claude` — 未来支持
- `gemini` — 未来支持
```

Insert after "## CLI 命令" section, before "### agentut init" subsection.

- [ ] **Step 2: Update suggest command section**

```markdown
### agentut suggest

从 opencode session 生成测试用例（需要 YAML 配置文件）。

```bash
agentut suggest <testFile> [-s sessionId] [--latest] [-o file] [--skill name] [--name name]
```

**参数**：
- `<testFile>` — YAML 配置文件路径（包含 agent_cli 配置）

**选项**：
- `-s, --session <sessionId>` — 指定 Session ID
- `--latest` — 使用最近的 session
- `-o, --output <file>` — 输出到文件
- `--skill <name>` — 目标 Skill 名称
- `--name <name>` — 测试套件名称
```

Replace existing suggest section.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add agent_cli configuration documentation"
```

---

## Task 12: Update AGENTS.md Architecture

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update directory structure**

```markdown
## 目录结构

```
cli/
├── src/
│   ├── cli.ts                    # CLI 入口，命令分发
│   ├── commands/
│   │   ├── run.ts                # 执行测试命令（使用 runner）
│   │   ├── suggest.ts            # 智能推荐生成命令（读取 YAML config）
│   │   ├── report.ts             # 报告生成命令
│   │   └── init.ts               # 初始化目录命令
│   ├── runner/                   # Agent Runner 抽象层（新增）
│   │   ├── types.ts              # AgentRunner 接口定义
│   │   ├── opencode.ts           # OpenCodeRunner 实现
│   │   ├── factory.ts            # createRunner 工厂
│   │   └── index.ts              # 模块导出
│   ├── parser/
│   │   ├── yaml.ts               # YAML 测试用例解析（含 agent_cli 默认值）
│   │   └── session.ts            # Session 数据解析（用于 suggest）
│   ├── executor/
│   │   ├── fixture.ts            # 测试环境管理（复制、清理）
│   │   └── verifier.ts           # 断言验证执行
│   ├── output/
│   │   ├── json.ts               # JSON 输出（核心格式）
│   │   └── formatters/
│   │       ├── html.ts           # HTML 报告转换
│   │       ├── markdown.ts       # Markdown 报告转换
│   │       └── jest.ts           # Jest/Vitest 兼容格式
│   └── types/
│       └ index.ts                # 类型定义（含 AgentCliConfig）
```
```

- [ ] **Step 2: Add runner module to responsibilities table**

```markdown
| 模块 | 职责 | 依赖 |
|------|------|------|
| `runner/types.ts` | 定义 AgentRunner 接口和运行时类型 | types |
| `runner/opencode.ts` | OpenCode CLI 执行封装 | runner/types, types |
| `runner/factory.ts` | Runner 实例创建工厂 | runner/opencode, types |
```

- [ ] **Step 3: Update dependency diagram**

```markdown
### 依赖关系图

```
cli.ts
  └── commands/
        ├── init.ts (独立)
        ├── suggest.ts
        │     ├── parser/yaml.ts
        │     ├── parser/session.ts
        │     └── runner/factory.ts
        │           └── runner/opencode.ts
        ├── run.ts
        │     ├── parser/yaml.ts
        │     ├── runner/factory.ts
        │     │     └── runner/opencode.ts
        │     ├── executor/fixture.ts
        │     ├── executor/verifier.ts
        │     └── output/json.ts
        └── report.ts
              └── output/formatters/*
```
```

- [ ] **Step 4: Add agent_cli configuration section**

```markdown
## Agent CLI 配置

### YAML 配置

```yaml
config:
  agent_cli:
    runner: opencode      # Agent 类型
    command: mycode       # 自定义命令名
```

验证层自动设置默认值 `{ runner: 'opencode', command: 'opencode' }`。

### Runner 报告

| Runner | CLI 格式 | 状态 |
|--------|---------|------|
| `opencode` | `opencode run/export/session` | 已实现 |
| `claude` | 待定义 | 未实现 |
| `gemini` | 待定义 | 未实现 |

### 扩展新 Runner

1. 在 `types/index.ts` 的 `AgentCliConfig.runner` 添加类型
2. 创建 `runner/<name>.ts` 实现 `AgentRunner`
3. 在 `factory.ts` 添加 case
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with runner module architecture"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ AgentCliConfig type — Task 1
- ✅ SessionInfo type — Task 1
- ✅ YAML config default — Task 2
- ✅ AgentRunner interface — Task 3
- ✅ OpenCodeRunner — Task 4
- ✅ Factory function — Task 5
- ✅ run.ts integration — Task 7
- ✅ suggest.ts integration — Task 8
- ✅ CLI signature change — Task 9
- ✅ Delete old files — Task 10
- ✅ README update — Task 11
- ✅ AGENTS.md update — Task 12

**2. Placeholder scan:** No TBD/TODO/placeholder phrases found.

**3. Type consistency:**
- `AgentCliConfig.runner` matches factory switch cases
- `RunOptions` fields match `OpenCodeRunner.run()` usage
- `SessionInfo` matches `OpenCodeRunner.listSessions()` return type

---

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-04-07-agent-runner-abstraction.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?