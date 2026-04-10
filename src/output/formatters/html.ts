import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput, RunExecution, StepSummary, AssertionSummary } from '../../types/index.js';

export function formatAsHtml(result: TestResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Report: ${escapeHtml(result.suite.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #2c3e50; margin-bottom: 10px; }
    h2 { color: #34495e; margin: 20px 0 10px; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
    h3 { color: #2c3e50; margin: 15px 0 10px; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .summary-item { margin: 5px 0; }
    .status-passed { color: #27ae60; font-weight: bold; }
    .status-failed { color: #e74c3c; font-weight: bold; }
    .scenario {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    .scenario-header { display: flex; justify-content: space-between; align-items: center; }
    .scenario-status {
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
    }
    .scenario-status.passed { background: #d4edda; color: #155724; }
    .scenario-status.failed { background: #f8d7da; color: #721c24; }
    .step { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .step-header { font-weight: bold; }
    .assertion { margin: 5px 0 5px 20px; }
    .assertion.passed { color: #27ae60; }
    .assertion.failed { color: #e74c3c; }
    .error { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .meta { color: #666; font-size: 0.9em; }
.step-session { margin: 15px 0; padding: 15px; background: #f9f9f9; border-radius: 4px; }
.session-request, .session-response { margin: 10px 0; }
.session-request blockquote, .session-response blockquote {
  margin: 5px 0; padding: 10px; background: #fff; border-left: 3px solid #3498db;
}
.session-tool-calls table { width: 100%; border-collapse: collapse; margin: 10px 0; }
.session-tool-calls th, .session-tool-calls td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.session-tool-calls td code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
.session-raw { margin-top: 10px; }
.session-raw pre { background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; }
.runs-summary { background: #f0f8ff; padding: 15px; border-radius: 4px; margin: 10px 0; border-left: 4px solid #3498db; }
.runs-summary h4 { margin-bottom: 10px; color: #2c3e50; }
.runs-summary-stats { display: flex; gap: 20px; flex-wrap: wrap; }
.runs-summary-stat { margin: 5px 0; }
.assertion-summary-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
.assertion-summary-table th, .assertion-summary-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
.assertion-summary-table th { background: #f4f4f4; }
.assertion-summary-passed { color: #27ae60; }
.assertion-summary-failed { color: #e74c3c; }
.run-item { margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
.run-item.passed { border-left: 4px solid #27ae60; }
.run-item.failed { border-left: 4px solid #e74c3c; }
.run-header { padding: 10px 15px; background: #f9f9f9; cursor: pointer; font-weight: bold; list-style: none; }
.run-header::-webkit-details-marker { display: none; }
.run-header::before { content: '▶ '; }
details[open] > .run-header::before { content: '▼ '; }
.run-content { padding: 15px; border-top: 1px solid #ddd; }
.run-error { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
.run-details-section { margin-top: 20px; }
.run-details-section h4 { margin-bottom: 10px; color: #2c3e50; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Report: ${escapeHtml(result.suite.name)}</h1>
    ${result.suite.description ? `<p class="meta">${escapeHtml(result.suite.description)}</p>` : ''}

    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-item"><strong>File:</strong> ${escapeHtml(result.suite.file)}</div>
      <div class="summary-item"><strong>Timestamp:</strong> ${escapeHtml(result.summary.timestamp)}</div>
      <div class="summary-item"><strong>Duration:</strong> ${result.summary.duration_ms}ms</div>
      <div class="summary-item">
        <strong>Results:</strong>
        <span class="status-passed">✓ ${result.summary.passed} passed</span>,
        <span class="status-failed">✗ ${result.summary.failed} failed</span>
      </div>
    </div>

    <h2>Scenarios</h2>
    ${result.scenarios.length === 0 ? '<p>No scenarios executed.</p>' : result.scenarios.map(formatScenario).join('\n')}
  </div>
</body>
</html>`;
}

function formatScenario(scenario: ScenarioResult): string {
  return `
    <div class="scenario">
      <div class="scenario-header">
        <h3>${escapeHtml(scenario.name)}</h3>
        <span class="scenario-status ${scenario.status}">${scenario.status.toUpperCase()}</span>
      </div>
      <div class="meta">
        Environment: ${escapeHtml(scenario.environment)} | Duration: ${scenario.duration_ms}ms
      </div>
      ${scenario.error ? `<div class="error"><strong>Error:</strong> ${escapeHtml(scenario.error)}</div>` : ''}
      ${scenario.steps.length > 0 ? `
        <h4>Steps</h4>
        ${scenario.steps.map((step, i) => formatStep(step, i + 1)).join('\n')}
      ` : ''}
    </div>`;
}

function formatStep(step: StepResult, index: number): string {
  return `
    <div class="step">
      <div class="step-header">${index}. Input: "${escapeHtml(step.input)}"</div>
      <div class="meta">Status: ${step.status} | Duration: ${step.duration_ms}ms</div>
      ${step.runs && step.runs.length > 1 && step.summary ? formatRunsDetailHtml(step.runs, step.summary, step.assertionSummaries) : ''}
      ${!step.runs || step.runs.length <= 1 ? (step.actual_output ? formatSessionOutputHtml(step.actual_output, step.input) : '') : ''}
      ${step.assertions.length > 0 ? `
        <div class="assertions">
          ${step.assertions.map(a => {
            const value = typeof a.value === 'string' ? a.value : `${JSON.stringify(a.value)}`;
            return `<div class="assertion ${a.passed ? 'passed' : 'failed'}">
              ${a.passed ? '✓' : '✗'} ${escapeHtml(a.type)}: ${escapeHtml(value)}
              ${!a.passed && a.message ? `<br><small>${escapeHtml(a.message)}</small>` : ''}
            </div>`;
          }).join('\n')}
        </div>
      ` : ''}
    </div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface ToolCallInfo {
  tool: string;
  status: string;
  input: Record<string, unknown>;
  error?: string;
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

export function formatSessionOutputHtml(
  outputs: OpenCodeRunOutput[] | undefined,
  request: string
): string {
  if (!outputs || outputs.length === 0) {
    return '';
  }

  const texts = extractTextResponses(outputs);
  const toolCalls = extractToolCalls(outputs);

  const requestHtml = `
    <div class="session-request">
      <strong>Request:</strong>
      <blockquote>${escapeHtml(request)}</blockquote>
    </div>`;

  const responseHtml = texts.length > 0 ? `
    <div class="session-response">
      <strong>Response:</strong>
      ${texts.map(t => `<blockquote>${escapeHtml(t).replace(/\n/g, '<br>')}</blockquote>`).join('\n')}
    </div>` : '';

  const toolCallsHtml = toolCalls.length > 0 ? `
    <div class="session-tool-calls">
      <strong>Tool Calls:</strong>
      <table>
        <tr><th>Tool</th><th>Status</th><th>Input</th></tr>
        ${toolCalls.map(tc => {
          const statusIcon = tc.status === 'completed' ? '✓' : '✗';
          const inputStr = Object.entries(tc.input)
            .map(([k, v]) => `${k}: <code>${escapeHtml(String(v).replace(/\n/g, ' '))}</code>`)
            .join('<br>');
          const errorStr = tc.error ? `<br><strong>Error:</strong> ${escapeHtml(tc.error)}` : '';
          return `<tr>
            <td>${escapeHtml(tc.tool)}</td>
            <td>${statusIcon} ${escapeHtml(tc.status)}</td>
            <td>${inputStr}${errorStr}</td>
          </tr>`;
        }).join('\n')}
      </table>
    </div>` : '';

  const rawOutputHtml = `
    <details class="session-raw">
      <summary>Raw Output</summary>
      <pre><code>${escapeHtml(JSON.stringify(outputs, null, 2))}</code></pre>
    </details>`;

  return `
    <div class="step-session">
      ${requestHtml}
      ${responseHtml}
      ${toolCallsHtml}
      ${rawOutputHtml}
    </div>`;
}

/**
 * 格式化多运行详情的 HTML
 * 用于概率测试场景，显示每次运行的详细信息和断言统计
 */
export function formatRunsDetailHtml(
  runs: RunExecution[],
  summary: StepSummary,
  assertionSummaries?: AssertionSummary[]
): string {
  // 单次运行或空运行不显示详情
  if (!runs || runs.length <= 1) {
    return '';
  }

  // 运行统计部分
  const statsHtml = `
    <div class="runs-summary">
      <h4>运行统计</h4>
      <div class="runs-summary-stats">
        <div class="runs-summary-stat"><strong>总运行:</strong> ${summary.total_runs} 次运行</div>
        <div class="runs-summary-stat"><strong>通过:</strong> <span class="${summary.passed_runs >= summary.min_pass ? 'status-passed' : 'status-failed'}">${summary.passed_runs} 次通过</span></div>
        <div class="runs-summary-stat">要求 ≥ ${summary.min_pass}</div>
        <div class="runs-summary-stat"><strong>状态:</strong> <span class="${summary.status === 'passed' ? 'status-passed' : 'status-failed'}">${summary.status.toUpperCase()}</span></div>
      </div>
      ${assertionSummaries && assertionSummaries.length > 0 ? formatAssertionSummariesHtml(assertionSummaries) : ''}
    </div>`;

  // 每次运行的详情部分
  const runsDetailsHtml = runs.map(run => {
    const statusClass = run.status === 'passed' ? 'passed' : 'failed';
    const statusIcon = run.status === 'passed' ? '✓' : '✗';

    const errorHtml = run.error ? `
      <div class="run-error">
        <strong>错误:</strong> ${escapeHtml(run.error)}
      </div>` : '';

    const outputHtml = run.output && run.output.length > 0
      ? formatSessionOutputHtml(run.output, `运行 ${run.run_index + 1}`)
      : '';

    const assertionsHtml = run.assertions && run.assertions.length > 0 ? `
      <div class="assertions">
        ${run.assertions.map(a => {
          const value = typeof a.value === 'string' ? a.value : `${JSON.stringify(a.value)}`;
          return `<div class="assertion ${a.passed ? 'passed' : 'failed'}">
            ${a.passed ? '✓' : '✗'} ${escapeHtml(a.type)}: ${escapeHtml(value)}
            ${!a.passed && a.message ? `<br><small>${escapeHtml(a.message)}</small>` : ''}
          </div>`;
        }).join('\n')}
      </div>` : '';

    return `
      <details class="run-item ${statusClass}">
        <summary class="run-header">
          ${statusIcon} 运行 ${run.run_index + 1} - ${run.status.toUpperCase()} (${run.duration_ms}ms)
        </summary>
        <div class="run-content">
          ${errorHtml}
          ${outputHtml}
          ${assertionsHtml}
        </div>
      </details>`;
  }).join('\n');

  return `
    ${statsHtml}
    <div class="run-details-section">
      <h4>运行详情</h4>
      ${runsDetailsHtml}
    </div>`;
}

/**
 * 格式化断言统计表格
 */
function formatAssertionSummariesHtml(assertionSummaries: AssertionSummary[]): string {
  return `
    <div class="assertion-summaries">
      <h4>断言统计</h4>
      <table class="assertion-summary-table">
        <tr>
          <th>断言类型</th>
          <th>断言值</th>
          <th>通过次数</th>
          <th>要求</th>
          <th>状态</th>
        </tr>
        ${assertionSummaries.map(as => {
          const value = typeof as.value === 'string' ? as.value : `${JSON.stringify(as.value)}`;
          const totalRuns = as.passed_runs + as.failures.length;
          const statusClass = as.status === 'passed' ? 'assertion-summary-passed' : 'assertion-summary-failed';
          const statusIcon = as.status === 'passed' ? '✓' : '✗';
          return `<tr>
            <td>${escapeHtml(as.type)}</td>
            <td><code>${escapeHtml(value)}</code></td>
            <td>${as.passed_runs}/${totalRuns}</td>
            <td>≥ ${as.min_pass}</td>
            <td class="${statusClass}">${statusIcon} ${as.status.toUpperCase()}</td>
          </tr>`;
        }).join('\n')}
      </table>
    </div>`;
}