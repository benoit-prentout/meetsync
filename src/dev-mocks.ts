import { useSettingsStore } from './store/settingsStore';

// Wipe persisted store so stale localStorage never interferes with mock data
localStorage.removeItem('meet-gemini-storage');

// Minimal chrome API mock for Vite dev server (no real chrome.* APIs available)
(window as unknown as Record<string, unknown>).chrome = {
  storage: {
    sync: {
      get: (_keys: unknown, cb: (result: Record<string, unknown>) => void) => {
        cb({ deploymentUrl: 'https://fake-dev.invalid' });
      },
      set: (_items: object, cb?: () => void) => { cb?.(); },
      remove: (_keys: string | string[], cb?: () => void) => { cb?.(); },
    },
  },
  identity: {
    getAuthToken: (_opts: object, cb: (token: string | undefined) => void) => {
      cb('fake-dev-token');
    },
    removeCachedAuthToken: (_opts: object, cb?: () => void) => { cb?.(); },
  },
  runtime: { lastError: undefined },
  tabs: { create: () => {} },
};

const now = Date.now();
const day = 86_400_000;

useSettingsStore.setState({
  isAuthenticated: true,
  accessToken: 'fake-dev-token',
  deploymentUrl: 'https://fake-dev.invalid',
  lastSync: new Date(now - 3 * day).toISOString(),
  docSize: 680_000,
  error: null,
  isLoading: false,
  settings: {
    masterDocId: '1BxSmocked_master_doc_id',
    archiveFolderId: '1Fzpmocked_archive_folder',
    sourceFolderName: 'Meet Notes',
    maxFilesPerRun: 10,
    archiveThresholdChars: 800_000,
    enableMonthlyArchive: true,
    enableUpdateDetection: true,
    maxAgeDays: 90,
    maxRetries: 3,
    historySize: 20,
  },
  history: [
    {
      id: 'h1',
      timestamp: new Date(now - 3 * day).toISOString(),
      filesProcessed: 2,
      status: 'partial',
      message: '1 synced, 1 updated, 2 errors',
      syncedNames: ['Weekly Sync — Product Team'],
      updatedNames: ['Q2 Planning Session'],
      duration: 3800,
    },
    {
      id: 'h2',
      timestamp: new Date(now - 2 * day).toISOString(),
      filesProcessed: 1,
      status: 'success',
      message: '1 synced, 0 updated',
      syncedNames: ['Customer Discovery — Acme Corp'],
      updatedNames: [],
      duration: 1200,
    },
    {
      id: 'h3',
      timestamp: new Date(now - 4 * day).toISOString(),
      filesProcessed: 0,
      status: 'partial',
      message: '0 synced, 0 updated',
      syncedNames: [],
      updatedNames: [],
      duration: 900,
    },
    {
      id: 'h4',
      timestamp: new Date(now - 5 * day).toISOString(),
      filesProcessed: 5,
      status: 'success',
      message: '3 synced, 2 updated',
      syncedNames: ['Engineering All-Hands', 'Weekly Sync — Product Team', 'Q2 Planning Session'],
      updatedNames: ['Customer Discovery — Acme Corp', '1:1 with Lucas'],
      duration: 6100,
    },
    {
      id: 'h5',
      timestamp: new Date(now - 7 * day).toISOString(),
      filesProcessed: 2,
      status: 'success',
      message: '2 synced, 0 updated',
      syncedNames: ['Weekly Sync — Product Team', 'Engineering All-Hands'],
      updatedNames: [],
      duration: 2200,
    },
    { id: 'h6', timestamp: new Date(now - 8 * day).toISOString(), filesProcessed: 0, status: 'error', message: 'Failed: quota exceeded' },
    { id: 'h7', timestamp: new Date(now - 10 * day).toISOString(), filesProcessed: 4, status: 'success', message: '4 synced, 0 updated' },
    { id: 'h8', timestamp: new Date(now - 12 * day).toISOString(), filesProcessed: 2, status: 'success', message: '2 synced, 0 updated' },
  ],
  files: [
    { id: 'f1', name: 'Weekly Sync — Product Team', lastSynced: new Date(now - day).toISOString(), size: 0 },
    { id: 'f2', name: 'Q2 Planning Session', lastSynced: new Date(now - 2 * day).toISOString(), size: 0 },
    { id: 'f3', name: 'Engineering All-Hands', lastSynced: new Date(now - 5 * day).toISOString(), size: 0 },
    { id: 'f4', name: 'Customer Discovery — Acme Corp', lastSynced: new Date(now - 7 * day).toISOString(), size: 0 },
  ],
});
