/**
 * 蒸馏后的工具调用信息
 */
export interface DistilledToolCall {
  toolName: string;
  status: 'completed' | 'error' | 'pending';
  input: Record<string, unknown>;
  /** 普通输出截断到 500 字；Skill 加载替换为 "[Loaded skill: xxx]" */
  output?: string;
  error?: string;
}

/**
 * 蒸馏后的文件变更信息
 */
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

/**
 * 蒸馏后的单个步骤（用户输入 → agent 响应）
 */
export interface DistilledStep {
  index: number;
  userInput: string;
  /** reasoning block 前 200 字 */
  reasoning?: string;
  toolCalls: DistilledToolCall[];
  /** Agent 最终文本响应（非空） */
  assistantResponse?: string;
  fileChanges: FileChange[];
}

/**
 * 蒸馏后的标准化会话
 */
export interface DistilledSession {
  workingDirectory: string;
  title: string;
  steps: DistilledStep[];
}

/**
 * 会话蒸馏器接口 —— 每种 Agent runner 实现一个。
 * 将原生 session JSON 转换为标准化的 DistilledSession，
 * 消除格式差异，让下游 LLM 生成器只依赖统一结构。
 */
export interface SessionDistiller {
  readonly runnerType: string;
  distill(rawSession: unknown): DistilledSession;
}
