// src/process/manager.ts
import { treeKill } from './tree-killer.js';

export class ProcessManager {
  private pids = new Set<number>();

  register(pid: number): void {
    this.pids.add(pid);
  }

  unregister(pid: number): void {
    this.pids.delete(pid);
  }

  killAll(): void {
    for (const pid of this.pids) {
      treeKill(pid);
    }
    this.pids.clear();
  }

  get activeCount(): number {
    return this.pids.size;
  }
}

export const processManager = new ProcessManager();

// Register signal handlers on module import (only once)
let installed = false;

function installSignalHandlers(): void {
  if (installed) return;
  installed = true;

  const cleanup = () => {
    processManager.killAll();
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Last-resort cleanup on normal exit (belt and suspenders)
  process.on('exit', () => {
    processManager.killAll();
  });
}

installSignalHandlers();
