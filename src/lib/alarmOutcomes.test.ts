import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushAlarmOutcome, getAlarmOutcomes, MAX_ALARM_OUTCOMES } from './alarmOutcomes';

beforeEach(() => {
  const store: Record<string, unknown> = {};
  globalThis.chrome = {
    ...(globalThis.chrome ?? {}),
    storage: {
      ...(globalThis.chrome?.storage ?? {}),
      local: {
        get: vi.fn((_key, cb?: (v: unknown) => void) => {
          const value = { alarmOutcomes: store.alarmOutcomes ?? [] };
          if (cb) cb(value);
          return Promise.resolve(value);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(store, items);
          return Promise.resolve();
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe('alarmOutcomes', () => {
  it('appends a new outcome', async () => {
    await pushAlarmOutcome({ timestamp: '2026-06-01T00:00:00Z', ok: true, durationMs: 1200 });
    const all = await getAlarmOutcomes();
    expect(all).toHaveLength(1);
    expect(all[0].ok).toBe(true);
  });

  it(`caps at ${MAX_ALARM_OUTCOMES} entries, evicting oldest`, async () => {
    for (let i = 0; i < MAX_ALARM_OUTCOMES + 5; i++) {
      await pushAlarmOutcome({ timestamp: `2026-06-01T00:00:${String(i).padStart(2, '0')}Z`, ok: true });
    }
    const all = await getAlarmOutcomes();
    expect(all).toHaveLength(MAX_ALARM_OUTCOMES);
    expect(all[all.length - 1].timestamp).toContain(':24Z');
  });

  it('records a failed outcome with error string', async () => {
    await pushAlarmOutcome({ timestamp: '2026-06-01T00:00:00Z', ok: false, error: 'TIMEOUT' });
    const all = await getAlarmOutcomes();
    expect(all[0].ok).toBe(false);
    expect(all[0].error).toBe('TIMEOUT');
  });
});
