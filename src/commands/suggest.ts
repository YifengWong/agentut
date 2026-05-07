import fs from 'fs-extra';
import { createRunner } from '../runner/factory.js';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { suggest } from '../suggest/index.js';
import { ExecutionError } from '../types/index.js';

export interface SuggestOptions {
  session?: string;
  latest?: boolean;
  output?: string;
  name?: string;
  model?: string;
  agent?: string;
  noLlm?: boolean;
}

export async function suggestTest(testFile: string, options: SuggestOptions = {}): Promise<string> {
  if (!await fs.pathExists(testFile)) {
    throw new ExecutionError(`Test file not found: ${testFile}`, testFile);
  }

  const yamlContent = await fs.readFile(testFile, 'utf-8');
  const suite = parseAndValidateYaml(yamlContent);

  if (!suite.config?.agent_cli) {
    throw new ExecutionError('YAML config must contain config.agent_cli configuration', testFile);
  }

  const runner = createRunner(suite.config.agent_cli);

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
    sourceConfig: suite.config
  });

  if (options.output) {
    await fs.writeFile(options.output, yamlString, 'utf-8');
  }

  return yamlString;
}
