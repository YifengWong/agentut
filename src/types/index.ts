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
  agent?: string;  // 可选，显式指定 agent 名称
}

export interface SetupAction {
  copy?: string;   // "source -> target" 格式，target 支持 $WORKDIR
  run?: string;
}

export interface ScenarioConfig {
  name: string;
  environment: string;
  /** @deprecated Cleanup strategy is now controlled by CLI --clean parameter or agentut clean command */
  cleanup: boolean;
  steps: StepConfig[];
  runs?: number;      // 概率测试：覆盖全局设置
  min_pass?: number;  // 概率测试：覆盖全局设置
}

export interface StepConfig {
  input: string;
  expected: Assertion[];
  timeout?: number;
}

// ========== Matcher Types ==========

/**
 * Matcher 对象支持多种匹配模式
 * - equals: 精确匹配
 * - contains: 包含匹配（字符串）
 * - regex: 正则匹配
 * - oneOf: 候选值匹配
 */
export interface Matcher {
  equals?: string;
  contains?: string;
  regex?: string;
  oneOf?: string[];
}

/**
 * 工具调用断言，支持 Matcher 模式
 */
export interface ToolCallAssertion {
  name: string | Matcher;
  input?: Record<string, string | Matcher>;
  status?: 'completed' | 'error' | 'pending';
  min_pass?: number;  // 概率测试：覆盖场景/全局设置
}

/**
 * 文件内容断言，支持 Matcher 模式
 */
export interface FileContentAssertion {
  file: string | Matcher;
  text: string | Matcher;
  min_pass?: number;  // 概率测试：覆盖场景/全局设置
}

/**
 * AI裁判断言配置
 */
export interface JudgedByAssertion {
  judge: string;       // 引用全局 judges 中的裁判名
  prompt: string;      // 给裁判的输入提示
  timeout?: number;    // 可选超时覆盖
  min_pass?: number;   // 概率测试支持
}

export type Assertion =
  | { should_call_tool: string | ToolCallAssertion }
  | { should_produce_file: string | Matcher }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion }
  | { response_contains: string | Matcher }
  | { judged_by: JudgedByAssertion };  // AI裁判断言

// ========== Agent CLI Configuration ==========

/**
 * Agent CLI 配置，支持自定义命令名和多 runner 支持
 */
export interface AgentCliConfig {
  runner: 'opencode' | 'claude' | 'gemini';  // Agent 类型
  command: string;                           // 实际执行的 CLI 命令名
}

export interface GlobalConfig {
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;  // 新增：Agent CLI 配置
  runs?: number;                // 概率测试：运行次数
  min_pass?: number;            // 概率测试：最小通过次数
  judges?: Record<string, AgentCliConfig>;  // AI裁判配置
  /** @deprecated Use environment.agent and setup.copy with $WORKDIR instead */
  target?: {
    skill?: string;
    agent?: string;
    model?: string;
  };
}

// ========== Session Analysis Types ==========

export interface ExportedSession {
  info: OpenCodeSessionInfo;
  messages: Message[];
}

/**
 * OpenCode 特有的详细会话信息结构
 * 用于 exportSession() 返回的完整会话数据
 */
export interface OpenCodeSessionInfo {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  version: string;
  summary: SessionSummary;
  time: SessionTime;
}

/**
 * 会话基本信息
 * 用于 listSessions() 返回的会话列表项
 */
export interface SessionInfo {
  id: string;
  title?: string;
  created?: number;
  updated?: number;
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
  // 概率测试扩展字段
  runs?: number;
  min_pass?: number;
  passed_runs?: number;
  runDetails?: RunExecution[];  // 新增：存储每次运行的详细信息
}

// ========== Probabilistic Test Types ==========

/**
 * 单次运行的断言失败详情
 */
export interface AssertionFailure {
  run_index: number;
  message: string;
}

/**
 * 断言级别的统计信息
 */
export interface AssertionStat {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  passed_runs: number;
  total_runs: number;
  pass_rate: number;  // 百分比，0-100
  status: 'passed' | 'failed';
}

/**
 * 单次运行中的步骤详情
 */
export interface RunStepDetail {
  step_index: number;
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];
}

/**
 * 单次运行的执行结果
 */
export interface RunExecution {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions?: AssertionResult[];  // 保留兼容：旧的汇总断言
  steps?: RunStepDetail[];  // 新增：步骤级详情
  error?: string;
}

/**
 * 步骤级别的汇总统计
 */
export interface StepSummary {
  total_runs: number;
  passed_runs: number;
  min_pass: number;
  status: 'passed' | 'failed';
}

/**
 * 断言级别的汇总统计
 */
export interface AssertionSummary {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  min_pass: number;
  passed_runs: number;
  status: 'passed' | 'failed';
  failures: AssertionFailure[];
}

export interface StepResult {
  input: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];  // 保持必填，向后兼容
  actual_output?: OpenCodeRunOutput[];  // 实际输出，供 formatter 使用
  // 概率测试扩展字段（仅在多运行场景时填充）
  runs?: RunExecution[];  // 每次运行的详细信息
  summary?: StepSummary;  // 步骤汇总
  assertionSummaries?: AssertionSummary[];  // 断言汇总
  // 概率测试：断言级统计
  assertionStats?: AssertionStat[];
}

export interface AssertionResult {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | JudgedByAssertion | { file: string; text: string };
  passed: boolean;
  actual?: {
    tool?: string;
    input?: Record<string, unknown>;
    status?: string;
    content?: string;
    file?: string;
    files?: string[];
    responses?: string[];
    reason?: string;  // AI裁判返回的原因
  };
  message?: string;
}

// ========== Cleanup Types ==========

export interface CleanupResult {
  cleaned: boolean;
  path: string;
  error?: string;
}

// ========== OpenCode Output Types ==========

export interface OpenCodeRunOutput {
  type: string;
  timestamp?: number;
  sessionID?: string;
  part?: {
    type?: string;
    text?: string;
    tool?: string;
    callID?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
    };
  };
  // Legacy format support
  data?: {
    role?: 'user' | 'assistant';
    content?: string;
    tool_name?: string;
    tool_args?: Record<string, unknown>;
    tool_output?: string;
    success?: boolean;
    error?: string;
  };
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