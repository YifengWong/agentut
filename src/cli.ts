#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import { initProject } from './commands/init.js';
import { suggestTest } from './commands/suggest.js';
import { runTests } from './commands/run.js';
import { generateReport } from './commands/report.js';
import { formatAsMarkdown } from './output/formatters/markdown.js';
import { formatAsHtml } from './output/formatters/html.js';
import { formatAsJest } from './output/formatters/jest.js';

const program = new Command();

program
  .name('agentvcr')
  .description('Agent VCR - Test framework for opencode Agent behaviors')
  .version('1.0.0');

// init command
program
  .command('init [directory]')
  .description('Initialize a test directory structure')
  .option('--with-example', 'Create example test files')
  .action(async (directory = '.', options) => {
    try {
      await initProject(directory, { withExample: options.withExample });
      console.log(`✓ Initialized test directory at ${directory}`);
      if (options.withExample) {
        console.log('  Created fixtures/example-env/');
        console.log('  Created tests/example-test.yaml');
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// suggest command
program
  .command('suggest [sessionId]')
  .description('Generate test case suggestion from session')
  .option('--latest', 'Use the most recent session')
  .option('-o, --output <file>', 'Output file path')
  .option('--skill <name>', 'Target skill name')
  .option('--name <name>', 'Test suite name')
  .action(async (sessionId, options) => {
    try {
      const yaml = await suggestTest({
        sessionId,
        latest: options.latest,
        output: options.output,
        skill: options.skill,
        name: options.name
      });

      if (!options.output) {
        console.log(yaml);
      } else {
        console.log(`✓ Generated test case: ${options.output}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// run command
program
  .command('run <testFile>')
  .description('Run test cases')
  .option('-f, --format <format>', 'Output format (json, markdown, html, jest)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .option('-s, --scenario <name>', 'Run specific scenario')
  .option('--parallel', 'Run scenarios in parallel')
  .option('-m, --model <model>', 'Override model (provider/model)')
  .option('-a, --agent <agent>', 'Override agent')
  .option('--verbose', 'Show detailed output')
  .action(async (testFile, options) => {
    try {
      const result = await runTests(testFile, {
        format: options.format,
        output: options.output,
        scenario: options.scenario,
        parallel: options.parallel,
        model: options.model,
        agent: options.agent,
        verbose: options.verbose
      });

      // Format output
      let output: string;
      switch (options.format) {
        case 'markdown':
          output = formatAsMarkdown(result);
          break;
        case 'html':
          output = formatAsHtml(result);
          break;
        case 'jest':
          output = JSON.stringify(formatAsJest(result), null, 2);
          break;
        default:
          output = JSON.stringify(result, null, 2);
      }

      if (options.output) {
        await fs.writeFile(options.output, output);
        console.log(`✓ Results written to ${options.output}`);
      } else {
        console.log(output);
      }

      // Exit with error code if any tests failed
      if (result.summary.failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// report command
program
  .command('report')
  .description('Generate formatted report from JSON results')
  .requiredOption('-i, --input <file>', 'Input JSON file')
  .requiredOption('-f, --format <format>', 'Output format (markdown, html, jest)')
  .option('-o, --output <file>', 'Output file path')
  .action(async (options) => {
    try {
      const report = await generateReport({
        input: options.input,
        format: options.format,
        output: options.output
      });

      if (!options.output) {
        console.log(report);
      } else {
        console.log(`✓ Report written to ${options.output}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();