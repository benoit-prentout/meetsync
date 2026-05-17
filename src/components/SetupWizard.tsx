import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSettingsStore } from '@/store/settingsStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetupWizard() {
  const { signIn } = useAuth();
  const { setDeploymentUrl } = useSettingsStore();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'Deployment URL is required';
    if (!trimmed.startsWith('https://script.google.com/')) {
      return 'URL must start with https://script.google.com/';
    }
    return null;
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setUrl(value);
    setUrlError(validateUrl(value));
  }

  async function handleSave() {
    const validationError = validateUrl(url);
    if (validationError) {
      setUrlError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    useSettingsStore.getState().setError(null);
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ deploymentUrl: url.trim() }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      await signIn();
      // Only transition to Dashboard after auth succeeds
      setDeploymentUrl(url.trim());
    } catch (err) {
      // Roll back the stored URL so the user can retry
      chrome.storage.sync.remove('deploymentUrl');
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 w-96">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Setup Required</h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-500">
            Enter your Apps Script deployment URL to get started.
          </p>
          <div className="space-y-2">
            <Label htmlFor="deployment-url">Apps Script Deployment URL</Label>
            <Input
              id="deployment-url"
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={url}
              onChange={handleUrlChange}
              disabled={saving}
            />
            {urlError && (
              <p className="text-sm text-red-600">{urlError}</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !!urlError || !url}
            className="w-full bg-[#1a73e8] hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? 'Connecting...' : 'Save & Connect'}
          </button>
          <p className="text-xs text-slate-400 text-center">
            Need help?{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                chrome.tabs.create({ url: 'https://github.com/benoit-prentout/google-meet-gemini-to-notebooklm/blob/main/docs/google-cloud-setup.md' });
              }}
              className="underline hover:text-slate-600 transition-colors"
            >
              See the setup guide
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
