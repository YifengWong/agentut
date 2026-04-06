import fs from 'fs-extra';
import * as path from 'path';
import {
  type Assertion,
  type OpenCodeRunOutput,
  type AssertionResult,
  type Matcher,
  type ToolCallAssertion,
  type FileContentAssertion
} from '../types/index.js';

/**
 * Type guard to check if a value is a string
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard to check if a value is a Matcher object
 */
function isMatcher(value: unknown): value is Matcher {
  return typeof value === 'object' && value !== null &&
    ('equals' in value || 'contains' in value || 'regex' in value || 'oneOf' in value);
}

/**
 * Type guard to check if a value is a ToolCallAssertion object
 */
function isToolCallAssertion(value: unknown): value is ToolCallAssertion {
  return typeof value === 'object' && value !== null && 'name' in value;
}

/**
 * Type guard to check if a value is a FileContentAssertion object
 */
function isFileContentAssertion(value: unknown): value is FileContentAssertion {
  return typeof value === 'object' && value !== null && 'file' in value && 'text' in value;
}

/**
 * 使用 Matcher 模式匹配值
 * @param actual 实际值
 * @param matcher Matcher 对象或字符串（字符串 = equals）
 * @returns 是否匹配
 */
export function matchValue(actual: unknown, matcher: string | Matcher): boolean {
  // 字符串 = 精确匹配
  if (typeof matcher === 'string') {
    return actual === matcher;
  }

  // 转换 actual 为字符串（用于 contains/regex）
  const actualStr = String(actual);

  // Matcher 对象（按优先级检查）
  if (matcher.equals !== undefined) {
    return actual === matcher.equals;
  }

  if (matcher.contains !== undefined) {
    return actualStr.includes(matcher.contains);
  }

  if (matcher.regex !== undefined) {
    try {
      return new RegExp(matcher.regex).test(actualStr);
    } catch {
      return false; // 无效正则返回 false
    }
  }

  if (matcher.oneOf !== undefined) {
    return matcher.oneOf.includes(String(actual));
  }

  return false;
}

/**
 * 获取匹配类型描述（用于 message）
 */
export function getMatcherDescription(matcher: string | Matcher): string {
  if (typeof matcher === 'string') {
    return `equals '${matcher}'`;
  }

  if (matcher.equals !== undefined) return `equals '${matcher.equals}'`;
  if (matcher.contains !== undefined) return `contains '${matcher.contains}'`;
  if (matcher.regex !== undefined) return `matches regex '${matcher.regex}'`;
  if (matcher.oneOf !== undefined) return `one of [${matcher.oneOf.join(', ')}]`;

  return 'unknown matcher';
}

/**
 * Verify that a specific tool was called with optional Matcher support
 */
export function verifyShouldCallTool(
  outputs: OpenCodeRunOutput[],
  assertion: string | ToolCallAssertion
): AssertionResult {
  // 解析断言
  const toolAssertion: ToolCallAssertion = typeof assertion === 'string'
    ? { name: assertion }
    : assertion;

  // 查找匹配的工具调用
  const matches = outputs.filter(output => {
    // Check new format (type: "tool_use", part.tool)
    if (output.type === 'tool_use') {
      const tool = output.part?.tool?.toLowerCase() || '';
      const input = output.part?.state?.input || {};
      const status = output.part?.state?.status || '';

      // 验证 name（工具名通常是小写）
      const expectedName = typeof toolAssertion.name === 'string'
        ? toolAssertion.name.toLowerCase()
        : toolAssertion.name;

      if (!matchValue(tool, expectedName)) return false;

      // 验证 input
      if (toolAssertion.input) {
        for (const [key, valueMatcher] of Object.entries(toolAssertion.input)) {
          if (!matchValue(input[key], valueMatcher)) return false;
        }
      }

      // 验证 status
      if (toolAssertion.status && status !== toolAssertion.status) return false;

      return true;
    }

    // Legacy format (type: "tool_call", data.tool_name)
    if (output.type === 'tool_call' && output.data?.tool_name) {
      // Legacy format doesn't support input/status matching
      if (toolAssertion.input || toolAssertion.status) {
        return false;
      }

      // For string assertions, use case-insensitive matching
      // For Matcher objects, match against original value (case-sensitive)
      if (typeof toolAssertion.name === 'string') {
        const tool = output.data.tool_name.toLowerCase();
        const expectedName = toolAssertion.name.toLowerCase();
        return matchValue(tool, expectedName);
      }

      // Matcher objects expect the original value for proper matching
      return matchValue(output.data.tool_name, toolAssertion.name);
    }

    return false;
  });

  // 构建结果
  const passed = matches.length > 0;

  // 获取第一个匹配的实际值（用于调试）
  const actual = matches.length > 0 ? {
    tool: matches[0].part?.tool || matches[0].data?.tool_name,
    input: matches[0].part?.state?.input,
    status: matches[0].part?.state?.status
  } : undefined;

  // 构建描述
  const nameDesc = getMatcherDescription(toolAssertion.name);
  const inputDesc = toolAssertion.input
    ? Object.entries(toolAssertion.input)
        .map(([k, v]) => `${k} ${getMatcherDescription(v)}`)
        .join(', ')
    : '';
  const statusDesc = toolAssertion.status ? `, status='${toolAssertion.status}'` : '';

  return {
    type: 'should_call_tool',
    value: toolAssertion,
    passed,
    actual,
    message: passed
      ? `Found matching tool call: ${actual?.tool}${inputDesc ? `(${inputDesc})` : ''}${statusDesc}`
      : `No tool call found with name ${nameDesc}${inputDesc ? `, input ${inputDesc}` : ''}${statusDesc}`
  };
}

/**
 * Verify that a file was produced in the working directory
 */
export async function verifyShouldProduceFile(
  workDir: string,
  filePath: string
): Promise<AssertionResult> {
  // Handle absolute or relative paths
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workDir, filePath);

  const exists = await fs.pathExists(fullPath);

  if (exists) {
    return {
      type: 'should_produce_file',
      value: filePath,
      passed: true,
      message: `File '${filePath}' exists`
    };
  }

  return {
    type: 'should_produce_file',
    value: filePath,
    passed: false,
    message: `File '${filePath}' not found`
  };
}

/**
 * Verify that a file contains specific content
 */
export async function verifyFileContentContains(
  workDir: string,
  filePath: string,
  content: string
): Promise<AssertionResult> {
  // Handle absolute or relative paths
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workDir, filePath);

  const exists = await fs.pathExists(fullPath);

  if (!exists) {
    return {
      type: 'file_content_contains',
      value: { file: filePath, text: content },
      passed: false,
      message: `File '${filePath}' not found`
    };
  }

  try {
    const fileContent = await fs.readFile(fullPath, 'utf-8');

    if (fileContent.includes(content)) {
      return {
        type: 'file_content_contains',
        value: { file: filePath, text: content },
        passed: true,
        message: `Content '${content}' found in '${filePath}'`
      };
    }

    return {
      type: 'file_content_contains',
      value: { file: filePath, text: content },
      passed: false,
      message: `Content '${content}' not found in '${filePath}'`
    };
  } catch (error) {
    return {
      type: 'file_content_contains',
      value: { file: filePath, text: content },
      passed: false,
      message: `Error reading file '${filePath}': ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Verify that the response contains specific text
 */
export function verifyResponseContains(
  outputs: OpenCodeRunOutput[],
  text: string
): AssertionResult {
  // Check both new format (part.text) and legacy format (data.content)
  const textOutputs = outputs.filter(output => {
    // New format: type: "text", part.text
    if (output.type === 'text' && output.part?.text) {
      return true;
    }
    // Legacy format: type: "text", data.content
    if (output.data?.content) {
      return true;
    }
    return false;
  });

  const found = textOutputs.some(output => {
    // New format
    if (output.part?.text) {
      return output.part.text.includes(text);
    }
    // Legacy format
    if (output.data?.content) {
      return output.data.content.includes(text);
    }
    return false;
  });

  if (found) {
    return {
      type: 'response_contains',
      value: text,
      passed: true,
      message: `Text '${text}' found in response`
    };
  }

  return {
    type: 'response_contains',
    value: text,
    passed: false,
    message: `Text '${text}' not found in response`
  };
}

/**
 * Verify all assertions against outputs and working directory
 */
export async function verifyAssertions(
  assertions: Assertion[],
  outputs: OpenCodeRunOutput[],
  workDir: string
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    if ('should_call_tool' in assertion) {
      results.push(verifyShouldCallTool(outputs, assertion.should_call_tool));
    }

    if ('should_produce_file' in assertion) {
      const value = assertion.should_produce_file;
      if (isString(value)) {
        results.push(await verifyShouldProduceFile(workDir, value));
      } else if (isMatcher(value)) {
        // Matcher mode: will be implemented in Task 4
        results.push({
          type: 'should_produce_file',
          value: value,
          passed: false,
          message: 'should_produce_file with Matcher is not yet implemented'
        });
      } else {
        results.push({
          type: 'should_produce_file',
          value: value,
          passed: false,
          message: 'Invalid should_produce_file assertion value'
        });
      }
    }

    if ('file_content_contains' in assertion) {
      const assertionValue = assertion.file_content_contains;
      if ('file' in assertionValue && 'text' in assertionValue) {
        const { file, text } = assertionValue;
        if (isString(file) && isString(text)) {
          results.push(await verifyFileContentContains(workDir, file, text));
        } else if (isMatcher(file) || isMatcher(text)) {
          // Matcher mode: will be implemented in Task 5
          results.push({
            type: 'file_content_contains',
            value: { file, text } as FileContentAssertion,
            passed: false,
            message: 'file_content_contains with Matcher is not yet implemented'
          });
        } else {
          results.push({
            type: 'file_content_contains',
            value: { file, text },
            passed: false,
            message: 'Invalid file_content_contains assertion value'
          });
        }
      }
    }

    if ('response_contains' in assertion) {
      const value = assertion.response_contains;
      if (isString(value)) {
        results.push(verifyResponseContains(outputs, value));
      } else if (isMatcher(value)) {
        // Matcher mode: will be implemented in Task 6
        results.push({
          type: 'response_contains',
          value: value,
          passed: false,
          message: 'response_contains with Matcher is not yet implemented'
        });
      } else {
        results.push({
          type: 'response_contains',
          value: value,
          passed: false,
          message: 'Invalid response_contains assertion value'
        });
      }
    }
  }

  return results;
}