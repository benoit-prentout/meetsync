import { describe, it, expect, vi } from 'vitest';
import { _dedupeForTest as dedupe } from './useApi';

describe('useApi dedupe', () => {
  it('shares a single in-flight promise for concurrent calls with the same key', async () => {
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('ok'), 10);
        }),
    );

    const p1 = dedupe('action', fn);
    const p2 = dedupe('action', fn);

    expect(p1).toBe(p2);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('ok');
    expect(r2).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clears the cache after a fulfilled promise so subsequent calls fire fn again', async () => {
    const fn = vi.fn(async () => 'value');

    await dedupe('action-fulfill', fn);
    await dedupe('action-fulfill', fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears the cache after a rejected promise', async () => {
    const fn = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(dedupe('action-reject', fn)).rejects.toThrow('boom');
    await expect(dedupe('action-reject', fn)).rejects.toThrow('boom');

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
