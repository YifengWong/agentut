import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { initProject } from '../../src/commands/init.js';

const TEST_DIR = './test-temp-init';

describe('init command', () => {
  beforeEach(async () => {
    await fs.remove(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should create fixtures and tests directories', async () => {
    await initProject(TEST_DIR);

    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures'))).toBe(true);
    expect(await fs.pathExists(path.join(TEST_DIR, 'tests'))).toBe(true);
  });

  it('should create example files with --with-example flag', async () => {
    await initProject(TEST_DIR, { withExample: true });

    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures', 'example-env'))).toBe(true);
    expect(await fs.pathExists(path.join(TEST_DIR, 'tests', 'example-test.yaml'))).toBe(true);
  });

  it('should not create example files without --with-example flag', async () => {
    await initProject(TEST_DIR, { withExample: false });

    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures', 'example-env'))).toBe(false);
    expect(await fs.pathExists(path.join(TEST_DIR, 'tests', 'example-test.yaml'))).toBe(false);
  });

  it('should not overwrite existing directory', async () => {
    await fs.ensureDir(path.join(TEST_DIR, 'fixtures'));
    await fs.writeFile(path.join(TEST_DIR, 'fixtures', 'existing.txt'), 'content');

    await initProject(TEST_DIR, { withExample: false });

    // Should preserve existing content
    expect(await fs.pathExists(path.join(TEST_DIR, 'fixtures', 'existing.txt'))).toBe(true);
    expect(await fs.readFile(path.join(TEST_DIR, 'fixtures', 'existing.txt'), 'utf-8')).toBe('content');
  });

  it('should create valid example YAML file', async () => {
    await initProject(TEST_DIR, { withExample: true });

    const yamlPath = path.join(TEST_DIR, 'tests', 'example-test.yaml');
    const content = await fs.readFile(yamlPath, 'utf-8');

    expect(content).toContain('name:');
    expect(content).toContain('environments:');
    expect(content).toContain('scenarios:');
  });
});