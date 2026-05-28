import type { SyncFile, SyncEvent } from '@/types';

export type FileStatus = 'recent' | 'active' | 'older' | 'never';

export interface FileStats {
  updateCount: number;
  firstSeen: string | null;
  daysSinceLastSync: number;
  status: FileStatus;
  events: { timestamp: string; type: 'new' | 'updated' }[];
}

export type EnrichedFile = SyncFile & FileStats;

export function computeFileStats(files: SyncFile[], history: SyncEvent[]): EnrichedFile[] {
  const updateCounts: Record<string, number> = {};
  const fileEvents: Record<string, { timestamp: string; type: 'new' | 'updated' }[]> = {};
  const firstSeen: Record<string, string> = {};

  for (const event of history) {
    for (const name of event.syncedNames ?? []) {
      if (!fileEvents[name]) fileEvents[name] = [];
      fileEvents[name].push({ timestamp: event.timestamp, type: 'new' });
      if (!firstSeen[name] || event.timestamp < firstSeen[name]) {
        firstSeen[name] = event.timestamp;
      }
    }
    for (const name of event.updatedNames ?? []) {
      updateCounts[name] = (updateCounts[name] ?? 0) + 1;
      if (!fileEvents[name]) fileEvents[name] = [];
      fileEvents[name].push({ timestamp: event.timestamp, type: 'updated' });
      if (!firstSeen[name] || event.timestamp < firstSeen[name]) {
        firstSeen[name] = event.timestamp;
      }
    }
  }

  for (const name of Object.keys(fileEvents)) {
    fileEvents[name].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  const now = Date.now();

  return files.map((file) => {
    const updateCount = updateCounts[file.name] ?? 0;
    const events = fileEvents[file.name] ?? [];
    const first = firstSeen[file.name] ?? null;

    let daysSinceLastSync: number;
    let status: FileStatus;

    if (!file.lastSynced) {
      daysSinceLastSync = Infinity;
      status = 'never';
    } else {
      daysSinceLastSync = Math.floor(
        (now - new Date(file.lastSynced).getTime()) / 86_400_000
      );
      if (daysSinceLastSync <= 7) status = 'recent';
      else if (daysSinceLastSync <= 30) status = 'active';
      else status = 'older';
    }

    return {
      ...file,
      updateCount,
      firstSeen: first,
      daysSinceLastSync,
      status,
      events,
    };
  });
}
