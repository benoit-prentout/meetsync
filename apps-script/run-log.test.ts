// Mirrors apps-script/Code.gs appendRunLog_ (added in Task 7).
import { describe, it, expect } from 'vitest';

type LogEntry = {
  startedAt: string;
  finishedAt: string;
  action: string;
  ok: boolean;
  error?: string;
  errorStack?: string;
};

function appendRunLog(existing: LogEntry[], entry: LogEntry, cap = 50): LogEntry[] {
  const next = existing.concat([entry]);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

describe('appendRunLog', () => {
  const entry = (i: number): LogEntry => ({
    startedAt: '2026-05-31T00:00:00.000Z', finishedAt: '2026-05-31T00:00:01.000Z',
    action: 'runSync', ok: i % 2 === 0,
  });
  it('appends to empty list', () => {
    expect(appendRunLog([], entry(0))).toHaveLength(1);
  });
  it('preserves insertion order', () => {
    const list = [entry(0), entry(1)];
    expect(appendRunLog(list, entry(2))[2]).toEqual(entry(2));
  });
  it('caps at 50, evicting oldest', () => {
    const list = Array.from({ length: 50 }, (_, i) => entry(i));
    const out = appendRunLog(list, entry(99));
    expect(out).toHaveLength(50);
    expect(out[49]).toEqual(entry(99));
    expect(out[0]).toEqual(entry(1)); // entry(0) evicted
  });
  it('respects custom cap', () => {
    const list = Array.from({ length: 5 }, (_, i) => entry(i));
    expect(appendRunLog(list, entry(99), 3)).toHaveLength(3);
  });
});
