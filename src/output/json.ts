import type {
  YamlTestSuite,
  ScenarioResult,
  TestResult
} from '../types/index.js';

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function generateTestResult(
  suite: YamlTestSuite,
  scenarioResults: ScenarioResult[],
  filePath: string
): TestResult {
  const passed = scenarioResults.filter(s => s.status === 'passed').length;
  const failed = scenarioResults.filter(s => s.status === 'failed').length;
  const duration_ms = scenarioResults.reduce((sum, s) => sum + s.duration_ms, 0);

  return {
    suite: {
      name: suite.name,
      description: suite.description || '',
      file: filePath
    },
    summary: {
      total_scenarios: scenarioResults.length,
      passed,
      failed,
      duration_ms,
      timestamp: formatTimestamp()
    },
    scenarios: scenarioResults
  };
}