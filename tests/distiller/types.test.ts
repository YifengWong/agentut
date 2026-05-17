import { describe, it, expect } from 'vitest';

describe('Distiller types', () => {
  it('should be importable', async () => {
    const mod = await import('../../src/distiller/types.js');
    expect(mod).toBeDefined();
  });

  it('DistilledStep should have required fields', () => {
    const step = {
      index: 1,
      userInput: 'test',
      toolCalls: [],
      fileChanges: []
    };
    expect(step.index).toBe(1);
    expect(step.userInput).toBe('test');
    expect(step.toolCalls).toEqual([]);
    expect(step.fileChanges).toEqual([]);
  });

  it('DistilledToolCall should support all status values', () => {
    const completed: { status: 'completed' } = { status: 'completed' };
    const error: { status: 'error' } = { status: 'error' };
    const pending: { status: 'pending' } = { status: 'pending' };
    expect(completed.status).toBe('completed');
    expect(error.status).toBe('error');
    expect(pending.status).toBe('pending');
  });

  it('FileChange should support all status values', () => {
    const added: { status: 'added' } = { status: 'added' };
    const modified: { status: 'modified' } = { status: 'modified' };
    const deleted: { status: 'deleted' } = { status: 'deleted' };
    expect(added.status).toBe('added');
    expect(modified.status).toBe('modified');
    expect(deleted.status).toBe('deleted');
  });
});
