import { useState } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { CheckCircle, AlertCircle, XCircle } from 'lucide-react';

type Filter = 'all' | 'success' | 'partial' | 'error';

export function History() {
  const { history } = useSettingsStore();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = filter === 'all' ? history : history.filter(e => e.status === filter);

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
        filtered.map((event) => (
          <div
            key={event.id}
            className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3"
          >
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
          </div>
        ))
      )}
    </div>
  );
}
