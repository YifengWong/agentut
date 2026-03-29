import fs from 'fs-extra';
import * as yaml from 'yaml';
import { exportSession, getLatestSessionId } from '../executor/opencode.js';
import { analyzeSession, generateYamlFromAnalysis } from '../parser/session.js';
import { ExecutionError } from '../types/index.js';

export interface SuggestOptions {
  sessionId?: string;
  latest?: boolean;
  output?: string;
  skill?: string;
  name?: string;
}

export async function suggestTest(options: SuggestOptions): Promise<string> {
  // Get session ID
  let sessionId = options.sessionId;

  if (options.latest) {
    sessionId = await getLatestSessionId() || undefined;
    if (!sessionId) {
      throw new ExecutionError('No sessions found. Run opencode first to create a session.', '');
    }
  }

  if (!sessionId) {
    throw new ExecutionError('Session ID is required. Use --latest or provide a session ID.', '');
  }

  // Export session
  const session = await exportSession(sessionId);

  // Analyze and generate YAML
  const analysis = analyzeSession(session);
  const yamlSuite = generateYamlFromAnalysis(analysis);

  // Apply custom options
  if (options.name) {
    yamlSuite.name = options.name;
  }

  if (options.skill) {
    yamlSuite.config = yamlSuite.config || {};
    yamlSuite.config.target = yamlSuite.config.target || {};
    yamlSuite.config.target.skill = options.skill;
  }

  // Convert to YAML string
  const yamlString = yaml.stringify(yamlSuite, { lineWidth: 0 });

  // Write to file if output specified
  if (options.output) {
    await fs.writeFile(options.output, yamlString, 'utf-8');
  }

  return yamlString;
}