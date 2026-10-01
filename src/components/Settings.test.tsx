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
