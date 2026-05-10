import type { TestResult, ScenarioResult } from '../../types/index.js';

interface JestTestResult {
  assertionResults: Array<{
    ancestorTitles: string[];
    fullName: string;
    status: 'passed' | 'failed';
    title: string;
    duration?: number;
    failureMessages: string[];
  }>;
  startTime: number;
  endTime: number;
  status: 'passed' | 'failed';
  name: string;
  duration: number;
  failureMessages: string[];
  score?: number;
  scoreReason?: string;
}

interface JestResults {
  success: boolean;
  startTime: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
  total_score?: number;
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
    testResults,
    total_score: result.total_score,
  };
}

function formatScenarioAsJest(scenario: ScenarioResult): JestTestResult {
  const startTime = Date.now() - scenario.duration_ms;
  const failureMessages: string[] = [];

  if (scenario.error) {
    failureMessages.push(scenario.error);
  }

  // Collect failure messages from failed assertions
  for (const step of scenario.steps) {
    for (const assertion of step.assertions) {
      if (!assertion.passed && assertion.message) {
        failureMessages.push(`${assertion.type}: ${assertion.message}`);
      }
    }
  }

  return {
    assertionResults: [{
      ancestorTitles: [],
      fullName: scenario.name,
      status: scenario.status,
      title: scenario.name,
      duration: scenario.duration_ms,
      failureMessages
    }],
    startTime,
    endTime: startTime + scenario.duration_ms,
    status: scenario.status,
    name: scenario.name,
    duration: scenario.duration_ms,
    failureMessages,
    score: scenario.score?.score,
    scoreReason: scenario.score?.reason,
  };
}