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
export function matchValue(actual: unknown, matcher: string | Matcher | undefined): boolean {
  // 处理 matcher 为 undefined 的情况
  if (matcher === undefined || matcher === null) {
    return actual === undefined || actual === null;
  }

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
export function getMatcherDescription(matcher: string | Matcher | undefined): string {
  if (matcher === undefined || matcher === null) {
    return 'undefined';
  }

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
 * Verify that a file was produced in the working directory with Matcher support
 */
export async function verifyShouldProduceFile(
  workDir: string,
  assertion: string | Matcher
): Promise<AssertionResult> {
  // 对于字符串形式的绝对路径，保持原有行为
  if (typeof assertion === 'string' && path.isAbsolute(assertion)) {
    const exists = await fs.pathExists(assertion);
    return {
      type: 'should_produce_file',
      value: assertion,
      passed: exists,
      message: exists
        ? `File '${assertion}' exists`
        : `File '${assertion}' not found`
    };
  }

  const matcher: Matcher = typeof assertion === 'string'
    ? { equals: assertion }
    : assertion;

  // 获取目录下所有文件（递归）
  const files: string[] = [];

  async function collectFiles(dir: string, baseDir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath, baseDir);
      } else if (entry.isFile()) {
        // 返回相对路径
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  try {
    await collectFiles(workDir, workDir);
  } catch {
    // 目录不存在
  }

  // 查找匹配的文件
  const matches = files.filter(file => matchValue(file, matcher));

  const passed = matches.length > 0;

  return {
    type: 'should_produce_file',
    value: assertion,
    passed,
    actual: { files: matches },
    message: passed
      ? `Found matching file(s): ${matches.join(', ')}`
      : `No file found matching ${getMatcherDescription(matcher)}`
  };
}

/**
 * Verify that a file contains specific content with Matcher support
 */
export async function verifyFileContentContains(
  workDir: string,
  assertion: { file: string; text: string } | FileContentAssertion
): Promise<AssertionResult> {
  // 解析断言
  // file 使用 equals（精确匹配文件名）
  const fileMatcher: Matcher = typeof assertion.file === 'string'
    ? { equals: assertion.file }
    : assertion.file;

  // text 使用 contains（内容包含检查）- 保持向后兼容
  const textMatcher: Matcher = typeof assertion.text === 'string'
    ? { contains: assertion.text }
    : assertion.text;

  // 获取目录下所有文件
  const files: string[] = [];

  async function collectFiles(dir: string, baseDir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await collectFiles(fullPath, baseDir);
      } else if (entry.isFile()) {
        files.push(path.relative(baseDir, fullPath));
      }
    }
  }

  try {
    await collectFiles(workDir, workDir);
  } catch {
    // 目录不存在
  }

  // 查找匹配的文件
  const matchedFiles = files.filter(f => matchValue(f, fileMatcher));

  if (matchedFiles.length === 0) {
    return {
      type: 'file_content_contains',
      value: assertion,
      passed: false,
      actual: { files: [] },
      message: `No file found matching ${getMatcherDescription(fileMatcher)}`
    };
  }

  // 检查文件内容
  for (const file of matchedFiles) {
    const fullPath = path.join(workDir, file);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (matchValue(content, textMatcher)) {
      return {
        type: 'file_content_contains',
        value: assertion,
        passed: true,
        actual: { file, content: content.substring(0, 200) },
        message: `Content ${getMatcherDescription(textMatcher)} found in '${file}'`
      };
    }
  }

  // 所有匹配文件都不包含指定内容
  const firstFileContent = await fs.readFile(path.join(workDir, matchedFiles[0]), 'utf-8');

  return {
    type: 'file_content_contains',
    value: assertion,
    passed: false,
    actual: {
      file: matchedFiles[0],
      content: firstFileContent.substring(0, 200)
    },
    message: `Content ${getMatcherDescription(textMatcher)} not found in any matching file`
  };
}

/**
 * Verify that the response contains specific text with Matcher support
 */
export function verifyResponseContains(
  outputs: OpenCodeRunOutput[],
  assertion: string | Matcher
): AssertionResult {
  // 字符串参数默认使用 contains 匹配（保持向后兼容）
  const matcher: Matcher = typeof assertion === 'string'
    ? { contains: assertion }
    : assertion;

  // 收集所有文本响应（同时支持 part.text 和 data.content 格式）
  const responses = outputs
    .filter(o => o.type === 'text')
    .map(o => o.part?.text || o.data?.content || '');

  // 检查是否有匹配的响应
  const matches = responses.filter(r => r && matchValue(r, matcher));

  const passed = matches.length > 0;

  return {
    type: 'response_contains',
    value: assertion,
    passed,
    actual: { responses: matches },
    message: passed
      ? `Found response ${getMatcherDescription(matcher)}`
      : `No response found matching ${getMatcherDescription(matcher)}`
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
      results.push(await verifyShouldProduceFile(workDir, assertion.should_produce_file));
    }

    if ('file_content_contains' in assertion) {
      results.push(await verifyFileContentContains(workDir, assertion.file_content_contains));
    }

    if ('response_contains' in assertion) {
      results.push(verifyResponseContains(outputs, assertion.response_contains));
    }
  }

  return results;
}