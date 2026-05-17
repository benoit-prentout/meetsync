import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { ExternalLink, Save, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { useApi } from '@/hooks/useApi';

export function Settings() {
  const { settings, updateSetting, setError, error, isLoading, deploymentUrl, setDeploymentUrl } = useSettingsStore();
  const { updateSettings, getSettings } = useApi();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState(false);
  const [autoSyncInterval, setAutoSyncIntervalState] = useState(60);
  const [deploymentUrlInput, setDeploymentUrlInput] = useState('');

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

  if (!settings) {
    return (
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
          <button
            onClick={() => getSettings().catch(() => {})}
            className="flex items-center gap-1.5 text-xs text-[#1a73e8] hover:text-blue-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Try again
          </button>
        )}
        {isLoading && (
          <RefreshCw className="w-3.5 h-3.5 text-slate-400 motion-safe:animate-spin" aria-hidden="true" />
        )}
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateSettings(settings);
      setSaved(true);
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
      {/* Apps Script Deployment */}
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
            <button
              type="button"
              onClick={handleSaveDeploymentUrl}
              disabled={!deploymentUrlInput.trim() || deploymentUrlInput.trim() === (deploymentUrl ?? '')}
              className="shrink-0 px-3 py-1.5 text-xs font-medium bg-[#1a73e8] text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Update
            </button>
          </div>
          {deploymentUrl && deploymentUrlInput.trim() === deploymentUrl && (
            <p className="text-[10px] text-slate-400 truncate">{deploymentUrl}</p>
          )}
        </div>
      </div>

      {/* Google Drive Configuration */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-slate-900 mb-3">Google Drive Configuration</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="masterDocId">Master Document ID</Label>
            <div className="flex items-center gap-2">
              <Input
                id="masterDocId"
                value={settings.masterDocId || ''}
                onChange={(e) => updateSetting('masterDocId', e.target.value)}
                placeholder="Enter Google Doc ID"
              />
              {settings.masterDocId && (
                <button
                  type="button"
                  onClick={() => chrome.tabs.create({ url: `https://docs.google.com/document/d/${settings.masterDocId}` })}
                  className="shrink-0 text-slate-400 hover:text-[#1a73e8] transition-colors cursor-pointer"
                  aria-label="Open master document"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="archiveFolderId">Archive Folder ID</Label>
            <div className="flex items-center gap-2">
              <Input
                id="archiveFolderId"
                value={settings.archiveFolderId || ''}
                onChange={(e) => updateSetting('archiveFolderId', e.target.value)}
                placeholder="Enter Google Drive Folder ID"
              />
              {settings.archiveFolderId && (
                <button
                  type="button"
                  onClick={() => chrome.tabs.create({ url: `https://drive.google.com/drive/folders/${settings.archiveFolderId}` })}
                  className="shrink-0 text-slate-400 hover:text-[#1a73e8] transition-colors cursor-pointer"
                  aria-label="Open archive folder"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="archiveThresholdChars">Archive Threshold (chars)</Label>
              <Input
                id="archiveThresholdChars"
                type="number"
                value={settings.archiveThresholdChars}
                onChange={(e) => updateSetting('archiveThresholdChars', parseInt(e.target.value, 10) || 800000)}
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
              <Label htmlFor="maxRetries">Max Retries</Label>
              <Input
                id="maxRetries"
                type="number"
                value={settings.maxRetries}
                onChange={(e) => updateSetting('maxRetries', parseInt(e.target.value, 10) || 3)}
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
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-green-600">✓ Settings saved</span>}
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
