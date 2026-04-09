import type {
  StepSummary,
  AssertionSummary,
  AssertionFailure,
  Assertion,
  AssertionResult
} from '../types/index.js';

/**
 * 用于统计的运行执行结果（简化版）
 */
export interface RunExecutionWithAssertions {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  error?: string;
}

/**
 * 计算步骤汇总信息
 */
export function calculateStepSummary(
  runs: RunExecutionWithAssertions[],
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
  return 'unknown';
}

/**
 * 从 Assertion 提取值
 */
function getAssertionValue(assertion: Assertion): string | undefined {
  if ('should_call_tool' in assertion) return assertion.should_call_tool as string;
  if ('should_produce_file' in assertion) return assertion.should_produce_file as string;
  if ('file_content_contains' in assertion) return assertion.file_content_contains as { file: string; text: string };
  if ('response_contains' in assertion) return assertion.response_contains as string;
  return undefined;
}

/**
 * 从 Assertion 提取 min_pass
 */
function getAssertionMinPass(assertion: Assertion, defaultMinPass: number): number {
  if ('min_pass' in assertion && assertion.min_pass !== undefined) {
    return assertion.min_pass;
  }
  return defaultMinPass;
}

/**
 * 计算各断言的汇总统计
 */
export function calculateAssertionSummaries(
  runs: RunExecutionWithAssertions[],
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
      // 找到对应的断言结果（按索引匹配）
      const assertionResult = run.assertions[i];

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

    summaries.push({
      type,
      value,
      min_pass: minPass,
      passed_runs: passedRuns,
      status,
      failures
    });
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