import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from '@/components/Settings';
import { useSettingsStore } from '@/store/settingsStore';

vi.mock('@/hooks/useApi', () => ({
  useApi: vi.fn(() => ({
    updateSettings: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@/lib/api', () => ({
  api: { getStatus: vi.fn().mockResolvedValue({ success: true }) },
}));

vi.mock('@/lib/deployApi', () => ({
  deployBackendUpdate: vi.fn().mockResolvedValue({ versionNumber: 7 }),
}));

describe('Settings — deployment URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({ deploymentUrl: null, accessToken: null, settings: null });
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
    );
  });

  async function enterUrl(url: string) {
    render(<Settings />);
    const input = screen.getByLabelText(/deployment url/i);
    await userEvent.type(input, url);
    await userEvent.click(screen.getAllByRole('button', { name: /update/i })[0]);
  }

  it('rejects a non-Apps-Script URL with a visible error and does not save it', async () => {
    await enterUrl('https://evil.example/macros/s/x/exec');
    expect(screen.getByText(/must look like https:\/\/script\.google\.com\/macros\/s\//i)).toBeInTheDocument();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().deploymentUrl).toBeNull();
  });

  it('saves a valid Apps Script URL', async () => {
    const url = 'https://script.google.com/macros/s/AKfy/exec';
    await enterUrl(url);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ deploymentUrl: url });
    expect(useSettingsStore.getState().deploymentUrl).toBe(url);
    expect(screen.queryByText(/must look like/i)).not.toBeInTheDocument();
  });
});

describe('Settings — deploy uses the full-scope token', () => {
  const getAuthToken = chrome.identity.getAuthToken as unknown as ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
    useSettingsStore.setState({
      deploymentUrl: 'https://script.google.com/macros/s/AKfy/exec',
      accessToken: 'narrow-token',
      scriptId: '1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02',
      settings: null,
    });
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_keys: unknown, cb: (r: Record<string, unknown>) => void) => cb({}),
    );
    getAuthToken.mockImplementation((opts: { scopes?: string[] }, cb: (t?: string) => void) =>
      cb(opts.scopes ? 'narrow-token' : 'full-token'),
    );
    const { api } = await import('@/lib/api');
    (api.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, backendIntegrity: 'stale' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('passes the manifest-scope token (not the backend token) to deployBackendUpdate', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    const { api } = await import('@/lib/api');
    render(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: /deploy update/i }));
    await screen.findByText(/deployed successfully/i);

    expect(api.getStatus).toHaveBeenCalledWith('narrow-token');
    const deployCall = getAuthToken.mock.calls.find(([opts]) => !('scopes' in opts));
    expect(deployCall?.[0]).toEqual({ interactive: true });
    const args = (deployBackendUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[args.length - 1]).toBe('full-token');
  });
});
