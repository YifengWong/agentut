import { describe, it, expect } from 'vitest';
import { createDistiller } from '../../../src/suggest/distiller/factory.js';
import { OpenCodeDistiller } from '../../../src/suggest/distiller/opencode.js';

describe('createDistiller', () => {
  it('should create OpenCodeDistiller for "opencode"', () => {
    const distiller = createDistiller('opencode');
    expect(distiller).toBeInstanceOf(OpenCodeDistiller);
    expect(distiller.runnerType).toBe('opencode');
  });

  it('should throw for unknown runner type', () => {
    expect(() => createDistiller('unknown_runner')).toThrow('Unknown runner type: unknown_runner');
  });

  it('should throw for empty string', () => {
    expect(() => createDistiller('')).toThrow('Unknown runner type: ');
  });
});
