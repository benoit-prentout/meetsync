import { useState, useEffect } from 'react';
import { Github, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settingsStore';
import { formatLastSync } from '@/lib/format';
import { MeetSyncMark } from '@/components/Brand';

function openDashboardTab() {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
}

export function Popup() {
  const [syncResult, setSyncResult] = useState<{ filesProcessed: number } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const { isAuthenticated, signIn, signOut } = useAuth();
  const { sync } = useApi();
  const { lastSync, docSize, files, history, isLoading, settings, setAuthenticated } = useSettingsStore();

  useEffect(() => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (!chrome.runtime.lastError && token) {
        setAuthenticated(token);
      }
      setAuthChecking(false);
    });
  }, [setAuthenticated]);

  if (authChecking) {
    return (
      <div className="w-60 h-24 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-slate-400 motion-safe:animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-60 p-6 flex flex-col items-center gap-4">
        <MeetSyncMark size={40} />
        <div className="text-center">
          <p className="font-semibold text-slate-900 text-sm">MeetSync for NotebookLM</p>
          <p className="text-xs text-slate-500 mt-1">
            Connect your Google account to sync your meeting notes
          </p>
        </div>
        <button
          onClick={signIn}
          className="w-full bg-[#1a73e8] hover:bg-blue-600 text-white text-sm font-semibold py-2 rounded-md transition-colors cursor-pointer"
        >
          Connect Google Account
        </button>
      </div>
    );
  }

  const notConfigured = !settings?.masterDocId || !settings?.archiveFolderId;
  const lastEvent = history[0];

  const STAT_CARDS = [
    { label: 'Last Sync', value: formatLastSync(lastSync) },
    { label: 'Doc Size', value: `${(docSize / 1024).toFixed(1)} KB` },
    { label: 'Files', value: String(files.length) },
    {
      label: 'Status',
      value: lastEvent?.status === 'success' ? 'Synced'
           : lastEvent?.status === 'error'   ? 'Error'
           : lastEvent?.status === 'partial' ? 'Partial'
           : 'No syncs',
      isStatus: true,
      statusType: lastEvent?.status ?? null,
    },
  ] as const;

  return (
    <div className="w-60 bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[#1a73e8] px-4 py-3 flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z" />
          </svg>
        </div>
        <span className="text-white font-semibold text-xs">MeetSync</span>
      </div>

      {/* 2×2 stat grid */}
      <div className="p-3 grid grid-cols-2 gap-1.5">
        {STAT_CARDS.map((card) => (
          <div
            key={card.label}
            className="bg-slate-50 border border-slate-200 rounded-md px-2.5 py-2 h-[52px] flex flex-col justify-between"
          >
            <span className="text-[11px] text-slate-400 uppercase tracking-wide">{card.label}</span>
            {'isStatus' in card && card.isStatus ? (
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  card.statusType === 'success' ? 'bg-green-600' :
                  card.statusType === 'error'   ? 'bg-red-500' :
                  card.statusType === 'partial' ? 'bg-amber-500' : 'bg-slate-300'
                }`} />
                <span className={`text-[10px] font-semibold ${
                  card.statusType === 'success' ? 'text-green-600' :
                  card.statusType === 'error'   ? 'text-red-500' :
                  card.statusType === 'partial' ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {card.value}
                </span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-slate-900">{card.value}</span>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="px-3 pb-3 flex flex-col gap-1.5">
        <button
          onClick={async () => {
            const result = await sync();
            if (result) {
              const count = (result.result as { filesProcessed?: number } | null)?.filesProcessed ?? 0;
              setSyncResult({ filesProcessed: count });
              setTimeout(() => setSyncResult(null), 3000);
            }
          }}
          disabled={isLoading || notConfigured}
          className="w-full bg-[#1a73e8] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-2 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          Sync Now
        </button>
        {syncResult !== null && (
          <p className="text-[10px] text-green-600 text-center">
            ✓ {syncResult.filesProcessed} file{syncResult.filesProcessed !== 1 ? 's' : ''} synced
          </p>
        )}
        <button
          onClick={openDashboardTab}
          className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-[#1a73e8] text-xs font-medium py-2 rounded-md transition-colors cursor-pointer"
        >
          Open Dashboard →
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-3 py-2 flex items-center justify-between">
        <button
          onClick={() => chrome.tabs.create({ url: 'https://github.com/benoit-prentout/google-meet-gemini-to-notebooklm' })}
          className="text-[9px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer flex items-center gap-1"
        >
          <Github className="w-2.5 h-2.5" />
          Star
        </button>
        <button onClick={signOut} className="text-[9px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
          Sign out
        </button>
      </div>
    </div>
  );
}
