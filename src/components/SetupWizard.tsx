import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSettingsStore } from '@/store/settingsStore';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MeetSyncMark } from '@/components/Brand';

export function SetupWizard() {
  const { signIn } = useAuth();
  const { setDeploymentUrl, setScriptId } = useSettingsStore();
  const [url, setUrl] = useState('');
  const [scriptIdValue, setScriptIdValue] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [scriptIdError, setScriptIdError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'verifying'>('idle');
  const [error, setError] = useState<string | null>(null);

  function validateUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'Deployment URL is required';
    if (!trimmed.startsWith('https://script.google.com/')) {
      return 'URL must start with https://script.google.com/';
    }
    return null;
  }

  function validateScriptId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'Script project ID is required';
    if (trimmed.length < 20) return 'Script project ID looks too short';
    return null;
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setUrl(value);
    setUrlError(validateUrl(value));
  }

  function handleScriptIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setScriptIdValue(value);
    setScriptIdError(validateScriptId(value));
  }

  async function handleSave() {
    const validationError = validateUrl(url);
    if (validationError) {
      setUrlError(validationError);
      return;
    }
    const sidError = validateScriptId(scriptIdValue);
    if (sidError) {
      setScriptIdError(sidError);
      return;
    }
    setPhase('connecting');
    setError(null);
    useSettingsStore.getState().setError(null);
    try {
      await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ deploymentUrl: url.trim(), scriptId: scriptIdValue.trim() }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      // Note: signIn() internally calls api.getSettings() and swallows errors.
      // api.getStatus() below is the first validated round-trip to the backend.
      const token = await signIn();
      setPhase('verifying');
      await api.getStatus(token);
      // Only transition to Dashboard after connection test succeeds
      setDeploymentUrl(url.trim());
      setScriptId(scriptIdValue.trim());
    } catch (err) {
      chrome.storage.sync.remove(['deploymentUrl', 'scriptId']);
      if (err instanceof TypeError) {
        setError('Could not reach the deployment URL — check the URL and your internet connection.');
      } else if (err instanceof Error && err.message.includes('HTML')) {
        setError(
          "Apps Script deployment not responding correctly — make sure you saved Code.gs and deployed a new version (not an existing one) in the Apps Script editor."
        );
      } else if (err instanceof Error && /unauthori[sz]ed/i.test(err.message)) {
        setError(
          'Authorization failed — make sure the script is deployed as Execute as: Me and Who has access: Anyone.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
      }
    } finally {
      setPhase('idle');
    }
  }

  return (
    <div className="p-4 w-96">
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <MeetSyncMark size={28} />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 leading-tight">MeetSync for NotebookLM</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Setup required</p>
          </div>
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
              disabled={phase !== 'idle'}
            />
            {urlError && (
              <p className="text-sm text-red-600">{urlError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="script-id">Script Project ID</Label>
            <p className="text-[11px] text-slate-400">Found in the Apps Script editor URL under your project name, after <code className="text-slate-500">/home/projects/</code>.</p>
            <Input
              id="script-id"
              placeholder="1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02"
              value={scriptIdValue}
              onChange={handleScriptIdChange}
              disabled={phase !== 'idle'}
            />
            {scriptIdError && (
              <p className="text-sm text-red-600">{scriptIdError}</p>
            )}
          </div>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            onClick={handleSave}
            disabled={phase !== 'idle' || !!urlError || !url}
            className="w-full bg-[#1a73e8] hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {phase === 'verifying' ? 'Verifying…' : phase === 'connecting' ? 'Connecting…' : 'Save & Connect'}
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
