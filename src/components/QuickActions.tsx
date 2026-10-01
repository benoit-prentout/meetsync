import { useSettingsStore } from '@/store/settingsStore';
import { useApi } from '@/hooks/useApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

export function QuickActions() {
  const { lastSync, history, isLoading, settings } = useSettingsStore();
  const { sync } = useApi();
  const lastEvent = history[0];
  
  const notConfigured = !settings?.masterDocId || !settings?.archiveFolderId;
  
  return (
    <div className="w-80 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Quick Actions</h2>
        <Badge
          variant={lastEvent?.status === 'success' ? 'success' : 'secondary'}
        >
          {lastEvent?.status === 'success' ? (
            <CheckCircle className="w-3 h-3 mr-1" />
          ) : (
            <AlertCircle className="w-3 h-3 mr-1" />
          )}
          {lastEvent?.status || 'No syncs'}
        </Badge>
      </div>
      
      {notConfigured && (
        <div className="p-3 rounded-lg bg-yellow-500/10 text-yellow-600 text-sm">
          Please configure settings in the dashboard
        </div>
      )}
      
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Last sync:</p>
        <p className="text-sm">
          {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
        </p>
      </div>
      
      <Button
        className="w-full"
        onClick={sync}
        disabled={isLoading || notConfigured}
      >
        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
        Sync Now
      </Button>
      
      <p className="text-xs text-muted-foreground text-center">
        Open the dashboard for more features
      </p>
    </div>
  );
}
