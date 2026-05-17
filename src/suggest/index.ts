import { createDistiller } from '../distiller/factory.js';
import { generateAssertions } from './generator/llm-generator.js';
import { generateYamlFromAnalysis, analyzeSession } from '../parser/session.js';
import * as yaml from 'yaml';
import type { AgentRunner } from '../runner/types.js';
import type { YamlTestSuite, GlobalConfig } from '../types/index.js';

export interface SuggestInput {
  runner: AgentRunner;
  sessionId: string;
  name?: string;
  model?: string;
  agent?: string;
  noLlm?: boolean;
  sourceConfig?: GlobalConfig;
}

const DIR_COMMENT = '# ↑ 请确保该目录存在。如需空白环境，创建空目录即可；如需预置文件，在目录中放置初始文件。';

const SETUP_COMMENT = '# ↑ 可选 setup 示例（请根据实际需要修改或删除）:';

const SETUP_EXAMPLE_1 = '#   - copy: "../skills/your-skill/ -> $WORKDIR/.opencode/skills/your-skill/"';

const SETUP_EXAMPLE_2 = '#   - run: "npm install"';

const SETUP_EXAMPLE_3 = '#   - copy: "../fixtures/templates/hello.txt -> $WORKDIR/hello.txt"';

const JUDGES_COMMENT = '# ↑ 请填写 judge 配置，例如（请根据实际需要修改或删除）:';

const JUDGES_EXAMPLE_1 = '# default:';

const JUDGES_EXAMPLE_2 = '#   runner: opencode';

const JUDGES_EXAMPLE_3 = '#   command: opencode';

const JUDGES_EXAMPLE_4 = '#   model: your-model';

const JUDGES_EXAMPLE_5 = '#   agent: plan';

export async function suggest(input: SuggestInput): Promise<string> {
  console.log('[session] 导出会话数据...');
  const session = await input.runner.exportSession(input.sessionId);

  let suite: YamlTestSuite;

  if (input.noLlm) {
    console.log('[mode] 规则引擎模式（--no-llm）');
    const analysis = analyzeSession(session);
    console.log(`[analysis] 提取到 ${analysis.inputs.length} 个步骤, ${analysis.toolCallsByInput.size} 组工具调用`);
    suite = generateYamlFromAnalysis(analysis);
  } else {
    console.log('[mode] LLM 推理模式');
    console.log(`[distill] 蒸馏会话数据 (${input.runner.runnerType})...`);
    const distiller = createDistiller(input.runner.runnerType);
    const distilled = distiller.distill(session);
    console.log(`[distill] 蒸馏完成: ${distilled.steps.length} 个步骤`);

    // Resolve model/agent: CLI options take priority, then sourceConfig.agent_cli defaults
    // model 不是必需的 —— opencode 自身有默认 model 可运行
    const llmModel = input.model || input.sourceConfig?.agent_cli?.model;
    const llmAgent = input.agent || input.sourceConfig?.agent_cli?.agent;

    console.log(`[llm] model: ${llmModel || '(opencode 默认)'}, agent: ${llmAgent || '(opencode 默认)'}`);
    console.log('[llm] 调用 LLM 推理生成断言...');
    suite = await generateAssertions(distilled, input.runner, {
      model: llmModel,
      agent: llmAgent
    });
  }

  console.log(`[result] 生成测试 "${suite.name}": ${suite.scenarios.length} 个场景, ${suite.scenarios.reduce((n, s) => n + s.steps.length, 0)} 个步骤`);

  if (input.name) {
    suite.name = input.name;
  }

  // Ensure environments.default
  if (!suite.environments) {
    suite.environments = {};
  }
  if (!suite.environments.default) {
    suite.environments.default = {
      directory: './fixtures/your-project-dir'
    };
  }

  // Ensure all scenarios use default environment
  for (const scenario of suite.scenarios) {
    if (!scenario.environment) {
      scenario.environment = 'default';
    }
    if (scenario.cleanup === undefined) {
      scenario.cleanup = true;
    }
  }

  // Ensure config
  suite.config = {
    default_timeout: 120000,
    parallel: false,
    ...suite.config,
    agent_cli: input.sourceConfig?.agent_cli || suite.config?.agent_cli || {
      runner: 'opencode',
      command: 'opencode'
    },
    judges: suite.config?.judges || { default: { runner: 'opencode' as const, command: 'opencode' } }
  };

  return buildYamlWithComments(suite);
}

function buildYamlWithComments(suite: YamlTestSuite): string {
  const baseYaml = yaml.stringify(suite, { lineWidth: 0 });
  const lines = baseYaml.split('\n');
  const result: string[] = [];

  let inDefaultEnv = false;
  let passedDirectory = false;
  let passedSetupArray = false;
  let passedJudges = false;

  for (const line of lines) {
    // Insert directory comment after the "directory:" line
    if (inDefaultEnv && !passedDirectory && line.match(/^\s+directory:/)) {
      result.push(line);
      result.push(line.replace(/directory:.*$/, '  ') + DIR_COMMENT);
      passedDirectory = true;
      continue;
    }

    // Insert setup comments after "setup: []" or "setup:" line
    if (inDefaultEnv && passedDirectory && !passedSetupArray && line.match(/^\s+setup:/)) {
      result.push(line);
      result.push(line.replace(/setup:.*$/, '  ') + SETUP_COMMENT);
      result.push(line.replace(/setup:.*$/, '  ') + SETUP_EXAMPLE_1);
      result.push(line.replace(/setup:.*$/, '  ') + SETUP_EXAMPLE_2);
      result.push(line.replace(/setup:.*$/, '  ') + SETUP_EXAMPLE_3);
      passedSetupArray = true;
      continue;
    }

    // Insert judges comments after "default:" in judges section
    if (passedJudges && line.match(/^\s+default:/)) {
      result.push(line);
      result.push(line.replace(/default:.*$/, '  ') + JUDGES_COMMENT);
      result.push(line.replace(/default:.*$/, '  ') + JUDGES_EXAMPLE_1);
      result.push(line.replace(/default:.*$/, '  ') + JUDGES_EXAMPLE_2);
      result.push(line.replace(/default:.*$/, '  ') + JUDGES_EXAMPLE_3);
      result.push(line.replace(/default:.*$/, '  ') + JUDGES_EXAMPLE_4);
      result.push(line.replace(/default:.*$/, '  ') + JUDGES_EXAMPLE_5);
      passedJudges = false; // prevent duplicate
      continue;
    }

    // Track section transitions
    if (line.match(/^\s+default:/) && !line.match(/default_timeout/)) {
      inDefaultEnv = true;
    }
    if (line.match(/^\s+judges:/)) {
      passedJudges = true;
    }
    if (inDefaultEnv && line.match(/^\w/)) {
      inDefaultEnv = false;
    }

    result.push(line);
  }

  return result.join('\n');
}
