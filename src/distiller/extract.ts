// src/distiller/extract.ts
// 从 Part/OpenCodeRunOutput 的统一结构中提取有意义信息的纯函数

const MAX_OUTPUT_LENGTH = 500;

/**
 * 从 item 中提取文本内容
 * 兼容 Part 直接 text 字段和 OpenCodeRunOutput 的 part.text / data.content 字段
 */
export function extractText(item: {
  type?: string;
  // Part 直接字段
  text?: string;
  // OpenCodeRunOutput 包装字段
  part?: { type?: string; text?: string };
  data?: { role?: string; content?: string };
}): string | null {
  // Part 形状：text 直接在顶层
  if (item.text && item.text.trim()) {
    return item.text.trim();
  }
  // OpenCodeRunOutput 新格式
  if (item.part?.text && item.part.text.trim()) {
    return item.part.text.trim();
  }
  // OpenCodeRunOutput 遗留格式
  if (item.data?.content && item.data.content.trim()) {
    return item.data.content.trim();
  }
  return null;
}

/**
 * 从 item 中提取工具调用信息
 * 兼容 Part 和 OpenCodeRunOutput 两种形状，以及新/旧两种字段格式
 */
export function extractToolInfo(item: {
  type?: string;
  // Part 直接字段 (新格式)
  tool?: string;
  state?: { status?: string; input?: Record<string, unknown>; output?: string; error?: string };
  // Part 直接字段 (遗留格式)
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_output?: string;
  success?: boolean;
  error?: string;
  // OpenCodeRunOutput 包装字段 (新格式)
  part?: {
    type?: string;
    tool?: string;
    state?: { status?: string; input?: Record<string, unknown>; output?: string; error?: string };
  };
  // OpenCodeRunOutput 包装字段 (遗留格式)
  data?: {
    role?: string;
    content?: string;
    tool_name?: string;
    tool_args?: Record<string, unknown>;
    tool_output?: string;
    success?: boolean;
    error?: string;
  };
}): {
  toolName: string;
  status: 'completed' | 'error' | 'pending';
  input: Record<string, unknown>;
  output?: string;
  error?: string;
} | null {
  // Part 新格式: 直接 tool 字段
  if (item.tool) {
    const rawStatus = item.state?.status;
    const status: 'completed' | 'error' | 'pending' =
      rawStatus === 'error' ? 'error' : rawStatus === 'pending' ? 'pending' : 'completed';
    return {
      toolName: item.tool,
      status,
      input: item.state?.input || {},
      output: item.state?.output,
      error: item.state?.error,
    };
  }

  // OpenCodeRunOutput 新格式: part.tool
  if (item.part?.tool) {
    const rawStatus = item.part.state?.status;
    const status: 'completed' | 'error' | 'pending' =
      rawStatus === 'error' ? 'error' : rawStatus === 'pending' ? 'pending' : 'completed';
    return {
      toolName: item.part.tool,
      status,
      input: item.part.state?.input || {},
      output: item.part.state?.output,
      error: item.part.state?.error,
    };
  }

  // Part 遗留格式: 直接 tool_name
  if (item.tool_name) {
    return {
      toolName: item.tool_name,
      status: item.success === false ? 'error' : 'completed',
      input: item.tool_args || {},
      output: item.tool_output,
      error: item.error,
    };
  }

  // OpenCodeRunOutput 遗留格式: data.tool_name
  if (item.data?.tool_name) {
    return {
      toolName: item.data.tool_name,
      status: item.data.success === false ? 'error' : 'completed',
      input: item.data.tool_args || {},
      output: item.data.tool_output,
      error: item.data.error,
    };
  }

  return null;
}

/**
 * 截断/替换工具输出
 * - skill 工具 → "[Loaded skill: xxx]"
 * - 普通工具 → 截断到 MAX_OUTPUT_LENGTH 字
 */
export function truncateOutput(
  toolName: string,
  input: Record<string, unknown>,
  output?: string
): string | undefined {
  if (toolName === 'skill' && input['name']) {
    return `[Loaded skill: ${input['name']}]`;
  }
  if (output && output.length > MAX_OUTPUT_LENGTH) {
    return output.slice(0, MAX_OUTPUT_LENGTH) + '...';
  }
  return output;
}
