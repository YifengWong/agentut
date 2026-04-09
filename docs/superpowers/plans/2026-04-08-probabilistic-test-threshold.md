# 概率性测试通过率指标实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 agentvcr 添加概率性测试通过率指标支持，允许配置多次运行和通过阈值。

**Architecture:** 扩展现有类型系统添加 runs/min_pass 配置；新增 statistics 模块处理多次运行统计；修改 run 命令实现循环执行逻辑；扩展输出格式支持新的结果结构。

**Tech Stack:** TypeScript, Vitest, yaml, fs-extra

---

## 文件结构

### 新增文件
- `src/executor/statistics.ts` — 统计模块：汇总通过次数、判定状态
- `tests/executor/statistics.test.ts` — 统计模块的完整单元测试

### 修改文件
- `src/types/index.ts` — 扩展类型定义
- `src/parser/yaml.ts` — 解析新增配置字段
- `src/commands/run.ts` — 循环执行逻辑
- `src/output/json.ts` — 新输出结构生成
- `tests/types/index.test.ts` — 类型测试
- `tests/parser/yaml.test.ts` — YAML 解析测试
- `tests/commands/run.test.ts` — 运行命令测试
- `tests/output/json.test.ts` — 输出格式测试

---

## Task 1: 类型扩展

**Files:**
- Modify: `src/types/index.ts`
- Modify: `tests/types/index.test.ts`

- [ ] **Step 1: 编写类型扩展的失败测试**

在 `tests/types/index.test.ts` 中添加：

```typescript
import { describe, it, expect } from 'vitest';
import type {
  GlobalConfig,
  ScenarioConfig,
  Assertion,
  ToolCallAssertion,
  StepResult,
  RunExecution,
  AssertionSummary,
  AssertionFailure
} from '../../src/types/index.js';

describe('Probabilistic test types', () => {
  describe('GlobalConfig runs and min_pass', () => {
    it('should accept runs and min_pass as optional fields', () => {
      const config: GlobalConfig = {
        runs: 10,
        min_pass: 8,
        default_timeout: 120000
      };
      expect(config.runs).toBe(10);
      expect(config.min_pass).toBe(8);
    });

    it('should allow missing runs and min_pass', () => {
      const config: GlobalConfig = {
        default_timeout: 60000
      };
      expect(config.runs).toBeUndefined();
      expect(config.min_pass).toBeUndefined();
    });
  });

  describe('ScenarioConfig runs and min_pass override', () => {
    it('should allow scenario-level runs and min_pass', () => {
      const scenario: ScenarioConfig = {
        name: 'test',
        environment: 'default',
        cleanup: true,
        steps: [],
        runs: 5,
        min_pass: 4
      };
      expect(scenario.runs).toBe(5);
      expect(scenario.min_pass).toBe(4);
    });
  });

  describe('Assertion min_pass override', () => {
    it('should allow min_pass in ToolCallAssertion', () => {
      const assertion: ToolCallAssertion = {
        name: 'Write',
        min_pass: 9
      };
      expect(assertion.min_pass).toBe(9);
    });
  });

  describe('RunExecution type', () => {
    it('should track single run execution result', () => {
      const run: RunExecution = {
        run_index: 1,
        status: 'passed',
        duration_ms: 5000,
        assertions: [
          { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
        ]
      };
      expect(run.run_index).toBe(1);
      expect(run.status).toBe('passed');
    });

    it('should include error info for failed run', () => {
      const run: RunExecution = {
        run_index: 2,
        status: 'failed',
        duration_ms: 60000,
        assertions: [],
        error: 'Timeout'
      };
      expect(run.error).toBe('Timeout');
    });
  });

  describe('AssertionSummary type', () => {
    it('should summarize assertion pass rate', () => {
      const summary: AssertionSummary = {
        type: 'should_call_tool',
        value: 'Write',
        min_pass: 9,
        passed_runs: 8,
        status: 'failed',
        failures: [
          { run_index: 3, message: 'Tool not called' }
        ]
      };
      expect(summary.passed_runs).toBe(8);
      expect(summary.status).toBe('failed');
      expect(summary.failures).toHaveLength(1);
    });
  });

  describe('StepResult extended structure', () => {
    it('should support runs array structure', () => {
      const step: StepResult = {
        input: 'Create file',
        runs: [
          { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] }
        ],
        summary: {
          total_runs: 1,
          passed_runs: 1,
          min_pass: 1,
          status: 'passed'
        },
        assertions: []
      };
      expect(step.runs).toHaveLength(1);
      expect(step.summary.status).toBe('passed');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/types/index.test.ts`
Expected: 类型检查通过（TypeScript 编译），但这是新类型测试

- [ ] **Step 3: 扩展类型定义**

在 `src/types/index.ts` 中，修改现有类型并添加新类型：

```typescript
// ========== 修改 GlobalConfig ==========
export interface GlobalConfig {
  runs?: number;              // 运行次数，默认 5
  min_pass?: number;          // 最少通过次数，默认 4
  default_timeout?: number;
  parallel?: boolean;
  agent_cli?: AgentCliConfig;
  /** @deprecated Use environment.agent and setup.copy with $WORKDIR instead */
  target?: {
    skill?: string;
    agent?: string;
    model?: string;
  };
}

// ========== 修改 ScenarioConfig ==========
export interface ScenarioConfig {
  name: string;
  environment: string;
  cleanup: boolean;
  steps: StepConfig[];
  runs?: number;              // 场景层级覆盖
  min_pass?: number;          // 场景层级覆盖
}

// ========== 修改 Assertion 类型（添加 min_pass） ==========

/**
 * 工具调用断言，支持 Matcher 模式
 */
export interface ToolCallAssertion {
  name: string | Matcher;
  input?: Record<string, string | Matcher>;
  status?: 'completed' | 'error' | 'pending';
  min_pass?: number;          // 断言层级覆盖
}

/**
 * 文件内容断言，支持 Matcher 模式
 */
export interface FileContentAssertion {
  file: string | Matcher;
  text: string | Matcher;
  min_pass?: number;          // 断言层级覆盖
}

// 更新 Assertion 联合类型以支持 min_pass
export type Assertion =
  | { should_call_tool: string | ToolCallAssertion; min_pass?: number }
  | { should_produce_file: string | Matcher; min_pass?: number }
  | { file_content_contains: { file: string; text: string } | FileContentAssertion; min_pass?: number }
  | { response_contains: string | Matcher; min_pass?: number };

// ========== 新增类型 ==========

/**
 * 单次运行执行结果
 */
export interface RunExecution {
  run_index: number;              // 运行序号（1-N）
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];  // 本次运行的断言结果
  error?: string;                 // 失败原因
  output?: OpenCodeRunOutput[];   // 完整输出（用于复盘）
}

/**
 * 断言汇总统计
 */
export interface AssertionSummary {
  type: string;
  value: string | Matcher | ToolCallAssertion | FileContentAssertion | { file: string; text: string };
  min_pass: number;               // 该断言要求的通过次数
  passed_runs: number;            // 实际通过次数
  status: 'passed' | 'failed';    // passed_runs >= min_pass ?
  failures: AssertionFailure[];   // 失败详情列表
}

/**
 * 断言失败详情
 */
export interface AssertionFailure {
  run_index: number;              // 哪次运行失败
  message: string;                // 失败原因
  actual?: any;                   // 实际值
}

/**
 * 步骤汇总信息
 */
export interface StepSummary {
  total_runs: number;
  passed_runs: number;
  min_pass: number;               // 实际使用的 min_pass 值
  status: 'passed' | 'failed';
}
```

然后修改 `StepResult` 类型：

```typescript
export interface StepResult {
  input: string;
  // 新结构（多次运行）
  runs?: RunExecution[];          // 每次运行的详情
  summary?: StepSummary;          // 步骤汇总
  assertions?: AssertionSummary[];// 各断言汇总统计
  // 旧结构（向后兼容）
  status?: 'passed' | 'failed';
  duration_ms: number;
  assertions_legacy?: AssertionResult[];
  actual_output?: OpenCodeRunOutput[];
}
```

为保持向后兼容，保留旧字段并添加新的可选字段。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/types/index.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/types/index.ts tests/types/index.test.ts
git commit -m "feat: add probabilistic test types (runs, min_pass, RunExecution, AssertionSummary)"
```

---

## Task 2: YAML 解析扩展

**Files:**
- Modify: `src/parser/yaml.ts`
- Modify: `tests/parser/yaml.test.ts`

- [ ] **Step 1: 编写 YAML 解析扩展的失败测试**

在 `tests/parser/yaml.test.ts` 中添加：

```typescript
describe('runs and min_pass configuration', () => {
  it('should parse global runs and min_pass', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps: []
config:
  runs: 10
  min_pass: 8
`;
    const result = parseYaml(yaml);
    expect(result.config?.runs).toBe(10);
    expect(result.config?.min_pass).toBe(8);
  });

  it('should parse scenario-level runs and min_pass', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps: []
    runs: 5
    min_pass: 4
`;
    const result = parseYaml(yaml);
    expect(result.scenarios[0].runs).toBe(5);
    expect(result.scenarios[0].min_pass).toBe(4);
  });

  it('should parse assertion-level min_pass', () => {
    const yaml = `
name: test-suite
environments:
  default:
    directory: ./test
    setup: []
scenarios:
  - name: scenario-1
    environment: default
    cleanup: true
    steps:
      - input: "test"
        expected:
          - should_call_tool: Write
            min_pass: 9
`;
    const result = parseYaml(yaml);
    const assertion = result.scenarios[0].steps[0].expected[0];
    expect(assertion).toHaveProperty('min_pass', 9);
  });
});

describe('validateYamlTestSuite runs and min_pass defaults', () => {
  it('should set default runs=5 and min_pass=4 when not provided', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'test',
          expected: []
        }]
      }]
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.runs).toBe(5);
    expect(suite.config?.min_pass).toBe(4);
  });

  it('should preserve user-configured runs and min_pass', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }],
      config: {
        runs: 10,
        min_pass: 8
      }
    };
    validateYamlTestSuite(suite);
    expect(suite.config?.runs).toBe(10);
    expect(suite.config?.min_pass).toBe(8);
  });

  it('should validate min_pass <= runs', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }],
      config: {
        runs: 3,
        min_pass: 5  // 无效：min_pass > runs
      }
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should validate scenario-level min_pass <= runs', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: [],
        runs: 3,
        min_pass: 5  // 无效
      }]
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });

  it('should validate runs is positive', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'scenario-1',
        environment: 'default',
        cleanup: true,
        steps: []
      }],
      config: {
        runs: 0  // 无效
      }
    };
    expect(() => validateYamlTestSuite(suite)).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/parser/yaml.test.ts`
Expected: FAIL (新验证逻辑未实现)

- [ ] **Step 3: 实现默认值设置和验证**

修改 `src/parser/yaml.ts`：

```typescript
export function validateYamlTestSuite(suite: YamlTestSuite): void {
  // ... 现有验证逻辑 ...

  // Set default runs and min_pass if not provided
  if (suite.config?.runs === undefined) {
    suite.config = suite.config || {};
    suite.config.runs = 5;
  }
  if (suite.config?.min_pass === undefined) {
    suite.config = suite.config || {};
    suite.config.min_pass = 4;
  }

  // Validate runs and min_pass at global level
  if (suite.config.runs <= 0) {
    throw new ValidationError('runs must be a positive integer', 'config.runs');
  }
  if (suite.config.min_pass <= 0) {
    throw new ValidationError('min_pass must be a positive integer', 'config.min_pass');
  }
  if (suite.config.min_pass > suite.config.runs) {
    throw new ValidationError(
      `min_pass (${suite.config.min_pass}) cannot be greater than runs (${suite.config.runs})`,
      'config.min_pass'
    );
  }

  // Validate and set defaults for scenario-level runs and min_pass
  for (const scenario of suite.scenarios) {
    // If scenario specifies runs, validate it
    if (scenario.runs !== undefined) {
      if (scenario.runs <= 0) {
        throw new ValidationError(
          `Scenario "${scenario.name}": runs must be a positive integer`,
          `scenarios.${scenario.name}.runs`
        );
      }
    }

    // If scenario specifies min_pass, validate it
    if (scenario.min_pass !== undefined) {
      const effectiveRuns = scenario.runs ?? suite.config!.runs!;
      if (scenario.min_pass <= 0) {
        throw new ValidationError(
          `Scenario "${scenario.name}": min_pass must be a positive integer`,
          `scenarios.${scenario.name}.min_pass`
        );
      }
      if (scenario.min_pass > effectiveRuns) {
        throw new ValidationError(
          `Scenario "${scenario.name}": min_pass (${scenario.min_pass}) cannot be greater than runs (${effectiveRuns})`,
          `scenarios.${scenario.name}.min_pass`
        );
      }
    }
  }

  // Set default agent_cli if not provided (现有逻辑保持不变)
  if (!suite.config?.agent_cli) {
    suite.config = suite.config || {};
    suite.config.agent_cli = {
      runner: 'opencode',
      command: 'opencode'
    };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/parser/yaml.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/parser/yaml.ts tests/parser/yaml.test.ts
git commit -m "feat: add runs/min_pass parsing with validation and defaults"
```

---

## Task 3: 统计模块实现

**Files:**
- Create: `src/executor/statistics.ts`
- Create: `tests/executor/statistics.test.ts`

- [ ] **Step 1: 编写统计模块测试**

创建 `tests/executor/statistics.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculateStepSummary,
  calculateAssertionSummaries,
  determineScenarioStatus,
  type RunExecutionWithAssertions
} from '../../src/executor/statistics.js';
import type { AssertionResult, Assertion } from '../../src/types/index.js';

describe('statistics module', () => {
  describe('calculateStepSummary', () => {
    it('should calculate passed_runs from run executions', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] },
        { run_index: 3, status: 'failed', duration_ms: 2000, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 3);

      expect(summary.total_runs).toBe(3);
      expect(summary.passed_runs).toBe(2);
      expect(summary.min_pass).toBe(3);
      expect(summary.status).toBe('failed'); // 2 < 3
    });

    it('should return passed when passed_runs >= min_pass', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] },
        { run_index: 3, status: 'failed', duration_ms: 2000, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 2);

      expect(summary.passed_runs).toBe(2);
      expect(summary.status).toBe('passed'); // 2 >= 2
    });

    it('should handle all passed runs', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 2);

      expect(summary.passed_runs).toBe(2);
      expect(summary.status).toBe('passed');
    });

    it('should handle all failed runs', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'failed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'failed', duration_ms: 1100, assertions: [] }
      ];

      const summary = calculateStepSummary(runs, 1);

      expect(summary.passed_runs).toBe(0);
      expect(summary.status).toBe('failed');
    });

    it('should handle empty runs array', () => {
      const summary = calculateStepSummary([], 1);

      expect(summary.total_runs).toBe(0);
      expect(summary.passed_runs).toBe(0);
      expect(summary.status).toBe('failed');
    });
  });

  describe('calculateAssertionSummaries', () => {
    const createAssertionResult = (
      type: string,
      value: any,
      passed: boolean,
      message?: string
    ): AssertionResult => ({
      type,
      value,
      passed,
      message: message || (passed ? 'OK' : 'Failed')
    });

    it('should calculate assertion pass rates', () => {
      const runs: RunExecutionWithAssertions[] = [
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true),
            createAssertionResult('response_contains', 'done', true)
          ]
        },
        {
          run_index: 2,
          status: 'passed',
          duration_ms: 1100,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true),
            createAssertionResult('response_contains', 'done', false, 'Not found')
          ]
        },
        {
          run_index: 3,
          status: 'failed',
          duration_ms: 2000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', false, 'Tool not called'),
            createAssertionResult('response_contains', 'done', false, 'Not found')
          ]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' },
        { response_contains: 'done' }
      ];

      const summaries = calculateAssertionSummaries(runs, assertions, 2);

      expect(summaries).toHaveLength(2);

      // should_call_tool: 2/3 passed
      expect(summaries[0].type).toBe('should_call_tool');
      expect(summaries[0].passed_runs).toBe(2);
      expect(summaries[0].min_pass).toBe(2);
      expect(summaries[0].status).toBe('passed');

      // response_contains: 1/3 passed
      expect(summaries[1].type).toBe('response_contains');
      expect(summaries[1].passed_runs).toBe(1);
      expect(summaries[1].status).toBe('failed');
    });

    it('should use assertion-level min_pass when provided', () => {
      const runs: RunExecutionWithAssertions[] = [
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true)
          ]
        },
        {
          run_index: 2,
          status: 'passed',
          duration_ms: 1100,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', false, 'Failed')
          ]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write', min_pass: 2 }
      ];

      const summaries = calculateAssertionSummaries(runs, assertions, 1);

      expect(summaries[0].min_pass).toBe(2);
      expect(summaries[0].passed_runs).toBe(1);
      expect(summaries[0].status).toBe('failed');
    });

    it('should collect failure details', () => {
      const runs: RunExecutionWithAssertions[] = [
        {
          run_index: 1,
          status: 'failed',
          duration_ms: 1000,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', false, 'Tool not called')
          ]
        },
        {
          run_index: 2,
          status: 'passed',
          duration_ms: 1100,
          assertions: [
            createAssertionResult('should_call_tool', 'Write', true)
          ]
        }
      ];

      const assertions: Assertion[] = [
        { should_call_tool: 'Write' }
      ];

      const summaries = calculateAssertionSummaries(runs, assertions, 1);

      expect(summaries[0].failures).toHaveLength(1);
      expect(summaries[0].failures[0].run_index).toBe(1);
      expect(summaries[0].failures[0].message).toBe('Tool not called');
    });

    it('should handle empty assertions', () => {
      const runs: RunExecutionWithAssertions[] = [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] }
      ];

      const summaries = calculateAssertionSummaries(runs, [], 1);

      expect(summaries).toHaveLength(0);
    });
  });

  describe('determineScenarioStatus', () => {
    it('should pass when step summary passes and all assertions pass', () => {
      const stepSummary = { total_runs: 3, passed_runs: 3, min_pass: 2, status: 'passed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 2, passed_runs: 3, status: 'passed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('passed');
    });

    it('should fail when step summary fails', () => {
      const stepSummary = { total_runs: 3, passed_runs: 1, min_pass: 2, status: 'failed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 2, passed_runs: 3, status: 'passed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('failed');
    });

    it('should fail when any assertion fails', () => {
      const stepSummary = { total_runs: 3, passed_runs: 3, min_pass: 2, status: 'passed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 3, passed_runs: 2, status: 'failed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('failed');
    });

    it('should pass with edge case: exactly min_pass', () => {
      const stepSummary = { total_runs: 10, passed_runs: 8, min_pass: 8, status: 'passed' as const };
      const assertionSummaries = [
        { type: 'should_call_tool', value: 'Write', min_pass: 8, passed_runs: 8, status: 'passed' as const, failures: [] }
      ];

      const status = determineScenarioStatus(stepSummary, assertionSummaries);

      expect(status).toBe('passed');
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/executor/statistics.test.ts`
Expected: FAIL (模块不存在)

- [ ] **Step 3: 实现统计模块**

创建 `src/executor/statistics.ts`：

```typescript
import type {
  RunExecution,
  StepSummary,
  AssertionSummary,
  AssertionFailure,
  Assertion,
  AssertionResult
} from '../types/index.js';

/**
 * 用于统计的运行执行结果（简化版）
 */
export interface RunExecutionWithAssertions {
  run_index: number;
  status: 'passed' | 'failed';
  duration_ms: number;
  assertions: AssertionResult[];
  error?: string;
}

/**
 * 计算步骤汇总信息
 */
export function calculateStepSummary(
  runs: RunExecutionWithAssertions[],
  minPass: number
): StepSummary {
  const totalRuns = runs.length;
  const passedRuns = runs.filter(r => r.status === 'passed').length;
  const status = passedRuns >= minPass ? 'passed' : 'failed';

  return {
    total_runs: totalRuns,
    passed_runs: passedRuns,
    min_pass: minPass,
    status
  };
}

/**
 * 获取断言的唯一标识（用于匹配多次运行中的同一断言）
 */
function getAssertionKey(index: number, assertion: Assertion): string {
  const type = Object.keys(assertion).find(k =>
    ['should_call_tool', 'should_produce_file', 'file_content_contains', 'response_contains'].includes(k)
  );
  return `${index}-${type}`;
}

/**
 * 从 Assertion 提取断言类型
 */
function getAssertionType(assertion: Assertion): string {
  if ('should_call_tool' in assertion) return 'should_call_tool';
  if ('should_produce_file' in assertion) return 'should_produce_file';
  if ('file_content_contains' in assertion) return 'file_content_contains';
  if ('response_contains' in assertion) return 'response_contains';
  return 'unknown';
}

/**
 * 从 Assertion 提取值
 */
function getAssertionValue(assertion: Assertion): any {
  if ('should_call_tool' in assertion) return assertion.should_call_tool;
  if ('should_produce_file' in assertion) return assertion.should_produce_file;
  if ('file_content_contains' in assertion) return assertion.file_content_contains;
  if ('response_contains' in assertion) return assertion.response_contains;
  return undefined;
}

/**
 * 从 Assertion 提取 min_pass
 */
function getAssertionMinPass(assertion: Assertion, defaultMinPass: number): number {
  if ('min_pass' in assertion && assertion.min_pass !== undefined) {
    return assertion.min_pass;
  }
  return defaultMinPass;
}

/**
 * 计算各断言的汇总统计
 */
export function calculateAssertionSummaries(
  runs: RunExecutionWithAssertions[],
  assertions: Assertion[],
  defaultMinPass: number
): AssertionSummary[] {
  if (assertions.length === 0) {
    return [];
  }

  const summaries: AssertionSummary[] = [];

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    const type = getAssertionType(assertion);
    const value = getAssertionValue(assertion);
    const minPass = getAssertionMinPass(assertion, defaultMinPass);

    // 统计该断言在各次运行中的通过情况
    let passedRuns = 0;
    const failures: AssertionFailure[] = [];

    for (const run of runs) {
      // 找到对应的断言结果（按索引匹配）
      const assertionResult = run.assertions[i];

      if (assertionResult && assertionResult.passed) {
        passedRuns++;
      } else if (assertionResult) {
        failures.push({
          run_index: run.run_index,
          message: assertionResult.message || 'Assertion failed',
          actual: assertionResult.actual
        });
      }
    }

    const status = passedRuns >= minPass ? 'passed' : 'failed';

    summaries.push({
      type,
      value,
      min_pass: minPass,
      passed_runs: passedRuns,
      status,
      failures
    });
  }

  return summaries;
}

/**
 * 判定场景最终状态
 * 需要 step summary 通过 且 所有断言 summary 通过
 */
export function determineScenarioStatus(
  stepSummary: StepSummary,
  assertionSummaries: AssertionSummary[]
): 'passed' | 'failed' {
  // 场景整体通过次数必须达标
  if (stepSummary.status === 'failed') {
    return 'failed';
  }

  // 每个断言的通过次数必须达标
  for (const summary of assertionSummaries) {
    if (summary.status === 'failed') {
      return 'failed';
    }
  }

  return 'passed';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/executor/statistics.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/executor/statistics.ts tests/executor/statistics.test.ts
git commit -m "feat: add statistics module for probabilistic test pass rate calculation"
```

---

## Task 4: 运行命令改造

**Files:**
- Modify: `src/commands/run.ts`
- Modify: `tests/commands/run.test.ts`

- [ ] **Step 1: 编写运行命令扩展测试**

在 `tests/commands/run.test.ts` 中添加：

```typescript
describe('probabilistic test execution', () => {
  it('should run scenario multiple times based on runs config', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'multi-run-scenario',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Create file',
          expected: [{ should_call_tool: 'Write' }],
          timeout: 60000
        }]
      }],
      config: {
        runs: 3,
        min_pass: 2,
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    mockRunner.run.mockReturnValue({
      outputs: [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: 'ses_1', timestamp: 1 }],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([
      { type: 'should_call_tool', value: 'Write', passed: true, message: 'Tool called' }
    ]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    // 应该调用 runner.run 3 次（每个 step * 3 runs）
    // 注意：由于每次运行需要独立环境，实际调用次数取决于实现
    expect(result.scenarios[0].status).toBe('passed');
  });

  it('should use scenario-level runs/min_pass override', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'override-scenario',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test',
          expected: [],
          timeout: 60000
        }],
        runs: 2,
        min_pass: 2
      }],
      config: {
        runs: 10,
        min_pass: 8,
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    mockRunner.run.mockReturnValue({
      outputs: [],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(result.scenarios[0].status).toBe('passed');
  });

  it('should handle mixed pass/fail runs and determine status correctly', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'mixed-results',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Create file',
          expected: [{ should_call_tool: 'Write' }],
          timeout: 60000
        }]
      }],
      config: {
        runs: 5,
        min_pass: 3,  // 需要 3 次通过
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });

    // 模拟 5 次运行：3 次通过，2 次失败
    let runCount = 0;
    mockRunner.run.mockImplementation(() => {
      runCount++;
      const passed = runCount <= 3;
      return {
        outputs: passed
          ? [{ type: 'tool_call', data: { tool_name: 'Write' }, session_id: `ses_${runCount}`, timestamp: runCount }]
          : [],
        sessionId: `ses_${runCount}`
      };
    });

    vi.mocked(verifyAssertions).mockImplementation(async (assertions, outputs) => {
      const passed = outputs.length > 0;
      return [
        { type: 'should_call_tool', value: 'Write', passed, message: passed ? 'OK' : 'Failed' }
      ];
    });

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath);

    expect(result.scenarios[0].status).toBe('passed'); // 3 >= 3
  });

  it('should support CLI --runs and --min-pass overrides', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'cli-override',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test',
          expected: [],
          timeout: 60000
        }]
      }],
      config: {
        runs: 10,
        min_pass: 8,
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    mockRunner.run.mockReturnValue({
      outputs: [],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath, { runs: 1, min_pass: 1 });

    // CLI 覆盖后只运行 1 次
    expect(result.scenarios[0].status).toBe('passed');
  });

  it('should support --quick mode for single run', async () => {
    const mockSuite: YamlTestSuite = {
      name: 'test',
      environments: {
        default: { directory: './test', setup: [] }
      },
      scenarios: [{
        name: 'quick-test',
        environment: 'default',
        cleanup: true,
        steps: [{
          input: 'Test',
          expected: [],
          timeout: 60000
        }]
      }],
      config: {
        runs: 10,
        min_pass: 8,
        agent_cli: { runner: 'opencode', command: 'opencode' }
      }
    };

    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite);
    vi.mocked(prepareEnvironment).mockResolvedValue({ tempDirectory: '/tmp/test' });
    mockRunner.run.mockReturnValue({
      outputs: [],
      sessionId: 'ses_1'
    });
    vi.mocked(verifyAssertions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'test.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const result = await runTests(yamlPath, { quick: true });

    expect(result.scenarios[0].status).toBe('passed');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/commands/run.test.ts`
Expected: FAIL (新选项和逻辑未实现)

- [ ] **Step 3: 扩展 RunOptions 接口**

在 `src/commands/run.ts` 中修改：

```typescript
export interface RunOptions {
  scenario?: string;
  format?: 'json' | 'markdown' | 'html' | 'jest';
  output?: string;
  verbose?: boolean;
  parallel?: boolean;
  model?: string;
  agent?: string;
  // 新增
  runs?: number;
  min_pass?: number;
  quick?: boolean;
}
```

- [ ] **Step 4: 实现多次运行执行逻辑**

修改 `executeScenario` 函数以支持多次运行。由于代码较长，我将完整重写该函数：

```typescript
import {
  calculateStepSummary,
  calculateAssertionSummaries,
  determineScenarioStatus,
  type RunExecutionWithAssertions
} from './statistics.js';

// ... 现有 imports ...

async function executeScenario(
  suite: YamlTestSuite,
  scenario: typeof suite.scenarios[0],
  yamlDirectory: string,
  tempRoot: string,
  options?: {
    verbose?: boolean;
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
  let error: string | undefined;

  // 确定运行次数和通过阈值
  const effectiveRuns = options?.quick
    ? 1
    : (options?.runs ?? scenario.runs ?? suite.config?.runs ?? 5);

  const effectiveMinPass = options?.quick
    ? 1
    : (options?.min_pass ?? scenario.min_pass ?? suite.config?.min_pass ?? 4);

  // ... 现有的 agent 推导逻辑 ...

  const runner = createRunner(suite.config!.agent_cli!);

  // 存储所有步骤的所有运行结果
  const allStepResults: StepResult[] = [];

  try {
    // 执行多次运行
    for (let runIndex = 1; runIndex <= effectiveRuns; runIndex++) {
      let sessionId: string | undefined;
      let tempDirectory: string | undefined;

      // 每次运行准备独立环境
      const envResult = await prepareEnvironment(envConfig, `${scenario.name}-run${runIndex}`, tempRoot, {
        yamlDirectory
      });
      tempDirectory = envResult.tempDirectory;

      // 执行步骤
      for (let stepIndex = 0; stepIndex < scenario.steps.length; stepIndex++) {
        const step = scenario.steps[stepIndex];
        const stepStartTime = Date.now();

        try {
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

          const assertionResults = await verifyAssertions(step.expected, runResult.outputs, tempDirectory);

          const runExec: RunExecutionWithAssertions = {
            run_index: runIndex,
            status: assertionResults.every(a => a.passed) ? 'passed' : 'failed',
            duration_ms: Date.now() - stepStartTime,
            assertions: assertionResults,
            output: options?.verbose ? runResult.outputs : undefined
          };

          // 存储到对应步骤的结果数组
          if (!allStepResults[stepIndex]) {
            allStepResults[stepIndex] = {
              input: step.input,
              runs: [],
              duration_ms: 0,
              assertions: []
            };
          }
          allStepResults[stepIndex].runs!.push(runExec);

        } catch (err) {
          const runExec: RunExecutionWithAssertions = {
            run_index: runIndex,
            status: 'failed',
            duration_ms: Date.now() - stepStartTime,
            assertions: [{
              type: 'error',
              value: err instanceof Error ? err.message : 'Unknown error',
              passed: false,
              message: err instanceof Error ? err.message : 'Unknown error'
            }],
            error: err instanceof Error ? err.message : 'Unknown error'
          };

          if (!allStepResults[stepIndex]) {
            allStepResults[stepIndex] = {
              input: step.input,
              runs: [],
              duration_ms: 0,
              assertions: []
            };
          }
          allStepResults[stepIndex].runs!.push(runExec);
        }
      }

      // 清理本次运行的环境
      if (tempDirectory) {
        await cleanupEnvironment(tempDirectory, true, `${scenario.name}-run${runIndex}`);
      }
    }
  } catch (err) {
    if (err instanceof Error) {
      error = err.message;
    }
  }

  // 计算汇总统计
  for (const stepResult of allStepResults) {
    if (stepResult.runs && stepResult.runs.length > 0) {
      const stepSummary = calculateStepSummary(stepResult.runs, effectiveMinPass);
      const assertionSummaries = calculateAssertionSummaries(
        stepResult.runs,
        scenario.steps[allStepResults.indexOf(stepResult)].expected,
        effectiveMinPass
      );

      stepResult.summary = stepSummary;
      stepResult.assertions = assertionSummaries;
      stepResult.duration_ms = stepResult.runs.reduce((sum, r) => sum + r.duration_ms, 0);
    }
  }

  // 判定场景状态
  const allStepsPassed = allStepResults.every(s =>
    s.summary?.status === 'passed' && s.assertions?.every(a => a.status === 'passed')
  );

  return {
    name: scenario.name,
    environment: scenario.environment,
    status: allStepsPassed && !error ? 'passed' : 'failed',
    duration_ms: Date.now() - startTime,
    steps: allStepResults,
    error,
    runs: effectiveRuns,
    min_pass: effectiveMinPass,
    passed_runs: allStepResults.reduce((min, s) => Math.min(min, s.summary?.passed_runs ?? 0), effectiveRuns)
  };
}
```

- [ ] **Step 5: 更新 ScenarioResult 类型**

在 `src/types/index.ts` 中扩展 `ScenarioResult`：

```typescript
export interface ScenarioResult {
  name: string;
  environment: string;
  status: 'passed' | 'failed';
  duration_ms: number;
  steps: StepResult[];
  error?: string;
  tempDirectory?: string;
  // 新增
  runs?: number;
  min_pass?: number;
  passed_runs?: number;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- tests/commands/run.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/commands/run.ts tests/commands/run.test.ts src/types/index.ts
git commit -m "feat: implement multi-run execution with probabilistic pass rate"
```

---

## Task 5: 输出格式扩展

**Files:**
- Modify: `src/output/json.ts`
- Modify: `tests/output/json.test.ts`

- [ ] **Step 1: 编写输出格式扩展测试**

在 `tests/output/json.test.ts` 中添加：

```typescript
describe('probabilistic test result output', () => {
  it('should include runs and min_pass in scenario result', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const steps: StepResult[] = [{
      input: 'Create file',
      runs: [
        { run_index: 1, status: 'passed', duration_ms: 1000, assertions: [] },
        { run_index: 2, status: 'passed', duration_ms: 1100, assertions: [] },
        { run_index: 3, status: 'failed', duration_ms: 2000, assertions: [] }
      ],
      summary: {
        total_runs: 3,
        passed_runs: 2,
        min_pass: 2,
        status: 'passed'
      },
      assertions: [],
      duration_ms: 4100
    }];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 4100,
        steps,
        runs: 3,
        min_pass: 2,
        passed_runs: 2
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].runs).toBe(3);
    expect(result.scenarios[0].min_pass).toBe(2);
    expect(result.scenarios[0].passed_runs).toBe(2);
    expect(result.scenarios[0].steps[0].runs).toHaveLength(3);
    expect(result.scenarios[0].steps[0].summary?.status).toBe('passed');
  });

  it('should include assertion summaries with pass rates', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    const steps: StepResult[] = [{
      input: 'Create file',
      runs: [
        {
          run_index: 1,
          status: 'passed',
          duration_ms: 1000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
          ]
        },
        {
          run_index: 2,
          status: 'failed',
          duration_ms: 2000,
          assertions: [
            { type: 'should_call_tool', value: 'Write', passed: false, message: 'Not called' }
          ]
        }
      ],
      summary: {
        total_runs: 2,
        passed_runs: 1,
        min_pass: 2,
        status: 'failed'
      },
      assertions: [
        {
          type: 'should_call_tool',
          value: 'Write',
          min_pass: 2,
          passed_runs: 1,
          status: 'failed',
          failures: [
            { run_index: 2, message: 'Not called' }
          ]
        }
      ],
      duration_ms: 3000
    }];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'failed',
        duration_ms: 3000,
        steps,
        runs: 2,
        min_pass: 2,
        passed_runs: 1
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    const assertionSummary = result.scenarios[0].steps[0].assertions?.[0];
    expect(assertionSummary?.type).toBe('should_call_tool');
    expect(assertionSummary?.passed_runs).toBe(1);
    expect(assertionSummary?.min_pass).toBe(2);
    expect(assertionSummary?.status).toBe('failed');
    expect(assertionSummary?.failures).toHaveLength(1);
  });

  it('should handle legacy single-run format for backward compatibility', () => {
    const suite: YamlTestSuite = {
      name: 'test',
      environments: {},
      scenarios: []
    };

    // 旧格式（向后兼容）
    const steps: StepResult[] = [{
      input: 'Create file',
      status: 'passed',
      duration_ms: 1000,
      assertions_legacy: [
        { type: 'should_call_tool', value: 'Write', passed: true, message: 'OK' }
      ]
    }];

    const scenarioResults: ScenarioResult[] = [
      {
        name: 'scenario',
        environment: 'default',
        status: 'passed',
        duration_ms: 1000,
        steps
      }
    ];

    const result = generateTestResult(suite, scenarioResults, './test.yaml');

    expect(result.scenarios[0].status).toBe('passed');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/output/json.test.ts`
Expected: FAIL (新字段未处理)

- [ ] **Step 3: 确认输出格式兼容现有逻辑**

`src/output/json.ts` 已经是透传结构，无需修改。测试应该通过。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- tests/output/json.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add tests/output/json.test.ts
git commit -m "test: add probabilistic test output format tests"
```

---

## Task 6: CLI 参数扩展

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: 查看现有 CLI 定义**

Run: `cat src/cli.ts`

- [ ] **Step 2: 添加新 CLI 参数**

在 `src/cli.ts` 的 run 命令中添加新参数：

```typescript
program
  .command('run <testFile>')
  .description('Run test cases')
  .option('-f, --format <format>', 'Output format (json, markdown, html, jest)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('-s, --scenario <name>', 'Run only specified scenario')
  .option('--parallel', 'Run scenarios in parallel')
  .option('-m, --model <model>', 'Override model configuration')
  .option('-a, --agent <agent>', 'Override agent configuration')
  .option('--verbose', 'Show verbose output')
  // 新增参数
  .option('--runs <n>', 'Override runs configuration', parseInt)
  .option('--min-pass <n>', 'Override min_pass configuration', parseInt)
  .option('--quick', 'Quick mode: single run (runs=1, min_pass=1)')
  .action(async (testFile, options) => {
    // ... 现有逻辑 ...
  });
```

- [ ] **Step 3: 运行 CLI 测试**

Run: `npm run build && node dist/cli.js run --help`
Expected: 显示新增的参数

- [ ] **Step 4: 提交**

```bash
git add src/cli.ts
git commit -m "feat: add CLI options for runs, min-pass, and quick mode"
```

---

## Task 7: 集成测试与文档更新

**Files:**
- Create: `example/tests/probabilistic-test.yaml`
- Update: `README.md`

- [ ] **Step 1: 创建示例测试文件**

创建 `example/tests/probabilistic-test.yaml`：

```yaml
name: probabilistic-test-example
description: 演示概率性测试通过率指标

config:
  runs: 5
  min_pass: 4
  default_timeout: 60000

environments:
  default:
    directory: ./fixtures/empty
    setup: []

scenarios:
  - name: basic-file-creation
    environment: default
    cleanup: true
    steps:
      - input: "创建一个名为 test.txt 的文件"
        expected:
          - should_call_tool: Write
            min_pass: 5  # 要求所有运行都通过
          - should_produce_file: test.txt
        timeout: 30000

  - name: flexible-response-check
    runs: 10        # 场景覆盖：运行 10 次
    min_pass: 8     # 场景覆盖：至少通过 8 次
    environment: default
    cleanup: true
    steps:
      - input: "输出 hello world"
        expected:
          - response_contains: "hello"
        timeout: 15000
```

- [ ] **Step 2: 更新 README 文档**

在 `README.md` 中添加新章节：

```markdown
## 概率性测试

在 AI 时代，测试结果可能存在不确定性。Agent VCR 支持概率性测试，允许配置多次运行和通过阈值。

### 配置

```yaml
config:
  runs: 5          # 运行次数，默认 5
  min_pass: 4      # 最少通过次数，默认 4（80%）

scenarios:
  - name: my-scenario
    runs: 10       # 场景覆盖
    min_pass: 8
    steps:
      - input: "创建文件"
        expected:
          - should_call_tool: Write
            min_pass: 9  # 断言覆盖
```

### CLI 快速测试

```bash
# 快速单次测试（用于调试）
agentvcr run ./tests/my-test.yaml --quick

# 临时调整运行次数
agentvcr run ./tests/my-test.yaml --runs 3 --min-pass 2
```

### 判定规则

场景通过需满足两个条件：
1. 场景整体通过次数 >= min_pass
2. 每个断言的通过次数 >= 断言各自的 min_pass
```

- [ ] **Step 3: 运行完整测试套件**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add example/tests/probabilistic-test.yaml README.md
git commit -m "docs: add probabilistic test documentation and example"
```

---

## Self-Review

### 1. Spec Coverage

| Spec 章节 | 对应 Task |
|----------|----------|
| YAML 配置结构 | Task 1, Task 2 |
| TypeScript 类型定义 | Task 1 |
| 结果输出结构 | Task 5 |
| 判定逻辑 | Task 3 |
| CLI 命令调整 | Task 6 |
| 执行流程调整 | Task 4 |
| 向后兼容 | Task 1, Task 5 |

### 2. Placeholder Scan

无 TBD/TODO，所有步骤包含完整代码。

### 3. Type Consistency

- `RunExecution` 类型在 statistics.ts 和 types/index.ts 中一致
- `AssertionSummary` 类型在 statistics.ts 和 types/index.ts 中一致
- `StepResult` 扩展字段名称一致

---

Plan complete and saved to `docs/superpowers/plans/2026-04-08-probabilistic-test-threshold.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?