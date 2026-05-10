import chalk from 'chalk';

/**
 * 格式化时间 duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

/**
 * 截断长文本
 */
function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

class Logger {
  /**
   * 测试套件开始
   */
  startSuite(suiteName: string, totalScenarios: number): void {
    console.log(`\nRunning test suite: ${chalk.bold(suiteName)} (${totalScenarios} scenarios)\n`);
  }

  /**
   * 场景开始
   */
  startScenario(scenarioName: string, current: number, total: number): void {
    console.log(`Running scenario ${current}/${total}: ${chalk.bold(scenarioName)}`);
  }

  /**
   * 场景结束
   */
  endScenario(scenarioName: string, passed: boolean, durationMs: number): void {
    const status = passed
      ? chalk.green('✓')
      : chalk.red('✗');
    const duration = formatDuration(durationMs);
    const result = passed ? 'passed' : 'failed';
    console.log(`${status} ${scenarioName} ${result} (${duration})\n`);
  }

  /**
   * 环境准备开始
   */
  startEnvironmentPrep(scenarioName: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Preparing environment...`);
  }

  /**
   * Setup copy 动作
   */
  setupCopy(scenarioName: string, source: string, target: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Setup: copy ${source} -> ${target}`);
  }

  /**
   * Setup run 动作
   */
  setupRun(scenarioName: string, command: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Setup: run ${command}`);
  }

  /**
   * 环境准备结束
   */
  endEnvironmentPrep(scenarioName: string, success: boolean, durationMs: number): void {
    const status = success
      ? chalk.green('✓')
      : chalk.red('✗');
    const duration = formatDuration(durationMs);
    const message = success ? 'Environment ready' : 'Environment setup failed';
    console.log(`[${chalk.gray(scenarioName)}] ${status} ${message} (${duration})`);
  }

  /**
   * 步骤开始
   */
  startStep(scenarioName: string, stepInput: string, current: number, total: number): void {
    const truncatedInput = truncate(stepInput);
    console.log(`[${chalk.gray(scenarioName)}] Step ${current}/${total}: "${truncatedInput}"`);
  }

  /**
   * 进度指示器（动画效果）
   */
  showProgress(scenarioName: string, message: string): void {
    // 使用 \r 回到行首，覆盖之前的内容
    process.stdout.write(`\r[${chalk.gray(scenarioName)}] ${chalk.yellow('⏳')} ${message}`);
  }

  /**
   * 步骤结束
   */
  endStep(scenarioName: string, passed: boolean, current: number, total: number, durationMs: number): void {
    // 清除动画行（\x1b[K 清除整行）
    process.stdout.write('\r\x1b[K');

    const prefix = `[${chalk.gray(scenarioName)}]`;
    const status = passed
      ? chalk.green('✓')
      : chalk.red('✗');
    const duration = formatDuration(durationMs);
    const result = passed ? 'passed' : 'failed';

    console.log(`${prefix} ${status} Step ${current}/${total} ${result} (${duration})`);
  }

  /**
   * 清理环境
   */
  cleanup(scenarioName: string): void {
    console.log(`[${chalk.gray(scenarioName)}] Cleaning up...`);
  }

  /**
   * 导入 session
   */
  importSession(sessionFile: string): void {
    console.log(`  Importing session: ${sessionFile}`);
  }

  /**
   * 错误输出
   */
  error(scenarioName: string, message: string): void {
    console.log(`[${chalk.gray(scenarioName)}] ${chalk.red('✗')} Error: ${message}`);
  }

  /**
   * 评分开始 — shows progress indicator
   */
  startScoring(scenarioName: string): void {
    process.stdout.write(`\r[${chalk.gray(scenarioName)}] ${chalk.yellow('⏳')} scoring...`);
  }

  /**
   * 评分结束 — clears progress line, prints final score
   */
  endScoring(scenarioName: string, score: number, minScore: number, reason: string, isAssertionBased: boolean): void {
    process.stdout.write('\r\x1b[K'); // Clear the progress line
    const prefix = `[${chalk.gray(scenarioName)}]`;
    const passed = score >= minScore;
    const status = passed ? chalk.green('✓') : chalk.red('✗');
    const methodLabel = isAssertionBased ? chalk.gray(' (assertion-based)') : '';
    const reasonText = reason ? ` - ${reason}` : '';
    console.log(`${prefix} ${status} Score: ${score}/100${methodLabel} (min_score: ${minScore})${reasonText}`);
  }

  /**
   * 最终汇总
   */
  summary(passed: number, failed: number, totalDurationMs: number): void {
    const duration = formatDuration(totalDurationMs);
    const passedText = failed === 0
      ? chalk.green(`${passed} passed`)
      : `${chalk.green(`${passed} passed`)}, ${chalk.red(`${failed} failed`)}`;

    console.log(`\nSummary: ${passedText} (total ${duration})`);
  }
}

// 单例导出
export const logger = new Logger();