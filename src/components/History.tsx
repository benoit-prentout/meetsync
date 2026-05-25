import { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { CheckCircle, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

type Filter = 'all' | 'success' | 'partial' | 'error';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function hasDetail(event: { syncedNames?: string[]; updatedNames?: string[]; duration?: number }): boolean {
  return (
    (event.syncedNames?.length ?? 0) > 0 ||
    (event.updatedNames?.length ?? 0) > 0 ||
    event.duration != null
  );
}

export function History() {
  const { history } = useSettingsStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = filter === 'all' ? history : history.filter(e => e.status === filter);

  function toggleRow(id: string, expandable: boolean) {
    if (!expandable) return;
    setExpandedId(prev => (prev === id ? null : id));
  }

  const filterBtn = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
        filter === f
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 pb-1">
        {filterBtn('all', `All (${history.length})`)}
        {filterBtn('success', 'Success')}
        {filterBtn('partial', 'Partial')}
        {filterBtn('error', 'Error')}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
          <p className="text-xs text-slate-400">
            {history.length === 0 ? 'No sync history yet' : 'No events match this filter'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((event) => {
            const expandable = hasDetail(event);
            const isOpen = expandedId === event.id;

            return (
              <li
                key={event.id}
                role="listitem"
                onClick={() => toggleRow(event.id, expandable)}
                className={`bg-white border border-slate-200 rounded-lg overflow-hidden ${
                  expandable ? 'cursor-pointer hover:border-slate-300' : ''
                }`}
              >
                {/* Summary row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  {event.status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  {event.status === 'partial' && <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                  {event.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}

                  <p className="flex-1 text-xs text-slate-700 truncate">{event.message}</p>

                  <span className="text-[10px] text-slate-400 shrink-0">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>

                  {event.status === 'error' ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 bg-red-50 text-red-600">
                      Failed
                    </span>
                  ) : (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      event.status === 'success'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}>
                      {event.filesProcessed} file{event.filesProcessed !== 1 ? 's' : ''}
                    </span>
                  )}

                  {expandable && (
                    <span data-testid="chevron" className="text-slate-400 shrink-0">
                      {isOpen
                        ? <ChevronUp className="w-3.5 h-3.5" />
                        : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>

                {/* Expanded detail panel */}
                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-2.5 flex flex-col gap-1">
                    {event.syncedNames?.map((name, i) => (
                      <p key={`s-${i}`} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <span className="text-green-600 font-bold">▸</span>
                        {name}
                      </p>
                    ))}
                    {event.updatedNames?.map((name, i) => (
                      <p key={`u-${i}`} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <span className="text-blue-500 font-bold">↻</span>
                        {name}
                      </p>
                    ))}
                    {event.duration != null && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>⏱</span>
                        {formatDuration(event.duration)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
