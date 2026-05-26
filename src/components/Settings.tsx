import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { ExternalLink, Save, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useApi } from '@/hooks/useApi';
import { extractDocId, extractFolderId } from '@/lib/googleIds';
import { api } from '@/lib/api';
import { EXPECTED_BACKEND_HASH } from '@/lib/backendChecksum';

export function Settings() {
  const { settings, updateSetting, setError, error, isLoading, deploymentUrl, setDeploymentUrl } = useSettingsStore();
  const accessToken = useSettingsStore((state) => state.accessToken);
  const { updateSettings, getSettings } = useApi();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(false);
  const [autoSyncInterval, setAutoSyncIntervalState] = useState(60);
  const [deploymentUrlInput, setDeploymentUrlInput] = useState('');
  const [docIdError, setDocIdError] = useState<string | null>(null);
  const [folderIdError, setFolderIdError] = useState<string | null>(null);
  const [settingsSnapshot, setSettingsSnapshot] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'up-to-date' | 'update-available' | 'unknown'>('checking');

  useEffect(() => {
    if (settings) {
      setSettingsSnapshot(JSON.stringify(settings));
    }
  }, [!!settings]);

  const isDirty = settingsSnapshot !== null && settings
    ? JSON.stringify(settings) !== settingsSnapshot
    : false;

  useEffect(() => {
    chrome.storage.sync.get(['autoSyncEnabled', 'autoSyncIntervalMinutes', 'deploymentUrl'], (result) => {
      if (result.autoSyncEnabled !== undefined) setAutoSyncEnabledState(Boolean(result.autoSyncEnabled));
      if (result.autoSyncIntervalMinutes !== undefined) setAutoSyncIntervalState(Number(result.autoSyncIntervalMinutes));
      if (result.deploymentUrl) setDeploymentUrlInput(String(result.deploymentUrl));
    });
  }, []);

  const setAutoSyncEnabled = (val: boolean) => {
    setAutoSyncEnabledState(val);
    chrome.storage.sync.set({ autoSyncEnabled: val, autoSyncIntervalMinutes: autoSyncInterval });
  };

  const setAutoSyncInterval = (val: number) => {
    setAutoSyncIntervalState(val);
    chrome.storage.sync.set({ autoSyncEnabled: autoSyncEnabled, autoSyncIntervalMinutes: val });
  };

  useEffect(() => {
    if (!settings) {
      getSettings().catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!deploymentUrl || !accessToken) {
      setBackendStatus('unknown');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await api.getStatus(accessToken);
        if (cancelled) return;
        if (status.backendIntegrity) {
          setBackendStatus(status.backendIntegrity === EXPECTED_BACKEND_HASH ? 'up-to-date' : 'update-available');
        } else {
          setBackendStatus('unknown');
        }
      } catch {
        if (!cancelled) setBackendStatus('unknown');
      }
    })();
    return () => { cancelled = true; };
  }, [deploymentUrl, accessToken]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await updateSettings(settings);
      setSaved(true);
      setSettingsSnapshot(JSON.stringify(settings));
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDeploymentUrl = () => {
    const trimmed = deploymentUrlInput.trim();
    if (!trimmed) return;
    chrome.storage.sync.set({ deploymentUrl: trimmed });
    setDeploymentUrl(trimmed);
    getSettings().catch(() => {});
  };

  return (
    <div className="grid gap-6">
      {/* Apps Script Deployment — always visible so it's accessible even when settings fail */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-900 mb-1">Apps Script Deployment</p>
        <p className="text-xs text-slate-400 mb-3">The URL of your deployed Apps Script web app.</p>
        <div className="space-y-2">
          <Label htmlFor="deploymentUrl">Deployment URL</Label>
          <div className="flex items-center gap-2">
            <Input
              id="deploymentUrl"
              value={deploymentUrlInput}
              onChange={(e) => setDeploymentUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDeploymentUrl}
              disabled={!deploymentUrlInput.trim() || deploymentUrlInput.trim() === (deploymentUrl ?? '')}
            >
              Update
            </Button>
          </div>
          {deploymentUrl && deploymentUrlInput.trim() === deploymentUrl && (
            <p className="text-[10px] text-slate-400 truncate">{deploymentUrl}</p>
          )}
        </div>
        {/* Backend Status */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Backend Status</span>
            <span className="text-xs flex items-center gap-1.5">
              {backendStatus === 'checking' && (
                <><RefreshCw className="w-3 h-3 text-slate-400 motion-safe:animate-spin" /><span className="text-slate-400">Checking...</span></>
              )}
              {backendStatus === 'up-to-date' && (
                <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /><span className="text-green-700">Up to date</span></>
              )}
              {backendStatus === 'update-available' && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  <span className="text-amber-700">Update available</span>
                </div>
              )}
              {backendStatus === 'unknown' && (
                <><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /><span className="text-red-600">Could not verify</span></>
              )}
            </span>
          </div>
        </div>
      </div>

      {!settings && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 flex flex-col items-center gap-3 text-center">
          {error ? (
            <>
              <p className="text-xs font-semibold text-red-600">Failed to load settings</p>
              <p className="text-xs text-slate-500 max-w-xs">{error}</p>
            </>
          ) : (
            <p className="text-xs text-slate-400">Loading settings…</p>
          )}
          {!isLoading && (
            <Button
              variant="link"
              size="sm"
              onClick={() => getSettings().catch(() => {})}
            >
              <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
              Try again
            </Button>
          )}
          {isLoading && (
            <RefreshCw className="w-3.5 h-3.5 text-slate-400 motion-safe:animate-spin" aria-hidden="true" />
          )}
        </div>
      )}

      {settings && (<>

      {/* Google Drive Configuration */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-900 mb-3">Google Drive Configuration</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="masterDocId">Master Document ID</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
                <span className="shrink-0 px-3 py-2 text-sm text-slate-400 bg-slate-50 border-r border-input select-none cursor-default whitespace-nowrap">
                  https://docs.google.com/document/d/
                </span>
                <input
                  id="masterDocId"
                  className="flex-1 h-10 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                  value={settings.masterDocId || ''}
                  onChange={(e) => {
                    updateSetting('masterDocId', e.target.value);
                    if (docIdError) setDocIdError(null);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    const id = extractDocId(pasted);
                    if (id) {
                      e.preventDefault();
                      updateSetting('masterDocId', id);
                      setDocIdError(null);
                    } else if (pasted.includes('://')) {
                      e.preventDefault();
                      setDocIdError('Pasted URL is not a valid Google Docs link');
                    }
                  }}
                  onBlur={() => {
                    const val = settings.masterDocId?.trim();
                    if (!val) {
                      setDocIdError('Master Document ID is required');
                    } else if (val.includes('://')) {
                      setDocIdError('Enter a Google Doc ID, not a generic URL');
                    } else {
                      setDocIdError(null);
                    }
                  }}
                  placeholder="document-id"
                />
              </div>
              {settings.masterDocId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => chrome.tabs.create({ url: `https://docs.google.com/document/d/${settings.masterDocId}` })}
                  aria-label="Open master document"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            {docIdError && (
              <p className="text-[10px] text-red-500">{docIdError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="archiveFolderId">Archive Folder ID</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0">
                <span className="shrink-0 px-3 py-2 text-sm text-slate-400 bg-slate-50 border-r border-input select-none cursor-default whitespace-nowrap">
                  https://drive.google.com/drive/folders/
                </span>
                <input
                  id="archiveFolderId"
                  className="flex-1 h-10 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                  value={settings.archiveFolderId || ''}
                  onChange={(e) => {
                    updateSetting('archiveFolderId', e.target.value);
                    if (folderIdError) setFolderIdError(null);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    const id = extractFolderId(pasted);
                    if (id) {
                      e.preventDefault();
                      updateSetting('archiveFolderId', id);
                      setFolderIdError(null);
                    } else if (pasted.includes('://')) {
                      e.preventDefault();
                      setFolderIdError('Pasted URL is not a valid Google Drive link');
                    }
                  }}
                  onBlur={() => {
                    const val = settings.archiveFolderId?.trim();
                    if (!val) {
                      setFolderIdError('Archive Folder ID is required');
                    } else if (val.includes('://')) {
                      setFolderIdError('Enter a Google Drive Folder ID, not a generic URL');
                    } else {
                      setFolderIdError(null);
                    }
                  }}
                  placeholder="folder-id"
                />
              </div>
              {settings.archiveFolderId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => chrome.tabs.create({ url: `https://drive.google.com/drive/folders/${settings.archiveFolderId}` })}
                  aria-label="Open archive folder"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            {folderIdError && (
              <p className="text-[10px] text-red-500">{folderIdError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sourceFolderName">Source Folder Name</Label>
            <Input
              id="sourceFolderName"
              value={settings.sourceFolderName || ''}
              onChange={(e) => updateSetting('sourceFolderName', e.target.value)}
              placeholder="Meet Notes"
            />
          </div>
        </div>
      </div>

      {/* Sync Settings */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-900 mb-3">Sync Settings</p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Enable Update Detection</Label>
            <Switch
              checked={settings.enableUpdateDetection}
              onClick={() => updateSetting('enableUpdateDetection', !settings.enableUpdateDetection)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Email Notifications</Label>
              <p className="text-[10px] text-slate-400 mt-0.5">Receive email alerts on sync failures</p>
            </div>
            <Switch
              checked={settings.enableNotifications}
              onClick={() => updateSetting('enableNotifications', !settings.enableNotifications)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Enable Monthly Archive</Label>
            <Switch
              checked={settings.enableMonthlyArchive}
              onClick={() => updateSetting('enableMonthlyArchive', !settings.enableMonthlyArchive)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxFilesPerRun">Max Files Per Run</Label>
              <Input
                id="maxFilesPerRun"
                type="number"
                value={settings.maxFilesPerRun}
                onChange={(e) => updateSetting('maxFilesPerRun', parseInt(e.target.value, 10) || 10)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxAgeDays">Max Age (Days)</Label>
              <Input
                id="maxAgeDays"
                type="number"
                value={settings.maxAgeDays}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  updateSetting('maxAgeDays', isNaN(parsed) ? 0 : parsed);
                }}
              />
            </div>

          </div>
        </div>
      </div>

      {/* Auto-Sync */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-900 mb-3">Auto-Sync</p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Auto-Sync</Label>
              <p className="text-[10px] text-slate-400 mt-0.5">Sync automatically in the background</p>
            </div>
            <Switch
              checked={autoSyncEnabled}
              onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
            />
          </div>
          {autoSyncEnabled && (
            <>
            <div className="space-y-2">
              <Label htmlFor="autoSyncInterval">Interval</Label>
              <select
                id="autoSyncInterval"
                value={autoSyncInterval}
                onChange={(e) => setAutoSyncInterval(Number(e.target.value))}
                className="w-full text-xs border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1a73e8]"
              >
                <option value={15}>Every 15 minutes</option>
                <option value={30}>Every 30 minutes</option>
                <option value={60}>Every hour</option>
                <option value={120}>Every 2 hours</option>
                <option value={240}>Every 4 hours</option>
                <option value={480}>Every 8 hours</option>
              </select>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div>
                <Label>Restrict to Time Window</Label>
                <p className="text-[10px] text-slate-400 mt-0.5">Only sync during certain hours</p>
              </div>
              <Switch
                checked={settings.enableTimeWindow}
                onClick={() => updateSetting('enableTimeWindow', !settings.enableTimeWindow)}
              />
            </div>
            {settings.enableTimeWindow && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="syncWindowStart">Start</Label>
                  <Input
                    id="syncWindowStart"
                    type="time"
                    value={settings.syncWindowStart || '09:00'}
                    onChange={(e) => updateSetting('syncWindowStart', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="syncWindowEnd">End</Label>
                  <Input
                    id="syncWindowEnd"
                    type="time"
                    value={settings.syncWindowEnd || '17:00'}
                    onChange={(e) => updateSetting('syncWindowEnd', e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
          )}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between text-sm font-semibold text-slate-900"
        >
          <span>Advanced Settings</span>
          {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {showAdvanced && (
          <div className="space-y-4 mt-4 pt-4 border-t border-slate-100">
            <div className="space-y-2">
              <Label htmlFor="sourceFileNamePattern">File Name Filter</Label>
              <Input
                id="sourceFileNamePattern"
                value={settings.sourceFileNamePattern || ''}
                onChange={(e) => updateSetting('sourceFileNamePattern', e.target.value)}
                placeholder="e.g. Meeting-* (leave empty for all files)"
              />
              <p className="text-[10px] text-slate-400">Only sync files whose name matches this pattern (* matches anything).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exclusionPatterns">Exclude Files</Label>
              <textarea
                id="exclusionPatterns"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-y"
                value={settings.exclusionPatterns || ''}
                onChange={(e) => updateSetting('exclusionPatterns', e.target.value)}
                placeholder={'One pattern per line, e.g.\nDraft-*\n*-test\n2023-*'}
              />
              <p className="text-[10px] text-slate-400">Files matching any pattern will be skipped. One pattern per line.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxRetries">Max Retries</Label>
                <Input
                  id="maxRetries"
                  type="number"
                  value={settings.maxRetries}
                  onChange={(e) => updateSetting('maxRetries', parseInt(e.target.value, 10) || 3)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="historySize">History Size</Label>
                <Input
                  id="historySize"
                  type="number"
                  value={settings.historySize}
                  onChange={(e) => updateSetting('historySize', parseInt(e.target.value, 10) || 20)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="archiveThresholdChars">Archive Threshold (chars)</Label>
                <Input
                  id="archiveThresholdChars"
                  type="number"
                  value={settings.archiveThresholdChars}
                  onChange={(e) => updateSetting('archiveThresholdChars', parseInt(e.target.value, 10) || 800000)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-green-600">✓ Settings saved</span>}
        <Button onClick={handleSave} disabled={!isDirty || saving} className="bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 px-6">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      </>)}
    </div>
  );
}
