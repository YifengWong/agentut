import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput, RunExecution, StepSummary } from '../../types/index.js';

interface ToolCallInfo {
  tool: string;
  status: string;
  input: Record<string, unknown>;
  error?: string;
}

function escapeMarkdownTableCell(str: string): string {
  return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function extractTextResponses(outputs: OpenCodeRunOutput[]): string[] {
  return outputs
    .filter(output => output.type === 'text' && output.part?.text)
    .map(output => output.part!.text as string);
}

function extractToolCalls(outputs: OpenCodeRunOutput[]): ToolCallInfo[] {
  return outputs
    .filter(output => output.type === 'tool_use' && output.part?.tool)
    .map(output => ({
      tool: output.part!.tool as string,
      status: output.part?.state?.status || 'unknown',
      input: output.part?.state?.input || {},
      error: output.part?.state?.error
    }));
}

export function formatSessionOutputMarkdown(
  outputs: OpenCodeRunOutput[] | undefined,
  request: string
): string {
  if (!outputs || outputs.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const texts = extractTextResponses(outputs);
  const toolCalls = extractToolCalls(outputs);

  // Request
  lines.push('**Request:**');
  lines.push(`> ${request}`);
  lines.push('');

  // Response
  if (texts.length > 0) {
    lines.push('**Response:**');
    for (const text of texts) {
      lines.push(`> ${text.replace(/\n/g, '\n> ')}`);
    }
    lines.push('');
  }

  // Tool Calls
  if (toolCalls.length > 0) {
    lines.push('**Tool Calls:**');
    lines.push('');
    lines.push('| Tool | Status | Input |');
    lines.push('|------|--------|-------|');
    for (const tc of toolCalls) {
      const statusIcon = tc.status === 'completed' ? '✓' : '✗';
      const inputStr = Object.entries(tc.input)
        .map(([k, v]) => `${k}: \`${escapeMarkdownTableCell(String(v))}\``)
        .join('<br>');
      const errorStr = tc.error ? `<br>**Error:** ${escapeMarkdownTableCell(tc.error)}` : '';
      lines.push(`| ${escapeMarkdownTableCell(tc.tool)} | ${statusIcon} ${tc.status} | ${inputStr}${errorStr} |`);
    }
    lines.push('');
  }

  // Raw Output (collapsible)
  lines.push('<details>');
  lines.push('<summary>Raw Output</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(outputs, null, 2));
  lines.push('```');
  lines.push('</details>');
  lines.push('');

  return lines.join('\n');
}

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

  if (scenario.error) {
    lines.push('');
    lines.push(`**Error:** ${scenario.error}`);
  }

  if (scenario.tempDirectory) {
    lines.push(`**Temp Directory:** ${scenario.tempDirectory}`);
  }

  lines.push('');

  // Multi-run table for probabilistic tests (display before Steps)
  if (scenario.steps.length > 0 && scenario.steps[0].runs && scenario.steps[0].runs.length > 1 && scenario.steps[0].summary) {
    lines.push(formatRunsTableMarkdown(scenario.steps[0].runs, scenario.steps[0].summary));
  }

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

  if (step.assertions.length > 0) {
    lines.push('   - Assertions:');
    for (const assertion of step.assertions) {
      const icon = assertion.passed ? '✓' : '✗';
      lines.push(`     - ${icon} ${assertion.type}: ${assertion.value}`);
      if (!assertion.passed && assertion.message) {
        lines.push(`       - ${assertion.message}`);
      }
    }
  }

  // Session Output
  if (step.actual_output && step.actual_output.length > 0) {
    lines.push('');
    lines.push(formatSessionOutputMarkdown(step.actual_output, step.input));
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format multi-run table for probabilistic tests (Markdown concise mode)
 * Returns empty string if runs.length <= 1 (single run scenario)
 */
function formatRunsTableMarkdown(runs: RunExecution[], summary: StepSummary): string {
  // Single run scenario - no table needed
  if (!runs || runs.length <= 1) {
    return '';
  }

  const lines: string[] = [];

  // Run summary
  const statusIcon = summary.status === 'passed' ? '✅' : '❌';
  lines.push(`**运行统计:** ${summary.total_runs} 次运行, ${summary.passed_runs} 次通过, 要求 ≥ ${summary.min_pass} (${statusIcon} ${summary.status.toUpperCase()})`);
  lines.push('');

  // Run details table
  lines.push('#### 运行详情');
  lines.push('');
  lines.push('| 运行 | 状态 | 耗时 | 断言 |');
  lines.push('|------|------|------|------|');

  for (const run of runs) {
    const icon = run.status === 'passed' ? '✅' : '❌';
    const duration = `${run.duration_ms}ms`;

    // Count passed assertions
    const passedCount = run.assertions.filter(a => a.passed).length;
    const totalCount = run.assertions.length;
    let assertionStr = `${passedCount}/${totalCount}`;

    // Append error if exists
    if (run.error) {
      assertionStr += ` (${run.error})`;
    }

    lines.push(`| ${run.run_index} | ${icon} ${run.status} | ${duration} | ${assertionStr} |`);
  }

  lines.push('');

  return lines.join('\n');
}