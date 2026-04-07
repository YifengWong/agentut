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

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
    vi.mocked(createRunner).mockReturnValue(mockRunner as any);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should read YAML config and create runner', async () => {
    const mockSuite = {
      name: 'test-project',
      environments: {
        default: {
          directory: '/test',
          setup: []
        }
      },
      scenarios: [],
      config: { agent_cli: { runner: 'opencode', command: 'mycode' } }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite as any);
    vi.mocked(mockRunner.exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test Session',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
        time: { created: Date.now(), updated: Date.now() }
      },
      messages: [
        {
          info: { role: 'user', time: { created: 1 }, id: 'm1', sessionID: 'ses_123' },
          parts: [{ type: 'text', text: 'Create file', id: 'p1', sessionID: 'ses_123', messageID: 'm1' }]
        }
      ]
    });

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const yaml = await suggestTest(yamlPath, { session: 'ses_123' });

    expect(createRunner).toHaveBeenCalledWith({ runner: 'opencode', command: 'mycode' });
    expect(mockRunner.exportSession).toHaveBeenCalledWith('ses_123');
    expect(yaml).toContain('name:');
    expect(yaml).toContain('scenarios:');
    expect(yaml).toContain('Create file');
  });

  it('should use latest session when --latest flag is set', async () => {
    const mockSuite = {
      name: 'test-project',
      environments: {
        default: {
          directory: '/test',
          setup: []
        }
      },
      scenarios: [],
      config: { agent_cli: { runner: 'opencode', command: 'opencode' } }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite as any);
    vi.mocked(mockRunner.listSessions).mockResolvedValue([{ id: 'ses_latest' }]);
    vi.mocked(mockRunner.exportSession).mockResolvedValue({
      info: {
        id: 'ses_latest',
        slug: 'latest',
        projectID: 'global',
        directory: '/test',
        title: 'Latest Session',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await suggestTest(yamlPath, { latest: true });

    expect(mockRunner.listSessions).toHaveBeenCalled();
    expect(mockRunner.exportSession).toHaveBeenCalledWith('ses_latest');
  });

  it('should write to output file when specified', async () => {
    const mockSuite = {
      name: 'test-project',
      environments: {
        default: {
          directory: '/test',
          setup: []
        }
      },
      scenarios: [],
      config: { agent_cli: { runner: 'opencode', command: 'opencode' } }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite as any);
    vi.mocked(mockRunner.exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const outputPath = path.join(TEST_DIR, 'output.yaml');
    await suggestTest(yamlPath, { session: 'ses_123', output: outputPath });

    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('suggested-test');
  });

  it('should use custom test name when --name is specified', async () => {
    const mockSuite = {
      name: 'test-project',
      environments: {
        default: {
          directory: '/test',
          setup: []
        }
      },
      scenarios: [],
      config: { agent_cli: { runner: 'opencode', command: 'opencode' } }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite as any);
    vi.mocked(mockRunner.exportSession).mockResolvedValue({
      info: {
        id: 'ses_123',
        slug: 'test',
        projectID: 'global',
        directory: '/test',
        title: 'Test',
        version: '1.0',
        summary: { additions: 0, deletions: 0, files: 0, diffs: [] },
        time: { created: 1, updated: 1 }
      },
      messages: []
    });

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    const yaml = await suggestTest(yamlPath, { session: 'ses_123', name: 'my-custom-test' });

    expect(yaml).toContain('name: my-custom-test');
  });

  it('should throw error when test file not found', async () => {
    const yamlPath = path.join(TEST_DIR, 'nonexistent.yaml');

    await expect(suggestTest(yamlPath, { session: 'ses_123' }))
      .rejects.toThrow('Test file not found');
  });

  it('should throw error when no sessions found with --latest', async () => {
    const mockSuite = {
      name: 'test-project',
      environments: {
        default: {
          directory: '/test',
          setup: []
        }
      },
      scenarios: [],
      config: { agent_cli: { runner: 'opencode', command: 'opencode' } }
    };
    vi.mocked(parseAndValidateYaml).mockReturnValue(mockSuite as any);
    vi.mocked(mockRunner.listSessions).mockResolvedValue([]);

    const yamlPath = path.join(TEST_DIR, 'config.yaml');
    await fs.writeFile(yamlPath, 'name: test');

    await expect(suggestTest(yamlPath, { latest: true }))
      .rejects.toThrow('No sessions found');
  });
});