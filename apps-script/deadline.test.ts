// Mirrors apps-script/Code.gs apiCallWithDeadline_ (added in Task 6).
// If you change one, update the other — there is no shared module.
import { describe, it, expect, vi } from 'vitest';

class DeadlineExceededError extends Error {
  constructor() { super('DEADLINE_EXCEEDED'); }
}

function apiCallWithDeadline(
  fn: () => unknown,
  deadlineEpochMs: number,
  maxRetries = 3,
  now: () => number = Date.now,
  sleep: (ms: number) => void = () => {}
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (now() >= deadlineEpochMs) throw new DeadlineExceededError();
    try { return fn(); }
    catch (e) {
      lastError = e;
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 500;
        if (now() + delay >= deadlineEpochMs) throw new DeadlineExceededError();
        sleep(delay);
      }
    }
  }
  throw lastError;
}

describe('apiCallWithDeadline', () => {
  it('returns result on first success', () => {
    const fn = vi.fn(() => 'ok');
    expect(apiCallWithDeadline(fn, Date.now() + 60_000)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('retries on failure then succeeds', () => {
    let n = 0;
    const fn = () => { if (n++ < 2) throw new Error('flaky'); return 'ok'; };
    expect(apiCallWithDeadline(fn, Date.now() + 60_000, 3)).toBe('ok');
  });
  it('throws DEADLINE_EXCEEDED if now() is already past deadline', () => {
    expect(() => apiCallWithDeadline(() => 'x', Date.now() - 1)).toThrow('DEADLINE_EXCEEDED');
  });
  it('throws DEADLINE_EXCEEDED when backoff would cross deadline', () => {
    let n = 0;
    const fn = () => { n++; throw new Error('boom'); };
    let t = 0;
    const now = () => t;
    const sleep = (ms: number) => { t += ms; };
    // deadline at 600ms; first call fails at t=0, backoff 500ms would land at t=500 (under),
    // second call fails at t=500, backoff 1000ms would land at t=1500 → exceeds deadline.
    expect(() => apiCallWithDeadline(fn, 600, 3, now, sleep)).toThrow('DEADLINE_EXCEEDED');
    expect(n).toBe(2);
  });
  it('rethrows last error if all retries fail within deadline', () => {
    const fn = () => { throw new Error('persistent'); };
    expect(() => apiCallWithDeadline(fn, Date.now() + 60_000, 2)).toThrow('persistent');
  });
});
