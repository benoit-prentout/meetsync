// Exercises the real apps-script/Code.gs appendRunLog_ / logRun_ via the loadCode harness.
import { describe, it, expect } from 'vitest';
import { loadCode, fillTo } from './loadCode';

type LogEntry = {
  startedAt: string;
  finishedAt: string;
  action: string;
  ok: boolean;
  error?: string;
  errorStack?: string;
};

function appendRunLog(existing: LogEntry[], entry: LogEntry): LogEntry[] {
  const props: Record<string, string> = { RUN_LOG: JSON.stringify(existing) };
  loadCode({ props }).appendRunLog_(entry);
  return JSON.parse(props.RUN_LOG);
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
});

describe('run log stays under the 9 KB property limit (F1b)', () => {
  const failed = (i: number, pad: string): LogEntry => ({
    startedAt: `2026-09-01T00:00:${String(i).padStart(2, '0')}.000Z`, finishedAt: '2026-09-01T00:01:00.000Z',
    action: 'runSync', ok: false, error: 'boom ' + i, errorStack: 'at x\n'.repeat(60) + pad,
  });

  it('a successful run is still reported as success when the log is full', () => {
    const old = fillTo(failed, 9200);
    const props: Record<string, string> = { RUN_LOG: JSON.stringify(old) };
    const gs = loadCode({ props });
    expect(gs.logRun_('runSync', () => ({ success: true }))).toEqual({ success: true });
    expect(props.RUN_LOG.length).toBeLessThanOrEqual(9000);
    const log = JSON.parse(props.RUN_LOG);
    expect(log.at(-1)).toMatchObject({ action: 'runSync', ok: true });
    expect(log.at(-2)).toEqual(old.at(-1)); // newest entries kept, oldest dropped
  });

  it('truncates error and errorStack of a failed run', () => {
    const props: Record<string, string> = {};
    const gs = loadCode({ props });
    const err = Object.assign(new Error('m'.repeat(2000)), { stack: 's'.repeat(5000) });
    expect(() => gs.logRun_('runArchive', () => { throw err; })).toThrow(err);
    const [entry] = JSON.parse(props.RUN_LOG);
    expect(entry.error.length).toBeLessThanOrEqual(500);
    expect(entry.errorStack.length).toBeLessThanOrEqual(500);
  });

  it('a failing property write never changes the run outcome', () => {
    const gs = loadCode();
    const real = gs.PropertiesService.getScriptProperties();
    gs.PropertiesService = { getScriptProperties: () => ({ ...real, setProperty: () => { throw new Error('quota'); } }) };
    expect(gs.logRun_('runSync', () => 'done')).toBe('done');
  });
});
