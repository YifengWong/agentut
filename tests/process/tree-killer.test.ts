import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('../../src/output/logger.js', () => ({
  logger: { warn: vi.fn() }
}));

import { execSync } from 'child_process';
import { logger } from '../../src/output/logger.js';
import { treeKill } from '../../src/process/tree-killer.js';

describe('treeKill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call taskkill on Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    treeKill(12345);

    expect(execSync).toHaveBeenCalledWith(
      'taskkill /PID 12345 /T /F',
      expect.objectContaining({ stdio: 'ignore' })
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should call process.kill with negative PID on Unix', () => {
    const originalPlatform = process.platform;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    Object.defineProperty(process, 'platform', { value: 'linux' });

    treeKill(12345);

    expect(killSpy).toHaveBeenCalledWith(-12345, 'SIGKILL');

    killSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should silently ignore ESRCH (process not found) on Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('No such process') as Error & { code: string };
      err.code = 'ESRCH';
      throw err;
    });

    expect(() => treeKill(99999)).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should log warning and not throw for other errors', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Access denied');
    });

    expect(() => treeKill(12345)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('treeKill failed for PID 12345')
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should handle ESRCH on Unix', () => {
    const originalPlatform = process.platform;
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('No such process') as Error & { code: string };
      err.code = 'ESRCH';
      throw err;
    });

    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(() => treeKill(99999)).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();

    killSpy.mockRestore();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });
});
