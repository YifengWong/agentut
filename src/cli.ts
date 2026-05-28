#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs-extra';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initProject } from './commands/init.js';
import { suggestTest } from './commands/suggest.js';
import { runTests } from './commands/run.js';
import { generateReport } from './commands/report.js';
import { cleanTempDirectories } from './commands/clean.js';
import { formatAsMarkdown } from './output/formatters/markdown.js';
import { formatAsHtml } from './output/formatters/html.js';
import { formatAsJest } from './output/formatters/jest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = fs.readJsonSync(join(__dirname, '..', 'package.json'));

const program = new Command();

program
  .name('agentut')
  .description('Agent UT - Test framework for Agent behaviors')
  .version(pkg.version);

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
  .command('suggest')
  .description('Generate test case suggestion from session')
  .option('-s, --session <sessionId>', 'Session ID to analyze')
  .option('--latest', 'Use the most recent session')
  .option('-o, --output <file>', 'Output file path')
  .option('--name <name>', 'Test suite name')
  .option('--model <model>', 'Override LLM model')
  .option('--agent <agent>', 'Override agent')
  .option('--no-llm', 'Use rule-based extraction instead of LLM')
  .option('--base <file>', 'Base YAML config file for agent_cli settings')
  .action(async (options) => {
    try {
      const yaml = await suggestTest({
        session: options.session,
        latest: options.latest,
        output: options.output,
        name: options.name,
        model: options.model,
        agent: options.agent,
        noLlm: options.llm === false,
        base: options.base
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
  .option('-s, --scenario <name>', 'Run specific scenario (repeatable)',
    (val: string, prev: string[]) => [...prev, val], [])
  .option('--parallel', 'Run scenarios in parallel')
  .option('-m, --model <model>', 'Override model (provider/model)')
  .option('-a, --agent <agent>', 'Override agent')
  // 概率测试选项
  .option('--runs <n>', 'Override runs configuration', parseInt)
  .option('--min-pass <n>', 'Override min_pass configuration', parseInt)
  .option('--quick', 'Quick mode: single run (runs=1, min_pass=1)')
  .option('--clean', 'Clean temporary directories after run')
  .action(async (testFile, options) => {
    try {
      const result = await runTests(testFile, {
        format: options.format,
        output: options.output,
        scenario: options.scenario,
        parallel: options.parallel,
        model: options.model,
        agent: options.agent,
        runs: options.runs,
        min_pass: options.minPass,
        quick: options.quick,
        clean: options.clean
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

// clean command
program
  .command('clean')
  .description('Clean temporary directories (.agentut/temp)')
  .option('-d, --directory <path>', 'Working directory', '.')
  .action(async (options) => {
    try {
      const result = await cleanTempDirectories(options.directory);
      if (result.failedCount > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program.parse();