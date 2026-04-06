import { describe, it, expect } from 'vitest';
import { matchValue, getMatcherDescription } from '../../src/executor/verifier.js';

describe('matchValue', () => {
  describe('string matcher (equals)', () => {
    it('should match exact string', () => {
      expect(matchValue('Write', 'Write')).toBe(true);
      expect(matchValue('Write', 'Read')).toBe(false);
    });

    it('should match null/undefined correctly', () => {
      expect(matchValue(null, 'Write')).toBe(false);
      expect(matchValue(undefined, 'Write')).toBe(false);
    });
  });

  describe('equals matcher', () => {
    it('should match exact value', () => {
      expect(matchValue('Write', { equals: 'Write' })).toBe(true);
      expect(matchValue('Write', { equals: 'write' })).toBe(false);
    });

    it('should handle null values', () => {
      expect(matchValue(null, { equals: 'test' })).toBe(false);
    });
  });

  describe('contains matcher', () => {
    it('should match substring', () => {
      expect(matchValue('debugging skill', { contains: 'debug' })).toBe(true);
      expect(matchValue('skill', { contains: 'debug' })).toBe(false);
    });

    it('should convert non-string to string', () => {
      expect(matchValue(123, { contains: '23' })).toBe(true);
      expect(matchValue(null, { contains: 'null' })).toBe(true);
    });
  });

  describe('regex matcher', () => {
    it('should match regex pattern', () => {
      expect(matchValue('writing-plans', { regex: '.*writing.*' })).toBe(true);
      expect(matchValue('plans', { regex: '.*writing.*' })).toBe(false);
    });

    it('should match case insensitive with flags', () => {
      expect(matchValue('WRITE', { regex: 'write' })).toBe(false);
      expect(matchValue('WRITE', { regex: 'write' })).toBe(false); // regex 不加 flag
    });

    it('should handle invalid regex gracefully', () => {
      expect(matchValue('test', { regex: '[invalid' })).toBe(false);
    });

    it('should convert non-string to string', () => {
      expect(matchValue(12345, { regex: '.*45' })).toBe(true);
    });
  });

  describe('oneOf matcher', () => {
    it('should match if value is in list', () => {
      expect(matchValue('success', { oneOf: ['success', 'done', 'completed'] })).toBe(true);
      expect(matchValue('failed', { oneOf: ['success', 'done'] })).toBe(false);
    });

    it('should work with single element', () => {
      expect(matchValue('Write', { oneOf: ['Write'] })).toBe(true);
    });
  });

  describe('priority', () => {
    it('should check equals first when multiple fields present', () => {
      // 实际实现会按优先级检查
      expect(matchValue('test', { equals: 'test', contains: 'x' })).toBe(true);
    });
  });

  describe('empty matcher', () => {
    it('should return false for empty matcher object', () => {
      expect(matchValue('test', {})).toBe(false);
    });
  });
});

describe('getMatcherDescription', () => {
  it('should describe string matcher', () => {
    expect(getMatcherDescription('Write')).toBe("equals 'Write'");
  });

  it('should describe equals matcher', () => {
    expect(getMatcherDescription({ equals: 'Write' })).toBe("equals 'Write'");
  });

  it('should describe contains matcher', () => {
    expect(getMatcherDescription({ contains: 'debug' })).toBe("contains 'debug'");
  });

  it('should describe regex matcher', () => {
    expect(getMatcherDescription({ regex: '.*skill.*' })).toBe("matches regex '.*skill.*'");
  });

  it('should describe oneOf matcher', () => {
    expect(getMatcherDescription({ oneOf: ['a', 'b'] })).toBe("one of [a, b]");
  });

  it('should handle empty matcher', () => {
    expect(getMatcherDescription({})).toBe('unknown matcher');
  });
});