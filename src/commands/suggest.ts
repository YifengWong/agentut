import fs from 'fs-extra';
import { createRunner } from '../runner/factory.js';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { suggest } from '../suggest/index.js';
import { ExecutionError, type GlobalConfig } from '../types/index.js';

export interface SuggestOptions {
  session?: string;
  latest?: boolean;
  output?: string;
  name?: string;
  model?: string;
  agent?: string;
  noLlm?: boolean;
  base?: string;
}

const DEFAULT_CONFIG: GlobalConfig = {
  default_timeout: 120000,
  parallel: false,
  agent_cli: {
    runner: 'opencode',
    command: 'opencode'
  },
  judges: {
    default: {} as unknown as GlobalConfig['judges'] extends Record<string, infer T> | undefined ? T : never
  }
};

export async function suggestTest(options: SuggestOptions = {}): Promise<string> {
  let sourceConfig: GlobalConfig = DEFAULT_CONFIG;

  // Load base config file if specified
  if (options.base) {
    if (!await fs.pathExists(options.base)) {
      throw new ExecutionError(`Base config file not found: ${options.base}`, options.base);
    }
    const yamlContent = await fs.readFile(options.base, 'utf-8');
    const suite = parseAndValidateYaml(yamlContent);
    if (suite.config) {
      sourceConfig = suite.config;
    }
  }

  if (!sourceConfig.agent_cli) {
    throw new ExecutionError('Config must contain agent_cli configuration', '');
  }

  const runner = createRunner(sourceConfig.agent_cli);

  let sessionId = options.session;

  if (options.latest) {
    const sessions = await runner.listSessions();
    if (sessions.length === 0) {
      throw new ExecutionError('No sessions found. Run opencode first to create a session.', '');
    }
    sessionId = sessions[0].id;
  }

  if (!sessionId) {
    throw new ExecutionError('Session ID is required. Use --latest or provide a session ID.', '');
  }

  const yamlString = await suggest({
    runner,
    sessionId,
    name: options.name,
    model: options.model,
    agent: options.agent,
    noLlm: options.noLlm,
    sourceConfig
  });

  if (options.output) {
    await fs.writeFile(options.output, yamlString, 'utf-8');
  }

  return yamlString;
}
