import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/alarmOutcomes', () => ({ pushAlarmOutcome: vi.fn() }));

const getAuthToken = chrome.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>;
const removeCachedAuthToken = chrome.identity.removeCachedAuthToken as unknown as ReturnType<typeof vi.fn>;

let onAlarm: (alarm: { name: string }) => Promise<void>;

describe('background auto-sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    chrome.runtime.lastError = undefined;
    Object.assign(chrome, {
      alarms: {
        clear: vi.fn(),
        create: vi.fn(),
        onAlarm: { addListener: vi.fn((fn) => { onAlarm = fn; }) },
      },
    });
    Object.assign(chrome.storage, { onChanged: { addListener: vi.fn() } });
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      deploymentUrl: 'https://script.google.com/macros/s/AKfy/exec',
      autoSyncEnabled: true,
    });
    getAuthToken.mockImplementation((opts: { scopes?: string[] }, cb: (t?: string) => void) =>
      cb(opts.scopes ? 'narrow-token' : 'full-token'),
    );
    removeCachedAuthToken.mockImplementation((_d: unknown, cb: () => void) => cb());
    await import('@/background');
  });

  it('syncs with the narrow (openid email) token', async () => {
    const body = JSON.stringify({ success: true, result: {} });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => body });
    await onAlarm({ name: 'auto-sync' });
    expect(getAuthToken).toHaveBeenCalledWith({ interactive: false, scopes: ['openid', 'email'] }, expect.any(Function));
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(new URL(url).searchParams.get('token')).toBe('narrow-token');
  });

  it('on 401 evicts both cached tokens', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    await onAlarm({ name: 'auto-sync' });
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'narrow-token' }, expect.any(Function));
    expect(removeCachedAuthToken).toHaveBeenCalledWith({ token: 'full-token' }, expect.any(Function));
  });
});
