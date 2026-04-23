---
name: AI Judge Assertion
description: Add "AI Judge" assertion type allowing users to specify an Agent CLI to evaluate run results
type: project
---

# AI Judge Assertion Design

## Background

Agent UT currently supports four assertion types:
- `should_call_tool` - Verify tool calls
- `should_produce_file` - Verify file creation
- `file_content_contains` - Verify file content
- `response_contains` - Verify response content

These assertions are rule-based, matching specific patterns. However, AI-generated outputs may need more flexible, semantic evaluation. Users want to leverage another Agent CLI as a "judge" to evaluate whether the run results meet certain criteria.

## Goal

Add a new `judged_by` assertion type that:
1. Allows users to declare multiple judge CLI configurations globally
2. References a specific judge in assertion level
3. Passes outputs to judge CLI via `-f` parameter
4. Receives judge's evaluation result (passed/failed + reason)
5. Supports timeout and probabilistic test configuration

## Design

### YAML Configuration Structure

#### Global Judge Declaration

Reuse existing `AgentCliConfig` format in `config.judges`:

```yaml
config:
  judges:
    code-reviewer:
      runner: opencode
      command: opencode

    quality-checker:
      runner: opencode
      command: mycode    # Enterprise wrapper command name
```

#### Assertion Level Configuration

```yaml
expected:
  - should_call_tool: Write
  - judged_by:
      judge: code-reviewer
      prompt: "Check if the generated code follows project standards"
      timeout: 120000  # Optional, uses default_timeout logic
```

### Type Definitions

```typescript
// types/index.ts

// New JudgedByAssertion type
export interface JudgedByAssertion {
  judge: string;       // Reference to judge name in config.judges
  prompt: string;      // Input prompt for the judge
  timeout?: number;    // Optional timeout override
  min_pass?: number;   // Probabilistic test support
}

// Extend Assertion union type
export type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher }
  | { judged_by: JudgedByAssertion };  // New

// Extend GlobalConfig
export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;
  runs?: number;
  min_pass?: number;
  judges?: Record<string, AgentCliConfig>;  // New
  target?: { ... };
}
```

### Runner Extension

Extend `RunOptions` to support `-f/--file` parameter:

```typescript
// runner/types.ts

interface RunOptions {
  input: string;
  directory?: string;
  sessionId?: string;
  fork?: boolean;
  timeout?: number;
  model?: string;
  agent?: string;
  file?: string;  // New: -f parameter for additional file path
}
```

```typescript
// runner/opencode.ts - run() method

run(options: RunOptions): RunResult {
  const args = [`${this.command} run`];

  args.push(`"${options.input.replace(/"/g, '\\"')}"`);

  if (options.directory) {
    args.push(`--dir "${options.directory}"`);
  }

  // New: -f parameter
  if (options.file) {
    args.push(`-f "${options.file}"`);
  }

  ...
}
```

### Judge Execution Flow

```
┌─────────────────┐
│ judged_by       │
│ assertion       │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Get judge       │
│ config from     │
│ config.judges   │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Write outputs   │
│ to temp JSON    │
│ file            │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Combine prompt  │
│ with format     │
│ guidance        │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Execute judge   │
│ CLI via Runner  │
│ (reuse factory) │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Extract JSON    │
│ result from     │
│ judge output    │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Cleanup temp    │
│ file            │
└─────────────────┘
        │
        ▼
┌─────────────────┐
│ Return          │
│ AssertionResult │
└─────────────────┘
```

### Built-in Format Guidance

Before passing user's prompt to judge, combine with format guidance:

```typescript
const JUDGE_OUTPUT_FORMAT_PROMPT = `Please evaluate the input content. Your response must strictly use the following JSON format, without any other content:
{"passed":boolean,"reason":"string"}

Where:
- passed: evaluation result, true means pass, false means fail
- reason: brief explanation of the evaluation`;

const combinedPrompt = `${JUDGE_OUTPUT_FORMAT_PROMPT}\n\n${assertion.prompt}`;
```

**Why:** Guide judge to return parseable JSON format.
**How to apply:** All judged_by assertions automatically include this guidance.

### Verification Logic

```typescript
// executor/verifier.ts

async function verifyJudgedBy(
  outputs: OpenCodeRunOutput[],
  assertion: JudgedByAssertion,
  judges: Record<string, AgentCliConfig>,
  defaultTimeout: number,
  tempRoot: string
): Promise<AssertionResult> {
  const judgeName = assertion.judge;

  // 1. Check judge config exists
  const judgeConfig = judges[judgeName];
  if (!judgeConfig) {
    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Judge '${judgeName}' not found in config.judges`
    };
  }

  // 2. Write temp file
  let tempFile: string;
  try {
    tempFile = await writeTempJson(outputs, tempRoot);
  } catch (err) {
    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Failed to write temp file: ${err instanceof Error ? err.message : 'Unknown error'}`
    };
  }

  // 3. Execute judge CLI
  const runner = createRunner(judgeConfig);
  const timeout = assertion.timeout || defaultTimeout;
  const combinedPrompt = `${JUDGE_OUTPUT_FORMAT_PROMPT}\n\n${assertion.prompt}`;

  try {
    const result = runner.run({
      input: combinedPrompt,
      file: tempFile,
      timeout
    });

    // 4. Parse judge output
    const judgeResult = extractJudgeResult(result.outputs);

    return {
      type: 'judged_by',
      value: assertion,
      passed: judgeResult.passed,
      actual: { reason: judgeResult.reason },
      message: judgeResult.passed
        ? `Judge '${judgeName}' passed: ${judgeResult.reason || 'OK'}`
        : `Judge '${judgeName}' failed: ${judgeResult.reason || 'No reason provided'}`
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Judge '${judgeName}' execution error: ${errorMessage}`
    };

  } finally {
    // 5. Cleanup temp file
    try {
      await fs.remove(tempFile);
    } catch {
      // Ignore cleanup failure
    }
  }
}

function extractJudgeResult(outputs: OpenCodeRunOutput[]): { passed: boolean; reason?: string } {
  for (const output of outputs) {
    if (output.type === 'text') {
      const text = output.part?.text || output.data?.content || '';
      try {
        const parsed = JSON.parse(text.trim());
        if (typeof parsed.passed === 'boolean') {
          return parsed;
        }
      } catch {
        // Non-JSON, continue searching
      }
    }
  }

  return { passed: false, reason: 'No valid judge result found in output' };
}
```

### verifyAssertions Extension

```typescript
// executor/verifier.ts

async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string,
  config?: GlobalConfig,      // New: global config
  tempRoot?: string           // New: temp directory root
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  const judges = config?.judges || {};
  const defaultTimeout = config?.default_timeout || 120000;

  for (const assertion of assertions) {
    if ('should_call_tool' in assertion) {
      results.push(verifyShouldCallTool(outputs, assertion.should_call_tool));
    }

    if ('should_produce_file' in assertion) {
      results.push(await verifyShouldProduceFile(workDir, assertion.should_produce_file));
    }

    if ('file_content_contains' in assertion) {
      results.push(await verifyFileContentContains(workDir, assertion.file_content_contains));
    }

    if ('response_contains' in assertion) {
      results.push(verifyResponseContains(outputs, assertion.response_contains));
    }

    // New: judged_by assertion
    if ('judged_by' in assertion) {
      results.push(await verifyJudgedBy(
        outputs,
        assertion.judged_by,
        judges,
        defaultTimeout,
        tempRoot || workDir
      ));
    }
  }

  return results;
}
```

### Temp File Handling

```typescript
// executor/temp-file.ts (new file)

import fs from 'fs-extra';
import * as path from 'path';
import type { OpenCodeRunOutput } from '../types/index.js';

/**
 * Write outputs to temp JSON file
 * File stored in test temp directory: .agentut/temp/.judges/
 */
export async function writeTempJson(
  outputs: OpenCodeRunOutput[],
  tempRoot: string
): Promise<string> {
  // Create judge subdirectory
  const judgeDir = path.join(tempRoot, '.judges');
  await fs.ensureDir(judgeDir);

  // Generate unique filename (timestamp + random)
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const fileName = `outputs-${timestamp}-${random}.json`;
  const filePath = path.join(judgeDir, fileName);

  // Write JSON (no indentation)
  await fs.writeJson(filePath, outputs, { spaces: 0 });

  return filePath;
}
```

**Why:** Reuse existing test temp directory structure for unified cleanup.
**How to apply:** `--clean` parameter or `agentut clean` command cleans `.judges/` as well.

### Error Handling

| Error Type | Scenario | Handling |
|-----------|----------|----------|
| Judge not configured | `judges[assertion.judge]` undefined | Return failed, message explains judge not found |
| Execution timeout | Runner.run() throws TimeoutError | Return failed, message explains timeout |
| Execution failure | Runner.run() throws ExecutionError | Return failed, message includes error info |
| Output parse failure | Cannot extract valid JSON from outputs | Return failed, reason explains format error |
| Temp file write failure | fs operation exception | Return failed, message includes error info |

**Why:** All errors return `AssertionResult` (not throw), consistent with other assertions.
**How to apply:** Clean error messages for debugging.

### Probabilistic Test Support

`judged_by` supports `min_pass` configuration at assertion level:

```yaml
expected:
  - judged_by:
      judge: code-reviewer
      prompt: "Check code quality"
      timeout: 120000
      min_pass: 4  # At least 4 passes in 5 runs
```

Statistical calculation reuses existing `calculateAssertionStats` function - no changes needed.

**Priority:** assertion.min_pass → scenario.min_pass → config.min_pass → default

### Call Chain Modification

```typescript
// commands/run.ts - executeScenario function

async function executeScenario(...) {
  ...

  for (let runIndex = 0; runIndex < effectiveRuns; runIndex++) {
    ...

    for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
      ...

      const assertionResults = await verifyAssertions(
        step.expected,
        runResult.outputs,
        tempDirectory,
        suite.config,  // New: pass global config
        tempRoot       // New: pass temp directory root
      );
    }
  }
}
```

### File Structure Changes

```
src/
├── executor/
│   ├── temp-file.ts        # New: writeTempJson helper
│   └── verifier.ts         # Modify: add verifyJudgedBy, extend verifyAssertions
├── types/
│   └── index.ts            # Modify: add JudgedByAssertion, extend Assertion/GlobalConfig
├── runner/
│   ├── types.ts            # Modify: add file to RunOptions
│   └── opencode.ts         # Modify: add -f parameter handling
├── parser/
│   └── yaml.ts             # Modify: parse judged_by and judges config
├── output/
│   └── formatters/
│       ├── html.ts         # Modify: support judged_by display
│       └── markdown.ts     # Modify: support judged_by display
└── commands/
    └── run.ts              # Modify: pass config/tempRoot to verifyAssertions
```

## Future Extension

- Different runner types (claude, gemini) as judges - only need to extend Runner
- Custom judge output format templates - extend JudgedByAssertion
- Judge-specific timeout configuration - already supported via assertion.timeout