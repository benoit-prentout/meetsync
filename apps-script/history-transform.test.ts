// Exercises the real apps-script/Code.gs getHistory() via the loadCode harness.
import { describe, it, expect } from 'vitest';
import { loadCode } from './loadCode';

function transformHistoryRecord(
  r: {
    date: string;
    synced?: number;
    updated?: number;
    errors?: number;
    syncedNames?: string[];
    updatedNames?: string[];
    duration?: number;
  },
  _i: number
) {
  const gs = loadCode({ props: { syncHistory: JSON.stringify([r]) } });
  return gs.getHistory().history[0];
}

describe('getHistory transform', () => {
  it('maps a successful sync run correctly', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 5, updated: 2, errors: 0 },
      0
    );
    expect(result.id).toBe('2025-01-01T00:00:00.000Z');
    expect(result.timestamp).toBe('2025-01-01T00:00:00.000Z');
    expect(result.filesProcessed).toBe(7);
    expect(result.status).toBe('success');
    expect(result.message).toBe('5 synced, 2 updated');
  });

  it('returns partial status when there are errors but some files synced', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 3, updated: 0, errors: 2 },
      0
    );
    expect(result.status).toBe('partial');
    expect(result.message).toContain('2 errors');
  });

  it('returns error status when no files synced and there are errors', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 0, updated: 0, errors: 5 },
      0
    );
    expect(result.status).toBe('error');
    expect(result.filesProcessed).toBe(0);
  });

  it('handles undefined synced/updated/errors gracefully', () => {
    const result = transformHistoryRecord({ date: '2025-01-01T00:00:00.000Z' }, 0);
    expect(result.filesProcessed).toBe(0);
    expect(result.status).toBe('success');
    expect(result.message).toBe('0 synced, 0 updated');
  });

  it('passes through syncedNames and updatedNames when present', () => {
    const result = transformHistoryRecord(
      {
        date: '2025-01-01T00:00:00.000Z',
        synced: 2,
        updated: 1,
        errors: 0,
        syncedNames: ['Weekly Sync', '1:1 Lucas'],
        updatedNames: ['Team standup'],
      },
      0
    );
    expect(result.syncedNames).toEqual(['Weekly Sync', '1:1 Lucas']);
    expect(result.updatedNames).toEqual(['Team standup']);
  });

  it('defaults syncedNames, updatedNames to [] and duration to null when absent', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 1, updated: 0, errors: 0 },
      0
    );
    expect(result.syncedNames).toEqual([]);
    expect(result.updatedNames).toEqual([]);
    expect(result.duration).toBeNull();
  });

  it('passes through duration when present', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 1, updated: 0, errors: 0, duration: 4200 },
      0
    );
    expect(result.duration).toBe(4200);
  });
});
