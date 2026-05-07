import type { SessionDistiller } from './types.js';
import { OpenCodeDistiller } from './opencode.js';

export function createDistiller(runnerType: string): SessionDistiller {
  switch (runnerType) {
    case 'opencode':
      return new OpenCodeDistiller();
    default:
      throw new Error(`Unknown runner type: ${runnerType}`);
  }
}
