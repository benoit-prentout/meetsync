# Analytics Page Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) for syntax tracking.

**Goal:** Transform the Analytics page from a single-chart stat page into a multi-section insights dashboard with doc health, performance, reliability, and content breakdown.

**Architecture:** All UI data is computed client-side from existing Zustand store state (`history[]`, `files[]`, `docSize`). Two tiny backend changes (add `docSize` to sync records, track archive events) make the growth chart accurate going forward. One new reusable chart wrapper component; Analytics.tsx complete rewrite.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Recharts + Zustand

---

### Files Created/Modified

| File | Action | Responsibility |
|------|--------|---------------|
| `apps-script/Code.gs` | Modify (~10 lines) | Add `docSize` to `logSyncRun_`, track archive events in `checkAndArchive_`, expose in `getStatus` |
| `src/types/index.ts` | Modify | Add `ArchiveEvent` interface, optional `docSize` to `SyncEvent`, `archiveEvents` to `StatusResponse` |
| `src/store/settingsStore.ts` | Modify | Add `archiveEvents: ArchiveEvent[]` state + `setArchiveEvents` action |
| `src/hooks/useApi.ts` | Modify | Call `setArchiveEvents` inside `getStatus` |
| `src/components/AnalyticsChart.tsx` | **Create** | Reusable chart wrapper with title + empty state |
| `src/components/Analytics.tsx` | Rewrite | Full multi-section page |
| `src/components/Analytics.test.tsx` | **Create** | Tests for all chart sections and computations |
| `src/dev-mocks.ts` | Modify | Add mock `archiveEvents` for dev preview |

---

### Task 1: Backend Changes (Code.gs)

**Files:**
- Modify: `apps-script/Code.gs:919-929` — `logSyncRun_`
- Modify: `apps-script/Code.gs:763-854` — `checkAndArchive_`
- Modify: `apps-script/Code.gs:169-182` — `getStatus`

- [ ] **Step 1: Add docSize to logSyncRun_**

In `logSyncRun_` (line 919), add the current `estimatedChars` to the stored record:

```javascript
function logSyncRun_(run) {
  try {
    const props = PropertiesService.getScriptProperties();
    run.docSize = parseInt(props.getProperty('estimatedChars') || '0', 10);  // ADD THIS LINE
    const history = JSON.parse(props.getProperty('syncHistory') || '[]');
    history.unshift(run);
    if (history.length > CONFIG.HISTORY_SIZE) history.length = CONFIG.HISTORY_SIZE;
    props.setProperty('syncHistory', JSON.stringify(history));
  } catch (e) {
    console.error(`logSyncRun_ failed: ${e.message}`);
  }
}
```

- [ ] **Step 2: Record archive events in checkAndArchive_**

At the end of `checkAndArchive_`, after `props.setProperty('estimatedChars', '0')`, store the archive event:

```javascript
// After line 831: props.setProperty('estimatedChars', '0');
// Add:
var archiveHistory = JSON.parse(props.getProperty('archiveHistory') || '[]');
archiveHistory.unshift({
  date: new Date().toISOString(),
  sizeBefore: estimatedChars,
  reason: archiveReason
});
if (archiveHistory.length > 10) archiveHistory.length = 10;
props.setProperty('archiveHistory', JSON.stringify(archiveHistory));
```

- [ ] **Step 3: Expose archiveEvents in getStatus**

Add archive events to the `getStatus` return value:

```javascript
function getStatus() {
  const props = PropertiesService.getScriptProperties();
  const estimatedChars = parseInt(props.getProperty('estimatedChars') || '0', 10);
  const lastSync = props.getProperty('lastSync');
  const isConfigured = Boolean(CONFIG.MASTER_DOC_ID && CONFIG.ARCHIVE_FOLDER_ID);
  const archiveHistory = JSON.parse(props.getProperty('archiveHistory') || '[]');  // ADD

  return {
    success: true,
    lastSync: lastSync ? new Date(parseInt(lastSync, 10)).toISOString() : null,
    docSize: estimatedChars,
    isConfigured: isConfigured,
    backendIntegrity: SCRIPT_INTEGRITY,
    archiveEvents: archiveHistory.slice(0, 5)  // ADD
  };
}
```

---

### Task 2: TypeScript Types + Zustand Store

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/hooks/useApi.ts`

- [ ] **Step 1: Add ArchiveEvent type + update SyncEvent and StatusResponse**

In `src/types/index.ts`, add the new `ArchiveEvent` interface and update existing types:

```typescript
export interface SyncEvent {
  id: string;
  timestamp: string;
  filesProcessed: number;
  status: 'success' | 'partial' | 'error';
  message: string;
  syncedNames?: string[];
  updatedNames?: string[];
  duration?: number;
  docSize?: number;  // ADD — populated by backend from deploy-forward
}

export interface StatusResponse {
  success: boolean;
  lastSync: string | null;
  docSize: number;
  isConfigured: boolean;
  backendIntegrity?: string;
  archiveEvents?: ArchiveEvent[];  // ADD
}

export interface ArchiveEvent {  // ADD
  date: string;
  sizeBefore: number;
  reason: string;
}
```

- [ ] **Step 2: Add archiveEvents to Zustand store**

In `src/store/settingsStore.ts`, add the new state field and action:

```typescript
import type { Settings, SyncEvent, SyncFile, ArchiveEvent } from '@/types';  // ADD ArchiveEvent

interface SettingsState {
  // ... existing fields
  archiveEvents: ArchiveEvent[];  // ADD
  // ... existing actions
  setArchiveEvents: (events: ArchiveEvent[]) => void;  // ADD
}

// In the create() call:
archiveEvents: [],  // ADD (after files: [])

setArchiveEvents: (events) => set({ archiveEvents: events }),  // ADD
```

- [ ] **Step 3: Wire archiveEvents into useApi.ts**

In `src/hooks/useApi.ts`, update `getStatus` to also set `archiveEvents`:

```diff
- const { accessToken, setLoading, setError, setStatus, setHistory, setFiles, setSettings } = useSettingsStore();
+ const { accessToken, setLoading, setError, setStatus, setHistory, setFiles, setSettings, setArchiveEvents } = useSettingsStore();

// In getStatus:
- setStatus(response.lastSync || '', response.docSize);
+ setStatus(response.lastSync || '', response.docSize);
+ setArchiveEvents(response.archiveEvents ?? []);

// Add setArchiveEvents to the dependency array:
- }, [accessToken, setLoading, setError, setStatus]);
+ }, [accessToken, setLoading, setError, setStatus, setArchiveEvents]);
```

---

### Task 3: AnalyticsChart Reusable Component

**Files:**
- Create: `src/components/AnalyticsChart.tsx`
- Create: `src/components/AnalyticsChart.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalyticsChart } from './AnalyticsChart';

describe('AnalyticsChart', () => {
  it('renders the title', () => {
    render(<AnalyticsChart title="Doc Growth" isEmpty={false} emptyMessage="">content</AnalyticsChart>);
    expect(screen.getByText('Doc Growth')).toBeInTheDocument();
  });

  it('shows empty message when isEmpty is true', () => {
    render(<AnalyticsChart title="Test" isEmpty={true} emptyMessage="Not enough data">content</AnalyticsChart>);
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders children when not empty', () => {
    render(<AnalyticsChart title="Test" isEmpty={false} emptyMessage=""><div>chart content</div></AnalyticsChart>);
    expect(screen.getByText('chart content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/AnalyticsChart.test.tsx` — expects FAIL (component not found)

- [ ] **Step 3: Write the component**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/AnalyticsChart.test.tsx` — expects PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/AnalyticsChart.tsx src/components/AnalyticsChart.test.tsx apps-script/Code.gs src/types/index.ts src/store/settingsStore.ts src/hooks/useApi.ts
git commit -m "feat: backend + store changes for analytics enhancement"
```

---

### Task 4: Analytics.tsx Rewrite

**Files:**
- Rewrite: `src/components/Analytics.tsx`
- Create: `src/components/Analytics.test.tsx`

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Analytics } from './Analytics';

const mockHistory = [
  { id: 'h1', timestamp: '2026-05-21T08:00:00Z', filesProcessed: 5, status: 'success', message: '3 synced, 2 updated', syncedNames: ['A', 'B', 'C'], updatedNames: ['D', 'E'], duration: 4200 },
  { id: 'h2', timestamp: '2026-05-18T08:00:00Z', filesProcessed: 2, status: 'success', message: '2 synced, 0 updated', syncedNames: ['F', 'G'], updatedNames: [], duration: 2100 },
  { id: 'h3', timestamp: '2026-05-15T08:00:00Z', filesProcessed: 1, status: 'error', message: '0 synced, 0 updated, 1 error', syncedNames: [], updatedNames: [], duration: 800 },
  { id: 'h4', timestamp: '2026-05-12T08:00:00Z', filesProcessed: 3, status: 'partial', message: '2 synced, 1 updated, 1 error', syncedNames: ['H', 'I'], updatedNames: ['J'], duration: 3200 },
];

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    history: mockHistory,
    lastSync: '2026-05-21T08:00:00Z',
    docSize: 450000,
    settings: { archiveThresholdChars: 800000 },
    files: [
      { id: 'f1', name: 'Weekly Sync', lastSynced: '2026-05-21T08:00:00Z', size: 0 },
      { id: 'f2', name: 'Q2 Planning', lastSynced: '2026-05-18T08:00:00Z', size: 0 },
      { id: 'f3', name: 'Standup', lastSynced: '2026-05-15T08:00:00Z', size: 0 },
    ],
    archiveEvents: [],
  })),
}));

describe('Analytics top stat row', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders row 1 stat cards', () => {
    render(<Analytics />);
    expect(screen.getByText('Total Syncs')).toBeInTheDocument();
    expect(screen.getByText('Files Processed')).toBeInTheDocument();
    expect(screen.getByText('Avg Files / Sync')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
  });

  it('computes row 1 stats correctly', () => {
    render(<Analytics />);
    expect(screen.getByText('4')).toBeInTheDocument();  // total syncs
    expect(screen.getByText('11')).toBeInTheDocument(); // total files
    expect(screen.getByText('2.8')).toBeInTheDocument(); // avg
    expect(screen.getByText('50%')).toBeInTheDocument(); // success rate (2/4)
  });

  it('renders row 2 stat cards', () => {
    render(<Analytics />);
    expect(screen.getByText('Growth Rate')).toBeInTheDocument();
    expect(screen.getByText('Days to Archive')).toBeInTheDocument();
    expect(screen.getByText('Avg Duration')).toBeInTheDocument();
    expect(screen.getByText('Success Streak')).toBeInTheDocument();
  });
});

describe('Analytics sections', () => {
  it('renders Doc Health section', () => {
    render(<Analytics />);
    expect(screen.getByText('Doc Size Growth')).toBeInTheDocument();
  });

  it('renders Performance section', () => {
    render(<Analytics />);
    expect(screen.getByText('Sync Duration')).toBeInTheDocument();
  });

  it('renders reliability stats', () => {
    render(<Analytics />);
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('Best')).toBeInTheDocument();
    expect(screen.getByText('Worst')).toBeInTheDocument();
  });

  it('renders Content Breakdown section', () => {
    render(<Analytics />);
    expect(screen.getByText('New vs Updated')).toBeInTheDocument();
    expect(screen.getByText('Most Updated Files')).toBeInTheDocument();
  });

  it('renders Source Overview section', () => {
    render(<Analytics />);
    expect(screen.getByText('Total Unique Files')).toBeInTheDocument();
    expect(screen.getByText('Syncs / Week')).toBeInTheDocument();
  });
});

describe('Analytics empty state', () => {
  it('shows empty messages when no history', () => {
    const { useSettingsStore } = vi.importActual('@/store/settingsStore');
    (vi.mocked(useSettingsStore) as any).mockReturnValue({
      history: [],
      lastSync: null,
      docSize: 0,
      settings: { archiveThresholdChars: 800000 },
      files: [],
      archiveEvents: [],
    });
    render(<Analytics />);
    expect(screen.getAllByText(/No sync history yet/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/Analytics.test.tsx` — expects FAIL

- [ ] **Step 3: Rewrite Analytics.tsx**

```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line, CartesianGrid } from 'recharts';
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
    const estimatedSize = docSize * (cumulativeFiles / totalFiles);
    return {
      date: new Date(e.timestamp).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      sizeKB: Math.round(estimatedSize / 1024),
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

  const gap3 = 'gap-3';

  return (
    <div className={`space-y-3`}>
      {/* Row 1 — existing 4 stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Syncs" value={String(r1.totalSyncs)} />
        <StatCard label="Files Processed" value={String(r1.totalFiles)} />
        <StatCard label="Avg Files / Sync" value={r1.avgFiles} />
        <StatCard label="Success Rate" value={r1.successRate !== null ? `${r1.successRate}%` : '—'}
          valueColor={r1.successRate !== null ? (r1.successRate >= 80 ? 'text-green-600' : r1.successRate >= 50 ? 'text-amber-600' : 'text-red-500') : 'text-slate-300'} />
      </div>

      {/* Row 2 — new 4 stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Growth Rate" value={r2.growthRateKBPerDay > 0 ? `+${r2.growthRateKBPerDay.toFixed(1)} KB/day` : '—'} />
        <StatCard label="Days to Archive" value={r2.daysToArchive !== null ? `~${r2.daysToArchive}d` : '—'} />
        <StatCard label="Avg Duration" value={r2.avgDuration !== null ? formatDuration(Math.round(r2.avgDuration)) : '—'} />
        <StatCard label="Success Streak" value={String(r2.streak)} valueColor={r2.streak >= 3 ? 'text-green-600' : 'text-slate-900'} />
      </div>

      {/* Doc Health — 2col */}
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

        {/* Threshold Gauge */}
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

      {/* Performance + Reliability — 2col */}
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
              <div>
                <span className="text-slate-400">Avg </span>
                <span className="font-semibold text-slate-700">{r2.avgDuration !== null ? formatDuration(Math.round(r2.avgDuration)) : '—'}</span>
              </div>
              <div>
                <span className="text-slate-400">Best </span>
                <span className="font-semibold text-green-600">
                  {durationData.length > 0 ? formatDuration(Math.round(Math.min(...durationData.map(d => d.seconds * 1000)))) : '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Worst </span>
                <span className="font-semibold text-red-500">
                  {durationData.length > 0 ? formatDuration(Math.round(Math.max(...durationData.map(d => d.seconds * 1000)))) : '—'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <div>
                <span className="text-slate-400">Errors </span>
                <span className="font-semibold text-red-500">{history.filter(e => e.status === 'error').length}</span>
              </div>
              <div>
                <span className="text-slate-400">Partial </span>
                <span className="font-semibold text-amber-600">{history.filter(e => e.status === 'partial').length}</span>
              </div>
              <div>
                <span className="text-slate-400">Clean </span>
                <span className="font-semibold text-green-600">{history.filter(e => e.status === 'success').length}</span>
              </div>
            </div>
          </div>
        </AnalyticsChart>
      </div>

      {/* Content Breakdown — 2col */}
      <div className="grid grid-cols-2 gap-3">
        <AnalyticsChart title="New vs Updated" isEmpty={history.length === 0} emptyMessage="No sync history yet">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={contentData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} stackOffset="sign">
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6 }}
              />
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

      {/* Source Overview — 4 compact stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Last Sync" value={formatLastSync(lastSync, true)} small />
        <StatCard label="Total Unique Files" value={String(files.length)} small />
        <StatCard label="Most Active Day" value={mostActiveDay} small />
        <StatCard label="Syncs / Week" value={syncsPerWeek} small />
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor, small }: { label: string; value: string; valueColor?: string; small?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col justify-between h-[70px]">
      <span className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</span>
      <span className={`${small ? 'text-sm' : 'text-2xl'} font-bold ${valueColor || 'text-slate-900'}`}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/Analytics.test.tsx src/components/AnalyticsChart.test.tsx` — expects PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Analytics.tsx src/components/Analytics.test.tsx
git commit -m "feat: rewrite analytics page with multi-section insights dashboard"
```

---

### Task 5: Dev Mocks

**Files:**
- Modify: `src/dev-mocks.ts`

- [ ] **Step 1: Add mock archiveEvents**

Add `archiveEvents` to the mock state in `src/dev-mocks.ts`:

```typescript
archiveEvents: [
  { date: new Date(now - 15 * day).toISOString(), sizeBefore: 823000, reason: 'Size limit reached (~823K chars)' },
],
```

Place this after the `files` array, before the closing `})`.

- [ ] **Step 2: Verify dev preview loads**

Run: `npm run dev` — open `/dashboard-dev.html` in the browser, navigate to Analytics tab, verify all sections render.

- [ ] **Step 3: Commit**

```bash
git add src/dev-mocks.ts
git commit -m "chore: add mock archive events for dev preview"
```

---

### Task 6: Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run` — expects all tests pass (including existing Dashboard, History tests)

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit` — expects no type errors (verify `ArchiveEvent` is exported, `docSize` is optional on SyncEvent, all store types match)

- [ ] **Step 3: Run build**

Run: `npm run build` — expects no errors in both popup and dashboard builds
