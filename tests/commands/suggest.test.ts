import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { suggestTest } from '../../src/commands/suggest.js';

const TEST_DIR = './test-temp-suggest';

vi.mock('../../src/executor/opencode.js', () => ({
  exportSession: vi.fn(),
  getLatestSessionId: vi.fn()
}));

import { exportSession, getLatestSessionId } from '../../src/executor/opencode.js';

describe('suggest command', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should generate YAML from session ID', async () => {
    vi.mocked(exportSession).mockResolvedValue({
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

    const yaml = await suggestTest({ sessionId: 'ses_123' });

    expect(exportSession).toHaveBeenCalledWith('ses_123');
    expect(yaml).toContain('name:');
    expect(yaml).toContain('scenarios:');
    expect(yaml).toContain('Create file');
  });

  it('should use latest session when --latest flag is set', async () => {
    vi.mocked(getLatestSessionId).mockResolvedValue('ses_latest');
    vi.mocked(exportSession).mockResolvedValue({
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

    await suggestTest({ latest: true });

    expect(getLatestSessionId).toHaveBeenCalled();
    expect(exportSession).toHaveBeenCalledWith('ses_latest');
  });

  it('should write to output file when specified', async () => {
    vi.mocked(exportSession).mockResolvedValue({
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

    const outputPath = path.join(TEST_DIR, 'output.yaml');
    await suggestTest({ sessionId: 'ses_123', output: outputPath });

    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('suggested-test');
  });

  it('should use custom test name when --name is specified', async () => {
    vi.mocked(exportSession).mockResolvedValue({
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

    const yaml = await suggestTest({ sessionId: 'ses_123', name: 'my-custom-test' });

    expect(yaml).toContain('name: my-custom-test');
  });
});