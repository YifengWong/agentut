import fs from 'fs-extra';
import * as path from 'path';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { createRunner } from '../runner/factory.js';
import { prepareEnvironment, cleanupEnvironment } from '../executor/fixture.js';
import { verifyAssertions } from '../executor/verifier.js';
import { generateTestResult } from '../output/json.js';
import { logger } from '../output/logger.js';
import {
  calculateStepSummary,
  calculateAssertionSummaries,
  determineScenarioStatus,
  type RunExecutionWithAssertions
} from '../executor/statistics.js';
import {
  type YamlTestSuite,
  type TestResult,
  type ScenarioResult,
  type StepResult,
  type RunExecution,
  ExecutionError
} from '../types/index.js';

export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  parallel?: boolean;
  model?: string;
  agent?: string;
  // 概率测试选项
  runs?: number;
  min_pass?: number;
  quick?: boolean;
}

export async function runTests(
  testPath: string,
  options: RunOptions = {}
): Promise<TestResult> {
  // Check if path exists
  if (!await fs.pathExists(testPath)) {
    throw new ExecutionError(`Test file not found: ${testPath}`, testPath);
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
      throw new ExecutionError(`Scenario not found: ${options.scenario}`, testPath);
    }
  }

  // Log suite start
  logger.startSuite(suite.name, scenarios.length);

  // Execute scenarios
  const scenarioResults: ScenarioResult[] = [];
  const tempRoot = path.resolve(yamlDirectory, '.agentvcr', 'temp');
  const suiteStartTime = Date.now();

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    const result = await executeScenario(suite, scenario, yamlDirectory, tempRoot, {
      model: options.model,
      agent: options.agent,
      current: i + 1,
      total: scenarios.length,
      // 概率测试选项
      runs: options.runs,
      min_pass: options.min_pass,
      quick: options.quick
    });
    scenarioResults.push(result);
    logger.endScenario(scenario.name, result.status === 'passed', result.duration_ms);
  }

  // Calculate totals
  const passedCount = scenarioResults.filter(r => r.status === 'passed').length;
  const failedCount = scenarioResults.filter(r => r.status === 'failed').length;
  const totalDuration = Date.now() - suiteStartTime;

  // Log summary
  logger.summary(passedCount, failedCount, totalDuration);

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
  options?: {
    model?: string;
    agent?: string;
    current?: number;
    total?: number;
    runs?: number;
    min_pass?: number;
    quick?: boolean;
  }
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const current = options?.current ?? 1;
  const total = options?.total ?? 1;

  // Log scenario start
  logger.startScenario(scenario.name, current, total);

  // Get model from options or config (backwards compatibility)
  const model = options?.model || suite.config?.target?.model;

  // Get environment config for agent derivation
  const envConfig = suite.environments[scenario.environment];

  // Get agent name with priority:
  // 1. CLI options --agent
  // 2. Environment config agent field
  // 3. Derive from setup.copy targeting .opencode/agents
  // 4. Config target.agent (deprecated)
  let agent = options?.agent;

  if (!agent && envConfig.agent) {
    agent = envConfig.agent;
  }

  if (!agent) {
    const agentCopy = envConfig.setup.find(a =>
      a.copy && a.copy.includes('->') &&
      a.copy.split('->')[1].trim().includes('.opencode/agents')
    );
    if (agentCopy) {
      const source = agentCopy.copy!.split('->')[0].trim();
      agent = path.basename(source, '.md');
    }
  }

  if (!agent && suite.config?.target?.agent) {
    agent = suite.config.target.agent;
  }

  // Create runner from suite config
  const runner = createRunner(suite.config!.agent_cli!);

  // 计算有效的 runs 和 min_pass 值
  // 优先级：CLI > scenario > global > default
  let effectiveRuns = 1;
  let effectiveMinPass = 1;
  // 是否为传统的单次运行模式（没有任何多运行配置）
  let isTraditionalSingleRun = true;

  // quick 模式：强制单次运行
  if (options?.quick) {
    effectiveRuns = 1;
    effectiveMinPass = 1;
    isTraditionalSingleRun = false; // quick 是显式指定的
  } else {
    // CLI 优先级最高
    if (options?.runs !== undefined) {
      effectiveRuns = options.runs;
      effectiveMinPass = options?.min_pass ?? options.runs; // 如果没有 min_pass，默认全部通过
      isTraditionalSingleRun = false; // CLI 显式指定
    } else if (scenario.runs !== undefined) {
      // scenario 级别配置
      effectiveRuns = scenario.runs;
      effectiveMinPass = scenario?.min_pass ?? scenario.runs;
      isTraditionalSingleRun = false; // scenario 显式指定
    } else if (suite.config?.runs !== undefined) {
      // global 级别配置
      effectiveRuns = suite.config.runs;
      effectiveMinPass = suite.config?.min_pass ?? suite.config.runs;
      isTraditionalSingleRun = false; // global 显式指定
    }
    // 默认值：单次运行，isTraditionalSingleRun = true
  }

  // 收集所有运行的执行结果
  const allRunExecutions: RunExecutionWithAssertions[] = [];
  const stepResults: StepResult[] = [];
  let lastError: string | undefined;
  let preservedTempDirectory: string | undefined; // 用于保存不清理的临时目录

  // 多次运行循环
  for (let runIndex = 0; runIndex < effectiveRuns; runIndex++) {
    let sessionId: string | undefined;
    let tempDirectory: string | undefined;
    let runError: string | undefined;

    try {
      // 为每次运行准备独立环境
      // 传统单次运行模式使用原始 scenario name，多运行模式使用 `${scenario.name}-run${runIndex}`
      const scenarioNameForRun = isTraditionalSingleRun ? scenario.name : `${scenario.name}-run${runIndex}`;
      const envResult = await prepareEnvironment(envConfig, scenarioNameForRun, tempRoot, {
        yamlDirectory
      });
      tempDirectory = envResult.tempDirectory;

      // Execute steps
      const totalSteps = scenario.steps.length;
      const runAssertions: RunExecution['assertions'] = [];
      const runStepResults: StepResult[] = [];

      for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
        const step = scenario.steps[stepIndex];
        const stepStartTime = Date.now();
        const stepNumber = stepIndex + 1;

        // Log step start (只在第一次运行时显示详细日志，避免重复)
        if (runIndex === 0) {
          logger.startStep(scenario.name, step.input, stepNumber, totalSteps);
          // 传统单次运行模式使用原始消息，多运行模式显示运行进度
          const progressMsg = isTraditionalSingleRun ? 'executing...' : `executing run ${runIndex + 1}/${effectiveRuns}...`;
          logger.showProgress(scenario.name, progressMsg);
        }

        try {
          // Run agent
          const runResult = runner.run({
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
          const assertionResults = await verifyAssertions(step.expected, runResult.outputs, tempDirectory);

          const stepPassed = assertionResults.every(a => a.passed);
          const stepDuration = Date.now() - stepStartTime;

          const stepResult: StepResult = {
            input: step.input,
            status: stepPassed ? 'passed' : 'failed',
            duration_ms: stepDuration,
            assertions: assertionResults,
            actual_output: runResult.outputs
          };

          runStepResults.push(stepResult);
          runAssertions.push(...assertionResults);

          // Log step end (只在第一次运行时)
          if (runIndex === 0) {
            logger.endStep(scenario.name, stepPassed, stepNumber, totalSteps, stepDuration);
          }
        } catch (err) {
          const stepDuration = Date.now() - stepStartTime;
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';

          const stepResult: StepResult = {
            input: step.input,
            status: 'failed',
            duration_ms: stepDuration,
            assertions: [],
            actual_output: undefined
          };

          if (err instanceof Error) {
            stepResult.assertions = [{
              type: 'error',
              value: err.message,
              passed: false,
              message: err.message
            }];
            runAssertions.push(stepResult.assertions[0]);
          }

          runStepResults.push(stepResult);
          runError = errorMessage;

          if (runIndex === 0) {
            logger.error(scenario.name, errorMessage);
            logger.endStep(scenario.name, false, stepNumber, totalSteps, stepDuration);
          }
        }
      }

      // 收集单次运行结果
      const allStepsPassed = runStepResults.every(s => s.status === 'passed');
      const runExecution: RunExecutionWithAssertions = {
        run_index: runIndex,
        status: allStepsPassed && !runError ? 'passed' : 'failed',
        duration_ms: Date.now() - startTime,
        assertions: runAssertions,
        error: runError
      };
      allRunExecutions.push(runExecution);

      // 在第一次运行时收集 step results（用于展示）
      if (runIndex === 0) {
        stepResults.push(...runStepResults);
      }

      // Cleanup for this run
      if (tempDirectory) {
        // 传统单次运行模式使用原始 scenario name，多运行模式使用 `${scenario.name}-run${runIndex}`
        const scenarioNameForRun = isTraditionalSingleRun ? scenario.name : `${scenario.name}-run${runIndex}`;
        await cleanupEnvironment(tempDirectory, scenario.cleanup, scenarioNameForRun);
        // 如果 cleanup 为 false，保存第一次运行的临时目录用于返回
        if (!scenario.cleanup && runIndex === 0) {
          preservedTempDirectory = tempDirectory;
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        runError = err.message;
        lastError = runError;
      }

      // 记录失败的运行
      allRunExecutions.push({
        run_index: runIndex,
        status: 'failed',
        duration_ms: 0,
        assertions: [],
        error: runError
      });
    }
  }

  // 计算汇总信息
  let finalStatus: 'passed' | 'failed';

  if (effectiveRuns === 1) {
    // 单次运行：传统判定逻辑
    const allStepsPassed = stepResults.every(s => s.status === 'passed');
    finalStatus = allStepsPassed && !lastError ? 'passed' : 'failed';
  } else {
    // 多次运行：使用统计模块判定
    // 注意：对于多步场景，我们需要合并所有步骤的断言
    const allAssertions = scenario.steps.flatMap(step => step.expected);
    const stepSummary = calculateStepSummary(allRunExecutions, effectiveMinPass);
    const assertionSummaries = calculateAssertionSummaries(allRunExecutions, allAssertions, effectiveMinPass);
    finalStatus = determineScenarioStatus(stepSummary, assertionSummaries);

    // 添加 runs 信息到第一个 step result
    if (stepResults.length > 0) {
      stepResults[0].runs = allRunExecutions.map(r => ({
        run_index: r.run_index,
        status: r.status,
        duration_ms: r.duration_ms,
        assertions: r.assertions,
        error: r.error
      }));
      stepResults[0].summary = stepSummary;
      stepResults[0].assertionSummaries = assertionSummaries;
    }
  }

  const passedRuns = allRunExecutions.filter(r => r.status === 'passed').length;

  return {
    name: scenario.name,
    environment: scenario.environment,
    status: finalStatus,
    duration_ms: Date.now() - startTime,
    steps: stepResults,
    error: lastError,
    tempDirectory: scenario.cleanup ? undefined : preservedTempDirectory,
    // 概率测试扩展字段：只有在显式配置多运行时才返回这些字段
    runs: !isTraditionalSingleRun ? effectiveRuns : undefined,
    min_pass: !isTraditionalSingleRun ? effectiveMinPass : undefined,
    passed_runs: !isTraditionalSingleRun ? passedRuns : undefined
  };
}