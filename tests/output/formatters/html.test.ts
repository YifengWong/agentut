import { describe, it, expect } from 'vitest';
import { formatAsHtml, formatSessionOutputHtml } from '../../../src/output/formatters/html.js';
import type { TestResult, ScenarioResult, StepResult, OpenCodeRunOutput, AssertionStat, RunExecution } from '../../../src/types/index.js';

// ========== Basic HTML Structure Tests ==========

describe('formatAsHtml - Basic Structure', () => {
  it('should generate complete HTML document', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('should include CSS styles', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('<style>');
    expect(html).toContain('font-family');
  });

  it('should use different colors for passed/failed', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 2, passed: 1, failed: 1, duration_ms: 0, timestamp: '' },
      scenarios: [
        { name: 'passed', environment: 'e', status: 'passed', duration_ms: 0, steps: [] },
        { name: 'failed', environment: 'e', status: 'failed', duration_ms: 0, steps: [] }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('status-passed');
    expect(html).toContain('status-failed');
  });

  it('should support responsive layout', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('width=device-width');
  });
});

// ========== Scenario Header Tests ==========

describe('formatAsHtml - Scenario Header', () => {
  it('should display scenario name and status', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'test-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: []
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('test-scenario');
    expect(html).toContain('PASSED');
  });

  it('should display runs statistics when available', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'probabilistic-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [],
          runs: 5,
          passed_runs: 4
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('4/5');
    expect(html).toContain('runs');
  });
});

// ========== Step Tests ==========

describe('formatAsHtml - Steps', () => {
  it('should display multiple steps in a scenario', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 200, timestamp: '' },
      scenarios: [
        {
          name: 'multi-step-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 200,
          steps: [
            {
              input: 'Step 1 input',
              status: 'passed',
              duration_ms: 100,
              assertions: [{ type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }]
            },
            {
              input: 'Step 2 input',
              status: 'passed',
              duration_ms: 100,
              assertions: [{ type: 'response_contains', value: 'success', passed: true, message: 'Found' }]
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Step 1 input');
    expect(html).toContain('Step 2 input');
    // Assertions are now shown only in Run Details, not in step display
  });

  it('should display session output in Run Details for multi-run scenario', () => {
    const step1Output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Step 1 response' } },
      { type: 'tool_use', part: { tool: 'write', state: { status: 'completed', input: { file: 'a.txt' } } } }
    ];
    const step2Output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Step 2 response' } },
      { type: 'tool_use', part: { tool: 'read', state: { status: 'completed', input: { file: 'b.txt' } } } }
    ];

    const runDetails: RunExecution[] = [
      {
        run_index: 1,
        status: 'passed',
        duration_ms: 200,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 100,
            assertions: [{ type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }],
            actual_output: step1Output
          },
          {
            step_index: 1,
            input: 'Read file',
            status: 'passed',
            duration_ms: 100,
            assertions: [{ type: 'response_contains', value: 'success', passed: true, message: 'Found' }],
            actual_output: step2Output
          }
        ]
      },
      {
        run_index: 2,
        status: 'passed',
        duration_ms: 180,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 90,
            assertions: [],
            actual_output: step1Output
          },
          {
            step_index: 1,
            input: 'Read file',
            status: 'passed',
            duration_ms: 90,
            assertions: [],
            actual_output: step2Output
          }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 200, timestamp: '' },
      scenarios: [
        {
          name: 'multi-step-with-session',
          environment: 'default',
          status: 'passed',
          duration_ms: 200,
        runs: 2,
          passed_runs: 2,
          steps: [
            {
              input: 'Create file',
              status: 'passed',
              duration_ms: 100,
              assertions: [],
              assertionStats: [
                { type: 'should_call_tool', value: 'Write', passed_runs: 2, total_runs: 2, pass_rate: 100, status: 'passed' }
              ]
            },
            {
              input: 'Read file',
              status: 'passed',
              duration_ms: 100,
              assertions: [],
              assertionStats: [
                { type: 'response_contains', value: 'success', passed_runs: 2, total_runs: 2, pass_rate: 100, status: 'passed' }
              ]
            }
          ],
          runDetails
        }
      ]
    };

    const html = formatAsHtml(result);

    // Step display should only show stats, not session
    expect(html).toContain('assertion-stats-table');
    // Session output should be in Run Details section
    expect(html).toContain('run-details-section');
    expect(html).toContain('Step 1 response');
    expect(html).toContain('<td>write</td>');
    expect(html).toContain('Step 2 response');
    expect(html).toContain('<td>read</td>');
  });
});

// ========== Assertion Stats Table Tests ==========

describe('formatAsHtml - Assertion Stats Table', () => {
  it('should display assertion stats table when available', () => {
    const assertionStats: AssertionStat[] = [
      { type: 'should_call_tool', value: 'Write', passed_runs: 5, total_runs: 5, pass_rate: 100, status: 'passed' },
      { type: 'response_contains', value: 'success', passed_runs: 3, total_runs: 5, pass_rate: 60, status: 'failed' }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'scenario-with-stats',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test input',
              status: 'passed',
              duration_ms: 50,
              assertions: [],
              assertionStats
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    // Check for stats table
    expect(html).toContain('assertion-stats-table');
    expect(html).toContain('Pass Rate');
    expect(html).toContain('5/5');
    expect(html).toContain('3/5');
  });

  it('should apply color coding for pass rates', () => {
    const assertionStats: AssertionStat[] = [
      { type: 'test1', value: 'high', passed_runs: 9, total_runs: 10, pass_rate: 90, status: 'passed' },   // >= 80% = high (green)
      { type: 'test2', value: 'medium', passed_runs: 6, total_runs: 10, pass_rate: 60, status: 'failed' }, // 50-79% = medium (yellow)
      { type: 'test3', value: 'low', passed_runs: 3, total_runs: 10, pass_rate: 30, status: 'failed' }     // < 50% = low (red)
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'color-test',
          environment: 'default',
          status: 'failed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test',
              status: 'failed',
              duration_ms: 50,
              assertions: [],
              assertionStats
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    // Check for color classes
    expect(html).toContain('pass-rate high');
    expect(html).toContain('pass-rate medium');
    expect(html).toContain('pass-rate low');
  });

  it('should display pass rate percentage', () => {
    const assertionStats: AssertionStat[] = [
      { type: 'test', value: 'value', passed_runs: 7, total_runs: 10, pass_rate: 70, status: 'passed' }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'rate-test',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test',
              status: 'passed',
              duration_ms: 50,
              assertions: [],
              assertionStats
            }
          ]
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('70%');
    expect(html).toContain('7/10');
  });
});

// ========== Run Details Tab Tests ==========

describe('formatAsHtml - Run Details Tabs', () => {
  const createMultiRunScenario = (): ScenarioResult => {
    const runDetails: RunExecution[] = [
      {
        run_index: 1,
        status: 'passed',
        duration_ms: 100,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 50,
            assertions: [
              { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
            ]
          }
        ]
      },
      {
        run_index: 2,
        status: 'failed',
        duration_ms: 80,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'failed',
            duration_ms: 40,
            assertions: [
              { type: 'should_call_tool', value: 'Write', passed: false, message: 'Tool not called' }
            ]
          }
        ]
      },
      {
        run_index: 3,
        status: 'passed',
        duration_ms: 90,
        steps: [
          {
            step_index: 0,
            input: 'Create file',
            status: 'passed',
            duration_ms: 45,
            assertions: [
              { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
            ]
          }
        ]
      }
    ];

    return {
      name: 'multi-run-scenario',
      environment: 'default',
      status: 'passed',
      duration_ms: 270,
      runs: 3,
      passed_runs: 2,
      steps: [
        {
          input: 'Create file',
          status: 'passed',
          duration_ms: 50,
          assertions: [],
          assertionStats: [
            { type: 'should_call_tool', value: 'Write', passed_runs: 2, total_runs: 3, pass_rate: 67, status: 'passed' }
          ]
        }
      ],
      runDetails
    };
  };

  it('should display run details section when runDetails available', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('run-details-section');
    expect(html).toContain('Run Details');
  });

  it('should display run details section for single run when runDetails available', () => {
    const runDetails: RunExecution[] = [
      {
        run_index: 1,
        status: 'passed',
        duration_ms: 100,
        steps: [
          {
            step_index: 0,
            input: 'Test',
            status: 'passed',
            duration_ms: 50,
            assertions: [{ type: 'test', value: 'val', passed: true }]
          }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'single-run-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Test',
              status: 'passed',
              duration_ms: 50,
              assertions: []
            }
          ],
          runDetails
        }
      ]
    };

    const html = formatAsHtml(result);

    // Should display run details section for single runs when runDetails exists
    expect(html).toContain('run-details-section');
    expect(html).toContain('Run Details');
  });

  it('should display tab buttons for each run', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('tab-buttons');
    expect(html).toContain('tab-btn');
    expect(html).toContain('Run 1');
    expect(html).toContain('Run 2');
    expect(html).toContain('Run 3');
  });

  it('should display tab content for each run', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('tab-content');
    expect(html).toContain('tab-content-');
  });

  it('should show first tab as active by default', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    // First tab button should be active
    expect(html).toContain('tab-btn active');
    // First tab content should be active
    expect(html).toContain('tab-content active');
  });

  it('should display run status for each run', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Run Status');
    expect(html).toContain('PASSED');
    expect(html).toContain('FAILED');
  });

  it('should display step details in each run', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Step 1');
    expect(html).toContain('Create file');
  });

  it('should include JavaScript for tab switching', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('function switchTab');
  });

  it('should include JavaScript for toggle collapse', () => {
    const scenario = createMultiRunScenario();
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 270, timestamp: '' },
      scenarios: [scenario]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('function toggleRunDetails');
  });
});

// ========== CSS Styles Tests ==========

describe('formatAsHtml - CSS Styles', () => {
  it('should include tab-related CSS classes', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('.tab-buttons');
    expect(html).toContain('.tab-btn');
    expect(html).toContain('.tab-btn.active');
    expect(html).toContain('.tab-content');
    expect(html).toContain('.tab-content.active');
  });

  it('should include assertion stats table CSS classes', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('.assertion-stats-table');
    expect(html).toContain('.pass-rate');
    expect(html).toContain('.pass-rate.high');
    expect(html).toContain('.pass-rate.medium');
    expect(html).toContain('.pass-rate.low');
  });

  it('should include run details CSS classes', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('.run-details-section');
    expect(html).toContain('.run-details-header');
    expect(html).toContain('.run-details-content');
  });
});

// ========== Edge Cases ==========

describe('formatAsHtml - Edge Cases', () => {
  it('should handle scenario with no steps', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: [
        {
          name: 'empty-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 0,
          steps: []
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('empty-scenario');
    expect(html).toContain('PASSED');
  });

  it('should handle empty scenarios array', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('No scenarios executed');
  });

  it('should handle runDetails with errors', () => {
    const runDetails: RunExecution[] = [
      {
        run_index: 1,
        status: 'failed',
        duration_ms: 50,
        error: 'Timeout exceeded',
        steps: []
      },
      {
        run_index: 2,
        status: 'passed',
        duration_ms: 100,
        steps: [
          {
            step_index: 0,
            input: 'Test',
            status: 'passed',
            duration_ms: 50,
            assertions: []
          }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 0, failed: 1, duration_ms: 150, timestamp: '' },
      scenarios: [
        {
          name: 'error-scenario',
          environment: 'default',
          status: 'failed',
          duration_ms: 150,
          steps: [],
          runs: 2,
          passed_runs: 1,
          runDetails
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Timeout exceeded');
    expect(html).toContain('FAILED');
  });

  it('should handle step with actual_output in runDetails containing tool calls', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'tool_use', part: { tool: 'write', state: { status: 'completed', input: { file: 'test.txt' } } } }
    ];

    const runDetails: RunExecution[] = [
      {
        run_index: 1,
        status: 'passed',
        duration_ms: 100,
        steps: [
          {
            step_index: 0,
            input: 'Write file',
            status: 'passed',
            duration_ms: 50,
            assertions: [],
            actual_output: output
          }
        ]
      }
    ];

    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        {
          name: 'tool-call-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [
            {
              input: 'Write file',
              status: 'passed',
              duration_ms: 50,
              assertions: []
            }
          ],
          runDetails
        }
      ]
    };

    const html = formatAsHtml(result);

    // Tool calls should be in Run Details, not in step display
    expect(html).toContain('run-details-section');
    expect(html).toContain('Tool Calls');
    expect(html).toContain('<td>write</td>');
    expect(html).toContain('completed');
  });
});

// ========== Score Display Tests ==========

describe('formatAsHtml - Score Display', () => {
  it('should display total score when provided', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      total_score: 85,
      scenarios: []
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Total Score:');
    expect(html).toContain('85/100');
  });

  it('should display scenario score when provided', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      total_score: 85,
      scenarios: [
        {
          name: 'scored-scenario',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [],
          score: { score: 90, reason: 'Good performance', judge: 'gpt-4' }
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Score:');
    expect(html).toContain('<strong>90/100</strong>');
    expect(html).toContain('Good performance');
    expect(html).toContain('gpt-4');
  });

  it('should display assertion-based score when no judge', () => {
    const result: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      total_score: 100,
      scenarios: [
        {
          name: 'assertion-scored',
          environment: 'default',
          status: 'passed',
          duration_ms: 100,
          steps: [],
          score: { score: 100, reason: 'All assertions passed' }
        }
      ]
    };

    const html = formatAsHtml(result);

    expect(html).toContain('Score:');
    expect(html).toContain('<strong>100/100</strong>');
    expect(html).toContain('assertion-based');
    expect(html).toContain('All assertions passed');
  });
});

// ========== formatSessionOutputHtml Tests ==========

const mockSessionOutput: OpenCodeRunOutput[] = [
  { type: 'text', part: { text: 'Hello, I will help you create this file.' } },
  { type: 'tool_use', part: { tool: 'write', state: {
    status: 'completed',
    input: { filePath: '/tmp/hello.txt', content: 'Hello World' }
  }}}
];

const mockErrorOutput: OpenCodeRunOutput[] = [
  { type: 'tool_use', part: { tool: 'read', state: {
    status: 'error',
    input: { filePath: '/nonexistent.txt' },
    error: 'File not found'
  }}}
];

describe('formatSessionOutputHtml', () => {
  it('should format complete session with proper HTML structure', () => {
    const result = formatSessionOutputHtml(mockSessionOutput, 'Create file');
    expect(result).toContain('<div class="step-session">');
    expect(result).toContain('<div class="session-request">');
    expect(result).toContain('<div class="session-response">');
    expect(result).toContain('<div class="session-tool-calls">');
    expect(result).toContain('<td>write</td>');
    expect(result).toContain('completed');
  });

  it('should escape HTML special characters', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Test <script>alert("xss")</script>' } }
    ];
    const result = formatSessionOutputHtml(output, 'test');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('should escape XSS in request parameter', () => {
    const output: OpenCodeRunOutput[] = [
      { type: 'text', part: { text: 'Normal response' } }
    ];
    const result = formatSessionOutputHtml(output, 'Test <script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>alert');
  });

  it('should format error status', () => {
    const result = formatSessionOutputHtml(mockErrorOutput, 'Read file');
    expect(result).toContain('error');
    expect(result).toContain('File not found');
  });

  it('should return empty string for empty output', () => {
    const result = formatSessionOutputHtml([], 'test');
    expect(result).toBe('');
  });

  it('should return empty string for undefined input', () => {
    const result = formatSessionOutputHtml(undefined, 'test');
    expect(result).toBe('');
  });

  it('should include raw output in collapsible details', () => {
    const result = formatSessionOutputHtml(mockSessionOutput, 'test');
    expect(result).toContain('<details class="session-raw">');
    expect(result).toContain('<summary>Raw Output</summary>');
  });
});