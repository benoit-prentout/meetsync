export interface SyncEvent {
  id: string;
  timestamp: string;
  filesProcessed: number;
  status: 'success' | 'partial' | 'error';
  message: string;
  syncedNames?: string[];
  updatedNames?: string[];
  duration?: number;
  docSize?: number;
}

export interface Settings {
  sourceFolderName: string;
  maxFilesPerRun: number;
  archiveThresholdChars: number;
  enableMonthlyArchive: boolean;
  enableUpdateDetection: boolean;
  maxAgeDays: number;
  archiveFolderId: string;
  masterDocId: string;
  maxRetries: number;
  historySize: number;
  enableNotifications: boolean;
  sourceFileNamePattern: string;
  exclusionPatterns: string;
  enableTimeWindow: boolean;
  syncWindowStart: string;
  syncWindowEnd: string;
}

export interface SyncFile {
  id: string;
  name: string;
  lastSynced: string;
  size: number;
}

export interface StatusResponse {
  success: boolean;
  lastSync: string | null;
  docSize: number;
  isConfigured: boolean;
  backendIntegrity?: string;
  archiveEvents?: ArchiveEvent[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  result?: T;
  message?: string;
  settings?: Settings;
  history?: SyncEvent[];
  files?: SyncFile[];
}

export interface ArchiveEvent {
  date: string;
  sizeBefore: number;
  reason: string;
}

export interface AnalyticsData {
  totalSyncs: number;
  totalFilesProcessed: number;
  avgFilesPerSync: number;
  syncFrequency: { date: string; count: number }[];
  monthlyStats: { month: string; files: number }[];
}
