import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, ExternalLink, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useSettingsStore } from '@/store/settingsStore';
import { computeFileStats, type FileStatus } from '@/lib/fileStats';
import type { SyncEvent } from '@/types';

type SortKey = 'lastSynced' | 'name' | 'updateCount';

function computeDailyActivity(history: SyncEvent[]) {
  const now = new Date();
  const days: { label: string; count: number }[] = [];

  for (let i = 13; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toDateString();
    const label = date.toLocaleDateString('en', { weekday: 'short' });

    const dayEvents = history.filter(
      (e) => new Date(e.timestamp).toDateString() === dateStr
    );
    const count = dayEvents.reduce(
      (sum, e) => sum + (e.syncedNames?.length ?? 0) + (e.updatedNames?.length ?? 0),
      0
    );

    days.push({ label, count });
  }

  return days;
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between h-[70px]">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function StatusDot({ status }: { status: FileStatus }) {
  const colors: Record<FileStatus, string> = {
    recent: 'bg-green-500',
    active: 'bg-amber-400',
    older: 'bg-slate-400',
    never: 'bg-slate-300',
  };
  return <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status]}`} title={status} />;
}

function FileRow({
  file,
  isExpanded,
  onToggle,
  isMaster,
}: {
  file: ReturnType<typeof computeFileStats>[number];
  isExpanded: boolean;
  onToggle: () => void;
  isMaster?: boolean;
}) {
  return (
    <div>
      <div
        className={`border rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors ${
          isMaster
            ? 'bg-blue-50 border-blue-200'
            : 'bg-white border-slate-200'
        }`}
        onClick={onToggle}
      >
        {isMaster ? (
          <Star className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        ) : (
          <StatusDot status={file.status} />
        )}
        <a
          href={`https://drive.google.com/open?id=${file.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate flex items-center gap-1"
        >
          {isMaster && <span className="text-[10px] font-semibold text-blue-500 mr-0.5">★</span>}
          {file.name}
          <ExternalLink className="w-3 h-3 shrink-0 opacity-40" />
        </a>
        <span className="text-[10px] text-slate-400 shrink-0">
          {file.size > 0 ? `${(file.size / 1024).toFixed(1)} KB` : 'Google Doc'}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {file.daysSinceLastSync <= 1 ? 'Today' : `${file.daysSinceLastSync}d ago`}
        </span>
        {file.updateCount > 0 && (
          <span className="text-[10px] font-semibold text-amber-600 shrink-0">
            {file.updateCount} upd
          </span>
        )}
        <span className="text-slate-300 shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </span>
      </div>
      {isExpanded && (
        <div
          className={`border border-t-0 rounded-b-lg px-4 py-3 text-xs space-y-2 ${
            isMaster ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex gap-4 text-[11px] text-slate-500">
            <span>
              First seen:{' '}
              {file.firstSeen ? new Date(file.firstSeen).toLocaleDateString() : '—'}
            </span>
            <span>
              Last sync:{' '}
              {file.lastSynced ? new Date(file.lastSynced).toLocaleDateString() : '—'}
            </span>
          </div>
          {file.events.length > 0 ? (
            <>
              <div className="flex flex-col gap-1">
                {file.events.slice(-10).reverse().map((evt, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        evt.type === 'new' ? 'bg-blue-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-slate-400">
                      {new Date(evt.timestamp).toLocaleDateString()}
                    </span>
                    <span>{evt.type === 'new' ? 'Synced (new)' : 'Updated'}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400">
                Updated {file.updateCount} times across {file.events.length} syncs
              </p>
            </>
          ) : (
            <p className="text-[10px] text-slate-400 italic">
              No sync events recorded for this file
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const { files, history, settings } = useSettingsStore();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastSynced');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const enriched = useMemo(() => computeFileStats(files, history), [files, history]);
  const dailyActivity = useMemo(() => computeDailyActivity(history), [history]);

  const masterDocId = settings?.masterDocId;
  const masterDoc = useMemo(
    () => enriched.find((f) => f.id === masterDocId) ?? null,
    [enriched, masterDocId]
  );

  const filteredOthers = useMemo(() => {
    let result = masterDocId
      ? enriched.filter((f) => f.id !== masterDocId)
      : enriched;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'lastSynced': {
          if (!a.lastSynced && !b.lastSynced) return 0;
          if (!a.lastSynced) return 1;
          if (!b.lastSynced) return -1;
          return new Date(b.lastSynced).getTime() - new Date(a.lastSynced).getTime();
        }
        case 'updateCount':
          return b.updateCount - a.updateCount;
      }
    });
  }, [enriched, search, sortKey, masterDocId]);

  const recentCount = enriched.filter((f) => f.status === 'recent').length;
  const hasActivity = dailyActivity.some((d) => d.count > 0);

  if (enriched.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
        <p className="text-xs text-slate-400">No files synced yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Files" value={String(enriched.length)} />
        <StatCard
          label="Synced This Week"
          value={String(recentCount)}
          color={recentCount > 0 ? 'text-green-600' : undefined}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-[11px] text-slate-400 uppercase tracking-wide mb-2">
          Files Synced (last 14 days)
        </p>
        {hasActivity ? (
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={dailyActivity} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }}
                formatter={(v: number) => [v, 'files']}
              />
              <Bar dataKey="count" fill="#1a73e8" radius={[2, 2, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">No sync data yet</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="lastSynced">Last Synced</option>
          <option value="name">Name</option>
          <option value="updateCount">Updates</option>
        </select>
      </div>

      {masterDoc && (
        <FileRow
          file={masterDoc}
          isExpanded={expandedId === masterDoc.id}
          onToggle={() => setExpandedId(expandedId === masterDoc.id ? null : masterDoc.id)}
          isMaster
        />
      )}

      {filteredOthers.length < enriched.length - (masterDoc ? 1 : 0) && (
        <p className="text-[10px] text-slate-400">
          {filteredOthers.length} of {enriched.length - (masterDoc ? 1 : 0)} files
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {filteredOthers.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            isExpanded={expandedId === file.id}
            onToggle={() => setExpandedId(expandedId === file.id ? null : file.id)}
          />
        ))}
      </div>
    </div>
  );
}
