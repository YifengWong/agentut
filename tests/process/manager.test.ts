// tests/process/manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/process/tree-killer.js', () => ({
  treeKill: vi.fn()
}));

import { ProcessManager, processManager } from '../../src/process/manager.js';
import { treeKill } from '../../src/process/tree-killer.js';

describe('ProcessManager', () => {
  let pm: ProcessManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pm = new ProcessManager();
  });

  it('should register a PID', () => {
    pm.register(100);
    expect(pm.activeCount).toBe(1);
  });

  it('should unregister a PID', () => {
    pm.register(100);
    pm.unregister(100);
    expect(pm.activeCount).toBe(0);
  });

  it('should handle duplicate register (idempotent via Set)', () => {
    pm.register(100);
    pm.register(100);
    expect(pm.activeCount).toBe(1);
  });

  it('should handle unregister of non-existent PID gracefully', () => {
    expect(() => pm.unregister(999)).not.toThrow();
    expect(pm.activeCount).toBe(0);
  });

  it('should kill all registered PIDs and clear set', () => {
    pm.register(100);
    pm.register(200);
    pm.register(300);

    pm.killAll();

    expect(treeKill).toHaveBeenCalledTimes(3);
    expect(treeKill).toHaveBeenCalledWith(100);
    expect(treeKill).toHaveBeenCalledWith(200);
    expect(treeKill).toHaveBeenCalledWith(300);
    expect(pm.activeCount).toBe(0);
  });

  it('should support concurrent registration from multiple callers', () => {
    pm.register(100);
    pm.register(200);
    pm.unregister(100);
    pm.register(300);

    pm.killAll();

    expect(treeKill).toHaveBeenCalledTimes(2);
    expect(treeKill).toHaveBeenCalledWith(200);
    expect(treeKill).toHaveBeenCalledWith(300);
    expect(treeKill).not.toHaveBeenCalledWith(100);
  });
});

describe('processManager singleton', () => {
  it('should be an instance of ProcessManager', () => {
    expect(processManager).toBeInstanceOf(ProcessManager);
  });
});
