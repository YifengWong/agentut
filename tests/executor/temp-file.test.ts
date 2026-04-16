// tests/executor/temp-file.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { writeTempJson } from '../../src/executor/temp-file.js';
import type { OpenCodeRunOutput } from '../../src/types/index.js';

const TEST_TEMP_DIR = './test-temp-file';

describe('writeTempJson', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_TEMP_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_TEMP_DIR);
  });

  it('should write outputs to temp JSON file', async () => {
    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', data: { content: 'Hello' }, session_id: 'ses_1', timestamp: 1 }
    ];

    const filePath = await writeTempJson(outputs, TEST_TEMP_DIR);

    expect(await fs.pathExists(filePath)).toBe(true);
    expect(filePath).toContain('.judges');

    const content = await fs.readJson(filePath);
    expect(content).toEqual(outputs);
  });

  it('should create .judges subdirectory', async () => {
    const outputs: OpenCodeRunOutput[] = [];

    const filePath = await writeTempJson(outputs, TEST_TEMP_DIR);

    const judgeDir = path.join(TEST_TEMP_DIR, '.judges');
    expect(await fs.pathExists(judgeDir)).toBe(true);
  });

  it('should generate unique filenames', async () => {
    const outputs: OpenCodeRunOutput[] = [{ type: 'text', data: { content: 'test' }, session_id: 'ses_1', timestamp: 1 }];

    const file1 = await writeTempJson(outputs, TEST_TEMP_DIR);
    const file2 = await writeTempJson(outputs, TEST_TEMP_DIR);

    expect(file1).not.toBe(file2);
  });

  it('should write JSON without indentation', async () => {
    const outputs: OpenCodeRunOutput[] = [
      { type: 'text', data: { content: 'Test' }, session_id: 'ses_1', timestamp: 1 }
    ];

    const filePath = await writeTempJson(outputs, TEST_TEMP_DIR);

    const rawContent = await fs.readFile(filePath, 'utf-8');
    // 无缩进意味着 JSON 是紧凑格式
    expect(rawContent).not.toContain('\n  ');
    expect(rawContent).toContain('"type":"text"');
  });
});