import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { loadCode, type FetchStub } from './loadCode';

const OWNER = 'owner@corp.com';
const COLLEAGUE = 'colleague@corp.com';

const tokenInfo = (body: Record<string, unknown>, code = 200): FetchStub =>
  vi.fn(() => ({ code, body: JSON.stringify(body) }));

function setup(o: {
  info?: Record<string, unknown>;
  code?: number;
  active?: string;
  effective?: string;
  props?: Record<string, string>;
  cache?: Record<string, string>;
}) {
  const props = o.props ?? {};
  const cache = o.cache ?? {};
  const fetch = tokenInfo(o.info ?? { email: OWNER, email_verified: 'true' }, o.code);
  const log = vi.fn();
  const gs = loadCode({
    props, cache, fetch,
    session: { activeEmail: o.active ?? '', effectiveEmail: o.effective ?? '' },
    globals: { Logger: { log } },
  });
  return { gs, props, cache, fetch, log };
}

describe('validateCaller_', () => {
  it('accepts the deployer (effective user)', () => {
    const { gs } = setup({ effective: OWNER, active: OWNER });
    expect(gs.validateCaller_('tok-owner')).toBe(true);
  });

  it('rejects a same-domain colleague whose active user matches their own token', () => {
    const { gs } = setup({ info: { email: COLLEAGUE, email_verified: 'true' }, active: COLLEAGUE, effective: OWNER });
    expect(gs.validateCaller_('tok-colleague')).toBe(false);
  });

  it('does not let the first caller take over when no owner is known', () => {
    const { gs, props, log } = setup({ info: { email: 'attacker@gmail.com', email_verified: 'true' }, active: 'attacker@gmail.com' });
    expect(gs.validateCaller_('tok-attacker')).toBe(false);
    expect(props.OWNER_EMAIL).toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('OWNER_EMAIL'));
  });

  it('never writes OWNER_EMAIL, even on success', () => {
    const { gs, props } = setup({ effective: OWNER });
    expect(gs.validateCaller_('tok-owner')).toBe(true);
    expect(props.OWNER_EMAIL).toBeUndefined();
  });

  it('falls back to a stored OWNER_EMAIL when the effective email is empty', () => {
    const { gs } = setup({ props: { OWNER_EMAIL: OWNER } });
    expect(gs.validateCaller_('tok-owner')).toBe(true);
  });

  it('rejects a non-owner against a stored OWNER_EMAIL fallback', () => {
    const { gs } = setup({ info: { email: COLLEAGUE }, props: { OWNER_EMAIL: OWNER } });
    expect(gs.validateCaller_('tok-colleague')).toBe(false);
  });

  it('prefers the effective user over a stale stored OWNER_EMAIL', () => {
    const { gs } = setup({ info: { email: 'old@corp.com' }, effective: OWNER, props: { OWNER_EMAIL: 'old@corp.com' } });
    expect(gs.validateCaller_('tok-old')).toBe(false);
  });

  it('compares emails case-insensitively and trimmed', () => {
    const { gs } = setup({ info: { email: 'Owner@Corp.com ' }, effective: ' OWNER@corp.com' });
    expect(gs.validateCaller_('tok-owner')).toBe(true);
  });

  it('rejects a missing token without calling tokeninfo', () => {
    const { gs, fetch } = setup({ effective: OWNER });
    expect(gs.validateCaller_('')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an expired/invalid token (tokeninfo non-200)', () => {
    const { gs } = setup({ code: 400, info: { error: 'invalid_token' }, effective: OWNER });
    expect(gs.validateCaller_('tok-expired')).toBe(false);
  });

  it('rejects a tokeninfo response without email', () => {
    const { gs } = setup({ info: { scope: 'openid' }, effective: OWNER });
    expect(gs.validateCaller_('tok-noemail')).toBe(false);
  });

  it.each([false, 'false'])('rejects email_verified=%s', (v) => {
    const { gs } = setup({ info: { email: OWNER, email_verified: v }, effective: OWNER });
    expect(gs.validateCaller_('tok-unverified')).toBe(false);
  });

  it('accepts boolean email_verified=true', () => {
    const { gs } = setup({ info: { email: OWNER, email_verified: true }, effective: OWNER });
    expect(gs.validateCaller_('tok-owner')).toBe(true);
  });

  it('caches only validated tokens', () => {
    const cache: Record<string, string> = {};
    const ok = setup({ cache, effective: OWNER });
    expect(ok.gs.validateCaller_('tok-owner')).toBe(true);
    expect(ok.gs.validateCaller_('tok-owner')).toBe(true);
    expect(ok.fetch).toHaveBeenCalledTimes(1);

    const bad = setup({ cache, info: { email: COLLEAGUE }, effective: OWNER });
    expect(bad.gs.validateCaller_('tok-colleague')).toBe(false);
    expect(bad.gs.validateCaller_('tok-colleague')).toBe(false);
    expect(bad.fetch).toHaveBeenCalledTimes(2);
    expect(Object.keys(cache)).toHaveLength(1);
  });

  it('keys the cache on a digest of the full token, not a prefix or the raw token', () => {
    const prefix = 'p'.repeat(32);
    const cache: Record<string, string> = {};
    const ok = setup({ cache, effective: OWNER });
    expect(ok.gs.validateCaller_(prefix + '-owner')).toBe(true);

    const key = Object.keys(cache)[0];
    expect(key).toMatch(/^auth_[0-9a-f]{64}$/);
    expect(key).not.toContain(prefix);
    expect(key).toBe('auth_' + createHash('sha256').update(prefix + '-owner').digest('hex'));

    const bad = setup({ cache, info: { email: COLLEAGUE }, effective: OWNER });
    expect(bad.gs.validateCaller_(prefix + '-other')).toBe(false);
    expect(bad.fetch).toHaveBeenCalledTimes(1);
  });
});
