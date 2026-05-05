import type {
  StepSummary,
  AssertionSummary,
  AssertionFailure,
  Assertion,
  AssertionResult,
  Matcher,
  ToolCallAssertion,
  FileContentAssertion,
  JudgedByAssertion,
  ExecCommandAssertion,
  RunExecution,
  AssertionStat
} from '../types/index.js';

/**
 * 从 RunExecution 中提取所有断言结果（按步骤顺序）
 */
function extractAssertionsFromRun(run: RunExecution): AssertionResult[] {
  if (run.steps) {
    return run.steps.flatMap(s => s.assertions);
  }
  // 向后兼容：如果没有 steps，尝试 assertions 字段
  return run.assertions || [];
}

/**
 * 计算步骤汇总信息
 */
export function calculateStepSummary(
  runs: RunExecution[],
  minPass: number
): StepSummary {
  const totalRuns = runs.length;
  const passedRuns = runs.filter(r => r.status === 'passed').length;
  const status = passedRuns >= minPass ? 'passed' : 'failed';

  return {
    total_runs: totalRuns,
    passed_runs: passedRuns,
    min_pass: minPass,
    status
  };
}

/**
 * 从 Assertion 提取断言类型
 */
function getAssertionType(assertion: Assertion): string {
  if ('should_call_tool' in assertion) return 'should_call_tool';
  if ('should_produce_file' in assertion) return 'should_produce_file';
  if ('file_content_contains' in assertion) return 'file_content_contains';
  if ('response_contains' in assertion) return 'response_contains';
  if ('judged_by' in assertion) return 'judged_by';
  if ('exec_command' in assertion) return 'exec_command';
  return 'unknown';
}

/**
 * 从 Assertion 提取值
 */
function getAssertionValue(assertion: Assertion): string | Matcher | ToolCallAssertion | FileContentAssertion | JudgedByAssertion | ExecCommandAssertion | { file: string; text: string } | undefined {
  if ('should_call_tool' in assertion) return assertion.should_call_tool as string | ToolCallAssertion;
  if ('should_produce_file' in assertion) return assertion.should_produce_file as string | Matcher;
  if ('file_content_contains' in assertion) return assertion.file_content_contains as FileContentAssertion | { file: string; text: string };
  if ('response_contains' in assertion) return assertion.response_contains as string | Matcher;
  if ('judged_by' in assertion) return assertion.judged_by as JudgedByAssertion;
  if ('exec_command' in assertion) return assertion.exec_command as ExecCommandAssertion;
  return undefined;
}

/**
 * 从 Assertion 提取 min_pass
 * 支持两种格式：
 * 1. min_pass 在 ToolCallAssertion/FileContentAssertion 内部（符合类型定义）
 * 2. min_pass 直接在 Assertion 顶层（实际对象可能包含额外属性）
 */
function getAssertionMinPass(assertion: Assertion, defaultMinPass: number): number {
  // 首先检查顶层 min_pass（支持实际对象包含额外属性的情况）
  if ('min_pass' in assertion) {
    const minPassValue = (assertion as Record<string, unknown>).min_pass;
    if (typeof minPassValue === 'number' && minPassValue !== null) {
      return minPassValue;
    }
  }

  // 检查 ToolCallAssertion 内部的 min_pass
  if ('should_call_tool' in assertion && typeof assertion.should_call_tool === 'object' && assertion.should_call_tool !== null) {
    const toolCall = assertion.should_call_tool as ToolCallAssertion;
    if (toolCall.min_pass !== undefined && toolCall.min_pass !== null) {
      return toolCall.min_pass;
    }
  }

  // 检查 FileContentAssertion 内部的 min_pass
  if ('file_content_contains' in assertion && typeof assertion.file_content_contains === 'object' && assertion.file_content_contains !== null) {
    const fileContent = assertion.file_content_contains as FileContentAssertion;
    if (fileContent.min_pass !== undefined && fileContent.min_pass !== null) {
      return fileContent.min_pass;
    }
  }

  // 检查 ExecCommandAssertion 内部的 min_pass
  if ('exec_command' in assertion && typeof assertion.exec_command === 'object' && assertion.exec_command !== null) {
    const execCommand = assertion.exec_command as ExecCommandAssertion;
    if (execCommand.min_pass !== undefined && execCommand.min_pass !== null) {
      return execCommand.min_pass;
    }
  }

  return defaultMinPass;
}

/**
 * 计算各断言的汇总统计
 */
export function calculateAssertionSummaries(
  runs: RunExecution[],
  assertions: Assertion[],
  defaultMinPass: number
): AssertionSummary[] {
  if (assertions.length === 0) {
    return [];
  }

  const summaries: AssertionSummary[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const type = getAssertionType(assertion);
    const value = getAssertionValue(assertion);
    const minPass = getAssertionMinPass(assertion, defaultMinPass);

    // 统计该断言在各次运行中的通过情况
    let passedRuns = 0;
    const failures: AssertionFailure[] = [];

    for (const run of runs) {
      // 收集所有步骤的断言结果
      const allAssertions = extractAssertionsFromRun(run);
      // 按索引匹配（假设各次运行的断言顺序一致）
      const assertionResult = allAssertions[i];

      if (assertionResult && assertionResult.passed) {
        passedRuns++;
      } else if (assertionResult) {
        failures.push({
          run_index: run.run_index,
          message: assertionResult.message || 'Assertion failed'
        });
      }
    }

    const status = passedRuns >= minPass ? 'passed' : 'failed';

    // value 应该总是存在，因为每个 assertion 至少有一个断言属性
    if (value !== undefined) {
      summaries.push({
        type,
        value,
        min_pass: minPass,
        passed_runs: passedRuns,
        status,
        failures
      });
    }
  }

  return summaries;
}

/**
 * 判定场景最终状态
 * 需要 step summary 通过 且 所有断言 summary 通过
 */
export function determineScenarioStatus(
  stepSummary: StepSummary,
  assertionSummaries: AssertionSummary[]
): 'passed' | 'failed' {
  // 场景整体通过次数必须达标
  if (stepSummary.status === 'failed') {
    return 'failed';
  }

  // 每个断言的通过次数必须达标
  for (const summary of assertionSummaries) {
    if (summary.status === 'failed') {
      return 'failed';
    }
  }

  return 'passed';
}

/**
 * 计算各断言的统计信息（新版，用于 StepResult.assertionStats）
 */
export function calculateAssertionStats(
  runs: RunExecution[],
  assertions: Assertion[],
  minPass: number
): AssertionStat[] {
  if (assertions.length === 0) {
    return [];
  }

  const stats: AssertionStat[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const type = getAssertionType(assertion);
    const value = getAssertionValue(assertion);
    const assertionMinPass = getAssertionMinPass(assertion, minPass);

    // 统计该断言在各次运行中的通过情况
    let passedRuns = 0;

    for (const run of runs) {
      // 收集所有步骤的断言结果
      const allAssertions = extractAssertionsFromRun(run);
      // 按索引匹配（假设各次运行的断言顺序一致）
      const assertionResult = allAssertions[i];

      if (assertionResult && assertionResult.passed) {
        passedRuns++;
      }
    }

    const totalRuns = runs.length;
    const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;
    const status = passedRuns >= assertionMinPass ? 'passed' : 'failed';

    if (value !== undefined) {
      stats.push({
        type,
        value,
        passed_runs: passedRuns,
        total_runs: totalRuns,
        pass_rate: passRate,
        status
      });
    }
  }

  return stats;
}