import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { generateReport } from '../../src/commands/report.js';
import type { TestResult } from '../../src/types/index.js';

const TEST_DIR = './test-temp-report';

describe('report command', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should generate markdown report', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: []
    };

    await fs.writeJson(inputPath, testResult);

    const report = await generateReport({
      input: inputPath,
      format: 'markdown'
    });

    expect(report).toContain('# Test Report');
    expect(report).toContain('test');
  });

  it('should generate HTML report', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: []
    };

    await fs.writeJson(inputPath, testResult);

    const report = await generateReport({
      input: inputPath,
      format: 'html'
    });

    expect(report).toContain('<!DOCTYPE html>');
    expect(report).toContain('<html');
  });

  it('should generate Jest-compatible report', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 1, passed: 1, failed: 0, duration_ms: 100, timestamp: '' },
      scenarios: [
        { name: 'scenario-1', environment: 'e', status: 'passed', duration_ms: 100, steps: [] }
      ]
    };

    await fs.writeJson(inputPath, testResult);

    const report = await generateReport({
      input: inputPath,
      format: 'jest'
    });

    const parsed = JSON.parse(report);
    expect(parsed).toHaveProperty('success');
    expect(parsed).toHaveProperty('testResults');
  });

  it('should write report to output file', async () => {
    const inputPath = path.join(TEST_DIR, 'result.json');
    const outputPath = path.join(TEST_DIR, 'report.html');

    const testResult: TestResult = {
      suite: { name: 'test', description: '', file: './test.yaml' },
      summary: { total_scenarios: 0, passed: 0, failed: 0, duration_ms: 0, timestamp: '' },
      scenarios: []
    };

    await fs.writeJson(inputPath, testResult);

    await generateReport({
      input: inputPath,
      format: 'html',
      output: outputPath
    });

    expect(await fs.pathExists(outputPath)).toBe(true);
    const content = await fs.readFile(outputPath, 'utf-8');
    expect(content).toContain('<!DOCTYPE html>');
  });

  it('should throw error if input file does not exist', async () => {
    await expect(generateReport({
      input: './nonexistent.json',
      format: 'markdown'
    })).rejects.toThrow();
  });
});