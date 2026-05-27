import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupWizard } from '@/components/SetupWizard';

// Mock api module — tests control getStatus behavior per-test
vi.mock('@/lib/api', () => ({
  api: {
    getStatus: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    signIn: vi.fn().mockResolvedValue('test-token'),
  })),
}));

// Mock useSettingsStore
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    setDeploymentUrl: vi.fn(),
    setScriptId: vi.fn(),
  })),
}));

const VALID_URL = 'https://script.google.com/macros/s/test/exec';
const VALID_SID = '1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02';

describe('SetupWizard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { api } = await import('@/lib/api');
    (api.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      signIn: vi.fn().mockResolvedValue('test-token'),
    });

    const { useSettingsStore } = await import('@/store/settingsStore');
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setDeploymentUrl: vi.fn(),
      setScriptId: vi.fn(),
    });
    (useSettingsStore as unknown as { getState: () => { setError: ReturnType<typeof vi.fn> } }).getState = vi.fn().mockReturnValue({
      setError: vi.fn(),
    });

    (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockImplementation(
      (_data: Record<string, unknown>, cb: () => void) => cb()
    );
    (chrome.storage.sync.remove as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  });

  function fillForm() {
    const urlInput = screen.getByLabelText(/apps script deployment url/i);
    const sidInput = screen.getByLabelText(/script project id/i);
    return { urlInput, sidInput };
  }

  async function fillAndSubmit(url: string, sid: string) {
    const { urlInput, sidInput } = fillForm();
    await userEvent.type(urlInput, url);
    await userEvent.type(sidInput, sid);
    await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
  }

  it('renders the setup form', () => {
    render(<SetupWizard />);
    expect(screen.getByText(/setup required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apps script deployment url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/script project id/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & connect/i })).toBeInTheDocument();
  });

  it('button is disabled when fields are empty', () => {
    render(<SetupWizard />);
    expect(screen.getByRole('button', { name: /save & connect/i })).toBeDisabled();
  });

  it('shows validation error for non-script.google.com URL', async () => {
    render(<SetupWizard />);
    const { urlInput } = fillForm();
    await userEvent.type(urlInput, 'https://example.com/exec');
    expect(
      screen.getByText(/must start with https:\/\/script\.google\.com\//i)
    ).toBeInTheDocument();
  });

  it('button is disabled when URL is invalid', async () => {
    render(<SetupWizard />);
    const { urlInput } = fillForm();
    await userEvent.type(urlInput, 'https://example.com/exec');
    expect(screen.getByRole('button', { name: /save & connect/i })).toBeDisabled();
  });

  it('saves URL and scriptId to chrome.storage.sync on submit', async () => {
    render(<SetupWizard />);
    await fillAndSubmit(VALID_URL, VALID_SID);
    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        { deploymentUrl: VALID_URL, scriptId: VALID_SID },
        expect.any(Function)
      );
    });
  });

  it('shows error and removes stored values when signIn fails', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      signIn: vi.fn().mockRejectedValue(new Error('OAuth cancelled')),
    });
    render(<SetupWizard />);
    await fillAndSubmit(VALID_URL, VALID_SID);
    await waitFor(() => {
      expect(screen.getByText(/OAuth cancelled/i)).toBeInTheDocument();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(['deploymentUrl', 'scriptId']);
    });
  });

  it('calls api.getStatus with the token after signIn succeeds', async () => {
    const { api } = await import('@/lib/api');
    render(<SetupWizard />);
    await fillAndSubmit(VALID_URL, VALID_SID);
    await waitFor(() => {
      expect(api.getStatus).toHaveBeenCalledWith('test-token');
    });
  });

  it('shows HTML error and removes stored values when connection test returns HTML', async () => {
    const { api } = await import('@/lib/api');
    (api.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Apps Script returned HTML instead of JSON')
    );
    render(<SetupWizard />);
    await fillAndSubmit(VALID_URL, VALID_SID);
    await waitFor(() => {
      expect(screen.getByText(/Apps Script deployment not responding correctly/i)).toBeInTheDocument();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(['deploymentUrl', 'scriptId']);
    });
  });

  it('shows network error and removes stored values when connection test throws TypeError', async () => {
    const { api } = await import('@/lib/api');
    (api.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    render(<SetupWizard />);
    await fillAndSubmit(VALID_URL, VALID_SID);
    await waitFor(() => {
      expect(screen.getByText(/Could not reach the deployment URL/i)).toBeInTheDocument();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith(['deploymentUrl', 'scriptId']);
    });
  });
});
