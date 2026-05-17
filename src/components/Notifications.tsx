import { useSettingsStore } from '@/store/settingsStore';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface NotificationsProps {
  compact?: boolean;
}

export function Notifications({ compact = false }: NotificationsProps) {
  const { error, isLoading, settings } = useSettingsStore();

  const notConfigured = !settings?.masterDocId || !settings?.archiveFolderId;

  if (compact) {
    return (
      <div className="space-y-2">
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-blue-600">
            <AlertCircle className="w-4 h-4 animate-pulse" />
            <span className="text-sm">Syncing...</span>
          </div>
        )}
        {notConfigured && !error && !isLoading && (
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Configuration required</span>
          </div>
        )}
        {!error && !isLoading && !notConfigured && (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">All systems operational</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-semibold text-slate-900 mb-3">Notifications</p>
      {error ? (
        <div className="flex items-start gap-2 text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium">Error</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-blue-600">
          <AlertCircle className="w-4 h-4 animate-pulse shrink-0" />
          <span className="text-xs">Syncing in progress...</span>
        </div>
      ) : notConfigured ? (
        <div className="flex items-start gap-2 text-amber-600">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium">Configuration Required</p>
            <p className="text-xs">Please configure Master Doc ID and Archive Folder</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="text-xs">All systems operational</span>
        </div>
      )}
    </div>
  );
}