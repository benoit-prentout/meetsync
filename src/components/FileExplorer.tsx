import { useSettingsStore } from '@/store/settingsStore';
import { FileText } from 'lucide-react';

export function FileExplorer() {
  const { files } = useSettingsStore();

  return (
    <div className="flex flex-col gap-2">
      {files.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
          <p className="text-xs text-slate-400">No files synced yet</p>
        </div>
      ) : (
        files.map((file) => (
          <div
            key={file.id}
            className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <p className="flex-1 text-xs text-slate-700 truncate">{file.name}</p>
            <span className="text-[10px] text-slate-400 shrink-0">
              {file.size > 0 ? `${(file.size / 1024).toFixed(1)} KB` : 'Google Doc'}
            </span>
            <span className="text-[10px] text-slate-400 shrink-0">
              {new Date(file.lastSynced).toLocaleDateString()}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
