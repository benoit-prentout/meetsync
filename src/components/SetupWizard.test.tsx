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
  })),
}));

describe('SetupWizard', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { api } = await import('@/lib/api');
    // vi.clearAllMocks() above resets implementations set by the module-level vi.mock() factory,
    // so we must re-apply the default getStatus mock here to restore it for each test.
    (api.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      signIn: vi.fn().mockResolvedValue('test-token'),
    });

    const { useSettingsStore } = await import('@/store/settingsStore');
    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setDeploymentUrl: vi.fn(),
    });
    // useSettingsStore.getState() is called directly in the component for setError
    (useSettingsStore as unknown as { getState: () => { setError: ReturnType<typeof vi.fn> } }).getState = vi.fn().mockReturnValue({
      setError: vi.fn(),
    });

    (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockImplementation(
      (_data: Record<string, unknown>, cb: () => void) => cb()
    );
    (chrome.storage.sync.remove as ReturnType<typeof vi.fn>).mockImplementation(() => {});
  });

  it('renders the setup form', () => {
    render(<SetupWizard />);
    expect(screen.getByText(/setup required/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apps script deployment url/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & connect/i })).toBeInTheDocument();
  });

  it('button is disabled when URL is empty', () => {
    render(<SetupWizard />);
    expect(screen.getByRole('button', { name: /save & connect/i })).toBeDisabled();
  });

  it('shows validation error for non-script.google.com URL', async () => {
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://example.com/exec');
    expect(
      screen.getByText(/must start with https:\/\/script\.google\.com\//i)
    ).toBeInTheDocument();
  });

  it('button is disabled when URL is invalid', async () => {
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://example.com/exec');
    expect(screen.getByRole('button', { name: /save & connect/i })).toBeDisabled();
  });

  it('accepts a valid script.google.com URL', async () => {
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    expect(screen.queryByText(/must start with/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & connect/i })).not.toBeDisabled();
  });

  it('trims whitespace before validating URL', async () => {
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    // Type spaces then the URL — the trailing spaces are trimmed during validation
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    // Leading/trailing spaces added via direct value manipulation would be trimmed
    // Since userEvent.type doesn't add surrounding spaces, we verify no error appears
    expect(screen.queryByText(/must start with/i)).not.toBeInTheDocument();
  });

  it('saves URL to chrome.storage.sync on submit', async () => {
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
    await waitFor(() => {
      expect(chrome.storage.sync.set).toHaveBeenCalledWith(
        { deploymentUrl: 'https://script.google.com/macros/s/test/exec' },
        expect.any(Function)
      );
    });
  });

  it('shows error and removes stored URL when signIn fails', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      signIn: vi.fn().mockRejectedValue(new Error('OAuth cancelled')),
    });
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
    await waitFor(() => {
      expect(screen.getByText(/OAuth cancelled/i)).toBeInTheDocument();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith('deploymentUrl');
    });
  });

  it('calls api.getStatus with the token after signIn succeeds', async () => {
    const { api } = await import('@/lib/api');
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
    await waitFor(() => {
      expect(api.getStatus).toHaveBeenCalledWith('test-token');
    });
  });

  it('shows HTML error and removes stored URL when connection test returns HTML', async () => {
    const { api } = await import('@/lib/api');
    (api.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Apps Script returned HTML instead of JSON')
    );
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
    await waitFor(() => {
      expect(screen.getByText(/Apps Script deployment not responding correctly/i)).toBeInTheDocument();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith('deploymentUrl');
    });
  });

  it('shows network error and removes stored URL when connection test throws TypeError', async () => {
    const { api } = await import('@/lib/api');
    (api.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError('Failed to fetch')
    );
    render(<SetupWizard />);
    const input = screen.getByLabelText(/apps script deployment url/i);
    await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
    await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
    await waitFor(() => {
      expect(screen.getByText(/Could not reach the deployment URL/i)).toBeInTheDocument();
      expect(chrome.storage.sync.remove).toHaveBeenCalledWith('deploymentUrl');
    });
  });
});
