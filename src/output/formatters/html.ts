import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput, AssertionStat, RunExecution, RunStepDetail } from '../../types/index.js';

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
    h4 { color: #2c3e50; margin: 10px 0 8px; font-size: 1.1em; }
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
    .scenario-runs-info {
      color: #666;
      font-size: 0.9em;
      margin-top: 5px;
    }
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

    /* Assertion Stats Table */
    .assertion-stats-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 0.9em;
    }
    .assertion-stats-table th, .assertion-stats-table td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    .assertion-stats-table th {
      background: #f0f0f0;
      font-weight: bold;
    }
    .pass-rate {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: bold;
    }
    .pass-rate.high { background: #d4edda; color: #155724; }
    .pass-rate.medium { background: #fff3cd; color: #856404; }
    .pass-rate.low { background: #f8d7da; color: #721c24; }

    /* Run Details Section */
    .run-details-section {
      margin-top: 20px;
      border-top: 1px solid #eee;
      padding-top: 15px;
    }
    .run-details-header {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      background: #f0f0f0;
      border-radius: 4px;
      user-select: none;
    }
    .run-details-header:hover {
      background: #e8e8e8;
    }
    .run-details-header .toggle-icon {
      font-size: 1.2em;
      transition: transform 0.2s;
    }
    .run-details-content {
      display: none;
      padding: 15px;
      border: 1px solid #eee;
      border-radius: 4px;
      margin-top: 10px;
    }
    .run-details-content.expanded {
      display: block;
    }

    /* Tab Buttons */
    .tab-buttons {
      display: flex;
      gap: 5px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 8px 16px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #f8f8f8;
      cursor: pointer;
      font-size: 0.9em;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      background: #e8e8e8;
    }
    .tab-btn.active {
      background: #3498db;
      color: white;
      border-color: #3498db;
    }
    .tab-btn.failed {
      border-color: #e74c3c;
    }
    .tab-btn.failed.active {
      background: #e74c3c;
      border-color: #e74c3c;
    }

    /* Tab Content */
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }

    /* Run Step Block */
    .run-step-block {
      margin: 10px 0;
      padding: 10px;
      background: #f9f9f9;
      border-radius: 4px;
      border-left: 3px solid #3498db;
    }
    .run-step-block.failed {
      border-left-color: #e74c3c;
    }
    .run-step-header {
      font-weight: bold;
      margin-bottom: 8px;
    }
    .run-step-assertions {
      margin: 8px 0;
    }
    .run-step-assertions .assertion {
      margin: 3px 0 3px 15px;
    }

    /* Run Status Badge */
    .run-status-badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: bold;
      display: inline-block;
    }
    .run-status-badge.passed { background: #d4edda; color: #155724; }
    .run-status-badge.failed { background: #f8d7da; color: #721c24; }

    /* Run Info */
    .run-info {
      margin: 10px 0;
      padding: 10px;
      background: #fff;
      border-radius: 4px;
      border: 1px solid #eee;
    }
    .run-info-label {
      font-weight: bold;
      margin-right: 8px;
    }
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
        <span class="status-passed">${result.summary.passed} passed</span>,
        <span class="status-failed">${result.summary.failed} failed</span>
      </div>
    </div>

    <h2>Scenarios</h2>
    ${result.scenarios.length === 0 ? '<p>No scenarios executed.</p>' : result.scenarios.map(formatScenario).join('\n')}
  </div>

  <script>
    function toggleRunDetails(scenarioId) {
      const content = document.getElementById('run-details-content-' + scenarioId);
      const icon = document.getElementById('toggle-icon-' + scenarioId);
      if (content && icon) {
        const isExpanded = content.classList.contains('expanded');
        if (isExpanded) {
          content.classList.remove('expanded');
          icon.textContent = '+';
        } else {
          content.classList.add('expanded');
          icon.textContent = '-';
        }
      }
    }

    function switchTab(scenarioId, runIndex) {
      // Deactivate all tabs
      const buttons = document.querySelectorAll('#tab-buttons-' + scenarioId + ' .tab-btn');
      const contents = document.querySelectorAll('.tab-content-' + scenarioId);
      buttons.forEach(btn => btn.classList.remove('active'));
      contents.forEach(content => content.classList.remove('active'));

      // Activate selected tab
      const selectedBtn = document.getElementById('tab-btn-' + scenarioId + '-' + runIndex);
      const selectedContent = document.getElementById('tab-content-' + scenarioId + '-' + runIndex);
      if (selectedBtn) selectedBtn.classList.add('active');
      if (selectedContent) selectedContent.classList.add('active');
    }
  </script>
</body>
</html>`;
}

function formatScenario(scenario: ScenarioResult): string {
  const scenarioId = generateScenarioId(scenario.name);
  const hasRunDetails = scenario.runDetails && scenario.runDetails.length > 1;
  const runsInfo = scenario.runs && scenario.passed_runs
    ? `${scenario.passed_runs}/${scenario.runs} runs passed`
    : '';

  return `
    <div class="scenario">
      <div class="scenario-header">
        <h3>${escapeHtml(scenario.name)}</h3>
        <span class="scenario-status ${scenario.status}">${scenario.status.toUpperCase()}</span>
      </div>
      <div class="meta">
        Environment: ${escapeHtml(scenario.environment)} | Duration: ${scenario.duration_ms}ms
      </div>
      ${runsInfo ? `<div class="scenario-runs-info">${runsInfo}</div>` : ''}
      ${scenario.error ? `<div class="error"><strong>Error:</strong> ${escapeHtml(scenario.error)}</div>` : ''}
      ${scenario.steps.length > 0 ? `
        <h4>Steps</h4>
        ${scenario.steps.map((step, i) => formatStep(step, i + 1)).join('\n')}
      ` : ''}
      ${hasRunDetails ? formatRunDetails(scenario, scenarioId) : ''}
    </div>`;
}

function generateScenarioId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function formatStep(step: StepResult, index: number): string {
  return `
    <div class="step">
      <div class="step-header">${index}. Input: "${escapeHtml(step.input)}"</div>
      <div class="meta">Status: ${step.status} | Duration: ${step.duration_ms}ms</div>
      ${step.actual_output ? formatSessionOutputHtml(step.actual_output, step.input) : ''}
      ${step.assertions.length > 0 ? `
        <div class="assertions">
          ${step.assertions.map(a => {
            const value = typeof a.value === 'string' ? a.value : `${JSON.stringify(a.value)}`;
            return `<div class="assertion ${a.passed ? 'passed' : 'failed'}">
              ${a.passed ? '' : ''} ${escapeHtml(a.type)}: ${escapeHtml(value)}
              ${!a.passed && a.message ? `<br><small>${escapeHtml(a.message)}</small>` : ''}
            </div>`;
          }).join('\n')}
        </div>
      ` : ''}
      ${step.assertionStats && step.assertionStats.length > 0 ? formatAssertionStatsTable(step.assertionStats) : ''}
    </div>`;
}

function formatAssertionStatsTable(assertionStats: AssertionStat[]): string {
  return `
    <table class="assertion-stats-table">
      <tr>
        <th>Assertion Type</th>
        <th>Value</th>
        <th>Passed Runs</th>
        <th>Pass Rate</th>
        <th>Status</th>
      </tr>
      ${assertionStats.map(stat => {
        const value = typeof stat.value === 'string' ? stat.value : JSON.stringify(stat.value);
        const rateClass = getPassRateClass(stat.pass_rate);
        return `<tr>
          <td>${escapeHtml(stat.type)}</td>
          <td>${escapeHtml(value)}</td>
          <td>${stat.passed_runs}/${stat.total_runs}</td>
          <td><span class="pass-rate ${rateClass}">${stat.pass_rate}%</span></td>
          <td>${stat.status.toUpperCase()}</td>
        </tr>`;
      }).join('\n')}
    </table>`;
}

function getPassRateClass(passRate: number): string {
  if (passRate >= 80) return 'high';
  if (passRate >= 50) return 'medium';
  return 'low';
}

function formatRunDetails(scenario: ScenarioResult, scenarioId: string): string {
  const runDetails = scenario.runDetails!;
  return `
    <div class="run-details-section">
      <div class="run-details-header" onclick="toggleRunDetails('${scenarioId}')">
        <span id="toggle-icon-${scenarioId}" class="toggle-icon">+</span>
        <strong>Run Details</strong>
        <span class="meta">(${runDetails.length} runs)</span>
      </div>
      <div id="run-details-content-${scenarioId}" class="run-details-content">
        <div id="tab-buttons-${scenarioId}" class="tab-buttons">
          ${runDetails.map((run, index) => {
            const btnClass = run.status === 'failed' ? 'tab-btn failed' : 'tab-btn';
            const activeClass = index === 0 ? ' active' : '';
            return `<button id="tab-btn-${scenarioId}-${run.run_index}" class="${btnClass}${activeClass}" onclick="switchTab('${scenarioId}', ${run.run_index})">Run ${run.run_index}</button>`;
          }).join('\n')}
        </div>
        ${runDetails.map((run, index) => formatRunTabContent(run, scenarioId, index === 0)).join('\n')}
      </div>
    </div>`;
}

function formatRunTabContent(run: RunExecution, scenarioId: string, isActive: boolean): string {
  const activeClass = isActive ? ' active' : '';
  return `
    <div id="tab-content-${scenarioId}-${run.run_index}" class="tab-content-${scenarioId} tab-content${activeClass}">
      <div class="run-info">
        <span class="run-info-label">Run Status:</span>
        <span class="run-status-badge ${run.status}">${run.status.toUpperCase()}</span>
        <span class="meta"> | Duration: ${run.duration_ms}ms</span>
      </div>
      ${run.error ? `<div class="error">${escapeHtml(run.error)}</div>` : ''}
      ${run.steps && run.steps.length > 0 ? `
        <h4>Step Details</h4>
        ${run.steps.map((step, i) => formatRunStep(step, i + 1)).join('\n')}
      ` : ''}
    </div>`;
}

function formatRunStep(step: RunStepDetail, index: number): string {
  const statusClass = step.status === 'failed' ? ' failed' : '';
  return `
    <div class="run-step-block${statusClass}">
      <div class="run-step-header">Step ${index}: "${escapeHtml(step.input)}"</div>
      <div class="meta">Status: ${step.status} | Duration: ${step.duration_ms}ms</div>
      ${step.assertions.length > 0 ? `
        <div class="run-step-assertions">
          ${step.assertions.map(a => {
            const value = typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
            return `<div class="assertion ${a.passed ? 'passed' : 'failed'}">
              ${a.passed ? '' : ''} ${escapeHtml(a.type)}: ${escapeHtml(value)}
              ${!a.passed && a.message ? `<br><small>${escapeHtml(a.message)}</small>` : ''}
            </div>`;
          }).join('\n')}
        </div>
      ` : ''}
      ${step.actual_output ? formatSessionOutputHtml(step.actual_output, step.input) : ''}
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
          const statusIcon = tc.status === 'completed' ? '' : '';
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