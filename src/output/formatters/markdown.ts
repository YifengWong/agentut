import type { TestResult, ScenarioResult, StepResult } from '../../types/index.js';

export function formatAsMarkdown(result: TestResult): string {
  const lines: string[] = [];

  // Title
  lines.push(`# Test Report: ${result.suite.name}`);
  lines.push('');

  // Description
  if (result.suite.description) {
    lines.push(result.suite.description);
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **File:** ${result.suite.file}`);
  lines.push(`- **Timestamp:** ${result.summary.timestamp}`);
  lines.push(`- **Duration:** ${result.summary.duration_ms}ms`);
  lines.push(`- **Results:** ✓ ${result.summary.passed} passed, ✗ ${result.summary.failed} failed`);
  lines.push('');

  // Scenarios
  lines.push('## Scenarios');
  lines.push('');

  if (result.scenarios.length === 0) {
    lines.push('No scenarios executed.');
    lines.push('');
  } else {
    for (const scenario of result.scenarios) {
      lines.push(formatScenario(scenario));
    }
  }

  return lines.join('\n');
}

function formatScenario(scenario: ScenarioResult): string {
  const lines: string[] = [];

  const statusIcon = scenario.status === 'passed' ? '✅' : '❌';
  const statusText = scenario.status.toUpperCase();

  lines.push(`### ${scenario.name}`);
  lines.push('');
  lines.push(`**Status:** ${statusIcon} ${statusText}`);
  lines.push(`**Environment:** ${scenario.environment}`);
  lines.push(`**Duration:** ${scenario.duration_ms}ms`);

  // 多运行时显示汇总统计
  if (scenario.runs !== undefined) {
    lines.push(`**Runs:** ${scenario.passed_runs}/${scenario.runs} passed (min_pass: ${scenario.min_pass})`);
  }

  if (scenario.error) {
    lines.push('');
    lines.push(`**Error:** ${scenario.error}`);
  }

  lines.push('');

  // Steps
  if (scenario.steps.length > 0) {
    lines.push('#### Steps');
    lines.push('');

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      lines.push(formatStep(step, i + 1));
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function formatStep(step: StepResult, index: number): string {
  const lines: string[] = [];

  const statusIcon = step.status === 'passed' ? '✓' : '✗';

  lines.push(`${index}. **Input:** "${step.input}"`);
  lines.push(`   - Status: ${statusIcon} ${step.status}`);
  lines.push(`   - Duration: ${step.duration_ms}ms`);
  // 移除详细断言列表
  // 移除 session output
  lines.push('');

  return lines.join('\n');
}