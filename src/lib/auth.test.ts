import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBackendToken, getDeployToken, clearCachedTokens } from './auth';

const getAuthToken = chrome.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>;
const removeCachedAuthToken = chrome.identity.removeCachedAuthToken as unknown as ReturnType<typeof vi.fn>;

describe('auth tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
    // Narrow token when scopes are overridden, full manifest-scope token otherwise
    getAuthToken.mockImplementation((opts: { scopes?: string[] }, cb: (t?: string) => void) =>
      cb(opts.scopes ? 'narrow-token' : 'full-token'),
    );
    removeCachedAuthToken.mockImplementation((_d: unknown, cb: () => void) => cb());
  });

  it('getBackendToken requests only openid + email', async () => {
    await expect(getBackendToken()).resolves.toBe('narrow-token');
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: false, scopes: ['openid', 'email'] }, expect.any(Function));
    await getBackendToken(true);
    expect(getAuthToken).toHaveBeenLastCalledWith({ interactive: true, scopes: ['openid', 'email'] }, expect.any(Function));
  });

  it('getDeployToken uses the manifest scopes (no scopes override)', async () => {
    await expect(getDeployToken(true)).resolves.toBe('full-token');
    const opts = getAuthToken.mock.calls[0][0];
    expect(opts).toEqual({ interactive: true });
    expect(opts).not.toHaveProperty('scopes');
  });

  it('rejects when chrome reports an error or returns no token', async () => {
    getAuthToken.mockImplementationOnce((_o: unknown, cb: (t?: string) => void) => {
      chrome.runtime.lastError = { message: 'OAuth2 not granted' };
      cb(undefined);
      chrome.runtime.lastError = undefined;
    });
    await expect(getBackendToken()).rejects.toThrow('OAuth2 not granted');
    getAuthToken.mockImplementationOnce((_o: unknown, cb: (t?: string) => void) => cb(undefined));
    await expect(getDeployToken()).rejects.toThrow('No auth token received');
  });

  it('clearCachedTokens evicts both cached tokens by their exact strings', async () => {
    await clearCachedTokens();
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'narrow-token' }, expect.any(Function));
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'full-token' }, expect.any(Function));
  });

  it('clearCachedTokens tolerates a missing token', async () => {
    getAuthToken.mockImplementation((opts: { scopes?: string[] }, cb: (t?: string) => void) =>
      cb(opts.scopes ? 'narrow-token' : undefined),
    );
    await clearCachedTokens();
    expect(removeCachedAuthToken).toHaveBeenCalledTimes(1);
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'narrow-token' }, expect.any(Function));
  });
});
