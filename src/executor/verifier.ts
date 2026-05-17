import fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import { createRunner } from '../runner/factory.js';
import { OpenCodeDistiller, formatForJudge } from '../distiller/opencode.js';
import { logger } from '../output/logger.js';
import {
  type Assertion,
  type OpenCodeRunOutput,
  type AssertionResult,
  type Matcher,
  type ToolCallAssertion,
  type FileContentAssertion,
  type ExecCommandAssertion,  // 新增
  type JudgedByAssertion,
  type AgentCliConfig,
  type GlobalConfig,
  type ScoreResult,
  type MockRule          // NEW
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
    ('equals' in value || 'contains' in value || 'containsOneOf' in value || 'regex' in value || 'oneOf' in value);
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

  if (matcher.containsOneOf !== undefined) {
    return matcher.containsOneOf.some(sub => actualStr.includes(sub));
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
  if (matcher.containsOneOf !== undefined) return `contains any of [${matcher.containsOneOf.join(', ')}]`;
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

      // 验证 output
      if (toolAssertion.output) {
        const outputStr = output.part?.state?.output || '';
        if (!matchValue(outputStr, toolAssertion.output)) return false;
      }

      return true;
    }

    // Legacy format (type: "tool_call", data.tool_name)
    if (output.type === 'tool_call' && output.data?.tool_name) {
      // Legacy format doesn't support input/status/output matching
      if (toolAssertion.input || toolAssertion.status || toolAssertion.output) {
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
    status: matches[0].part?.state?.status,
    output: matches[0].part?.state?.output
  } : undefined;

  // 构建描述
  const nameDesc = getMatcherDescription(toolAssertion.name);
  const inputDesc = toolAssertion.input
    ? Object.entries(toolAssertion.input)
        .map(([k, v]) => `${k} ${getMatcherDescription(v)}`)
        .join(', ')
    : '';
  const statusDesc = toolAssertion.status ? `, status='${toolAssertion.status}'` : '';
  const outputDesc = toolAssertion.output ? `, output ${getMatcherDescription(toolAssertion.output)}` : '';

  return {
    type: 'should_call_tool',
    value: toolAssertion,
    passed,
    actual,
    message: passed
      ? `Found matching tool call: ${actual?.tool}${inputDesc ? `(${inputDesc})` : ''}${statusDesc}${outputDesc}`
      : `No tool call found with name ${nameDesc}${inputDesc ? `, input ${inputDesc}` : ''}${statusDesc}${outputDesc}`
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
  workDir: string,
  config?: GlobalConfig,
  tempRoot?: string,
  yamlDir?: string  // 新增参数：YAML文件所在目录
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

    // judged_by 断言
    if ('judged_by' in assertion) {
      results.push(await verifyJudgedBy(
        outputs,
        assertion.judged_by,
        judges,
        defaultTimeout,
        tempRoot || workDir,
        workDir  // AI裁判运行目录：使用场景临时目录
      ));
    }

    // exec_command 断言
    if ('exec_command' in assertion) {
      results.push(await verifyExecCommand(
        assertion.exec_command,
        workDir,
        defaultTimeout,
        yamlDir || workDir
      ));
    }
  }

  return results;
}

// ========== Command Execution ==========

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 执行命令并收集输出
 * @param command 要执行的命令
 * @param cwd 执行目录
 * @param timeout 超时时间（毫秒）
 * @returns 命令执行结果
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      cwd,
      shell: true,
      timeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });

    // 超时处理：spawn 的 timeout 会自动终止进程
    // 但我们需要捕获这个事件
    proc.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') {
        resolve({
          stdout,
          stderr,
          exitCode: 1
        });
      }
    });
  });
}

/**
 * 执行命令并验证输出
 * @param assertion exec_command断言配置
 * @param workDir 场景工作目录（默认执行目录）
 * @param defaultTimeout 默认超时时间
 * @param yamlDir YAML文件所在目录（用于解析相对路径的cwd）
 */
export async function verifyExecCommand(
  assertion: ExecCommandAssertion,
  workDir: string,
  defaultTimeout: number,
  yamlDir: string
): Promise<AssertionResult> {
  // 1. 确定执行目录
  const cwd = assertion.cwd
    ? path.resolve(yamlDir, assertion.cwd)
    : workDir;

  // 2. 执行命令
  const timeout = assertion.timeout || defaultTimeout;

  try {
    const result = await executeCommand(assertion.command, cwd, timeout);

    // 3. 验证输出（合并 stdout 和 stderr）
    const output = result.stdout + result.stderr;
    const passed = matchValue(output, assertion.expect);

    // 4. 返回结果
    return {
      type: 'exec_command',
      value: assertion,
      passed,
      actual: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      },
      message: passed
        ? `Command '${assertion.command}' output matches ${getMatcherDescription(assertion.expect)}`
        : `Command '${assertion.command}' output does not match ${getMatcherDescription(assertion.expect)}. Actual output: ${output.substring(0, 200)}`
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    return {
      type: 'exec_command',
      value: assertion,
      passed: false,
      message: `Command '${assertion.command}' execution failed: ${errorMessage}`
    };
  }
}

// ========== AI Judge Assertion ==========

// 内置格式引导 prompt
const JUDGE_OUTPUT_FORMAT_PROMPT = `Please evaluate the input content. Your response must strictly use the following JSON format, without any other content:
{"passed":boolean,"reason":"string"}

Where:
- passed: evaluation result, true means pass, false means fail
- reason: brief explanation of the evaluation`;

/**
 * 从裁判输出中提取 JSON 结果
 * 支持多种格式：
 * 1. 纯 JSON 文本
 * 2. JSON 嵌入在其他文本中（使用正则提取）
 */
function extractJudgeResult(outputs: OpenCodeRunOutput[]): { passed: boolean; reason?: string } {
  for (const output of outputs) {
    if (output.type === 'text') {
      const text = output.part?.text || output.data?.content || '';
      const trimmedText = text.trim();

      // 尝试直接解析纯 JSON
      try {
        const parsed = JSON.parse(trimmedText);
        if (typeof parsed.passed === 'boolean') {
          return parsed;
        }
      } catch {
        // 不是纯 JSON，继续尝试其他方式
      }

      // 尝试从文本中提取 JSON 对象（使用正则）
      // 匹配 {"passed": boolean, "reason": string} 格式
      const jsonRegex = /\{[^{}]*"passed"\s*:\s*(true|false)[^{}]*"reason"\s*:\s*"[^"]*"[^{}]*\}/i;
      const match = trimmedText.match(jsonRegex);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (typeof parsed.passed === 'boolean') {
            return parsed;
          }
        } catch {
          // 正则匹配的内容不是有效 JSON
        }
      }

      // 尝试更宽松的正则：寻找任何包含 passed 字段的 JSON
      const looseJsonRegex = /\{[^{}]*"passed"\s*:\s*(true|false)[^{}]*\}/i;
      const looseMatch = trimmedText.match(looseJsonRegex);
      if (looseMatch) {
        try {
          const parsed = JSON.parse(looseMatch[0]);
          if (typeof parsed.passed === 'boolean') {
            return parsed;
          }
        } catch {
          // 仍然解析失败
        }
      }
    }
  }

  return { passed: false, reason: 'No valid judge result found in output' };
}

/**
 * AI裁判断言验证
 * @param outputs Agent输出数据
 * @param assertion judged_by断言配置
 * @param judges 裁判配置表
 * @param defaultTimeout 默认超时时间
 * @param tempRoot 临时文件根目录（用于存放临时JSON文件）
 * @param judgeDir AI裁判运行目录（通常是场景临时目录tempDirectory）
 */
export async function verifyJudgedBy(
  outputs: OpenCodeRunOutput[],
  assertion: JudgedByAssertion,
  judges: Record<string, AgentCliConfig>,
  defaultTimeout: number,
  tempRoot: string,
  judgeDir: string
): Promise<AssertionResult> {
  const judgeName = assertion.judge;

  // 1. 检查裁判配置是否存在
  const judgeConfig = judges[judgeName];
  if (!judgeConfig) {
    return {
      type: 'judged_by',
      value: assertion,
      passed: false,
      message: `Judge '${judgeName}' not found in config.judges`
    };
  }

  // 2. 蒸馏步骤输出
  const distiller = new OpenCodeDistiller();
  const distilled = distiller.distillOutputs(outputs, judgeDir);
  const stepSummary = formatForJudge(distilled);

  // 3. 组合 prompt（格式引导 + 用户 prompt + 步骤摘要）
  const combinedPrompt = `${JUDGE_OUTPUT_FORMAT_PROMPT}\n\n${assertion.prompt}\n\n${stepSummary}`;

  // 4. 创建 Runner 并执行
  const runner = createRunner(judgeConfig);
  const timeout = assertion.timeout || defaultTimeout;

  try {
    const result = runner.run({
      input: combinedPrompt,
      directory: judgeDir,
      timeout,
      model: judgeConfig.model,
      agent: judgeConfig.agent
    });

    // 5. 解析裁判输出
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
  }
}

// ========== Scenario Scoring ==========

const SCORE_OUTPUT_FORMAT_PROMPT = `Please evaluate the scenario. Your response must strictly use the following JSON format, without any other content:
{"score":number,"reason":"string"}

Where:
- score: a number between 0 and 100 representing the overall quality
- reason: brief explanation of the evaluation`;

/**
 * Extract score from judge text output.
 */
function extractScoreResult(outputs: OpenCodeRunOutput[]): { score: number; reason?: string } {
  for (const output of outputs) {
    if (output.type === 'text') {
      const text = output.part?.text || output.data?.content || '';

      // Try direct JSON parse
      try {
        const parsed = JSON.parse(text.trim());
        if (typeof parsed.score === 'number') {
          return { score: Math.max(0, Math.min(100, Math.round(parsed.score))), reason: parsed.reason };
        }
      } catch { /* not pure JSON */ }

      // Try regex extraction: {"score": number, "reason": "string"}
      const jsonRegex = /\{[^{}]*"score"\s*:\s*(\d+)[^{}]*"reason"\s*:\s*"[^"]*"[^{}]*\}/i;
      const match = text.trim().match(jsonRegex);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (typeof parsed.score === 'number') {
            return { score: Math.max(0, Math.min(100, Math.round(parsed.score))), reason: parsed.reason };
          }
        } catch { /* not valid */ }
      }
    }
  }
  return { score: 0, reason: 'No valid score result found in judge output' };
}

/**
 * 场景评分 — 启动裁判在场景工作目录执行评分
 */
export async function evaluateScenarioScore(
  prompt: string,
  judgeConfig: AgentCliConfig,
  workDir: string,
  timeout: number,
  stepOutputs?: OpenCodeRunOutput[]
): Promise<ScoreResult> {
  let combinedPrompt = `${SCORE_OUTPUT_FORMAT_PROMPT}\n\n${prompt}`;

  // If step outputs were provided, distill and embed them
  if (stepOutputs && stepOutputs.length > 0) {
    const distiller = new OpenCodeDistiller();
    const distilled = distiller.distillOutputs(stepOutputs, workDir);
    combinedPrompt += `\n\n${formatForJudge(distilled)}`;
  }

  try {
    const runner = createRunner(judgeConfig);
    const result = runner.run({
      input: combinedPrompt,
      directory: workDir,
      timeout,
      model: judgeConfig.model,
      agent: judgeConfig.agent
    });

    const scoreResult = extractScoreResult(result.outputs);
    return {
      score: scoreResult.score,
      reason: scoreResult.reason || 'OK',
      judge: judgeConfig.command
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      score: 0,
      reason: `Judge execution error: ${errorMessage}`
    };
  }
}

// ========== Mock Hit Verification ==========

const MOCK_HINT = "Check your mock 'when' conditions and tool call configuration to ensure they align.";

/**
 * Step 执行完毕后，检查 mock 配置是否实际命中并生效。
 * 仅输出 warning 日志，不影响测试结果。
 */
export function verifyMockHits(
  outputs: OpenCodeRunOutput[],
  mockRules: MockRule[]
): void {
  for (const rule of mockRules) {
    const matchedOutputs = outputs.filter(o => {
      if (o.type !== 'tool_use') return false;
      if ((o.part?.tool || '').toLowerCase() !== rule.tool.toLowerCase()) return false;
      if (!rule.when || rule.when.length === 0) return true;
      const input = o.part?.state?.input as Record<string, unknown> | undefined;
      if (!input) return false;
      return rule.when.every(cond =>
        Object.entries(cond).every(([key, matcher]) =>
          matchValue(input[key], matcher as Matcher)
        )
      );
    });

    if (matchedOutputs.length === 0) {
      logger.warn(
        `Mock rule for '${rule.tool}' was configured but never matched. ${MOCK_HINT}`
      );
      continue;
    }

    for (const output of matchedOutputs) {
      const state = output.part?.state;
      const status = state?.status || '';
      const actualOutput = state?.output || '';
      const actualError = state?.error || '';

      if (rule.output !== undefined) {
        if (status !== 'completed') {
          logger.warn(
            `Mock mismatch for '${rule.tool}': expected completed status (mock output), got '${status}'. ${MOCK_HINT}`
          );
        } else if (actualOutput !== rule.output) {
          logger.warn(
            `Mock output mismatch for '${rule.tool}':\n` +
            `  expected: "${rule.output}"\n` +
            `  actual:   "${actualOutput}"\n` +
            `${MOCK_HINT}`
          );
        }
      }

      if (rule.error !== undefined) {
        if (status !== 'error') {
          logger.warn(
            `Mock mismatch for '${rule.tool}': expected error status (mock error), got '${status}'. ${MOCK_HINT}`
          );
        } else if (!actualError.includes(rule.error)) {
          logger.warn(
            `Mock error mismatch for '${rule.tool}':\n` +
            `  expected: "${rule.error}"\n` +
            `  actual:   "${actualError || '(no error)'}"\n` +
            `${MOCK_HINT}`
          );
        }
      }
    }
  }
}