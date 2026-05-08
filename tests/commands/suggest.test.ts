import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { suggestTest } from '../../src/commands/suggest.js';

const TEST_DIR = './test-temp-suggest';

vi.mock('../../src/runner/factory.js', () => ({
  createRunner: vi.fn()
}));

vi.mock('../../src/parser/yaml.js', () => ({
  parseAndValidateYaml: vi.fn()
}));

import { createRunner } from '../../src/runner/factory.js';
import { parseAndValidateYaml } from '../../src/parser/yaml.js';

describe('suggest command', () => {
  const mockRunner = {
    runnerType: 'opencode',
    run: vi.fn(),
    exportSession: vi.fn(),
    listSessions: vi.fn()
  };

  const mockRunResult = {
    outputs: [
      {
        part: {
          text: JSON.stringify({
            name: 'suggested-test',
            scenarios: [
              {
                name: 'test-scenario',
                steps: [{ input: 'Create file', expected: [] }]
              }
            ]
          })
        }
      }
    ],
    sessionId: 'ses_123'
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
    vi.mocked(createRunner).mockReturnValue(mockRunner as any);
    mockRunner.run.mockReturnValue(mockRunResult);
    mockRunner.exportSession.mockResolvedValue({
      info: {
        id: 'ses_123', slug: 'test', projectID: 'global', directory: '/test',
        title: 'Test Session', version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0 },
        time: { created: Date.now(), updated: Date.now() }
      },
      messages: [{
        info: { role: 'user', time: { created: Date.now() }, id: 'm1', sessionID: 'ses_123' },
        parts: [{ type: 'text', text: 'Create file', id: 'p1', sessionID: 'ses_123', messageID: 'm1' }]
      }]
    });
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should work without base file (use default config)', async () => {
    const yaml = await suggestTest({ session: 'ses_123' });

    expect(createRunner).toHaveBeenCalledWith({ runner: 'opencode', command: 'opencode' });
    expect(mockRunner.exportSession).toHaveBeenCalledWith('ses_123');
    expect(yaml).toContain('name:');
    expect(yaml).toContain('scenarios:');
    expect(yaml).toContain('Create file');
  });

  it('should read --base YAML config and create runner with custom settings', async () => {
    const mockSuite = {
      name: 'test-project',
      environments: { default: { directory: '/test', setup: [] } },
      scenarios: [],
      config: { agent_cli: { runner: 'opencode', command: 'mycode', model: 'custom-model' } }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite as any);

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const yaml = await suggestTest({ session: 'ses_123', base: yamlPath });

    expect(createRunner).toHaveBeenCalledWith({ runner: 'opencode', command: 'mycode', model: 'custom-model' });
    expect(yaml).toContain('Create file');
  });

  it('should use latest session when --latest flag is set', async () => {
    mockRunner.listSessions.mockResolvedValue([{ id: 'ses_latest' }]);

    await suggestTest({ latest: true });

    expect(mockRunner.listSessions).toHaveBeenCalled();
    expect(mockRunner.exportSession).toHaveBeenCalledWith('ses_latest');
  });

  it('should write to output file when specified', async () => {
    const outputPath = path.join(TEST_DIR, 'output.yaml');
    await suggestTest({ session: 'ses_123', output: outputPath });

    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('suggested-test');
  });

  it('should use custom test name when --name is specified', async () => {
    const yaml = await suggestTest({ session: 'ses_123', name: 'my-custom-test' });

    expect(yaml).toContain('name: my-custom-test');
  });

  it('should throw error when --base file not found', async () => {
    await expect(suggestTest({ session: 'ses_123', base: path.join(TEST_DIR, 'nonexistent.yaml') }))
      .rejects.toThrow('Base config file not found');
  });

  it('should throw error when no sessions found with --latest', async () => {
    mockRunner.listSessions.mockResolvedValue([]);

    await expect(suggestTest({ latest: true }))
      .rejects.toThrow('No sessions found');
  });

  it('should throw error when no session ID provided', async () => {
    await expect(suggestTest({}))
      .rejects.toThrow('Session ID is required');
  });

  it('should support --no-llm mode', async () => {
    const yaml = await suggestTest({ session: 'ses_123', noLlm: true });

    expect(yaml).toContain('name:');
    expect(yaml).toContain('Create file');
  });

  it('should pass --model and --agent to runner', async () => {
    await suggestTest({ session: 'ses_123', model: 'gpt-4', agent: 'helper' });

    expect(mockRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4',
      agent: 'helper'
    }));
  });
});
