import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { History } from './History';
import { Analytics } from './Analytics';
import { Settings } from './Settings';
import { Notifications } from './Notifications';
import { FileExplorer } from './FileExplorer';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settingsStore';
import { 
  RefreshCw, 
  Settings as SettingsIcon, 
  History as HistoryIcon,
  BarChart3,
  Bell,
  FolderOpen,
  LogOut
} from 'lucide-react';

type Tab = 'overview' | 'history' | 'analytics' | 'files' | 'settings';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const { signIn, signOut, isAuthenticated } = useAuth();
  const { sync } = useApi();
  const { isLoading, settings } = useSettingsStore();
  
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>MeetSync for NotebookLM</CardTitle>
            <CardDescription>
              Connect your Google account to sync your meeting notes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={signIn} className="w-full">
              Connect Google Account
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const notConfigured = !settings?.masterDocId || !settings?.archiveFolderId;
  
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">MeetSync for NotebookLM</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      
      <nav className="border-b bg-card/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 py-2">
            <Button
              variant={activeTab === 'overview' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('overview')}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Overview
            </Button>
            <Button
              variant={activeTab === 'history' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('history')}
            >
              <HistoryIcon className="w-4 h-4 mr-2" />
              History
            </Button>
            <Button
              variant={activeTab === 'analytics' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('analytics')}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </Button>
            <Button
              variant={activeTab === 'files' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('files')}
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Files
            </Button>
            <Button
              variant={activeTab === 'settings' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('settings')}
            >
              <SettingsIcon className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </nav>
      
      <main className="container mx-auto px-4 py-6">
        {notConfigured && activeTab !== 'settings' && (
          <Card className="mb-6 border-yellow-500/50 bg-yellow-500/10">
            <CardContent className="flex items-center gap-4 py-4">
              <Bell className="w-5 h-5 text-yellow-600" />
              <p className="flex-1">
                Please configure your Master Doc ID and Archive Folder in Settings to enable syncing.
              </p>
              <Button size="sm" onClick={() => setActiveTab('settings')}>
                Go to Settings
              </Button>
            </CardContent>
          </Card>
        )}
        
        {activeTab === 'overview' && <OverviewPanel onSync={async () => { await sync(); }} isLoading={isLoading} />}
        {activeTab === 'history' && <History />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'files' && <FileExplorer />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

function OverviewPanel({ onSync, isLoading }: { onSync: () => Promise<void>; isLoading: boolean }) {
  const { lastSync, docSize, history } = useSettingsStore();
  const lastEvent = history[0];
  
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button onClick={onSync} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Now
          </Button>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Last Sync</p>
            <p className="text-lg font-medium">
              {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Document Size</p>
            <p className="text-lg font-medium">
              {(docSize / 1024).toFixed(1)} KB
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <Badge variant={lastEvent?.status === 'success' ? 'success' : 'warning'}>
              {lastEvent?.status || 'No syncs yet'}
            </Badge>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {lastEvent ? (
            <div className="space-y-2">
              <p className="text-sm">{lastEvent.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(lastEvent.timestamp).toLocaleString()}
              </p>
              <p className="text-sm">
                {lastEvent.filesProcessed} files processed
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">No recent activity</p>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <Notifications />
        </CardContent>
      </Card>
    </div>
  );
}