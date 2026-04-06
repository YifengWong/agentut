import fs from 'fs-extra';
import * as path from 'path';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { runOpenCode } from '../executor/opencode.js';
import { prepareEnvironment, cleanupEnvironment } from '../executor/fixture.js';
import { verifyAssertions } from '../executor/verifier.js';
import { generateTestResult } from '../output/json.js';
import { logger } from '../output/logger.js';
import {
  type YamlTestSuite,
  type TestResult,
  type ScenarioResult,
  type StepResult,
  ExecutionError
} from '../types/index.js';

export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  verbose?: boolean;
  parallel?: boolean;
  model?: string;
  agent?: string;
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
      verbose: options.verbose,
      model: options.model,
      agent: options.agent,
      current: i + 1,
      total: scenarios.length
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
  options?: { verbose?: boolean; model?: string; agent?: string; current?: number; total?: number }
): Promise<ScenarioResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  let sessionId: string | undefined;
  let tempDirectory: string | undefined;
  let error: string | undefined;

  // Get current/total for logging (defaults to 1/1)
  const current = options?.current ?? 1;
  const total = options?.total ?? 1;

  // Log scenario start
  logger.startScenario(scenario.name, current, total);

  // Get model from options or config (backwards compatibility)
  const model = options?.model || suite.config?.target?.model;

  // Get environment config for agent derivation
  const envConfig = suite.environments[scenario.environment];

  // Get agent name with new priority:
  // 1. CLI options --agent
  // 2. Environment config agent field
  // 3. Derive from setup.copy targeting .opencode/agents
  // 4. Config target.agent (deprecated)
  let agent = options?.agent;

  if (!agent && envConfig.agent) {
    // Priority 2: explicit agent in environment config
    agent = envConfig.agent;
  }

  if (!agent) {
    // Priority 3: derive from setup.copy targeting .opencode/agents
    const agentCopy = envConfig.setup.find(a =>
      a.copy && a.copy.includes('->') &&
      a.copy.split('->')[1].trim().includes('.opencode/agents')
    );
    if (agentCopy) {
      const source = agentCopy.copy!.split('->')[0].trim();
      agent = path.basename(source, '.md');
    }
  }

  // Priority 4: backwards compatibility with config.target (deprecated)
  if (!agent && suite.config?.target?.agent) {
    agent = suite.config.target.agent;
  }

  try {
    // Prepare environment
    const envResult = await prepareEnvironment(envConfig, scenario.name, tempRoot, {
      yamlDirectory
      // skill 参数已移除
    });
    tempDirectory = envResult.tempDirectory;

    // Execute steps
    const totalSteps = scenario.steps.length;
    for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
      const step = scenario.steps[stepIndex];
      const stepStartTime = Date.now();
      const stepNumber = stepIndex + 1;

      // Log step start
      logger.startStep(scenario.name, step.input, stepNumber, totalSteps);
      logger.showProgress(scenario.name, 'executing...');

      try {
        // Run opencode
        const runResult = runOpenCode({
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
          actual_output: options?.verbose ? runResult.outputs : undefined
        };

        stepResults.push(stepResult);

        // Log step end
        logger.endStep(scenario.name, stepPassed, stepNumber, totalSteps, stepDuration);
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
        }

        stepResults.push(stepResult);

        // Log error and step end
        logger.error(scenario.name, errorMessage);
        logger.endStep(scenario.name, false, stepNumber, totalSteps, stepDuration);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      error = err.message;
    }
  }

  // Cleanup
  if (tempDirectory) {
    await cleanupEnvironment(tempDirectory, scenario.cleanup, scenario.name);
  }

  const allStepsPassed = stepResults.every(s => s.status === 'passed');

  return {
    name: scenario.name,
    environment: scenario.environment,
    status: allStepsPassed && !error ? 'passed' : 'failed',
    duration_ms: Date.now() - startTime,
    steps: stepResults,
    error,
    tempDirectory: scenario.cleanup ? undefined : tempDirectory
  };
}