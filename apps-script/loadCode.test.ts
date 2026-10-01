import { describe, it, expect } from 'vitest';
import { loadCode } from './loadCode';

describe('loadCode harness', () => {
  it('runs pure functions from the real Code.gs', () => {
    const gs = loadCode();
    expect(gs.matchesPattern_('Weekly sync - Notes', 'Weekly*')).toBe(true);
    expect(gs.matchesPattern_('Other', 'Weekly*')).toBe(false);
  });

  it('applies CONFIG_OVERRIDES from injected script properties on load', () => {
    const gs = loadCode({ props: { CONFIG_OVERRIDES: JSON.stringify({ MAX_FILES_PER_RUN: 7 }) } });
    expect(gs.CONFIG.MAX_FILES_PER_RUN).toBe(7);
  });
});
