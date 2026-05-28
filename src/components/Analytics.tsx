import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line } from 'recharts';
import { useSettingsStore } from '@/store/settingsStore';
import { formatLastSync } from '@/lib/format';
import { AnalyticsChart } from './AnalyticsChart';
import type { SyncEvent, ArchiveEvent } from '@/types';

function computeRow1(history: SyncEvent[]) {
  const totalSyncs = history.length;
  const totalFiles = history.reduce((sum, e) => sum + e.filesProcessed, 0);
  const avgFiles = totalSyncs > 0 ? (totalFiles / totalSyncs).toFixed(1) : '0';
  const successCount = history.filter(e => e.status === 'success').length;
  const successRate = totalSyncs > 0 ? Math.round((successCount / totalSyncs) * 100) : null;
  return { totalSyncs, totalFiles, avgFiles, successRate };
}

function computeRow2(history: SyncEvent[], docSize: number, threshold: number) {
  const now = Date.now();
  const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstSync = sorted.length > 0 ? new Date(sorted[0].timestamp).getTime() : now;
  const daysSinceFirst = Math.max((now - firstSync) / 86_400_000, 1);
  const currentKB = docSize / 1024;
  const growthRateKBPerDay = currentKB / daysSinceFirst;
  const thresholdKB = threshold / 1024;
  const remainingKB = thresholdKB - currentKB;
  const daysToArchive = growthRateKBPerDay > 0 && remainingKB > 0 ? Math.ceil(remainingKB / growthRateKBPerDay) : null;

  const durations = history.filter(e => e.duration != null).map(e => e.duration!);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  let streak = 0;
  for (const e of history) {
    if (e.status === 'success') streak++;
    else break;
  }

  return { growthRateKBPerDay, daysToArchive, avgDuration, streak };
}

function computeGrowthData(history: SyncEvent[], docSize: number, archiveEvents: ArchiveEvent[]) {
  const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const totalFiles = sorted.reduce((sum, e) => sum + e.filesProcessed, 0);
  if (totalFiles === 0) return [];

  const archiveDates = new Set(archiveEvents.map(e => new Date(e.date).toDateString()));
  let cumulativeFiles = 0;
  return sorted.map(e => {
    cumulativeFiles += e.filesProcessed;
    const sizeKB = e.docSize != null
      ? Math.round(e.docSize / 1024)
      : Math.round(docSize * (cumulativeFiles / totalFiles) / 1024);
    return {
      date: new Date(e.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      sizeKB,
      isArchive: archiveDates.has(new Date(e.timestamp).toDateString()),
    };
  });
}

function computeDurationData(history: SyncEvent[]) {
  return history.slice().reverse()
    .filter(e => e.duration != null)
    .map(e => ({
      date: new Date(e.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      seconds: Math.round((e.duration!) / 10) / 100,
    }));
}

function computeContentData(history: SyncEvent[]) {
  return history.slice().reverse().map(e => ({
    date: new Date(e.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    newFiles: e.syncedNames?.length ?? 0,
    updatedFiles: e.updatedNames?.length ?? 0,
  }));
}

function computeTopFiles(history: SyncEvent[]) {
  const counts: Record<string, number> = {};
  for (const e of history) {
    for (const name of e.updatedNames ?? []) {
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatCard({ label, value, valueColor, small }: { label: string; value: string; valueColor?: string; small?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between h-[70px]">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`${small ? 'text-sm' : 'text-2xl'} font-bold ${valueColor || 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

export function Analytics() {
  const { history, lastSync, docSize, settings, files, archiveEvents } = useSettingsStore();
  const threshold = settings?.archiveThresholdChars || 800_000;

  const r1 = computeRow1(history);
  const r2 = computeRow2(history, docSize, threshold);
  const growthData = computeGrowthData(history, docSize, archiveEvents);
  const durationData = computeDurationData(history);
  const contentData = computeContentData(history);
  const topFiles = computeTopFiles(history);

  const totalNew = history.reduce((sum, e) => sum + (e.syncedNames?.length ?? 0), 0);
  const totalUpdated = history.reduce((sum, e) => sum + (e.updatedNames?.length ?? 0), 0);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  history.forEach(e => { dayCounts[new Date(e.timestamp).getDay()]++; });
  const mostActiveDay = dayNames[dayCounts.indexOf(Math.max(...dayCounts))] || '—';

  const now = Date.now();
  const sorted = [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstSync = sorted.length > 0 ? new Date(sorted[0].timestamp).getTime() : now;
  const weeksElapsed = Math.max((now - firstSync) / (7 * 86_400_000), 1);
  const syncsPerWeek = (history.length / weeksElapsed).toFixed(1);

  const reliabilityData = history.slice().reverse().slice(-20).map(e => ({
    date: new Date(e.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    status: e.status,
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Syncs" value={String(r1.totalSyncs)} />
        <StatCard label="Files Processed" value={String(r1.totalFiles)} />
        <StatCard label="Avg Files / Sync" value={r1.avgFiles} />
        <StatCard label="Success Rate" value={r1.successRate !== null ? `${r1.successRate}%` : '—'}
          valueColor={r1.successRate !== null ? (r1.successRate >= 80 ? 'text-green-600' : r1.successRate >= 50 ? 'text-amber-600' : 'text-red-500') : 'text-slate-300'} />
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Growth Rate" value={r2.growthRateKBPerDay > 0 ? `+${r2.growthRateKBPerDay.toFixed(1)} KB/day` : '—'} />
        <StatCard label="Days to Archive" value={r2.daysToArchive !== null ? `~${r2.daysToArchive}d` : '—'} />
        <StatCard label="Avg Duration" value={r2.avgDuration !== null ? formatDuration(Math.round(r2.avgDuration)) : '—'} />
        <StatCard label="Success Streak" value={String(r2.streak)} valueColor={r2.streak >= 3 ? 'text-green-600' : 'text-slate-900'} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <AnalyticsChart title="Doc Size Growth" isEmpty={growthData.length < 2} emptyMessage="Not enough data yet — keep syncing">
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={growthData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a73e8" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#1a73e8" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}KB`} />
                <Tooltip
                  contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  formatter={(v: number) => [`${v} KB`, 'Doc Size']}
                />
                <Area type="monotone" dataKey="sizeKB" stroke="#1a73e8" strokeWidth={2} fill="url(#growthGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </AnalyticsChart>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <p className="text-[11px] text-slate-400 uppercase tracking-wide">Threshold</p>
          <div className="flex-1 flex flex-col justify-center gap-2">
            <p className="text-lg font-bold text-slate-900">{Math.round(docSize / 1024)} / {Math.round(threshold / 1024)} KB</p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min((docSize / threshold) * 100, 100)}%`,
                  backgroundColor: docSize / threshold > 0.8 ? '#ef4444' : docSize / threshold > 0.6 ? '#f59e0b' : '#1a73e8'
                }} />
            </div>
            {r2.growthRateKBPerDay > 0 && (
              <div className="text-[11px] text-slate-500 space-y-0.5">
                <p>+{r2.growthRateKBPerDay.toFixed(1)} KB/day</p>
                {r2.daysToArchive !== null && <p>~{r2.daysToArchive}d until archive</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <AnalyticsChart title="Sync Duration" isEmpty={durationData.length < 2} emptyMessage="Duration data appears after the first sync completes">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={durationData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}s`} />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }}
                formatter={(v: number) => [`${v.toFixed(1)}s`, 'Duration']}
              />
              <Line type="monotone" dataKey="seconds" stroke="#1a73e8" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsChart>

        <AnalyticsChart title="Reliability" isEmpty={history.length === 0} emptyMessage="No sync history yet">
          <div className="flex flex-col gap-2">
            <div className="flex gap-0.5 flex-wrap">
              {reliabilityData.map((entry, i) => (
                <div key={i} className="w-3 h-3 rounded-sm cursor-default"
                  style={{ backgroundColor: entry.status === 'success' ? '#16a34a' : entry.status === 'partial' ? '#f59e0b' : '#ef4444' }}
                  title={`${entry.date}: ${entry.status}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <div><span className="text-slate-400">Avg </span><span className="font-semibold text-slate-700">{r2.avgDuration !== null ? formatDuration(Math.round(r2.avgDuration)) : '—'}</span></div>
              <div><span className="text-slate-400">Best </span><span className="font-semibold text-green-600">{durationData.length > 0 ? formatDuration(Math.round(Math.min(...durationData.map(d => d.seconds * 1000)))) : '—'}</span></div>
              <div><span className="text-slate-400">Worst </span><span className="font-semibold text-red-500">{durationData.length > 0 ? formatDuration(Math.round(Math.max(...durationData.map(d => d.seconds * 1000)))) : '—'}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <div><span className="text-slate-400">Errors </span><span className="font-semibold text-red-500">{history.filter(e => e.status === 'error').length}</span></div>
              <div><span className="text-slate-400">Partial </span><span className="font-semibold text-amber-600">{history.filter(e => e.status === 'partial').length}</span></div>
              <div><span className="text-slate-400">Clean </span><span className="font-semibold text-green-600">{history.filter(e => e.status === 'success').length}</span></div>
            </div>
          </div>
        </AnalyticsChart>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <AnalyticsChart title="New vs Updated" isEmpty={history.length === 0} emptyMessage="No sync history yet">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={contentData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} stackOffset="sign">
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }} />
              <Bar dataKey="newFiles" stackId="a" fill="#1a73e8" radius={[0, 0, 0, 0]} name="New" />
              <Bar dataKey="updatedFiles" stackId="a" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Updated" />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsChart>

        <AnalyticsChart title="Most Updated Files" isEmpty={topFiles.length === 0} emptyMessage="No file updates yet">
          <div className="flex flex-col gap-1.5">
            {topFiles.map(([name, count], i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-400 w-3 shrink-0">{i + 1}.</span>
                <span className="flex-1 text-slate-700 truncate">{name}</span>
                <span className="font-semibold text-slate-500 shrink-0">{count}x</span>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-1.5 mt-1 flex gap-3 text-[11px] text-slate-500">
              <span>New files: <span className="font-semibold text-slate-700">{totalNew}</span></span>
              <span>Updates: <span className="font-semibold text-slate-700">{totalUpdated}</span></span>
            </div>
          </div>
        </AnalyticsChart>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Last Sync" value={formatLastSync(lastSync, true)} small />
        <StatCard label="Total Unique Files" value={String(files.length)} small />
        <StatCard label="Most Active Day" value={mostActiveDay} small />
        <StatCard label="Syncs / Week" value={syncsPerWeek} small />
      </div>
    </div>
  );
}
