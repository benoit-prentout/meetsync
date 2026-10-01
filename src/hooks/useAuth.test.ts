import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';
import { useSettingsStore } from '@/store/settingsStore';

const getAuthToken = chrome.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>;
const removeCachedAuthToken = chrome.identity.removeCachedAuthToken as unknown as ReturnType<typeof vi.fn>;

describe('useAuth — backend uses the narrow token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
    useSettingsStore.getState().logout();
    getAuthToken.mockImplementation((opts: { scopes?: string[] }, cb: (t?: string) => void) =>
      cb(opts.scopes ? 'narrow-token' : 'full-token'),
    );
    removeCachedAuthToken.mockImplementation((_d: unknown, cb: () => void) => cb());
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      deploymentUrl: 'https://script.google.com/macros/s/AKfy/exec',
    });
    const body = JSON.stringify({ success: true, settings: null });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => body });
  });

  it('signIn stores the narrow token and sends only it to the backend', async () => {
    const { result } = renderHook(() => useAuth());
    let token: string | undefined;
    await act(async () => { token = await result.current.signIn(); });

    expect(token).toBe('narrow-token');
    expect(useSettingsStore.getState().accessToken).toBe('narrow-token');
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: true, scopes: ['openid', 'email'] }, expect.any(Function));
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(new URL(url).searchParams.get('token')).toBe('narrow-token');
    expect(url).not.toContain('full-token');
  });

  it('signIn (and therefore 401 reauth) clears both cached tokens first', async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signIn(); });
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'narrow-token' }, expect.any(Function));
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'full-token' }, expect.any(Function));
  });

  it('signOut clears both cached tokens and logs out', async () => {
    useSettingsStore.getState().setAuthenticated('narrow-token');
    const { result } = renderHook(() => useAuth());
    await act(async () => { await result.current.signOut(); });
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'narrow-token' }, expect.any(Function));
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'full-token' }, expect.any(Function));
    expect(useSettingsStore.getState().accessToken).toBeNull();
    expect(useSettingsStore.getState().isAuthenticated).toBe(false);
  });
});
