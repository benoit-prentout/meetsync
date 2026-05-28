import { useState } from 'react';
import {
  RefreshCw,
  Archive,
  History as HistoryIcon,
  BarChart3,
  FolderOpen,
  Settings as SettingsIcon,
  ExternalLink,
  HelpCircle,
  Github,
} from 'lucide-react';
import { History } from '@/components/History';
import { Analytics } from '@/components/Analytics';
import { Settings } from '@/components/Settings';
import { FileExplorer } from '@/components/FileExplorer';
import { Notifications } from '@/components/Notifications';
import { MeetSyncMark } from '@/components/Brand';
import { Help } from '@/components/Help';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settingsStore';
import { formatLastSync } from '@/lib/format';

type Tab = 'overview' | 'history' | 'analytics' | 'files' | 'settings' | 'help';

export function Dashboard({ onSignOut }: { onSignOut?: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [syncResult, setSyncResult] = useState<{ filesProcessed: number } | null>(null);
  const [archiveDone, setArchiveDone] = useState(false);
  const { signOut } = useAuth();

  const handleSignOut = () => {
    onSignOut?.();
    signOut();
  };
  const { sync, archive } = useApi();
  const { lastSync, docSize, files, history, isLoading, settings, error } = useSettingsStore();

  const notConfigured = !settings?.masterDocId || !settings?.archiveFolderId;
  const lastEvent = history[0];

  const sizeRatio = Math.min(docSize / (settings?.archiveThresholdChars || 800_000), 1);
  const sizeBarColor = sizeRatio > 0.8 ? '#ef4444' : sizeRatio > 0.6 ? '#f59e0b' : '#1a73e8';

  type StatCard =
    | { label: string; value: string }
    | { label: string; value: string; isStatus: true; statusType: 'success' | 'error' | 'partial' | null }
    | { label: string; value: string; isDocSize: true; sizeRatio: number };

  const STAT_CARDS: StatCard[] = [
    { label: 'Last Sync', value: formatLastSync(lastSync) },
    { label: 'Doc Size', value: `${(docSize / 1024).toFixed(1)} / ${Math.round((settings?.archiveThresholdChars || 800_000) / 1024)} KB`, isDocSize: true, sizeRatio },
    { label: 'Files Synced', value: String(files.length) },
    {
      label: 'Status',
      value: lastEvent?.status === 'success' ? 'Synced'
           : lastEvent?.status === 'error'   ? 'Error'
           : lastEvent?.status === 'partial' ? 'Partial'
           : 'No syncs',
      isStatus: true,
      statusType: lastEvent?.status ?? null,
    },
  ];

  const NAV_MAIN: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', Icon: RefreshCw },
    { id: 'history', label: 'History', Icon: HistoryIcon },
    { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
    { id: 'files', label: 'Files', Icon: FolderOpen },
  ];

  const navItemClass = (id: Tab) =>
    `flex items-center gap-2 px-4 py-1.5 text-xs text-left w-full transition-colors cursor-pointer ${
      activeTab === id
        ? 'bg-blue-50 border-r-2 border-[#1a73e8] text-[#1a73e8] font-semibold'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`;

  return (
    <div className="h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="h-12 bg-white border-b border-slate-200 flex items-center px-5 gap-3 shrink-0">
        <MeetSyncMark size={24} />
        <span className="font-semibold text-slate-900 text-sm">MeetSync <span className="font-normal text-slate-400">{chrome.runtime.getManifest().version}</span></span>
        <div className="ml-auto flex items-center gap-3">
          {lastEvent && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              lastEvent.status === 'success' ? 'bg-green-50 text-green-700' :
              lastEvent.status === 'error'   ? 'bg-red-50 text-red-700' :
                                               'bg-amber-50 text-amber-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                lastEvent.status === 'success' ? 'bg-green-500' :
                lastEvent.status === 'error'   ? 'bg-red-500' : 'bg-amber-500'
              }`} aria-hidden="true" />
              {lastEvent.status === 'success' ? 'Synced' : lastEvent.status === 'error' ? 'Error' : 'Partial'}
            </span>
          )}
          <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-40 bg-white border-r border-slate-200 flex flex-col py-3 shrink-0">
          {NAV_MAIN.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={navItemClass(id)} aria-current={activeTab === id ? 'page' : undefined}>
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setActiveTab('help')} className={navItemClass('help')} aria-current={activeTab === 'help' ? 'page' : undefined}>
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Help
          </button>
          <button onClick={() => setActiveTab('settings')} className={navItemClass('settings')} aria-current={activeTab === 'settings' ? 'page' : undefined}>
            <SettingsIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Settings
          </button>

          {/* GitHub + Credit */}
          <div className="border-t border-slate-200 mx-3 my-2" />
          <div className="px-4 pb-2">
            <button
              onClick={() => chrome.tabs.create({ url: 'https://github.com/benoit-prentout/meetsync' })}
              className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer w-full"
            >
              <Github className="w-3 h-3" />
              Star on GitHub
            </button>
            <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
              Built by{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  chrome.tabs.create({ url: 'https://www.linkedin.com/in/prentout-benoit/' });
                }}
                className="underline hover:text-slate-600 transition-colors"
              >
                Benoît Prentout
              </a>
              {' · '}Open source · MIT
            </p>
          </div>
        </nav>

        {/* Content */}
        <main className="flex-1 p-5 overflow-auto">
          {notConfigured && activeTab !== 'settings' && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-amber-700 text-xs flex-1">
                Please configure your Master Doc ID and Archive Folder in Settings to enable syncing.
              </span>
              <button
                onClick={() => setActiveTab('settings')}
                className="text-xs font-semibold text-[#1a73e8] whitespace-nowrap cursor-pointer hover:text-blue-700 transition-colors"
              >
                Go to Settings
              </button>
            </div>
          )}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-red-700 text-xs flex-1">{error}</span>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="flex flex-col gap-4">
              {/* 4-column stat row */}
              <div className="grid grid-cols-4 gap-3">
                {STAT_CARDS.map((card) => (
                  <div
                    key={card.label}
                    className="bg-white border border-slate-200 rounded-lg p-3.5 h-[70px] flex flex-col justify-between relative overflow-hidden"
                  >
                    <span className="text-[11px] text-slate-400 uppercase tracking-wide">{card.label}</span>
                    {'isStatus' in card && card.isStatus ? (
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${
                          card.statusType === 'success' ? 'bg-green-600' :
                          card.statusType === 'error'   ? 'bg-red-500' :
                          card.statusType === 'partial' ? 'bg-amber-500' : 'bg-slate-300'
                        }`} />
                        <span className={`text-sm font-bold ${
                          card.statusType === 'success' ? 'text-green-600' :
                          card.statusType === 'error'   ? 'text-red-500' :
                          card.statusType === 'partial' ? 'text-amber-600' : 'text-slate-500'
                        }`}>
                          {card.value}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-slate-900">{card.value}</span>
                    )}
                    {'isDocSize' in card && card.isDocSize && (
                      <div className="absolute bottom-2 left-3.5 right-3.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${card.sizeRatio * 100}%`, backgroundColor: sizeBarColor }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Actions + Recent Activity */}
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 2fr' }}>
                <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-2">
                  <span className="text-xs font-semibold text-slate-900">Quick Actions</span>
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
                    className="bg-[#1a73e8] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                    Sync Now
                  </button>
                  <button
                    onClick={async () => {
                      await archive();
                      setArchiveDone(true);
                      setTimeout(() => setArchiveDone(false), 3000);
                    }}
                    disabled={isLoading || notConfigured}
                    className="bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-medium py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Archive className="w-3 h-3" aria-hidden="true" />
                    Archive Now
                  </button>
                  {syncResult !== null && (
                    <p className="text-[10px] text-green-600 text-center">
                      ✓ {syncResult.filesProcessed} file{syncResult.filesProcessed !== 1 ? 's' : ''} synced
                    </p>
                  )}
                  {archiveDone && (
                    <p className="text-[10px] text-green-600 text-center">✓ Archive complete</p>
                  )}
                  <button
                    onClick={() => chrome.tabs.create({ url: `https://docs.google.com/document/d/${settings?.masterDocId}` })}
                    disabled={!settings?.masterDocId}
                    className="bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600 text-xs font-medium py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    Open Master Doc
                  </button>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4 min-h-[90px]">
                  <p className="text-xs font-semibold text-slate-900 mb-2">Recent Activity</p>
                  {lastEvent ? (
                    <div className="space-y-0.5">
                      <p className="text-xs text-slate-600">{lastEvent.message}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(lastEvent.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No recent activity</p>
                  )}
                </div>
              </div>

              {/* Notifications — renders nothing when empty */}
              <Notifications />
            </div>
          )}

          {activeTab === 'history' && <History />}
          {activeTab === 'analytics' && <Analytics />}
          {activeTab === 'files' && <FileExplorer />}
          {activeTab === 'settings' && <Settings />}
          {activeTab === 'help' && <Help />}
        </main>
      </div>
    </div>
  );
}
