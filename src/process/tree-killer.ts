import { execSync } from 'child_process';
import { logger } from '../output/logger.js';

/**
 * Kill a process and all its descendants.
 * - Windows: taskkill /PID <pid> /T /F
 * - Unix: process.kill(-pid, 'SIGKILL') (requires detached: true on spawn)
 *
 * Errors (e.g., process already exited) are silently ignored.
 */
export function treeKill(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return; // No such process — already dead
    logger.warn(
      `treeKill failed for PID ${pid}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
