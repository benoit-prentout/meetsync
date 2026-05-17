import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useSettingsStore } from '@/store/settingsStore';
import { formatLastSync } from '@/lib/format';

export function Analytics() {
  const { history, lastSync, docSize, settings } = useSettingsStore();

  const totalSyncs = history.length;
  const totalFiles = history.reduce((sum, e) => sum + e.filesProcessed, 0);
  const avgFiles = totalSyncs > 0 ? (totalFiles / totalSyncs).toFixed(1) : '0';
  const successCount = history.filter(e => e.status === 'success').length;
  const successRate = totalSyncs > 0 ? Math.round((successCount / totalSyncs) * 100) : null;

  const threshold = settings?.archiveThresholdChars || 800_000;
  const sizeRatio = Math.min(docSize / threshold, 1);
  const sizeBarColor = sizeRatio > 0.8 ? '#ef4444' : sizeRatio > 0.6 ? '#f59e0b' : '#1a73e8';

  const chartData = history.slice().reverse().map(e => ({
    date: new Date(e.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    files: e.filesProcessed,
    status: e.status,
  }));

  const barColor = (status: string) => {
    if (status === 'success') return '#1a73e8';
    if (status === 'partial') return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="space-y-3">
      {/* Top stat row — 4 cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 h-[70px] flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Total Syncs</span>
          <span className="text-2xl font-bold text-slate-900">{totalSyncs}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 h-[70px] flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Files Processed</span>
          <span className="text-2xl font-bold text-slate-900">{totalFiles}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 h-[70px] flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Avg Files / Sync</span>
          <span className="text-2xl font-bold text-slate-900">{avgFiles}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 h-[70px] flex flex-col justify-between">
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Success Rate</span>
          {successRate !== null ? (
            <span className={`text-2xl font-bold ${
              successRate >= 80 ? 'text-green-600' :
              successRate >= 50 ? 'text-amber-600' : 'text-red-500'
            }`}>
              {successRate}%
            </span>
          ) : (
            <span className="text-2xl font-bold text-slate-300">—</span>
          )}
        </div>
      </div>

      {/* Second row — last sync + doc size with progress bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 h-[70px] flex flex-col justify-between col-span-2">
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Last Sync</span>
          <span className="text-sm font-semibold text-slate-900">
            {formatLastSync(lastSync, true)}
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between h-[70px]">
          <span className="text-[9px] text-slate-400 uppercase tracking-wide">Document Size</span>
          <span className="text-lg font-bold text-slate-900">{((docSize ?? 0) / 1024).toFixed(1)} KB</span>
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${sizeRatio * 100}%`, backgroundColor: sizeBarColor }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-slate-900 mb-3">Files Processed per Sync</p>
        {history.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">No sync history yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }}
                cursor={{ fill: '#f1f5f9' }}
              />
              <Bar dataKey="files" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={barColor(entry.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
