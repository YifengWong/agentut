import fs from 'fs-extra';
import * as yaml from 'yaml';
import { createRunner } from '../runner/factory.js';
import { parseAndValidateYaml } from '../parser/yaml.js';
import { analyzeSession, generateYamlFromAnalysis } from '../parser/session.js';
import { ExecutionError } from '../types/index.js';

export interface SuggestOptions {
  session?: string;
  latest?: boolean;
  output?: string;
  skill?: string;
  name?: string;
}

export async function suggestTest(testFile: string, options: SuggestOptions = {}): Promise<string> {
  // Check if YAML file exists
  if (!await fs.pathExists(testFile)) {
    throw new ExecutionError(`Test file not found: ${testFile}`, testFile);
  }

  // Read and parse YAML to get runner config
  const yamlContent = await fs.readFile(testFile, 'utf-8');
  const suite = parseAndValidateYaml(yamlContent);

  // Create runner from config
  const runner = createRunner(suite.config!.agent_cli!);

  // Get session ID
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

  // Export session
  const session = await runner.exportSession(sessionId);

  // Analyze and generate YAML
  const analysis = analyzeSession(session);
  const yamlSuite = generateYamlFromAnalysis(analysis);

  // Apply custom options
  if (options.name) {
    yamlSuite.name = options.name;
  }

  if (options.skill) {
    // Add skill to the default environment setup
    const defaultEnv = yamlSuite.environments.default;
    defaultEnv.setup.push({
      copy: `${options.skill} -> $WORKDIR/.opencode/agents/`
    });
    // Derive agent name from skill file
    const skillFileName = options.skill.split('/').pop() || options.skill;
    defaultEnv.agent = skillFileName.replace(/\.md$/, '');
  }

  // Convert to YAML string
  const yamlString = yaml.stringify(yamlSuite, { lineWidth: 0 });

  // Write to file if output specified
  if (options.output) {
    await fs.writeFile(options.output, yamlString, 'utf-8');
  }

  return yamlString;
}