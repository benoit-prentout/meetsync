import { useEffect, useState } from 'react';
import { GithubIcon } from '@/components/ui/GithubIcon';
import { useAuth } from '@/hooks/useAuth';
import { useSettingsStore } from '@/store/settingsStore';
import { api } from '@/lib/api';
import { isAppsScriptExecUrl } from '@/lib/deploymentUrl';
import { decodeConnectionCode } from '@/lib/connectionCode';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MeetSyncMark } from '@/components/Brand';

// The toolbar popup closes on blur (e.g. when switching tabs to copy the script ID),
// which wipes React state. Keep the two (non-secret) fields as a draft in storage.local.
const DRAFT_KEY = 'setupWizardDraft';
type Draft = { url: string; scriptId: string };

// ponytail: best-effort, storage errors (sync throws or rejections) are ignored.
function saveDraft(draft: Draft | null) {
  Promise.resolve()
    .then(() => (draft ? chrome.storage.local.set({ [DRAFT_KEY]: draft }) : chrome.storage.local.remove(DRAFT_KEY)))
    .catch(() => {});
}

export function SetupWizard() {
  const { signIn } = useAuth();
  const { setDeploymentUrl, setScriptId } = useSettingsStore();
  const [url, setUrl] = useState('');
  const [scriptIdValue, setScriptIdValue] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [scriptIdError, setScriptIdError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'verifying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    Promise.resolve()
      .then(() => chrome.storage.local.get(DRAFT_KEY))
      .then((result) => {
        const draft = result?.[DRAFT_KEY] as Partial<Draft> | undefined;
        // Functional updates: never clobber anything typed before the read resolved
        if (draft?.url) setUrl((prev) => prev || draft.url!);
        if (draft?.scriptId) setScriptIdValue((prev) => prev || draft.scriptId!);
        if (draft?.url || draft?.scriptId) setManualOpen(true);
      })
      .catch(() => {});
  }, []);

  function validateUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'Deployment URL is required';
    if (!isAppsScriptExecUrl(trimmed)) {
      return 'URL must start with https://script.google.com/ and look like …/macros/s/<id>/exec';
    }
    return null;
  }

  function validateScriptId(value: string): string | null {
    const trimmed = value.trim();
    // Optional: only "Deploy Update" in Settings needs it.
    if (trimmed && trimmed.length < 20) return 'Script project ID looks too short';
    return null;
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setUrl(value);
    setUrlError(validateUrl(value));
    setCodeError(null);
    saveDraft({ url: value, scriptId: scriptIdValue });
  }

  function handleScriptIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setScriptIdValue(value);
    setScriptIdError(validateScriptId(value));
    setCodeError(null);
    saveDraft({ url, scriptId: value });
  }

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setCode(value);
    if (!value.trim()) {
      setCodeError(null);
      return;
    }
    const decoded = decodeConnectionCode(value);
    if (!decoded) {
      setCodeError('That connection code is not valid. Copy it again from 🚀 NotebookLM → 🔌 Connect extension in your Google Doc.');
      return;
    }
    setCodeError(null);
    setUrl(decoded.url);
    setUrlError(null);
    setScriptIdValue(decoded.scriptId ?? '');
    setScriptIdError(null);
    saveDraft({ url: decoded.url, scriptId: decoded.scriptId ?? '' });
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
      const sid = scriptIdValue.trim();
      await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ deploymentUrl: url.trim(), ...(sid && { scriptId: sid }) }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
      // Note: signIn() internally calls api.getSettings() and swallows errors.
      // api.getStatus() below is the first validated round-trip to the backend.
      const token = await signIn();
      setPhase('verifying');
      await api.getStatus(token);
      saveDraft(null);
      // Only transition to Dashboard after connection test succeeds
      setDeploymentUrl(url.trim());
      if (sid) setScriptId(sid);
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
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <MeetSyncMark size={28} />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 leading-tight">MeetSync</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Setup required</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-500">
            In your Google Doc, open <strong>🚀 NotebookLM → 🔌 Connect extension</strong> and paste the code here.
          </p>
          <div className="space-y-2">
            <Label htmlFor="connection-code">Connection code</Label>
            <Input
              id="connection-code"
              placeholder="eyJ2IjoxLCJ1cmwiOiJodHRwczovL3Nj…"
              value={code}
              onChange={handleCodeChange}
              disabled={phase !== 'idle'}
            />
            {codeError && (
              <p className="text-sm text-red-600">{codeError}</p>
            )}
          </div>
          <details open={manualOpen} onToggle={(e) => setManualOpen(e.currentTarget.open)} className="space-y-4">
            <summary className="text-xs text-slate-500 cursor-pointer">Or enter the URL and script ID manually</summary>
          <div className="space-y-2 mt-3">
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
            <Label htmlFor="script-id">Script Project ID (optional)</Label>
            <p className="text-[11px] text-slate-400">Only needed for Deploy Update in Settings. Found in the Apps Script editor URL, after <code className="text-slate-500">/home/projects/</code>.</p>
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
          </details>
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <button
            onClick={handleSave}
            disabled={phase !== 'idle' || !!urlError || !!codeError || !url}
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
                chrome.tabs.create({ url: 'https://github.com/benoit-prentout/meetsync#-quick-start' });
              }}
              className="underline hover:text-slate-600 transition-colors"
            >
              See the setup guide
            </a>
          </p>
        </div>
      </div>
      <div className="mt-2 text-center">
        <button
          onClick={() => chrome.tabs.create({ url: 'https://github.com/benoit-prentout/meetsync' })}
          className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
        >
          <GithubIcon className="w-3 h-3" />
          Star on GitHub
        </button>
      </div>
    </div>
  );
}
