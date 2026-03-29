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
    model?: string;
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