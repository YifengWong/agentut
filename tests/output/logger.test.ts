import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, formatDuration } from '../../src/output/logger.js';

describe('Logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatDuration', () => {
    it('should format milliseconds under 1 second', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds under 1 minute', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(5500)).toBe('5.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minutes and seconds', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });
  });

  describe('startSuite', () => {
    it('should output suite start message', () => {
      logger.startSuite('test-suite', 3);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Running test suite: test-suite')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 scenarios')
      );
    });
  });

  describe('startScenario', () => {
    it('should output scenario start with progress', () => {
      logger.startScenario('create-file', 1, 3);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Running scenario 1/3: create-file')
      );
    });
  });

  describe('endScenario', () => {
    it('should output passed scenario with green checkmark', () => {
      logger.endScenario('create-file', true, 3200);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('create-file')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('passed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3.2s')
      );
    });

    it('should output failed scenario with red X', () => {
      logger.endScenario('create-file', false, 5000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      );
    });
  });

  describe('startEnvironmentPrep', () => {
    it('should output environment prep start', () => {
      logger.startEnvironmentPrep('create-file');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Preparing environment')
      );
    });
  });

  describe('setupCopy', () => {
    it('should output copy action details', () => {
      logger.setupCopy('create-file', './source/file.txt', '$WORKDIR/target/');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Setup: copy')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('./source/file.txt')
      );
    });
  });

  describe('setupRun', () => {
    it('should output run command details', () => {
      logger.setupRun('create-file', 'npm install');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Setup: run')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('npm install')
      );
    });
  });

  describe('endEnvironmentPrep', () => {
    it('should output success with duration', () => {
      logger.endEnvironmentPrep('create-file', true, 1500);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment ready')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.5s')
      );
    });

    it('should output failure', () => {
      logger.endEnvironmentPrep('create-file', false, 2000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Environment setup failed')
      );
    });
  });

  describe('startStep', () => {
    it('should output step start with input preview', () => {
      logger.startStep('create-file', '创建 hello.txt 文件', 1, 2);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 1/2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('创建 hello.txt 文件')
      );
    });

    it('should truncate long input', () => {
      // 51+ characters to trigger truncation (maxLength = 50)
      const longInput = '这是一个非常非常非常非常非常非常长的输入内容已经超过五十个字符限制应该会被截断显示省略号在末尾结尾处啊';
      logger.startStep('create-file', longInput, 1, 2);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('...')
      );
    });
  });

  describe('showProgress', () => {
    it('should output progress indicator using stdout.write', () => {
      logger.showProgress('create-file', '执行中... (Agent 正在处理)');

      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('\r')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('⏳')
      );
      expect(stdoutSpy).toHaveBeenCalledWith(
        expect.stringContaining('执行中')
      );
    });
  });

  describe('endStep', () => {
    it('should output passed step with duration', () => {
      logger.endStep('create-file', true, 1, 2, 2100);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Step 1/2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('passed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('2.1s')
      );
    });

    it('should output failed step', () => {
      logger.endStep('create-file', false, 1, 2, 60000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed')
      );
    });
  });

  describe('cleanup', () => {
    it('should output cleanup message', () => {
      logger.cleanup('create-file');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[create-file]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleaning up')
      );
    });
  });

  describe('error', () => {
    it('should output error message with red X', () => {
      logger.error('create-file', 'Execution timed out');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Execution timed out')
      );
    });
  });

  describe('summary', () => {
    it('should output summary with all passed', () => {
      logger.summary(3, 0, 10000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Summary')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('3 passed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('10.0s')
      );
    });

    it('should output summary with failures', () => {
      logger.summary(2, 1, 15000);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1 failed')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('15.0s')
      );
    });
  });
});