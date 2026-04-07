---
name: Agent Runner Abstraction
description: Abstract CLI runner layer supporting configurable command names and future multi-runner support (opencode, claude, gemini)
type: project
---

# Agent Runner Abstraction Design

## Background

Current implementation hardcodes `opencode` command name in three places in `src/executor/opencode.ts`. Enterprise environments may wrap opencode with custom command names like `mycode`. Additionally, future support for other agent CLI tools (claude, gemini) is desired.

## Goal

1. Allow users to configure custom CLI command name in YAML test suite
2. Abstract runner layer to support multiple agent types in the future
3. Centralize CLI command construction logic

## Design

### YAML Configuration

Add `agent_cli` field to `GlobalConfig`:

```typescript
export interface AgentCliConfig {
  runner: 'opencode' | 'claude' | 'gemini';  // Agent type
  command: string;                           // Actual CLI command name
}

export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;  // New field
  target?: { ... };  // deprecated
}
```

YAML example:

```yaml
name: my-project
config:
  agent_cli:
    runner: opencode
    command: mycode    # Enterprise wrapper command name
```

**Why:** Allows per-suite configuration of both runner type and command alias.
**How to apply:** Validation layer ensures default `{ runner: 'opencode', command: 'opencode' }` if not specified.

### Validation Layer

In `src/parser/yaml.ts`, add default value handling:

```typescript
// After existing validation, add:
if (!suite.config?.agent_cli) {
  suite.config = suite.config || {};
  suite.config.agent_cli = {
    runner: 'opencode',
    command: 'opencode'
  };
}
```

**Why:** Guarantees valid config for all callers, no null checks needed downstream.
**How to apply:** Run commands and suggest command both rely on this guaranteed config.

### Runner Interface

New `src/runner/` directory:

```typescript
// src/runner/types.ts
export interface AgentRunner {
  readonly runnerType: string;

  run(options: RunOptions): RunResult;
  exportSession(sessionId: string): Promise<ExportedSession>;
  listSessions(): Promise<SessionInfo[]>;
}

export interface RunOptions {
  input: string;
  directory?: string;
  sessionId?: string;
  fork?: boolean;
  timeout?: number;
  model?: string;
  agent?: string;
}

export interface RunResult {
  outputs: OpenCodeRunOutput[];
  sessionId: string;
}
```

**Why:** Interface abstraction allows each runner to encapsulate its CLI format differences.
**How to apply:** Different runners (claude, gemini) may have different CLI argument formats.

### OpenCodeRunner Implementation

```typescript
// src/runner/opencode.ts
export class OpenCodeRunner implements AgentRunner {
  readonly runnerType = 'opencode';
  private command: string;

  constructor(command: string) {
    this.command = command;
  }

  run(options: RunOptions): RunResult {
    const args = [`${this.command} run`];
    args.push(`"${options.input.replace(/"/g, '\\"')}"`);
    if (options.directory) args.push(`--dir "${options.directory}"`);
    if (options.sessionId) args.push(`--session ${options.sessionId}`);
    if (options.fork) args.push('--fork');
    args.push('--format json');
    if (options.model) args.push(`--model ${options.model}`);
    if (options.agent) args.push(`--agent ${options.agent}`);
    // execSync execution logic...
  }

  exportSession(sessionId: string): Promise<ExportedSession> {
    const command = `${this.command} export ${sessionId}`;
    // execSync execution logic...
  }

  listSessions(): Promise<SessionInfo[]> {
    const command = `${this.command} session list`;
    // Parse table output, return session list...
  }
}
```

**Why:** Encapsulates opencode-specific CLI format and command construction.
**How to apply:** Command name injected via constructor, making alias support trivial.

### Factory Function

```typescript
// src/runner/factory.ts
export function createRunner(config: AgentCliConfig): AgentRunner {
  switch (config.runner) {
    case 'opencode':
      return new OpenCodeRunner(config.command);
    // Future:
    // case 'claude': return new ClaudeRunner(config.command);
    // case 'gemini': return new GeminiRunner(config.command);
    default:
      throw new Error(`Unknown runner type: ${config.runner}`);
  }
}
```

**Why:** Centralized runner creation, easy extension point for new runners.
**How to apply:** Callers only need to pass config, factory handles instantiation.

### Unified Configuration Entry

Both `run` and `suggest` commands read runner config from YAML:

**run.ts:**
```typescript
import { createRunner } from '../runner/factory.js';

// In executeScenario:
const runner = createRunner(suite.config!.agent_cli!);
const runResult = runner.run({ ... });
```

**suggest.ts:**
```typescript
// Now requires testFile parameter (YAML path)
const yamlContent = await fs.readFile(testFile, 'utf-8');
const suite = parseAndValidateYaml(yamlContent);
const runner = createRunner(suite.config!.agent_cli!);
const session = await runner.exportSession(sessionId);
```

**Why:** Unified configuration source eliminates divergent default handling.
**How to apply:** Minimum valid YAML for suggest: `name: x; config: { agent_cli: {...} }`.

### File Structure Changes

```
src/
├── runner/                     # New directory
│   ├── types.ts               # AgentRunner interface
│   ├── opencode.ts            # OpenCodeRunner implementation
│   ├── factory.ts             # createRunner factory
│   └── index.ts               # Module exports
├── executor/
│   ├── opencode.ts            # DELETE (migrated to runner/)
│   ├── fixture.ts             # Keep
│   └── verifier.ts            # Keep
├── commands/
│   ├── run.ts                 # Modify: import runner
│   └── suggest.ts             # Modify: read YAML + import runner
├── types/
│   └ index.ts                 # Modify: add AgentCliConfig, SessionInfo
├── parser/
│   └ yaml.ts                  # Modify: add agent_cli default
├── cli.ts                     # Modify: suggest signature
```

**Why:** Clean module boundaries, runner logic isolated.
**How to apply:** Future runners add files in runner/, no changes to existing runner files.

### Migration Details

| Original | New Location | Change |
|----------|--------------|--------|
| `runOpenCode()` | `OpenCodeRunner.run()` | Interface params, `this.command` |
| `exportSession()` | `OpenCodeRunner.exportSession()` | `this.command` |
| `getLatestSessionId()` | `OpenCodeRunner.listSessions()` | Returns `SessionInfo[]` |

**Why:** `listSessions` returns array for future extensibility (sorting, filtering).
**How to apply:** Callers pick first element for "latest session" logic.

### New Types

```typescript
// types/index.ts
export interface SessionInfo {
  id: string;
  title?: string;
  created?: number;
  updated?: number;
}
```

**Why:** Structured session data instead of raw string parsing at caller.
**How to apply:** Used by suggest command for session selection.

### CLI Signature Change

```typescript
// cli.ts
program
  .command('suggest <testFile>')  // Changed from [sessionId]
  .description('Generate test case suggestion from session')
  .option('-s, --session <sessionId>', 'Session ID to analyze')
  .option('--latest', 'Use the most recent session')
  // ... other options unchanged
```

**Why:** Requires YAML for runner config, no CLI flags for runner/command.
**How to apply:** Users provide YAML path, suggest reads config from it.

## Future Extension

Adding new runner (e.g., claude):

1. Add `'claude'` to runner type union in `AgentCliConfig`
2. Create `src/runner/claude.ts` implementing `AgentRunner`
3. Add case in `factory.ts`
4. No changes to existing runners or callers

**Why:** Interface abstraction enables true extensibility.
**How to apply:** New runner handles its own CLI format without affecting existing code.

## Test Coverage

- `runner/types.ts`: Interface compliance tests
- `runner/opencode.ts`: Unit tests with mock execSync
- `runner/factory.ts`: Runner creation tests
- `parser/yaml.ts`: Default value tests
- `commands/run.ts`: Runner integration tests
- `commands/suggest.ts`: YAML config reading tests