import { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';

type Severity = 'error' | 'warning' | 'info';

interface NotificationItem {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
}

const ICON: Record<Severity, React.ReactNode> = {
  error:   <AlertCircle  className="w-3.5 h-3.5 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />,
  info:    <Info          className="w-3.5 h-3.5 shrink-0 mt-0.5" />,
};

const COLORS: Record<Severity, string> = {
  error:   'text-red-600',
  warning: 'text-amber-600',
  info:    'text-blue-500',
};

const BG: Record<Severity, string> = {
  error:   'bg-red-50 border-red-100',
  warning: 'bg-amber-50 border-amber-100',
  info:    'bg-blue-50 border-blue-100',
};

export function Notifications() {
  const { error, isLoading, settings, docSize, history, lastSync } = useSettingsStore();
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['autoSyncEnabled'], (result) => {
      setAutoSyncEnabled(Boolean(result.autoSyncEnabled));
    });
  }, []);

  const notConfigured = !settings?.masterDocId || !settings?.archiveFolderId;
  const threshold = settings?.archiveThresholdChars || 800_000;
  const sizeRatio = Math.min(docSize / threshold, 1);
  const sizePercent = Math.round(sizeRatio * 100);
  const lastEvent = history[0];
  const daysSinceSync = lastSync
    ? (Date.now() - new Date(lastSync).getTime()) / 86_400_000
    : null;

  const notifications: NotificationItem[] = [];

  if (error) {
    notifications.push({ id: 'api-error', severity: 'error', title: 'Sync error', detail: error });
  }

  if (isLoading) {
    notifications.push({ id: 'loading', severity: 'info', title: 'Sync in progress…' });
  }

  if (notConfigured && !error) {
    notifications.push({
      id: 'config',
      severity: 'warning',
      title: 'Setup incomplete',
      detail: 'Master Doc ID and Archive Folder are required in Settings',
    });
  }

  if (!notConfigured) {
    if (sizeRatio >= 0.8) {
      notifications.push({
        id: 'doc-size-critical',
        severity: 'error',
        title: `Document is ${sizePercent}% full`,
        detail: 'Archive soon to avoid hitting the auto-archive threshold',
      });
    } else if (sizeRatio >= 0.6) {
      const remaining = Math.round((1 - sizeRatio) * threshold / 1024);
      notifications.push({
        id: 'doc-size-warning',
        severity: 'warning',
        title: `Document is ${sizePercent}% full`,
        detail: `${remaining} KB remaining before auto-archive triggers`,
      });
    }
  }

  if (lastEvent?.status === 'error' && !error && !isLoading) {
    notifications.push({
      id: 'last-error',
      severity: 'error',
      title: 'Last sync failed',
      detail: lastEvent.message,
    });
  }

  if (lastEvent?.status === 'partial' && !isLoading) {
    notifications.push({
      id: 'partial',
      severity: 'warning',
      title: 'Last sync was partial',
      detail: lastEvent.message,
    });
  }

  if (!lastSync && !notConfigured && !isLoading) {
    notifications.push({
      id: 'no-sync',
      severity: 'info',
      title: 'No sync has run yet',
      detail: 'Click Sync Now to get started',
    });
  }

  if (daysSinceSync !== null && daysSinceSync > 2 && !autoSyncEnabled && !isLoading) {
    const days = Math.round(daysSinceSync);
    notifications.push({
      id: 'stale',
      severity: 'info',
      title: `Last synced ${days} day${days !== 1 ? 's' : ''} ago`,
      detail: 'Auto-Sync is off — enable it in Settings to sync automatically',
    });
  }

  if (notifications.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-semibold text-slate-900">Notifications</p>
        {isLoading && <RefreshCw className="w-3 h-3 text-blue-400 motion-safe:animate-spin" aria-hidden="true" />}
        <span className="ml-auto text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
          {notifications.length}
        </span>
      </div>
      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md border ${BG[n.severity]} ${COLORS[n.severity]}`}
          >
            {ICON[n.severity]}
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-snug">{n.title}</p>
              {n.detail && (
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
