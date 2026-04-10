import type { TestResult, ScenarioResult, AssertionSummary } from '../../types/index.js';

interface JestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed';
  title: string;
  duration?: number;
  failureMessages: string[];
}

interface JestTestResult {
  assertionResults: JestAssertionResult[];
  startTime: number;
  endTime: number;
  status: 'passed' | 'failed';
  name: string;
  duration: number;
  failureMessages: string[];
}

interface JestResults {
  success: boolean;
  startTime: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
}

export function formatAsJest(result: TestResult): JestResults {
  const startTime = Date.now();

  const testResults = result.scenarios.map(scenario => formatScenarioAsJest(scenario));

  return {
    success: result.summary.failed === 0,
    startTime,
    numTotalTests: result.summary.total_scenarios,
    numPassedTests: result.summary.passed,
    numFailedTests: result.summary.failed,
    numPendingTests: 0,
    testResults
  };
}

function formatScenarioAsJest(scenario: ScenarioResult): JestTestResult {
  const startTime = Date.now() - scenario.duration_ms;
  const failureMessages: string[] = [];
  const assertionResults: JestAssertionResult[] = [];

  // Handle scenario-level error
  if (scenario.error) {
    failureMessages.push(scenario.error);
  }

  // Check for probabilistic test with assertionSummaries
  const firstStep = scenario.steps[0];
  if (firstStep?.assertionSummaries && firstStep.assertionSummaries.length > 0) {
    // Probabilistic test: generate assertion-level results from assertionSummaries
    for (const summary of firstStep.assertionSummaries) {
      const assertionResult = formatAssertionSummaryAsJest(scenario.name, summary);
      assertionResults.push(assertionResult);

      // Aggregate failure messages at scenario level
      if (summary.status === 'failed') {
        failureMessages.push(...assertionResult.failureMessages);
      }
    }
  } else {
    // Traditional single-run test: generate assertion-level results from step.assertions
    for (const step of scenario.steps) {
      for (const assertion of step.assertions) {
        const assertionResult = formatAssertionResultAsJest(scenario.name, assertion);
        assertionResults.push(assertionResult);

        // Aggregate failure messages at scenario level
        if (!assertion.passed && assertion.message) {
          failureMessages.push(assertion.message);
        }
      }
    }
  }

  // Handle empty assertions: add a default result for the scenario
  if (assertionResults.length === 0) {
    assertionResults.push({
      ancestorTitles: [scenario.name],
      fullName: scenario.name,
      status: scenario.status,
      title: scenario.name,
      duration: scenario.duration_ms,
      failureMessages: []
    });
  }

  return {
    assertionResults,
    startTime,
    endTime: startTime + scenario.duration_ms,
    status: scenario.status,
    name: scenario.name,
    duration: scenario.duration_ms,
    failureMessages
  };
}

/**
 * Format an assertion summary (from probabilistic test) as a Jest assertion result
 */
function formatAssertionSummaryAsJest(scenarioName: string, summary: AssertionSummary): JestAssertionResult {
  const title = formatAssertionTitle(summary.type, summary.value);
  const fullName = `${scenarioName} - ${title}`;
  const failureMessages: string[] = [];

  if (summary.status === 'failed') {
    // Add summary message: "X/Y passed, required ≥ Z"
    const passedRuns = summary.passed_runs;
    const totalRuns = summary.failures.length + passedRuns;
    failureMessages.push(`${passedRuns}/${totalRuns} passed, required >= ${summary.min_pass}`);

    // Add individual run failures
    for (const failure of summary.failures) {
      failureMessages.push(`- Run ${failure.run_index}: ${failure.message}`);
    }
  }

  return {
    ancestorTitles: [scenarioName],
    fullName,
    status: summary.status,
    title,
    failureMessages
  };
}

/**
 * Format a single assertion result (from traditional test) as a Jest assertion result
 */
function formatAssertionResultAsJest(
  scenarioName: string,
  assertion: { type: string; value: unknown; passed: boolean; message?: string }
): JestAssertionResult {
  const title = formatAssertionTitle(assertion.type, assertion.value);
  const fullName = `${scenarioName} - ${title}`;
  const failureMessages: string[] = [];

  if (!assertion.passed && assertion.message) {
    failureMessages.push(assertion.message);
  }

  return {
    ancestorTitles: [scenarioName],
    fullName,
    status: assertion.passed ? 'passed' : 'failed',
    title,
    failureMessages
  };
}

/**
 * Format assertion type and value into a readable title
 */
function formatAssertionTitle(type: string, value: unknown): string {
  if (typeof value === 'string') {
    return `${type}: ${value}`;
  }
  if (typeof value === 'object' && value !== null) {
    // Handle ToolCallAssertion, FileContentAssertion, Matcher objects
    const v = value as Record<string, unknown>;
    if (v.name) {
      // ToolCallAssertion: { name: string, ... }
      return `${type}: ${v.name}`;
    }
    if (v.file && v.text) {
      // FileContentAssertion or file_content_contains
      return `${type}: ${v.file}`;
    }
    if (v.equals) {
      return `${type}: ${v.equals}`;
    }
    if (v.contains) {
      return `${type}: contains "${v.contains}"`;
    }
    if (v.regex) {
      return `${type}: ${v.regex}`;
    }
    if (v.oneOf) {
      return `${type}: one of [${(v.oneOf as string[]).join(', ')}]`;
    }
  }
  return type;
}