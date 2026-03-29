import fs from 'fs-extra';
import { formatAsMarkdown } from '../output/formatters/markdown.js';
import { formatAsHtml } from '../output/formatters/html.js';
import { formatAsJest } from '../output/formatters/jest.js';
import { ExecutionError, type TestResult } from '../types/index.js';

export interface ReportOptions {
  input: string;
  format: 'markdown' | 'html' | 'jest';
  output?: string;
}

export async function generateReport(options: ReportOptions): Promise<string> {
  // Check input file exists
  if (!await fs.pathExists(options.input)) {
    throw new ExecutionError(`Input file not found: ${options.input}`, options.input);
  }

  // Read test result
  const testResult = await fs.readJson(options.input) as TestResult;

  // Generate report based on format
  let report: string;

  switch (options.format) {
    case 'markdown':
      report = formatAsMarkdown(testResult);
      break;
    case 'html':
      report = formatAsHtml(testResult);
      break;
    case 'jest':
      report = JSON.stringify(formatAsJest(testResult), null, 2);
      break;
    default:
      throw new ExecutionError(`Unknown format: ${options.format}`, options.input);
  }

  // Write to output file if specified
  if (options.output) {
    await fs.writeFile(options.output, report, 'utf-8');
  }

  return report;
}