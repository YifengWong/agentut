# Agent VCR Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI tool for testing opencode Agent behaviors through input recording and replay.

**Architecture:** Layered architecture with types at the core, followed by parsers, executors, and output formatters. Commands layer orchestrates all modules. TDD approach with vitest.

**Tech Stack:** TypeScript, Node.js, Commander (CLI), yaml (YAML parsing), chalk (terminal output), fs-extra (file operations), vitest (testing)

---

## File Structure

```
agentut/
├── src/
│   ├── types/
│   │   └── index.ts              # All type definitions
│   ├── parser/
│   │   ├── yaml.ts               # YAML test case parser
│   │   └── session.ts            # Session data parser
│   ├── executor/
│   │   ├── opencode.ts           # opencode CLI wrapper
│   │   ├── fixture.ts            # Environment management
│   │   └── verifier.ts           # Assertion verification
│   ├── output/
│   │   ├── json.ts               # JSON output generator
│   │   └── formatters/
│   │       ├── markdown.ts       # Markdown formatter
│   │       ├── html.ts           # HTML formatter
│   │       └── jest.ts           # Jest-compatible formatter
│   ├── commands/
│   │   ├── init.ts               # init command
│   │   ├── suggest.ts            # suggest command
│   │   ├── run.ts                # run command
│   │   └── report.ts             # report command
│   └── cli.ts                    # CLI entry point
├── tests/
│   ├── parser/
│   │   ├── yaml.test.ts
│   │   └── session.test.ts
│   ├── executor/
│   │   ├── opencode.test.ts
│   │   ├── fixture.test.ts
│   │   └── verifier.test.ts
│   ├── output/
│   │   ├── json.test.ts
│   │   └── formatters/
│   │       ├── markdown.test.ts
│   │       ├── html.test.ts
│   │       └── jest.test.ts
│   └── commands/
│       ├── init.test.ts
│       ├── suggest.test.ts
│       ├── run.test.ts
│       └── report.test.ts
├── SKILL.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Chunk 1: Project Setup and Types

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander yaml chalk fs-extra
npm install -D typescript vitest @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts']
    }
  }
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
*.log
.env
.agentut/
coverage/
```

- [ ] **Step 6: Add npm scripts to package.json**

```json
{
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "dev": "tsc --watch"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: initialize project with TypeScript and vitest"
```

---

### Task 2: Type Definitions

**Files:**
- Create: `src/types/index.ts`
- Test: `tests/types/index.test.ts`

- [ ] **Step 1: Create types directory**

```bash
mkdir -p src/types tests/types
```

- [ ] **Step 2: Write type definitions**

Create `src/types/index.ts`:

```typescript
// ========== YAML Test Suite Types ==========

export interface YamlTestSuite {
  name: string;
  description?: string;
  environments: Record<string, EnvironmentConfig>;
  scenarios: ScenarioConfig[];
  config?: GlobalConfig;
}

export interface EnvironmentConfig {
  directory: string;
  setup: SetupAction[];
}

export interface SetupAction {
  copy?: string;
  run?: string;
}

export interface ScenarioConfig {
  name: string;
  environment: string;
  cleanup: boolean;
  steps: StepConfig[];
}

export interface StepConfig {
  input: string;
  expected: Assertion[];
  timeout?: number;
}

export type Assertion =
  | { should_call_tool: string }
  | { should_produce_file: string }
  | { file_content_contains: { file: string; text: string } }
  | { response_contains: string };

export interface GlobalConfig {
  target?: {
    skill?: string;
    agent?: string;
  };
  default_timeout?: number;
  parallel?: boolean;
}

// ========== Session Analysis Types ==========

export interface ExportedSession {
  info: SessionInfo;
  messages: Message[];
}

export interface SessionInfo {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  summary: SessionSummary;
  time: SessionTime;
}

export interface SessionSummary {
  additions: number;
  deletions: number;
  files: number;
  diffs?: FileDiff[];
}

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
}

export interface SessionTime {
  created: number;
  updated: number;
}

export interface Message {
  info: MessageInfo;
  parts: Part[];
}

export interface MessageInfo {
  role: 'user' | 'assistant';
  time: MessageTime;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  agent?: string;
  id: string;
  sessionID: string;
}

export interface MessageTime {
  created: number;
  completed?: number;
}

export interface Part {
  type: string;
  text?: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_output?: string;
  success?: boolean;
  id: string;
  sessionID: string;
  messageID: string;
}

export interface SessionAnalysis {
  inputs: string[];
  toolCallsByInput: Map<number, string[]>;
  fileChanges: string[];
  workingDirectory: string;
}

// ========== Test Result Types ==========

export interface TestResult {
  suite: SuiteInfo;
  summary: TestSummary;
  scenarios: ScenarioResult[];
}

export interface SuiteInfo {
  name: string;
  description: string;
  file: string;
}

export interface TestSummary {
  total_scenarios: number;
  passed: number;
  failed: number;
  duration_ms: number;
  timestamp: string;
}

export interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;
  tempDirectory?: string;
}

export interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];
}

export interface AssertionResult {
  type: string;
  value: string | { file: string; text: string };
  passed: boolean;
  actual?: string;
  message?: string;
}

// ========== OpenCode Output Types ==========

export interface OpenCodeRunOutput {
  type: 'message' | 'tool_call' | 'tool_result' | 'text' | 'error';
  data: {
    role?: 'user' | 'assistant';
    content?: string;
    tool_name?: string;
    tool_args?: Record<string, unknown>;
    tool_output?: string;
    success?: boolean;
    error?: string;
  };
  session_id: string;
  timestamp: number;
}

// ========== Execution Context Types ==========

export interface ExecutionContext {
  sessionId?: string;
  workingDirectory: string;
  outputs: OpenCodeRunOutput[];
  startTime: number;
}

// ========== Error Classes ==========

export class ValidationError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class ExecutionError extends Error {
  public readonly command?: string;

  constructor(message: string, command?: string) {
    super(message);
    this.name = 'ExecutionError';
    this.command = command;
  }
}

export class TimeoutError extends Error {
  public readonly timeout: number;

  constructor(message: string, timeout: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

export class SetupError extends Error {
  public readonly step?: SetupAction;

  constructor(message: string, step?: SetupAction) {
    super(message);
    this.name = 'SetupError';
    this.step = step;
  }
}
```

- [ ] **Step 3: Write tests for error classes**

Create `tests/types/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  ExecutionError,
  TimeoutError,
  SetupError,
  type Assertion
} from '../../src/types/index.js';

describe('Error Classes', () => {
  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ValidationError');
      expect(error.field).toBeUndefined();
    });

    it('should create error with message and field', () => {
      const error = new ValidationError('Missing field', 'name');
      expect(error.message).toBe('Missing field');
      expect(error.field).toBe('name');
    });
  });

  describe('ExecutionError', () => {
    it('should create error with message', () => {
      const error = new ExecutionError('Command failed');
      expect(error.message).toBe('Command failed');
      expect(error.name).toBe('ExecutionError');
      expect(error.command).toBeUndefined();
    });

    it('should create error with message and command', () => {
      const error = new ExecutionError('Failed', 'opencode run');
      expect(error.command).toBe('opencode run');
    });
  });

  describe('TimeoutError', () => {
    it('should create error with message and timeout', () => {
      const error = new TimeoutError('Timed out', 5000);
      expect(error.message).toBe('Timed out');
      expect(error.name).toBe('TimeoutError');
      expect(error.timeout).toBe(5000);
    });
  });

  describe('SetupError', () => {
    it('should create error with message', () => {
      const error = new SetupError('Setup failed');
      expect(error.message).toBe('Setup failed');
      expect(error.name).toBe('SetupError');
      expect(error.step).toBeUndefined();
    });

    it('should create error with message and step', () => {
      const step = { run: 'npm install' };
      const error = new SetupError('npm install failed', step);
      expect(error.step).toEqual(step);
    });
  });
});

describe('Assertion Type', () => {
  it('should allow should_call_tool assertion', () => {
    const assertion: Assertion = { should_call_tool: 'Write' };
    expect('should_call_tool' in assertion).toBe(true);
  });

  it('should allow should_produce_file assertion', () => {
    const assertion: Assertion = { should_produce_file: 'hello.txt' };
    expect('should_produce_file' in assertion).toBe(true);
  });

  it('should allow file_content_contains assertion', () => {
    const assertion: Assertion = {
      file_content_contains: { file: 'test.txt', text: 'hello' }
    };
    expect('file_content_contains' in assertion).toBe(true);
  });

  it('should allow response_contains assertion', () => {
    const assertion: Assertion = { response_contains: 'success' };
    expect('response_contains' in assertion).toBe(true);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "feat: add type definitions and error classes"
```

---

## Chunk 2: Parser Module

### Task 3: YAML Parser

**Files:**
- Create: `src/parser/yaml.ts`
- Test: `tests/parser/yaml.test.ts`

- [ ] **Step 1: Create parser directory**

```bash
mkdir -p src/parser tests/parser
```

- [ ] **Step 2: Write failing tests**

Create `tests/parser/yaml.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseYaml, validateYamlTestSuite } from '../../src/parser/yaml.js';
import { ValidationError } from '../../src/types/index.js';
import type { YamlTestSuite } from '../../src/types/index.js';

describe('parseYaml', () => {
  it('should parse valid YAML test suite', () => {
    const yaml = `
name: test-suite
description: A test suite
environments:
  default:
    directory: ./fixtures/test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps:
      - input: "test input"
        expected:
          - should_call_tool: Write
        timeout: 60000
config:
  default_timeout: 120000
`;
    const result = parseYaml(yaml);
    expect(result.name).toBe('test-suite');
    expect(result.description).toBe('A test suite');
    expect(result.environments).toHaveProperty('default');
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].steps).toHaveLength(1);
  });

  it('should parse setup actions correctly', () => {
    const yaml = `
name: test-suite
environments:
  env1:
    directory: ./test
    setup:
      - copy: ./templates/base
      - run: npm install
scenarios: []
`;
    const result = parseYaml(yaml);
    expect(result.environments.env1.setup).toHaveLength(2);
    expect(result.environments.env1.setup[0]).toEqual({ copy: './templates/base' });
    expect(result.environments.env1.setup[1]).toEqual({ run: 'npm install' });
  });

  it('should parse multiple scenarios', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps: []
  - name: scenario-2
    environment: default
    cleanup: false
    steps: []
`;
    const result = parseYaml(yaml);
    expect(result.scenarios).toHaveLength(2);
  });

  it('should parse all assertion types', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
          - file_content_contains:
              file: hello.txt
              text: "hello"
          - response_contains: "success"
`;
    const result = parseYaml(yaml);
    const expected = result.scenarios[0].steps[0].expected;
    expect(expected).toHaveLength(4);
  });

  it('should throw on invalid YAML syntax', () => {
    const yaml = `invalid: yaml: : syntax`;
    expect(() => parseYaml(yaml)).toThrow();
  });
});

describe('validateYamlTestSuite', () => {
  it('should pass for valid test suite', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }]
    };
    expect(() => validateYamlTestSuite(suite)).not.toThrow();
  });

  it('should throw ValidationError for missing name', () => {
    const suite = {
      environments: { default: { directory: './test', setup: [] } },
      scenarios: []
    } as unknown as YamlTestSuite;
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for missing environments', () => {
    const suite = {
      name: 'test',
      scenarios: []
    } as unknown as YamlTestSuite;
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for missing scenarios', () => {
    const suite = {
      name: 'test',
      environments: { default: { directory: './test', setup: [] } }
    } as unknown as YamlTestSuite;
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for scenario referencing non-existent environment', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'non-existent',
        cleanup: true,
        steps: []
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should throw ValidationError for invalid assertion type', () => {
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
          expected: [{ invalid_assertion: 'value' }] as unknown as Assertion
        }]
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should use default timeout when step timeout is missing', () => {
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
    expect(suite.scenarios[0].steps[0].timeout).toBe(90000);
  });

  it('should use 60000 as default timeout when config is missing', () => {
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
    expect(suite.scenarios[0].steps[0].timeout).toBe(60000);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test tests/parser/yaml.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 4: Implement YAML parser**

Create `src/parser/yaml.ts`:

```typescript
import { parse as parseYamlString } from 'yaml';
import {
  ValidationError,
  type YamlTestSuite,
  type Assertion
} from '../types/index.js';

const VALID_ASSERTION_TYPES = [
  'should_call_tool',
  'should_produce_file',
  'file_content_contains',
  'response_contains'
];

export function parseYaml(yamlString: string): YamlTestSuite {
  const parsed = parseYamlString(yamlString);
  return parsed as YamlTestSuite;
}

export function validateYamlTestSuite(suite: YamlTestSuite): void {
  // Validate name
  if (!suite.name || typeof suite.name !== 'string') {
    throw new ValidationError('Missing required field: name', 'name');
  }

  // Validate environments
  if (!suite.environments || typeof suite.environments !== 'object') {
    throw new ValidationError('Missing required field: environments', 'environments');
  }

  if (Object.keys(suite.environments).length === 0) {
    throw new ValidationError('environments must have at least one entry', 'environments');
  }

  // Validate scenarios
  if (!suite.scenarios || !Array.isArray(suite.scenarios)) {
    throw new ValidationError('Missing required field: scenarios', 'scenarios');
  }

  // Validate each scenario references a valid environment
  for (const scenario of suite.scenarios) {
    if (!scenario.environment || !(scenario.environment in suite.environments)) {
      throw new ValidationError(
        `Scenario "${scenario.name}" references non-existent environment: ${scenario.environment}`,
        'scenarios.environment'
      );
    }

    // Validate assertions in steps
    for (const step of scenario.steps) {
      for (const assertion of step.expected) {
        const assertionKeys = Object.keys(assertion);
        const isValid = assertionKeys.some(key => VALID_ASSERTION_TYPES.includes(key));

        if (!isValid) {
          throw new ValidationError(
            `Invalid assertion type: ${assertionKeys.join(', ')}`,
            'scenarios.steps.expected'
          );
        }
      }

      // Set default timeout if not provided
      if (step.timeout === undefined) {
        step.timeout = suite.config?.default_timeout ?? 60000;
      }
    }
  }
}

export function parseAndValidateYaml(yamlString: string): YamlTestSuite {
  const suite = parseYaml(yamlString);
  validateYamlTestSuite(suite);
  return suite;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test tests/parser/yaml.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/parser/yaml.ts tests/parser/yaml.test.ts
git commit -m "feat: implement YAML parser with validation"
```

---

### Task 4: Session Parser

**Files:**
- Create: `src/parser/session.ts`
- Test: `tests/parser/session.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/parser/session.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeSession, generateYamlFromAnalysis } from '../../src/parser/session.js';
import type { ExportedSession } from '../../src/types/index.js';

function createMockSession(overrides: Partial<ExportedSession> = {}): ExportedSession {
  return {
    info: {
      id: 'ses_test123',
      slug: 'test-session',
      projectID: 'global',
      directory: '/test/project',
      title: 'Test Session',
      version: '1.0.0',
      summary: {
        additions: 0,
        deletions: 0,
        files: 0
      },
      time: {
        created: Date.now(),
        updated: Date.now()
      }
    },
    messages: [],
    ...overrides
  };
}

describe('analyzeSession', () => {
  it('should extract user inputs from session', () => {
    const session = createMockSession({
      messages: [
        {
          info: {
            role: 'user',
            time: { created: Date.now() },
            id: 'msg_1',
            sessionID: 'ses_test123'
          },
          parts: [
            { type: 'text', text: 'Create a file', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        },
        {
          info: {
            role: 'user',
            time: { created: Date.now() },
            id: 'msg_2',
            sessionID: 'ses_test123'
          },
          parts: [
            { type: 'text', text: 'Modify the file', id: 'p2', sessionID: 'ses_test123', messageID: 'msg_2' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.inputs).toHaveLength(2);
    expect(analysis.inputs[0]).toBe('Create a file');
    expect(analysis.inputs[1]).toBe('Modify the file');
  });

  it('should extract tool calls from assistant messages', () => {
    const session = createMockSession({
      messages: [
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_1', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Create a file', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        },
        {
          info: { role: 'assistant', time: { created: Date.now() }, id: 'msg_2', sessionID: 'ses_test123' },
          parts: [
            { type: 'tool_call', tool_name: 'Write', id: 'p2', sessionID: 'ses_test123', messageID: 'msg_2' },
            { type: 'tool_call', tool_name: 'Read', id: 'p3', sessionID: 'ses_test123', messageID: 'msg_2' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.toolCallsByInput.get(0)).toEqual(['Write', 'Read']);
  });

  it('should extract file changes from summary', () => {
    const session = createMockSession({
      info: {
        ...createMockSession().info,
        summary: {
          additions: 10,
          deletions: 5,
          files: 2,
          diffs: [
            { path: 'src/index.ts', additions: 10, deletions: 5 },
            { path: 'src/utils.ts', additions: 0, deletions: 0 }
          ]
        }
      }
    });

    const analysis = analyzeSession(session);
    expect(analysis.fileChanges).toHaveLength(2);
    expect(analysis.fileChanges).toContain('src/index.ts');
    expect(analysis.fileChanges).toContain('src/utils.ts');
  });

  it('should return empty arrays for empty session', () => {
    const session = createMockSession();
    const analysis = analyzeSession(session);

    expect(analysis.inputs).toHaveLength(0);
    expect(analysis.toolCallsByInput.size).toBe(0);
    expect(analysis.fileChanges).toHaveLength(0);
  });

  it('should handle session with only user messages', () => {
    const session = createMockSession({
      messages: [
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_1', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Hello', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.inputs).toEqual(['Hello']);
    expect(analysis.toolCallsByInput.get(0)).toEqual([]);
  });

  it('should extract working directory', () => {
    const session = createMockSession({
      info: {
        ...createMockSession().info,
        directory: '/home/user/project'
      }
    });

    const analysis = analyzeSession(session);
    expect(analysis.workingDirectory).toBe('/home/user/project');
  });

  it('should handle complex nested message structure', () => {
    const session = createMockSession({
      messages: [
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_1', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Input 1', id: 'p1', sessionID: 'ses_test123', messageID: 'msg_1' }
          ]
        },
        {
          info: { role: 'assistant', time: { created: Date.now() }, id: 'msg_2', sessionID: 'ses_test123' },
          parts: [
            { type: 'step-start', id: 'p2', sessionID: 'ses_test123', messageID: 'msg_2' },
            { type: 'tool_call', tool_name: 'Write', id: 'p3', sessionID: 'ses_test123', messageID: 'msg_2' },
            { type: 'tool_result', tool_output: 'done', id: 'p4', sessionID: 'ses_test123', messageID: 'msg_2' }
          ]
        },
        {
          info: { role: 'user', time: { created: Date.now() }, id: 'msg_3', sessionID: 'ses_test123' },
          parts: [
            { type: 'text', text: 'Input 2', id: 'p5', sessionID: 'ses_test123', messageID: 'msg_3' }
          ]
        },
        {
          info: { role: 'assistant', time: { created: Date.now() }, id: 'msg_4', sessionID: 'ses_test123' },
          parts: [
            { type: 'tool_call', tool_name: 'Edit', id: 'p6', sessionID: 'ses_test123', messageID: 'msg_4' }
          ]
        }
      ]
    });

    const analysis = analyzeSession(session);
    expect(analysis.inputs).toEqual(['Input 1', 'Input 2']);
    expect(analysis.toolCallsByInput.get(0)).toEqual(['Write']);
    expect(analysis.toolCallsByInput.get(1)).toEqual(['Edit']);
  });
});

describe('generateYamlFromAnalysis', () => {
  it('should generate valid YAML test suite', () => {
    const analysis = {
      inputs: ['Create hello.txt'],
      toolCallsByInput: new Map([[0, ['Write']]]),
      fileChanges: ['hello.txt'],
      workingDirectory: '/test/project'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.name).toBe('suggested-test');
    expect(yaml.scenarios).toHaveLength(1);
    expect(yaml.scenarios[0].steps).toHaveLength(1);
    expect(yaml.scenarios[0].steps[0].input).toBe('Create hello.txt');
  });

  it('should add tool call assertions to each step', () => {
    const analysis = {
      inputs: ['Create file', 'Modify file'],
      toolCallsByInput: new Map([[0, ['Write']], [1, ['Edit']]]),
      fileChanges: ['test.txt'],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.scenarios[0].steps[0].expected).toContainEqual({ should_call_tool: 'Write' });
    expect(yaml.scenarios[0].steps[1].expected).toContainEqual({ should_call_tool: 'Edit' });
  });

  it('should add file changes to last step', () => {
    const analysis = {
      inputs: ['Create file', 'Modify file'],
      toolCallsByInput: new Map([[0, ['Write']], [1, ['Edit']]]),
      fileChanges: ['test.txt', 'config.json'],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    const lastStep = yaml.scenarios[0].steps[1];
    expect(lastStep.expected).toContainEqual({ should_produce_file: 'test.txt' });
    expect(lastStep.expected).toContainEqual({ should_produce_file: 'config.json' });
  });

  it('should handle empty inputs', () => {
    const analysis = {
      inputs: [],
      toolCallsByInput: new Map(),
      fileChanges: [],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.scenarios[0].steps).toHaveLength(0);
  });

  it('should handle inputs without tool calls', () => {
    const analysis = {
      inputs: ['What is this?'],
      toolCallsByInput: new Map([[0, []]]),
      fileChanges: [],
      workingDirectory: '/test'
    };

    const yaml = generateYamlFromAnalysis(analysis);
    expect(yaml.scenarios[0].steps[0].expected).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/parser/session.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement session parser**

Create `src/parser/session.ts`:

```typescript
import type {
  ExportedSession,
  SessionAnalysis,
  YamlTestSuite,
  StepConfig
} from '../types/index.js';

export function analyzeSession(session: ExportedSession): SessionAnalysis {
  const inputs: string[] = [];
  const toolCallsByInput: Map<number, string[]> = new Map();
  const fileChanges: string[] = [];

  let inputIndex = -1;

  for (const message of session.messages) {
    if (message.info.role === 'user') {
      for (const part of message.parts) {
        if (part.type === 'text' && part.text) {
          inputs.push(part.text);
          inputIndex++;
          toolCallsByInput.set(inputIndex, []);
        }
      }
    }

    if (message.info.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool_call' && part.tool_name) {
          const calls = toolCallsByInput.get(inputIndex) || [];
          calls.push(part.tool_name);
          toolCallsByInput.set(inputIndex, calls);
        }
      }
    }
  }

  // Extract file changes from summary
  if (session.info.summary?.diffs) {
    for (const diff of session.info.summary.diffs) {
      fileChanges.push(diff.path);
    }
  }

  return {
    inputs,
    toolCallsByInput,
    fileChanges,
    workingDirectory: session.info.directory
  };
}

export function generateYamlFromAnalysis(analysis: SessionAnalysis): YamlTestSuite {
  const steps: StepConfig[] = [];

  for (let i = 0; i < analysis.inputs.length; i++) {
    const step: StepConfig = {
      input: analysis.inputs[i],
      expected: [],
      timeout: 60000
    };

    // Add tool call assertions
    const toolCalls = analysis.toolCallsByInput.get(i) || [];
    for (const toolName of toolCalls) {
      step.expected.push({ should_call_tool: toolName });
    }

    steps.push(step);
  }

  // Add file changes to the last step
  if (analysis.fileChanges.length > 0 && steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    for (const filePath of analysis.fileChanges) {
      lastStep.expected.push({ should_produce_file: filePath });
    }
  }

  return {
    name: 'suggested-test',
    description: '从会话自动生成的测试用例',
    environments: {
      default: {
        directory: './fixtures/suggested-env',
        setup: []
      }
    },
    scenarios: [{
      name: 'suggested-scenario',
      environment: 'default',
      cleanup: true,
      steps: steps
    }],
    config: {
      target: {},
      default_timeout: 120000,
      parallel: false
    }
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/parser/session.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/parser/session.ts tests/parser/session.test.ts
git commit -m "feat: implement session parser for test suggestion"
```

---

## Chunk 3: Executor Module

### Task 5: OpenCode Executor

**Files:**
- Create: `src/executor/opencode.ts`
- Test: `tests/executor/opencode.test.ts`

- [ ] **Step 1: Create executor directory**

```bash
mkdir -p src/executor tests/executor
```

- [ ] **Step 2: Write failing tests**

Create `tests/executor/opencode.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  runOpenCode,
  exportSession,
  getLatestSessionId
} from '../../src/executor/opencode.js';
import { ExecutionError, TimeoutError } from '../../src/types/index.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('runOpenCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call opencode run with correct arguments', async () => {
    const mockOutput = JSON.stringify({
      type: 'text',
      data: { content: 'Hello' },
      session_id: 'ses_123',
      timestamp: 1234567890
    });

    vi.mocked(execSync).mockReturnValue(mockOutput);

    const result = await runOpenCode({
      input: 'Hello',
      directory: '/test/project'
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('opencode run'),
      expect.any(Object)
    );
    expect(result.sessionId).toBe('ses_123');
  });

  it('should use --session flag for subsequent steps', async () => {
    const mockOutput = JSON.stringify({
      type: 'text',
      data: { content: 'Response' },
      session_id: 'ses_456',
      timestamp: 1234567890
    });

    vi.mocked(execSync).mockReturnValue(mockOutput);

    await runOpenCode({
      input: 'Continue',
      sessionId: 'ses_123'
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--session ses_123'),
      expect.any(Object)
    );
  });

  it('should use --fork flag when specified', async () => {
    const mockOutput = JSON.stringify({
      type: 'text',
      data: { content: 'Response' },
      session_id: 'ses_789',
      timestamp: 1234567890
    });

    vi.mocked(execSync).mockReturnValue(mockOutput);

    await runOpenCode({
      input: 'Test',
      sessionId: 'ses_123',
      fork: true
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--fork'),
      expect.any(Object)
    );
  });

  it('should throw ExecutionError on failure', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    await expect(runOpenCode({
      input: 'Test',
      directory: '/test'
    })).rejects.toThrow(ExecutionError);
  });

  it('should throw TimeoutError when timeout is exceeded', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      const error = new Error('Timeout') as Error & { code?: string };
      error.code = 'ETIMEDOUT';
      throw error;
    });

    await expect(runOpenCode({
      input: 'Test',
      directory: '/test',
      timeout: 5000
    })).rejects.toThrow(TimeoutError);
  });

  it('should parse JSON stream output', async () => {
    const mockOutput = [
      JSON.stringify({ type: 'message', data: { role: 'user' }, session_id: 'ses_1', timestamp: 1 }),
      JSON.stringify({ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 2 }),
      JSON.stringify({ type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 3 })
    ].join('\n');

    vi.mocked(execSync).mockReturnValue(mockOutput);

    const result = await runOpenCode({
      input: 'Create file',
      directory: '/test'
    });

    expect(result.outputs).toHaveLength(3);
    expect(result.outputs[0].type).toBe('message');
    expect(result.outputs[1].type).toBe('tool_call');
    expect(result.sessionId).toBe('ses_1');
  });

  it('should use --format json flag', async () => {
    vi.mocked(execSync).mockReturnValue('{}');

    await runOpenCode({
      input: 'Test',
      directory: '/test'
    });

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('--format json'),
      expect.any(Object)
    );
  });
});

describe('exportSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call opencode export with session ID', async () => {
    const mockSession = {
      info: { id: 'ses_123', directory: '/test' },
      messages: []
    };

    vi.mocked(execSync).mockReturnValue(JSON.stringify(mockSession));

    const result = await exportSession('ses_123');

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('opencode export ses_123'),
      expect.any(Object)
    );
    expect(result.info.id).toBe('ses_123');
  });

  it('should throw ExecutionError for invalid session ID', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Session not found');
    });

    await expect(exportSession('invalid')).rejects.toThrow(ExecutionError);
  });
});

describe('getLatestSessionId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse session list and return latest ID', async () => {
    const mockOutput = `Session ID                      Title                                   Updated
ses_abc123                      Test Session                            10:30
ses_def456                      Another Session                         09:00`;

    vi.mocked(execSync).mockReturnValue(mockOutput);

    const result = await getLatestSessionId();

    expect(result).toBe('ses_abc123');
  });

  it('should return null for empty session list', async () => {
    vi.mocked(execSync).mockReturnValue('Session ID                      Title                                   Updated');

    const result = await getLatestSessionId();

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test tests/executor/opencode.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 4: Implement opencode executor**

Create `src/executor/opencode.ts`:

```typescript
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
          if (parsed.session_id) {
            lastSessionId = parsed.session_id;
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
```

- [ ] **Step 5: Run tests**

```bash
npm test tests/executor/opencode.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/executor/opencode.ts tests/executor/opencode.test.ts
git commit -m "feat: implement opencode CLI executor wrapper"
```

---

### Task 6: Fixture Manager

**Files:**
- Create: `src/executor/fixture.ts`
- Test: `tests/executor/fixture.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/executor/fixture.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
  createTempDirectory,
  copyEnvironment,
  executeSetup,
  cleanupEnvironment,
  prepareEnvironment
} from '../../src/executor/fixture.js';
import { SetupError } from '../../src/types/index.js';
import type { EnvironmentConfig, SetupAction } from '../../src/types/index.js';

const TEST_TEMP_DIR = './test-temp-fixture';

describe('Fixture Manager', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  describe('createTempDirectory', () => {
    it('should create a unique temporary directory', async () => {
      const tempDir = await createTempDirectory('test-scenario', TEST_TEMP_DIR);

      expect(await fs.pathExists(tempDir)).toBe(true);
      expect(path.basename(tempDir)).toContain('test-scenario');
    });

    it('should create directories with unique names', async () => {
      const dir1 = await createTempDirectory('scenario', TEST_TEMP_DIR);
      const dir2 = await createTempDirectory('scenario', TEST_TEMP_DIR);

      expect(dir1).not.toBe(dir2);
    });

    it('should sanitize scenario name for directory', async () => {
      const tempDir = await createTempDirectory('test/scenario:with*chars', TEST_TEMP_DIR);

      expect(path.basename(tempDir)).not.toContain('/');
      expect(path.basename(tempDir)).not.toContain(':');
      expect(path.basename(tempDir)).not.toContain('*');
    });
  });

  describe('copyEnvironment', () => {
    it('should copy source directory to target', async () => {
      const sourceDir = path.join(TEST_TEMP_DIR, 'source');
      const targetDir = path.join(TEST_TEMP_DIR, 'target');

      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'test.txt'), 'hello');

      await copyEnvironment(sourceDir, targetDir);

      expect(await fs.pathExists(targetDir)).toBe(true);
      expect(await fs.readFile(path.join(targetDir, 'test.txt'), 'utf-8')).toBe('hello');
    });

    it('should throw SetupError if source does not exist', async () => {
      const targetDir = path.join(TEST_TEMP_DIR, 'target');

      await expect(copyEnvironment('/non/existent/path', targetDir))
        .rejects.toThrow(SetupError);
    });
  });

  describe('executeSetup', () => {
    it('should execute copy action', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      const sourceDir = path.join(TEST_TEMP_DIR, 'source');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'file.txt'), 'content');

      const actions: SetupAction[] = [
        { copy: sourceDir }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      expect(await fs.pathExists(path.join(workDir, 'file.txt'))).toBe(true);
    });

    it('should execute run command', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);

      const actions: SetupAction[] = [
        { run: 'echo test > output.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      expect(await fs.pathExists(path.join(workDir, 'output.txt'))).toBe(true);
    });

    it('should execute multiple setup actions in order', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      const sourceDir = path.join(TEST_TEMP_DIR, 'source');

      await fs.ensureDir(workDir);
      await fs.ensureDir(sourceDir);
      await fs.writeFile(path.join(sourceDir, 'base.txt'), 'base');

      const actions: SetupAction[] = [
        { copy: sourceDir },
        { run: 'echo added >> base.txt' }
      ];

      await executeSetup(actions, workDir, TEST_TEMP_DIR);

      const content = await fs.readFile(path.join(workDir, 'base.txt'), 'utf-8');
      expect(content).toContain('base');
      expect(content).toContain('added');
    });

    it('should throw SetupError if command fails', async () => {
      const workDir = path.join(TEST_TEMP_DIR, 'work');
      await fs.ensureDir(workDir);

      const actions: SetupAction[] = [
        { run: 'exit 1' }
      ];

      await expect(executeSetup(actions, workDir, TEST_TEMP_DIR))
        .rejects.toThrow(SetupError);
    });
  });

  describe('cleanupEnvironment', () => {
    it('should remove directory when cleanup is true', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-cleanup');
      await fs.ensureDir(tempDir);

      await cleanupEnvironment(tempDir, true);

      expect(await fs.pathExists(tempDir)).toBe(false);
    });

    it('should keep directory when cleanup is false', async () => {
      const tempDir = path.join(TEST_TEMP_DIR, 'to-keep');
      await fs.ensureDir(tempDir);

      await cleanupEnvironment(tempDir, false);

      expect(await fs.pathExists(tempDir)).toBe(true);
    });
  });

  describe('prepareEnvironment', () => {
    it('should create temp dir, copy environment, and run setup', async () => {
      const envSource = path.join(TEST_TEMP_DIR, 'env-source');
      await fs.ensureDir(envSource);
      await fs.writeFile(path.join(envSource, 'base.txt'), 'env content');

      const config: EnvironmentConfig = {
        directory: envSource,
        setup: [
          { run: 'echo setup >> base.txt' }
        ]
      };

      const result = await prepareEnvironment(config, 'test-scenario', TEST_TEMP_DIR);

      expect(await fs.pathExists(result.tempDirectory)).toBe(true);
      expect(await fs.readFile(path.join(result.tempDirectory, 'base.txt'), 'utf-8'))
        .toContain('env content');
      expect(await fs.readFile(path.join(result.tempDirectory, 'base.txt'), 'utf-8'))
        .toContain('setup');
    });

    it('should use relative directory from yaml file location', async () => {
      const yamlDir = path.join(TEST_TEMP_DIR, 'yaml-dir');
      const relativeEnvDir = path.join(yamlDir, 'env');
      await fs.ensureDir(relativeEnvDir);
      await fs.writeFile(path.join(relativeEnvDir, 'test.txt'), 'relative');

      const config: EnvironmentConfig = {
        directory: './env',
        setup: []
      };

      const result = await prepareEnvironment(config, 'test', TEST_TEMP_DIR, yamlDir);

      expect(await fs.readFile(path.join(result.tempDirectory, 'test.txt'), 'utf-8'))
        .toBe('relative');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/executor/fixture.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement fixture manager**

Create `src/executor/fixture.ts`:

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import { SetupError, type EnvironmentConfig, type SetupAction } from '../types/index.js';

interface PrepareEnvironmentResult {
  tempDirectory: string;
}

function sanitizeDirectoryName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export async function createTempDirectory(
  scenarioName: string,
  tempRoot: string
): Promise<string> {
  await fs.ensureDir(tempRoot);

  const sanitizedName = sanitizeDirectoryName(scenarioName);
  const runId = uuidv4().split('-')[0];
  const timestamp = Date.now();
  const dirName = `${sanitizedName}-${runId}-${timestamp}`;

  const tempDir = path.join(tempRoot, dirName);
  await fs.ensureDir(tempDir);

  return tempDir;
}

export async function copyEnvironment(
  sourceDir: string,
  targetDir: string
): Promise<void> {
  const exists = await fs.pathExists(sourceDir);
  if (!exists) {
    throw new SetupError(`Source directory does not exist: ${sourceDir}`);
  }

  await fs.copy(sourceDir, targetDir, {
    overwrite: true,
    errorOnExist: false
  });
}

export async function executeSetup(
  actions: SetupAction[],
  workDir: string,
  tempRoot: string
): Promise<void> {
  for (const action of actions) {
    if (action.copy) {
      const sourcePath = path.resolve(tempRoot, action.copy);
      await copyEnvironment(sourcePath, workDir);
    }

    if (action.run) {
      try {
        execSync(action.run, {
          cwd: workDir,
          encoding: 'utf-8',
          timeout: 60000,
          stdio: 'pipe'
        });
      } catch (error) {
        throw new SetupError(
          `Setup command failed: ${action.run}`,
          action
        );
      }
    }
  }
}

export async function cleanupEnvironment(
  directory: string,
  shouldCleanup: boolean
): Promise<void> {
  if (shouldCleanup) {
    await fs.remove(directory);
  }
}

export async function prepareEnvironment(
  config: EnvironmentConfig,
  scenarioName: string,
  tempRoot: string,
  yamlDirectory?: string
): Promise<PrepareEnvironmentResult> {
  // Create temp directory
  const tempDir = await createTempDirectory(scenarioName, tempRoot);

  // Resolve source directory (relative to yaml file location)
  const sourceDir = yamlDirectory
    ? path.resolve(yamlDirectory, config.directory)
    : path.resolve(config.directory);

  // Copy environment
  await copyEnvironment(sourceDir, tempDir);

  // Execute setup actions
  await executeSetup(config.setup, tempDir, tempRoot);

  return {
    tempDirectory: tempDir
  };
}
```

- [ ] **Step 4: Add uuid dependency**

```bash
npm install uuid
npm install -D @types/uuid
```

- [ ] **Step 5: Run tests**

```bash
npm test tests/executor/fixture.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/executor/fixture.ts tests/executor/fixture.test.ts package.json package-lock.json
git commit -m "feat: implement fixture environment manager"
```

---

### Task 7: Verifier

**Files:**
- Create: `src/executor/verifier.ts`
- Test: `tests/executor/verifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/executor/verifier.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { verifyAssertions, verifyAssertion } from '../../src/executor/verifier.js';
import type {
  Assertion,
  OpenCodeRunOutput,
  AssertionResult
} from '../../src/types/index.js';

const TEST_DIR = './test-temp-verifier';

describe('Verifier', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('verifyAssertion', () => {
    describe('should_call_tool', () => {
      it('should pass when tool is called', () => {
        const outputs: OpenCodeRunOutput[] = [
          { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 },
          { type: 'tool_result', data: { success: true }, session_id: 'ses_1', timestamp: 2 }
        ];

        const assertion: Assertion = { should_call_tool: 'Write' };
        const result = verifyAssertion(assertion, outputs, TEST_DIR);

        expect(result.passed).toBe(true);
      });

      it('should fail when tool is not called', () => {
        const outputs: OpenCodeRunOutput[] = [
          { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 }
        ];

        const assertion: Assertion = { should_call_tool: 'Write' };
        const result = verifyAssertion(assertion, outputs, TEST_DIR);

        expect(result.passed).toBe(false);
        expect(result.actual).toContain('Read');
      });

      it('should pass when multiple tools include target', () => {
        const outputs: OpenCodeRunOutput[] = [
          { type: 'tool_call', data: { tool_name: 'Read' }, session_id: 'ses_1', timestamp: 1 },
          { type: 'tool_call', data: { tool_name: 'Edit' }, session_id: 'ses_1', timestamp: 2 }
        ];

        const assertion: Assertion = { should_call_tool: 'Edit' };
        const result = verifyAssertion(assertion, outputs, TEST_DIR);

        expect(result.passed).toBe(true);
      });
    });

    describe('should_produce_file', () => {
      it('should pass when file exists', async () => {
        await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');

        const assertion: Assertion = { should_produce_file: 'test.txt' };
        const result = verifyAssertion(assertion, [], TEST_DIR);

        expect(result.passed).toBe(true);
      });

      it('should fail when file does not exist', () => {
        const assertion: Assertion = { should_produce_file: 'missing.txt' };
        const result = verifyAssertion(assertion, [], TEST_DIR);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('missing.txt');
      });

      it('should handle nested paths', async () => {
        await fs.ensureDir(path.join(TEST_DIR, 'src'));
        await fs.writeFile(path.join(TEST_DIR, 'src', 'index.ts'), 'code');

        const assertion: Assertion = { should_produce_file: 'src/index.ts' };
        const result = verifyAssertion(assertion, [], TEST_DIR);

        expect(result.passed).toBe(true);
      });
    });

    describe('file_content_contains', () => {
      it('should pass when file contains text', async () => {
        await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'hello world');

        const assertion: Assertion = {
          file_content_contains: { file: 'test.txt', text: 'world' }
        };
        const result = verifyAssertion(assertion, [], TEST_DIR);

        expect(result.passed).toBe(true);
      });

      it('should fail when file does not contain text', async () => {
        await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'hello world');

        const assertion: Assertion = {
          file_content_contains: { file: 'test.txt', text: 'missing' }
        };
        const result = verifyAssertion(assertion, [], TEST_DIR);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('missing');
      });

      it('should fail when file does not exist', () => {
        const assertion: Assertion = {
          file_content_contains: { file: 'missing.txt', text: 'text' }
        };
        const result = verifyAssertion(assertion, [], TEST_DIR);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('does not exist');
      });
    });

    describe('response_contains', () => {
      it('should pass when response contains text', () => {
        const outputs: OpenCodeRunOutput[] = [
          { type: 'text', data: { content: 'Hello, world!' }, session_id: 'ses_1', timestamp: 1 }
        ];

        const assertion: Assertion = { response_contains: 'world' };
        const result = verifyAssertion(assertion, outputs, TEST_DIR);

        expect(result.passed).toBe(true);
      });

      it('should fail when response does not contain text', () => {
        const outputs: OpenCodeRunOutput[] = [
          { type: 'text', data: { content: 'Hello!' }, session_id: 'ses_1', timestamp: 1 }
        ];

        const assertion: Assertion = { response_contains: 'world' };
        const result = verifyAssertion(assertion, outputs, TEST_DIR);

        expect(result.passed).toBe(false);
        expect(result.message).toContain('world');
      });

      it('should search in all text outputs', () => {
        const outputs: OpenCodeRunOutput[] = [
          { type: 'text', data: { content: 'First' }, session_id: 'ses_1', timestamp: 1 },
          { type: 'text', data: { content: 'Second' }, session_id: 'ses_1', timestamp: 2 },
          { type: 'text', data: { content: 'Third' }, session_id: 'ses_1', timestamp: 3 }
        ];

        const assertion: Assertion = { response_contains: 'Second' };
        const result = verifyAssertion(assertion, outputs, TEST_DIR);

        expect(result.passed).toBe(true);
      });
    });
  });

  describe('verifyAssertions', () => {
    it('should return results for all assertions', () => {
      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 },
        { type: 'text', data: { content: 'Done' }, session_id: 'ses_1', timestamp: 2 }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { response_contains: 'Done' }
      ];

      const results = verifyAssertions(assertions, outputs, TEST_DIR);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.passed)).toBe(true);
    });

    it('should return empty array for empty assertions', () => {
      const results = verifyAssertions([], [], TEST_DIR);
      expect(results).toHaveLength(0);
    });

    it('should handle mixed pass/fail results', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'content');

      const outputs: OpenCodeRunOutput[] = [
        { type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },           // pass
        { should_produce_file: 'test.txt' },     // pass
        { response_contains: 'missing' }         // fail
      ];

      const results = verifyAssertions(assertions, outputs, TEST_DIR);

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
      expect(results[2].passed).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/executor/verifier.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement verifier**

Create `src/executor/verifier.ts`:

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import type {
  Assertion,
  OpenCodeRunOutput,
  AssertionResult
} from '../types/index.js';

export function verifyAssertion(
  assertion: Assertion,
  outputs: OpenCodeRunOutput[],
  workDirectory: string
): AssertionResult {
  if ('should_call_tool' in assertion) {
    return verifyShouldCallTool(assertion.should_call_tool, outputs);
  }

  if ('should_produce_file' in assertion) {
    return verifyShouldProduceFile(assertion.should_produce_file, workDirectory);
  }

  if ('file_content_contains' in assertion) {
    return verifyFileContentContains(
      assertion.file_content_contains.file,
      assertion.file_content_contains.text,
      workDirectory
    );
  }

  if ('response_contains' in assertion) {
    return verifyResponseContains(assertion.response_contains, outputs);
  }

  return {
    type: 'unknown',
    value: JSON.stringify(assertion),
    passed: false,
    message: 'Unknown assertion type'
  };
}

function verifyShouldCallTool(
  toolName: string,
  outputs: OpenCodeRunOutput[]
): AssertionResult {
  const calledTools = outputs
    .filter(o => o.type === 'tool_call')
    .map(o => o.data.tool_name)
    .filter((name): name is string => name !== undefined);

  const passed = calledTools.includes(toolName);

  return {
    type: 'should_call_tool',
    value: toolName,
    passed,
    actual: passed ? toolName : calledTools.join(', ') || 'no tools called',
    message: passed
      ? undefined
      : `Expected tool "${toolName}" was not called. Called tools: ${calledTools.join(', ') || 'none'}`
  };
}

function verifyShouldProduceFile(
  filePath: string,
  workDirectory: string
): AssertionResult {
  const fullPath = path.join(workDirectory, filePath);
  const exists = fs.existsSync(fullPath);

  return {
    type: 'should_produce_file',
    value: filePath,
    passed: exists,
    message: exists
      ? undefined
      : `File "${filePath}" does not exist`
  };
}

function verifyFileContentContains(
  filePath: string,
  text: string,
  workDirectory: string
): AssertionResult {
  const fullPath = path.join(workDirectory, filePath);

  if (!fs.existsSync(fullPath)) {
    return {
      type: 'file_content_contains',
      value: { file: filePath, text },
      passed: false,
      message: `File "${filePath}" does not exist`
    };
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const contains = content.includes(text);

  return {
    type: 'file_content_contains',
    value: { file: filePath, text },
    passed: contains,
    actual: contains ? text : content.substring(0, 100),
    message: contains
      ? undefined
      : `File "${filePath}" does not contain "${text}"`
  };
}

function verifyResponseContains(
  text: string,
  outputs: OpenCodeRunOutput[]
): AssertionResult {
  const allText = outputs
    .filter(o => o.type === 'text')
    .map(o => o.data.content || '')
    .join(' ');

  const contains = allText.includes(text);

  return {
    type: 'response_contains',
    value: text,
    passed: contains,
    actual: contains ? text : allText.substring(0, 100),
    message: contains
      ? undefined
      : `Response does not contain "${text}"`
  };
}

export function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDirectory: string
): AssertionResult[] {
  return assertions.map(assertion => verifyAssertion(assertion, outputs, workDirectory));
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/executor/verifier.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/executor/verifier.ts tests/executor/verifier.test.ts
git commit -m "feat: implement assertion verifier"
```

---

## Chunk 4: Output Module

### Task 8: JSON Output Generator

**Files:**
- Create: `src/output/json.ts`
- Test: `tests/output/json.test.ts`

- [ ] **Step 1: Create output directory**

```bash
mkdir -p src/output tests/output
```

- [ ] **Step 2: Write failing tests**

Create `tests/output/json.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateTestResult, formatTimestamp } from '../../src/output/json.js';
import type {
  ScenarioResult,
  StepResult,
  AssertionResult,
  YamlTestSuite
} from '../../src/types/index.js';

describe('formatTimestamp', () => {
  it('should format date as ISO 8601', () => {
    const date = new Date('2026-03-29T10:30:00Z');
    const result = formatTimestamp(date);
    expect(result).toBe('2026-03-29T10:30:00.000Z');
  });
});

describe('generateTestResult', () => {
  it('should generate complete test result', () => {
    const suite: YamlTestSuite = {
      name: 'test-suite',
      description: 'A test suite',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario-1',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps: []
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.suite.name).toBe('test-suite');
    expect(result.suite.description).toBe('A test suite');
    expect(result.suite.file).toBe('./test.yaml');
    expect(result.summary.total_scenarios).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.scenarios).toHaveLength(1);
  });

  it('should calculate summary correctly', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      { name: 's1', environment: 'e1', status: 'passed', duration_ms: 100, steps: [] },
      { name: 's2', environment: 'e1', status: 'passed', duration_ms: 200, steps: [] },
      { name: 's3', environment: 'e1', status: 'failed', duration_ms: 300, steps: [] },
      { name: 's4', environment: 'e1', status: 'failed', duration_ms: 400, steps: [] },
      { name: 's5', environment: 'e1', status: 'failed', duration_ms: 500, steps: [] }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.summary.total_scenarios).toBe(5);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.failed).toBe(3);
    expect(result.summary.duration_ms).toBe(1500);
  });

  it('should handle empty scenarios', () => {
    const suite: YamlTestSuite = {
      name: 'empty',
      environments: {},
      scenarios: []
    };

    const result = generateTestResult(suite, [], './test.yaml');

    expect(result.summary.total_scenarios).toBe(0);
    expect(result.summary.passed).toBe(0);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.duration_ms).toBe(0);
  });

  it('should include error message for failed scenarios', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'failed-scenario',
        environment: 'default',
        status: 'failed',
        duration_ms: 100,
        steps: [],
        error: 'Assertion failed: response_contains'
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].error).toBe('Assertion failed: response_contains');
  });

  it('should include temp directory for non-cleanup scenarios', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 100,
        steps: [],
        tempDirectory: '/tmp/test-123'
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].tempDirectory).toBe('/tmp/test-123');
  });

  it('should generate valid ISO 8601 timestamp', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const result = generateTestResult(suite, [], './test.yaml');

    // Validate ISO 8601 format
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    expect(result.summary.timestamp).toMatch(dateRegex);
  });

  it('should include step details', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const steps: StepResult[] = [
      {
        input: 'Create file',
        status: 'passed',
        duration_ms: 500,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true }
        ]
      }
    ];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 500,
        steps
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].steps).toHaveLength(1);
    expect(result.scenarios[0].steps[0].input).toBe('Create file');
    expect(result.scenarios[0].steps[0].assertions).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test tests/output/json.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 4: Implement JSON output generator**

Create `src/output/json.ts`:

```typescript
import type {
  YamlTestSuite,
  ScenarioResult,
  TestResult
} from '../types/index.js';

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function generateTestResult(
  suite: YamlTestSuite,
  scenarioResults: ScenarioResult[],
  filePath: string
): TestResult {
  const passed = scenarioResults.filter(s => s.status === 'passed').length;
  const failed = scenarioResults.filter(s => s.status === 'failed').length;
  const duration_ms = scenarioResults.reduce((sum, s) => sum + s.duration_ms, 0);

  return {
    suite: {
      name: suite.name,
      description: suite.description || '',
      file: filePath
    },
    summary: {
      total_scenarios: scenarioResults.length,
      passed,
      failed,
      duration_ms,
      timestamp: formatTimestamp()
    },
    scenarios: scenarioResults
  };
}
```

- [ ] **Step 5: Run tests**

```bash
npm test tests/output/json.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/output/json.ts tests/output/json.test.ts
git commit -m "feat: implement JSON test result generator"
```

---

### Task 9: Markdown Formatter

**Files:**
- Create: `src/output/formatters/markdown.ts`
- Test: `tests/output/formatters/markdown.test.ts`

- [ ] **Step 1: Create formatters directory**

```bash
mkdir -p src/output/formatters tests/output/formatters
```

- [ ] **Step 2: Write failing tests**

Create `tests/output/formatters/markdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatAsMarkdown } from '../../../src/output/formatters/markdown.js';
import type { TestResult, ScenarioResult } from '../../../src/types/index.js';

describe('formatAsMarkdown', () => {
  it('should generate markdown format', () => {
    const result: TestResult = {
      suite: { name: 'test-suite', description: 'Test', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '2026-03-29T10:30:00Z' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('# Test Report: test-suite');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('1 passed');
    expect(markdown).toContain('0 failed');
  });

  it('should display pass/fail counts correctly', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 3, passed: 2, failed: 1, duration_ms: 300, timestamp: '' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('✓ 2 passed');
    expect(markdown).toContain('✗ 1 failed');
  });

  it('should display scenario details', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-1',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: []
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('### scenario-1');
    expect(markdown).toContain('✅ PASSED');
    expect(markdown).toContain('Duration: 100ms');
  });

  it('should display assertion results', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-1',
          environment: 'default',
          status: 'failed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test',
              status: 'failed',
              duration_ms: 50,
              assertions: [
                { type: 'should_call_tool', value: 'Write', passed: true },
                { type: 'response_contains', value: 'success', passed: false, message: 'Not found' }
              ]
            }
          ]
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('should_call_tool: Write');
    expect(markdown).toContain('✓');
    expect(markdown).toContain('response_contains: success');
    expect(markdown).toContain('✗');
  });

  it('should display error for failed scenarios', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'failed-scenario',
          environment: 'default',
          status: 'failed',
          duration_ms: 100,
          steps: [],
          error: 'Assertion failed: missing file'
        }
      ]
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('Error:');
    expect(markdown).toContain('Assertion failed: missing file');
  });

  it('should handle empty scenarios', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const markdown = formatAsMarkdown(result);

    expect(markdown).toContain('No scenarios executed');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test tests/output/formatters/markdown.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 4: Implement markdown formatter**

Create `src/output/formatters/markdown.ts`:

```typescript
import type { TestResult, ScenarioResult, StepResult } from '../../types/index.js';

export function formatAsMarkdown(result: TestResult): string {
  const lines: string[] = [];

  // Title
  lines.push(`# Test Report: ${result.suite.name}`);
  lines.push('');

  // Description
  if (result.suite.description) {
    lines.push(result.suite.description);
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **File:** ${result.suite.file}`);
  lines.push(`- **Timestamp:** ${result.summary.timestamp}`);
  lines.push(`- **Duration:** ${result.summary.duration_ms}ms`);
  lines.push(`- **Results:** ✓ ${result.summary.passed} passed, ✗ ${result.summary.failed} failed`);
  lines.push('');

  // Scenarios
  lines.push('## Scenarios');
  lines.push('');

  if (result.scenarios.length === 0) {
    lines.push('No scenarios executed.');
    lines.push('');
  } else {
    for (const scenario of result.scenarios) {
      lines.push(formatScenario(scenario));
    }
  }

  return lines.join('\n');
}

function formatScenario(scenario: ScenarioResult): string {
  const lines: string[] = [];

  const statusIcon = scenario.status === 'passed' ? '✅' : '❌';
  const statusText = scenario.status.toUpperCase();

  lines.push(`### ${scenario.name}`);
  lines.push('');
  lines.push(`**Status:** ${statusIcon} ${statusText}`);
  lines.push(`**Environment:** ${scenario.environment}`);
  lines.push(`**Duration:** ${scenario.duration_ms}ms`);

  if (scenario.error) {
    lines.push('');
    lines.push(`**Error:** ${scenario.error}`);
  }

  if (scenario.tempDirectory) {
    lines.push(`**Temp Directory:** ${scenario.tempDirectory}`);
  }

  lines.push('');

  // Steps
  if (scenario.steps.length > 0) {
    lines.push('#### Steps');
    lines.push('');

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      lines.push(formatStep(step, i + 1));
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function formatStep(step: StepResult, index: number): string {
  const lines: string[] = [];

  const statusIcon = step.status === 'passed' ? '✓' : '✗';

  lines.push(`${index}. **Input:** "${step.input}"`);
  lines.push(`   - Status: ${statusIcon} ${step.status}`);
  lines.push(`   - Duration: ${step.duration_ms}ms`);

  if (step.assertions.length > 0) {
    lines.push('   - Assertions:');
    for (const assertion of step.assertions) {
      const icon = assertion.passed ? '✓' : '✗';
      const value = typeof assertion.value === 'string'
        ? assertion.value
        : `${assertion.value.file}: "${assertion.value.text}"`;
      lines.push(`     - ${icon} ${assertion.type}: ${value}`);
      if (!assertion.passed && assertion.message) {
        lines.push(`       - ${assertion.message}`);
      }
    }
  }

  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 5: Run tests**

```bash
npm test tests/output/formatters/markdown.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/output/formatters/markdown.ts tests/output/formatters/markdown.test.ts
git commit -m "feat: implement markdown report formatter"
```

---

### Task 10: HTML Formatter

**Files:**
- Create: `src/output/formatters/html.ts`
- Test: `tests/output/formatters/html.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/output/formatters/html.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatAsHtml } from '../../../src/output/formatters/html.js';
import type { TestResult } from '../../../src/types/index.js';

describe('formatAsHtml', () => {
  it('should generate complete HTML document', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('should include CSS styles', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<style>');
    expect(html).toContain('font-family');
  });

  it('should use different colors for passed/failed', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 0, timestamp: '' },
      scenarios: [
        { name: 'passed', environment: 'e', status: 'passed', duration_ms: 0, steps: [] },
        { name: 'failed', environment: 'e', status: 'failed', duration_ms: 0, steps: [] }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('passed');
    expect(html).toContain('failed');
    // Check for class names that style differently
    expect(html).toContain('status-passed');
    expect(html).toContain('status-failed');
  });

  it('should include scenario details', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'test-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Create file',
              status: 'passed',
              duration_ms: 50,
              assertions: [
                { type: 'should_call_tool', value: 'Write', passed: true }
              ]
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('test-scenario');
    expect(html).toContain('Create file');
    expect(html).toContain('Write');
  });

  it('should support responsive layout', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    // Check for responsive viewport meta tag
    expect(html).toContain('viewport');
    expect(html).toContain('width=device-width');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/output/formatters/html.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement HTML formatter**

Create `src/output/formatters/html.ts`:

```typescript
import type { TestResult, ScenarioResult, StepResult } from '../../types/index.js';

export function formatAsHtml(result: TestResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report: ${escapeHtml(result.suite.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #2c3e50; margin-bottom: 10px; }
    h2 { color: #34495e; margin: 20px 0 10px; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
    h3 { color: #2c3e50; margin: 15px 0 10px; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .summary-item { margin: 5px 0; }
    .status-passed { color: #27ae60; font-weight: bold; }
    .status-failed { color: #e74c3c; font-weight: bold; }
    .scenario {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .scenario-header { display: flex; justify-content: space-between; align-items: center; }
    .scenario-status {
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
    }
    .scenario-status.passed { background: #d4edda; color: #155724; }
    .scenario-status.failed { background: #f8d7da; color: #721c24; }
    .step { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .step-header { font-weight: bold; }
    .assertion { margin: 5px 0 5px 20px; }
    .assertion.passed { color: #27ae60; }
    .assertion.failed { color: #e74c3c; }
    .error { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .meta { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Report: ${escapeHtml(result.suite.name)}</h1>
    ${result.suite.description ? `<p class="meta">${escapeHtml(result.suite.description)}</p>` : ''}

    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-item"><strong>File:</strong> ${escapeHtml(result.suite.file)}</div>
      <div class="summary-item"><strong>Timestamp:</strong> ${escapeHtml(result.summary.timestamp)}</div>
      <div class="summary-item"><strong>Duration:</strong> ${result.summary.duration_ms}ms</div>
      <div class="summary-item">
        <strong>Results:</strong>
        <span class="status-passed">✓ ${result.summary.passed} passed</span>,
        <span class="status-failed">✗ ${result.summary.failed} failed</span>
      </div>
    </div>

    <h2>Scenarios</h2>
    ${result.scenarios.length === 0 ? '<p>No scenarios executed.</p>' : result.scenarios.map(formatScenario).join('\n')}
  </div>
</body>
</html>`;
}

function formatScenario(scenario: ScenarioResult): string {
  return `
    <div class="scenario">
      <div class="scenario-header">
        <h3>${escapeHtml(scenario.name)}</h3>
        <span class="scenario-status ${scenario.status}">${scenario.status.toUpperCase()}</span>
      </div>
      <div class="meta">
        Environment: ${escapeHtml(scenario.environment)} | Duration: ${scenario.duration_ms}ms
      </div>
      ${scenario.error ? `<div class="error"><strong>Error:</strong> ${escapeHtml(scenario.error)}</div>` : ''}
      ${scenario.steps.length > 0 ? `
        <h4>Steps</h4>
        ${scenario.steps.map((step, i) => formatStep(step, i + 1)).join('\n')}
      ` : ''}
    </div>`;
}

function formatStep(step: StepResult, index: number): string {
  return `
    <div class="step">
      <div class="step-header">${index}. Input: "${escapeHtml(step.input)}"</div>
      <div class="meta">Status: ${step.status} | Duration: ${step.duration_ms}ms</div>
      ${step.assertions.length > 0 ? `
        <div class="assertions">
          ${step.assertions.map(a => {
            const value = typeof a.value === 'string' ? a.value : `${a.value.file}: "${a.value.text}"`;
            return `<div class="assertion ${a.passed ? 'passed' : 'failed'}">
              ${a.passed ? '✓' : '✗'} ${escapeHtml(a.type)}: ${escapeHtml(value)}
              ${!a.passed && a.message ? `<br><small>${escapeHtml(a.message)}</small>` : ''}
            </div>`;
          }).join('\n')}
        </div>
      ` : ''}
    </div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/output/formatters/html.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/output/formatters/html.ts tests/output/formatters/html.test.ts
git commit -m "feat: implement HTML report formatter"
```

---

### Task 11: Jest Formatter

**Files:**
- Create: `src/output/formatters/jest.ts`
- Test: `tests/output/formatters/jest.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/output/formatters/jest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { formatAsJest } from '../../../src/output/formatters/jest.js';
import type { TestResult } from '../../../src/types/index.js';

describe('formatAsJest', () => {
  it('should generate Jest-compatible format', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 'scenario-1', environment: 'e', status: 'passed', duration_ms: 100, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest).toHaveProperty('success');
    expect(jest).toHaveProperty('startTime');
    expect(jest).toHaveProperty('numTotalTests');
    expect(jest).toHaveProperty('numPassedTests');
    expect(jest).toHaveProperty('numFailedTests');
    expect(jest).toHaveProperty('testResults');
  });

  it('should map scenario names to test names', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 'my-test-scenario', environment: 'e', status: 'passed', duration_ms: 100, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].name).toContain('my-test-scenario');
  });

  it('should map passed/failed status correctly', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 200, timestamp: '' },
      scenarios: [
        { name: 'passed-test', environment: 'e', status: 'passed', duration_ms: 100, steps: [] },
        { name: 'failed-test', environment: 'e', status: 'failed', duration_ms: 100, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.numPassedTests).toBe(1);
    expect(jest.numFailedTests).toBe(1);
    expect(jest.testResults[0].status).toBe('passed');
    expect(jest.testResults[1].status).toBe('failed');
  });

  it('should map duration to Jest format', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 1500, timestamp: '' },
      scenarios: [
        { name: 'test', environment: 'e', status: 'passed', duration_ms: 1500, steps: [] }
      ]
    };

    const jest = formatAsJest(result);

    // Jest uses seconds, we use ms
    expect(jest.testResults[0].duration).toBe(1500);
    expect(jest.testResults[0].endTime).toBeGreaterThan(jest.testResults[0].startTime);
  });

  it('should map error messages to failureMessages', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'failed-test',
          environment: 'e',
          status: 'failed',
          duration_ms: 100,
          steps: [],
          error: 'Assertion failed: missing file'
        }
      ]
    };

    const jest = formatAsJest(result);

    expect(jest.testResults[0].failureMessages).toContain('Assertion failed: missing file');
  });

  it('should calculate overall success correctly', () => {
    const passedResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 2, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 't1', environment: 'e', status: 'passed', duration_ms: 50, steps: [] },
        { name: 't2', environment: 'e', status: 'passed', duration_ms: 50, steps: [] }
      ]
    };

    const failedResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 't1', environment: 'e', status: 'passed', duration_ms: 50, steps: [] },
        { name: 't2', environment: 'e', status: 'failed', duration_ms: 50, steps: [] }
      ]
    };

    expect(formatAsJest(passedResult).success).toBe(true);
    expect(formatAsJest(failedResult).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/output/formatters/jest.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement Jest formatter**

Create `src/output/formatters/jest.ts`:

```typescript
import type { TestResult, ScenarioResult } from '../../types/index.js';

interface JestTestResult {
  assertionResults: Array<{
    ancestorTitles: string[];
    fullName: string;
    status: 'passed' | 'failed';
    title: string;
    duration?: number;
    failureMessages: string[];
  }>;
  startTime: number;
  endTime: number;
  status: 'passed' | 'failed';
  name: string;
  duration: number;
  failureMessages: string[];
}

interface JestResults {
  success: boolean;
  startTime: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
}

export function formatAsJest(result: TestResult): JestResults {
  const startTime = Date.now();

  const testResults = result.scenarios.map(scenario => formatScenarioAsJest(scenario));

  return {
    success: result.summary.failed === 0,
    startTime,
    numTotalTests: result.summary.total_scenarios,
    numPassedTests: result.summary.passed,
    numFailedTests: result.summary.failed,
    numPendingTests: 0,
    testResults
  };
}

function formatScenarioAsJest(scenario: ScenarioResult): JestTestResult {
  const startTime = Date.now() - scenario.duration_ms;
  const failureMessages: string[] = [];

  if (scenario.error) {
    failureMessages.push(scenario.error);
  }

  // Collect failure messages from failed assertions
  for (const step of scenario.steps) {
    for (const assertion of step.assertions) {
      if (!assertion.passed && assertion.message) {
        failureMessages.push(`${assertion.type}: ${assertion.message}`);
      }
    }
  }

  return {
    assertionResults: [{
      ancestorTitles: [],
      fullName: scenario.name,
      status: scenario.status,
      title: scenario.name,
      duration: scenario.duration_ms,
      failureMessages
    }],
    startTime,
    endTime: startTime + scenario.duration_ms,
    status: scenario.status,
    name: scenario.name,
    duration: scenario.duration_ms,
    failureMessages
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/output/formatters/jest.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/output/formatters/jest.ts tests/output/formatters/jest.test.ts
git commit -m "feat: implement Jest-compatible report formatter"
```

---

## Chunk 5: Commands Module

### Task 12: Init Command

**Files:**
- Create: `src/commands/init.ts`
- Test: `tests/commands/init.test.ts`

- [ ] **Step 1: Create commands directory**

```bash
mkdir -p src/commands tests/commands
```

- [ ] **Step 2: Write failing tests**

Create `tests/commands/init.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { initProject } from '../../src/commands/init.js';

const TEST_DIR = './test-temp-init';

describe('init command', () => {
  beforeEach(async () => {
    await fs.remove(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should create fixtures and tests directories', async () => {
    await initProject(TEST_DIR);

    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures'))).toBe(true);
    expect(await fs.pathExists(path.join(TEST_DIR, 'tests'))).toBe(true);
  });

  it('should create example files with --with-example flag', async () => {
    await initProject(TEST_DIR, { withExample: true });

    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures', 'example-env'))).toBe(true);
    expect(await fs.pathExists(path.join(TEST_DIR, 'tests', 'example-test.yaml'))).toBe(true);
  });

  it('should not create example files without --with-example flag', async () => {
    await initProject(TEST_DIR, { withExample: false });

    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures', 'example-env'))).toBe(false);
    expect(await fs.pathExists(path.join(TEST_DIR, 'tests', 'example-test.yaml'))).toBe(false);
  });

  it('should not overwrite existing directory', async () => {
    await fs.ensureDir(path.join(TEST_DIR, 'fixtures'));
    await fs.writeFile(path.join(TEST_DIR, 'fixtures', 'existing.txt'), 'content');

    await initProject(TEST_DIR, { withExample: false });

    // Should preserve existing content
    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures', 'existing.txt'))).toBe(true);
    expect(await fs.readFile(path.join(TEST_DIR, 'fixtures', 'existing.txt'), 'utf-8')).toBe('content');
  });

  it('should create valid example YAML file', async () => {
    await initProject(TEST_DIR, { withExample: true });

    const yamlPath = path.join(TEST_DIR, 'tests', 'example-test.yaml');
    const content = await fs.readFile(yamlPath, 'utf-8');

    expect(content).toContain('name:');
    expect(content).toContain('environments:');
    expect(content).toContain('scenarios:');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test tests/commands/init.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 4: Implement init command**

Create `src/commands/init.ts`:

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';

export interface InitOptions {
  withExample?: boolean;
}

export async function initProject(
  directory: string,
  options: InitOptions = {}
): Promise<void> {
  const fixturesDir = path.join(directory, 'fixtures');
  const testsDir = path.join(directory, 'tests');

  // Create directories (don't overwrite if exist)
  await fs.ensureDir(fixturesDir);
  await fs.ensureDir(testsDir);

  // Create example files if requested
  if (options.withExample) {
    const exampleEnvDir = path.join(fixturesDir, 'example-env');
    await fs.ensureDir(exampleEnvDir);
    await fs.writeFile(
      path.join(exampleEnvDir, 'sample.txt'),
      'This is a sample file for testing.\n'
    );

    const exampleYaml = `name: example-test
description: An example test suite for Agent VCR

environments:
  example-env:
    directory: ./fixtures/example-env
    setup: []

scenarios:
  - name: example-scenario
    environment: example-env
    cleanup: true
    steps:
      - input: "Read the sample.txt file and summarize it"
        expected:
          - should_call_tool: Read
          - response_contains: "sample"
        timeout: 60000

config:
  default_timeout: 120000
  parallel: false
`;

    await fs.writeFile(
      path.join(testsDir, 'example-test.yaml'),
      exampleYaml
    );
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npm test tests/commands/init.test.ts
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/init.ts tests/commands/init.test.ts
git commit -m "feat: implement init command"
```

---

### Task 13: Suggest Command

**Files:**
- Create: `src/commands/suggest.ts`
- Test: `tests/commands/suggest.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/suggest.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { suggestTest } from '../../src/commands/suggest.js';

const TEST_DIR = './test-temp-suggest';

vi.mock('../../src/executor/opencode.js', () => ({
  exportSession: vi.fn(),
  getLatestSessionId: vi.fn()
}));

import { exportSession, getLatestSessionId } from '../../src/executor/opencode.js';

describe('suggest command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should generate YAML from session ID', async () => {
    vi.mocked(exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test Session',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0 },
        time: { created: Date.now(), updated: Date.now() }
      },
      messages: [
        {
          info: { role: 'user', time: { created: 1 }, id: 'm1', sessionID: 'ses_123' },
          parts: [{ type: 'text', text: 'Create file', id: 'p1', sessionID: 'ses_123', messageID: 'm1' }]
        }
      ]
    });

    const yaml = await suggestTest({ sessionId: 'ses_123' });

    expect(exportSession).toHaveBeenCalledWith('ses_123');
    expect(yaml).toContain('name:');
    expect(yaml).toContain('scenarios:');
    expect(yaml).toContain('Create file');
  });

  it('should use latest session when --latest flag is set', async () => {
    vi.mocked(getLatestSessionId).mockResolvedValue('ses_latest');
    vi.mocked(exportSession).mockResolvedValue({
      info: {
        id: 'ses_latest',
        slug: 'latest',
        projectID: 'global',
        directory: '/test',
        title: 'Latest Session',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0 },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    await suggestTest({ latest: true });

    expect(getLatestSessionId).toHaveBeenCalled();
    expect(exportSession).toHaveBeenCalledWith('ses_latest');
  });

  it('should write to output file when specified', async () => {
    vi.mocked(exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0 },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const outputPath = path.join(TEST_DIR, 'output.yaml');
    await suggestTest({ sessionId: 'ses_123', output: outputPath });

    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('suggested-test');
  });

  it('should set skill name when --skill is specified', async () => {
    vi.mocked(exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0 },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const yaml = await suggestTest({ sessionId: 'ses_123', skill: 'my-skill' });

    expect(yaml).toContain('skill: my-skill');
  });

  it('should use custom test name when --name is specified', async () => {
    vi.mocked(exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0 },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const yaml = await suggestTest({ sessionId: 'ses_123', name: 'my-custom-test' });

    expect(yaml).toContain('name: my-custom-test');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/commands/suggest.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement suggest command**

Create `src/commands/suggest.ts`:

```typescript
import * as fs from 'fs-extra';
import * as yaml from 'yaml';
import { exportSession, getLatestSessionId } from '../executor/opencode.js';
import { analyzeSession, generateYamlFromAnalysis } from '../parser/session.js';
import { ExecutionError } from '../types/index.js';

export interface SuggestOptions {
  sessionId?: string;
  latest?: boolean;
  output?: string;
  skill?: string;
  name?: string;
}

export async function suggestTest(options: SuggestOptions): Promise<string> {
  // Get session ID
  let sessionId = options.sessionId;

  if (options.latest) {
    sessionId = await getLatestSessionId() || undefined;
    if (!sessionId) {
      throw new ExecutionError('No sessions found. Run opencode first to create a session.');
    }
  }

  if (!sessionId) {
    throw new ExecutionError('Session ID is required. Use --latest or provide a session ID.');
  }

  // Export session
  const session = await exportSession(sessionId);

  // Analyze and generate YAML
  const analysis = analyzeSession(session);
  const yamlSuite = generateYamlFromAnalysis(analysis);

  // Apply custom options
  if (options.name) {
    yamlSuite.name = options.name;
  }

  if (options.skill) {
    yamlSuite.config = yamlSuite.config || {};
    yamlSuite.config.target = yamlSuite.config.target || {};
    yamlSuite.config.target.skill = options.skill;
  }

  // Convert to YAML string
  const yamlString = yaml.stringify(yamlSuite, { lineWidth: 0 });

  // Write to file if output specified
  if (options.output) {
    await fs.writeFile(options.output, yamlString, 'utf-8');
  }

  return yamlString;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/commands/suggest.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/commands/suggest.ts tests/commands/suggest.test.ts
git commit -m "feat: implement suggest command"
```

---

### Task 14: Run Command

**Files:**
- Create: `src/commands/run.ts`
- Test: `tests/commands/run.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/run.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { runTests } from '../../src/commands/run.js';
import type { YamlTestSuite, TestResult } from '../../src/types/index.js';

const TEST_DIR = './test-temp-run';

// Mock dependencies
vi.mock('../../src/parser/yaml.js', () => ({
  parseAndValidateYaml: vi.fn()
}));

vi.mock('../../src/executor/opencode.js', () => ({
  runOpenCode: vi.fn()
}));

vi.mock('../../src/executor/fixture.js', () => ({
  prepareEnvironment: vi.fn(),
  cleanupEnvironment: vi.fn()
}));

vi.mock('../../src/executor/verifier.js', () => ({
  verifyAssertions: vi.fn()
}));

import { parseAndValidateYaml } from '../../src/parser/yaml.js';
import { runOpenCode } from '../../src/executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../../src/executor/fixture.js';
import { verifyAssertions } from '../../src/executor/verifier.js';

describe('run command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should run a single test file', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test-suite',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Create file',
          expected: [{ should_call_tool: 'Write' }],
          timeout: 60000
        }]
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(runOpenCode).mockReturnValue({
      outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockReturnValue([
      { type: 'should_call_tool', value: 'Write', passed: true }
    ]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(result.suite.name).toBe('test-suite');
    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].status).toBe('passed');
  });

  it('should filter scenarios when --scenario is specified', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [
        { name: 'scenario-1', environment: 'default', cleanup: true, steps: [] },
        { name: 'scenario-2', environment: 'default', cleanup: true, steps: [] }
      ]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath, { scenario: 'scenario-1' });

    expect(result.scenarios).toHaveLength(1);
    expect(result.scenarios[0].name).toBe('scenario-1');
  });

  it('should handle step timeout gracefully', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'timeout-scenario',
        environment: 'default',
        cleanup: true,
        steps: [
          { input: 'Step 1', expected: [], timeout: 1000 },
          { input: 'Step 2', expected: [], timeout: 1000 }
        ]
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

    // First step times out, second succeeds
    vi.mocked(runOpenCode)
      .mockImplementationOnce(() => {
        throw new Error('Timeout');
      })
      .mockReturnValueOnce({
        outputs: [],
        sessionId: 'ses_1'
      });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    // Scenario should continue after timeout
    expect(result.scenarios[0].steps).toHaveLength(2);
    expect(result.scenarios[0].steps[0].status).toBe('failed');
    expect(result.scenarios[0].steps[1].status).toBe('passed');
  });

  it('should cleanup environment after scenario', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'cleanup-test',
        environment: 'default',
        cleanup: true,
        steps: []
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await runTests(yamlPath);

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', true);
  });

  it('should preserve temp directory when cleanup is false', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'no-cleanup',
        environment: 'default',
        cleanup: false,
        steps: []
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(cleanupEnvironment).toHaveBeenCalledWith('/tmp/test', false);
    expect(result.scenarios[0].tempDirectory).toBe('/tmp/test');
  });

  it('should handle scenario with empty assertions', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'empty-assertions',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Simple question',
          expected: [],  // empty assertions
          timeout: 60000
        }]
      }]
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    vi.mocked(runOpenCode).mockReturnValue({
      outputs: [{ type: 'text', data: { content: 'Answer' }, session_id: 'ses_1', timestamp: 1 }],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockReturnValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    // Scenario with empty assertions should pass
    expect(result.scenarios[0].status).toBe('passed');
    expect(result.scenarios[0].steps[0].assertions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/commands/run.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement run command**

Create `src/commands/run.ts`:

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { runOpenCode } from '../executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../executor/fixture.js';
import { verifyAssertions } from '../executor/verifier.js';
import { generateTestResult } from '../output/json.js';
import {
  type YamlTestSuite,
  type TestResult,
  type ScenarioResult,
  type StepResult,
  ExecutionError
} from '../types/index.js';

export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  verbose?: boolean;
  parallel?: boolean;
  model?: string;
  agent?: string;
}

export async function runTests(
  testPath: string,
  options: RunOptions = {}
): Promise<TestResult> {
  // Check if path exists
  if (!await fs.pathExists(testPath)) {
    throw new ExecutionError(`Test file not found: ${testPath}`);
  }

  // Read and parse YAML
  const yamlContent = await fs.readFile(testPath, 'utf-8');
  const suite = parseAndValidateYaml(yamlContent);
  const yamlDirectory = path.dirname(testPath);

  // Filter scenarios if specified
  let scenarios = suite.scenarios;
  if (options.scenario) {
    scenarios = scenarios.filter(s => s.name === options.scenario);
    if (scenarios.length === 0) {
      throw new ExecutionError(`Scenario not found: ${options.scenario}`);
    }
  }

  // Execute scenarios
  const scenarioResults: ScenarioResult[] = [];
  const tempRoot = path.join(yamlDirectory, '.agentut', 'temp');

  for (const scenario of scenarios) {
    const result = await executeScenario(suite, scenario, yamlDirectory, tempRoot, {
      verbose: options.verbose,
      model: options.model,
      agent: options.agent
    });
    scenarioResults.push(result);
  }

  // Generate result
  const testResult = generateTestResult(suite, scenarioResults, testPath);

  // Write to output file if specified
  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(testResult, null, 2));
  }

  return testResult;
}

async function executeScenario(
  suite: YamlTestSuite,
  scenario: typeof suite.scenarios[0],
  yamlDirectory: string,
  tempRoot: string,
  options?: { verbose?: boolean; model?: string; agent?: string }
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  let sessionId: string | undefined;
  let tempDirectory: string | undefined;
  let error: string | undefined;

  // Get model and agent from options or config
  const model = options?.model || suite.config?.target?.model;
  const agent = options?.agent || suite.config?.target?.agent;

  try {
    // Prepare environment
    const envConfig = suite.environments[scenario.environment];
    const envResult = await prepareEnvironment(envConfig, scenario.name, tempRoot, yamlDirectory);
    tempDirectory = envResult.tempDirectory;

    // Execute steps
    for (const step of scenario.steps) {
      const stepStartTime = Date.now();

      try {
        // Run opencode
        const runResult = runOpenCode({
          input: step.input,
          directory: tempDirectory,
          sessionId,
          fork: !!sessionId,
          timeout: step.timeout,
          model,
          agent
        });

        sessionId = runResult.sessionId;

        // Verify assertions
        const assertionResults = verifyAssertions(step.expected, runResult.outputs, tempDirectory);

        const stepResult: StepResult = {
          input: step.input,
          status: assertionResults.every(a => a.passed) ? 'passed' : 'failed',
          duration_ms: Date.now() - stepStartTime,
          assertions: assertionResults,
          actual_output: options?.verbose ? runResult.outputs : undefined
        };

        stepResults.push(stepResult);
      } catch (err) {
        // Handle timeout or error
        const stepResult: StepResult = {
          input: step.input,
          status: 'failed',
          duration_ms: step.timeout || 60000,
          assertions: [],
          actual_output: options?.verbose ? undefined : undefined
        };

        if (err instanceof Error) {
          stepResult.assertions = [{
            type: 'error',
            value: err.message,
            passed: false,
            message: err.message
          }];
        }

        stepResults.push(stepResult);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      error = err.message;
    }
  }

  // Cleanup
  if (tempDirectory) {
    await cleanupEnvironment(tempDirectory, scenario.cleanup);
  }

  const allStepsPassed = stepResults.every(s => s.status === 'passed');

  return {
    name: scenario.name,
    environment: scenario.environment,
    status: allStepsPassed && !error ? 'passed' : 'failed',
    duration_ms: Date.now() - startTime,
    steps: stepResults,
    error,
    tempDirectory: scenario.cleanup ? undefined : tempDirectory
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/commands/run.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/commands/run.ts tests/commands/run.test.ts
git commit -m "feat: implement run command"
```

---

### Task 15: Report Command

**Files:**
- Create: `src/commands/report.ts`
- Test: `tests/commands/report.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/report.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as path from 'path';
import { generateReport } from '../../src/commands/report.js';
import type { TestResult } from '../../src/types/index.js';

const TEST_DIR = './test-temp-report';

describe('report command', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should generate markdown report', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: []
    };

    await fs.writeJson(inputPath, testResult);

    const report = await generateReport({
      input: inputPath,
      format: 'markdown'
    });

    expect(report).toContain('# Test Report');
    expect(report).toContain('test');
  });

  it('should generate HTML report', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: []
    };

    await fs.writeJson(inputPath, testResult);

    const report = await generateReport({
      input: inputPath,
      format: 'html'
    });

    expect(report).toContain('<!DOCTYPE html>');
    expect(report).toContain('<html>');
  });

  it('should generate Jest-compatible report', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 'scenario-1', environment: 'e', status: 'passed', duration_ms: 100, steps: [] }
      ]
    };

    await fs.writeJson(inputPath, testResult);

    const report = await generateReport({
      input: inputPath,
      format: 'jest'
    });

    const parsed = JSON.parse(report);
    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('testResults');
  });

  it('should write report to output file', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const outputPath = path.join(TEST_DIR, 'report.html');

    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    await fs.writeJson(inputPath, testResult);

    await generateReport({
      input: inputPath,
      format: 'html',
      output: outputPath
    });

    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
  });

  it('should throw error if input file does not exist', async () => {
    await expect(generateReport({
      input: './nonexistent.json',
      format: 'markdown'
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/commands/report.test.ts
```

Expected: FAIL - module not found

- [ ] **Step 3: Implement report command**

Create `src/commands/report.ts`:

```typescript
import * as fs from 'fs-extra';
import { formatAsMarkdown } from '../output/formatters/markdown.js';
import { formatAsHtml } from '../output/formatters/html.js';
import { formatAsJest } from '../output/formatters/jest.js';
import { ExecutionError, type TestResult } from '../types/index.js';

export interface ReportOptions {
  input: string;
  format: 'markdown' | 'html' | 'jest';
  output?: string;
}

export async function generateReport(options: ReportOptions): Promise<string> {
  // Check input file exists
  if (!await fs.pathExists(options.input)) {
    throw new ExecutionError(`Input file not found: ${options.input}`);
  }

  // Read test result
  const testResult = await fs.readJson(options.input) as TestResult;

  // Generate report based on format
  let report: string;

  switch (options.format) {
    case 'markdown':
      report = formatAsMarkdown(testResult);
      break;
    case 'html':
      report = formatAsHtml(testResult);
      break;
    case 'jest':
      report = JSON.stringify(formatAsJest(testResult), null, 2);
      break;
    default:
      throw new ExecutionError(`Unknown format: ${options.format}`);
  }

  // Write to output file if specified
  if (options.output) {
    await fs.writeFile(options.output, report, 'utf-8');
  }

  return report;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test tests/commands/report.test.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/commands/report.ts tests/commands/report.test.ts
git commit -m "feat: implement report command"
```

---

## Chunk 6: CLI Entry Point and Documentation

### Task 16: CLI Entry Point

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Implement CLI entry point**

Create `src/cli.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs-extra';
import { initProject } from './commands/init.js';
import { suggestTest } from './commands/suggest.js';
import { runTests } from './commands/run.js';
import { generateReport } from './commands/report.js';
import { formatAsMarkdown } from './output/formatters/markdown.js';
import { formatAsHtml } from './output/formatters/html.js';
import { formatAsJest } from './output/formatters/jest.js';

const program = new Command();

program
  .name('agentut')
  .description('Agent VCR - Test framework for opencode Agent behaviors')
  .version('1.0.0');

// init command
program
  .command('init [directory]')
  .description('Initialize a test directory structure')
  .option('--with-example', 'Create example test files')
  .action(async (directory = '.', options) => {
    try {
      await initProject(directory, { withExample: options.withExample });
      console.log(`✓ Initialized test directory at ${directory}`);
      if (options.withExample) {
        console.log('  Created fixtures/example-env/');
        console.log('  Created tests/example-test.yaml');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// suggest command
program
  .command('suggest [sessionId]')
  .description('Generate test case suggestion from session')
  .option('--latest', 'Use the most recent session')
  .option('-o, --output <file>', 'Output file path')
  .option('--skill <name>', 'Target skill name')
  .option('--name <name>', 'Test suite name')
  .action(async (sessionId, options) => {
    try {
      const yaml = await suggestTest({
        sessionId,
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

// run command
program
  .command('run <testFile>')
  .description('Run test cases')
  .option('-f, --format <format>', 'Output format (json, markdown, html, jest)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('-s, --scenario <name>', 'Run specific scenario')
  .option('--parallel', 'Run scenarios in parallel')
  .option('-m, --model <model>', 'Override model (provider/model)')
  .option('-a, --agent <agent>', 'Override agent')
  .option('--verbose', 'Show detailed output')
  .action(async (testFile, options) => {
    try {
      const result = await runTests(testFile, {
        format: options.format,
        output: options.output,
        scenario: options.scenario,
        parallel: options.parallel,
        model: options.model,
        agent: options.agent,
        verbose: options.verbose
      });

      // Format output
      let output: string;
      switch (options.format) {
        case 'markdown':
          output = formatAsMarkdown(result);
          break;
        case 'html':
          output = formatAsHtml(result);
          break;
        case 'jest':
          output = JSON.stringify(formatAsJest(result), null, 2);
          break;
        default:
          output = JSON.stringify(result, null, 2);
      }

      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(`✓ Results written to ${options.output}`);
      } else {
        console.log(output);
      }

      // Exit with error code if any tests failed
      if (result.summary.failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// report command
program
  .command('report')
  .description('Generate formatted report from JSON results')
  .requiredOption('-i, --input <file>', 'Input JSON file')
  .requiredOption('-f, --format <format>', 'Output format (markdown, html, jest)')
  .option('-o, --output <file>', 'Output file path')
  .action(async (options) => {
    try {
      const report = await generateReport({
        input: options.input,
        format: options.format,
        output: options.output
      });

      if (!options.output) {
        console.log(report);
      } else {
        console.log(`✓ Report written to ${options.output}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 2: Add bin entry to package.json**

```json
{
  "bin": {
    "agentut": "./dist/cli.js"
  }
}
```

- [ ] **Step 3: Build and test CLI**

```bash
npm run build
node dist/cli.js --help
```

Expected: CLI help output displayed

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts package.json
git commit -m "feat: implement CLI entry point"
```

---

### Task 17: SKILL.md Documentation

**Files:**
- Create: `SKILL.md`

- [ ] **Step 1: Create SKILL.md**

Create `SKILL.md`:

```markdown
---
name: agent-vcr
description: Test framework for opencode Agent behaviors. Use when you need to test skills, agents, or other agent modules through recorded input sequences and assertion verification.
---

# Agent VCR

A test framework for opencode Agent behaviors. Record user inputs, replay them, and verify expected behaviors.

## Installation

```bash
npm install -g agentut
```

## Quick Start

### 1. Initialize a Test Directory

```bash
agentut init ./tests --with-example
```

This creates:
- `fixtures/example-env/` - Sample test environment
- `tests/example-test.yaml` - Example test case

### 2. Run Tests

```bash
agentut run ./tests/example-test.yaml
```

### 3. Generate Test from Session

```bash
agentut suggest --latest -o ./tests/my-test.yaml
```

## Test Case Format

Test cases are defined in YAML:

```yaml
name: my-test-suite
description: Test description

environments:
  default:
    directory: ./fixtures/test-env
    setup:
      - copy: ./templates/base
      - run: npm install

scenarios:
  - name: create-file
    environment: default
    cleanup: true
    steps:
      - input: "Create hello.txt"
        expected:
          - should_call_tool: Write
          - should_produce_file: hello.txt
        timeout: 60000

config:
  default_timeout: 120000
```

## Assertions

| Assertion | Description |
|-----------|-------------|
| `should_call_tool: ToolName` | Verify a specific tool was called |
| `should_produce_file: filename` | Verify a file was created |
| `file_content_contains: { file, text }` | Verify file content contains text |
| `response_contains: text` | Verify response contains text |

## Commands

### agentut init

Initialize test directory structure.

```bash
agentut init [directory] [--with-example]
```

### agentut suggest

Generate test case from opencode session.

```bash
agentut suggest [sessionId] [--latest] [-o file] [--skill name] [--name name]
```

### agentut run

Run test cases.

```bash
agentut run <testFile> [-f format] [-o file] [-s scenario] [--verbose]
```

### agentut report

Generate formatted report.

```bash
agentut report -i <jsonFile> -f <format> [-o file]
```

## Output Formats

- `json` - Structured JSON (default)
- `markdown` - Human-readable markdown
- `html` - Styled HTML report
- `jest` - Jest-compatible format for CI integration

## CI Integration

For CI/CD pipelines, use JSON or Jest format:

```bash
agentut run ./tests/ -f jest -o results.json
```

Exit code is 0 if all tests pass, 1 if any fail.
```

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: add SKILL.md documentation"
```

---

### Task 18: Final Build and Test

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Build the project**

```bash
npm run build
```

Expected: No errors

- [ ] **Step 3: Test CLI locally**

```bash
# Link for local testing
npm link

# Test init
agentut init ./test-output --with-example

# Verify files created
ls ./test-output

# Cleanup
rm -rf ./test-output
npm unlink -g agentut
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build verification"
```

---

## Summary

This implementation plan covers:

1. **Project Setup** - TypeScript, vitest, dependencies
2. **Types** - Core type definitions and error classes
3. **Parser Module** - YAML and session parsing
4. **Executor Module** - OpenCode wrapper, fixtures, verification
5. **Output Module** - JSON, Markdown, HTML, Jest formatters
6. **Commands Module** - init, suggest, run, report
7. **CLI Entry Point** - Commander-based CLI
8. **Documentation** - SKILL.md

Each task follows TDD with failing tests first, then implementation.

## Scope Notes

**Deferred Features (Future Versions):**

- **Parallel Execution**: The `--parallel` CLI option and parallel scenario execution is defined in the spec but deferred to a future version. The current implementation accepts the flag but executes scenarios sequentially. Parallel execution requires careful resource isolation (temporary directories, opencode sessions) and will be implemented in a follow-up phase.

- **Model/Agent Override**: The `--model` and `--agent` CLI options are implemented and allow overriding the YAML config at runtime. The `config.target` in YAML can also specify default values.