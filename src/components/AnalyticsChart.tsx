import { ReactNode } from 'react';

interface AnalyticsChartProps {
  title: string;
  isEmpty: boolean;
  emptyMessage: string;
  children?: ReactNode;
}

export function AnalyticsChart({ title, isEmpty, emptyMessage, children }: AnalyticsChartProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-semibold text-slate-900 mb-3">{title}</p>
      {isEmpty ? (
        <p className="text-xs text-slate-400 py-6 text-center">{emptyMessage}</p>
      ) : (
        children
      )}
    </div>
  );
}
