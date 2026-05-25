# History Expandable Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each history row expandable to reveal the names of synced/updated files and the run duration.

**Architecture:** Extend the stored run record in Apps Script to include file name arrays, pass them through `getHistory()`, add optional fields to `SyncEvent`, then render a collapsible detail panel below each row in `History.tsx`.

**Tech Stack:** Google Apps Script (vanilla JS), TypeScript, React, Tailwind CSS, Lucide React icons, Vitest + Testing Library

---

## File Map

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `syncedNames?`, `updatedNames?`, `duration?` to `SyncEvent` |
| `apps-script/history-transform.test.ts` | Add tests for new fields pass-through |
| `apps-script/Code.gs` | `getHistory()` pass-through + both `logSyncRun_` call sites |
| `src/dev-mocks.ts` | Seed `syncedNames`, `updatedNames`, `duration` on history entries |
| `src/components/History.test.tsx` | **New** — expandable row behaviour tests |
| `src/components/History.tsx` | Expandable row UI |

---

### Task 1: Extend `SyncEvent` type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update the `SyncEvent` interface**

Replace the existing `SyncEvent` interface in `src/types/index.ts`:

```ts
export interface SyncEvent {
  id: string;
  timestamp: string;
  filesProcessed: number;
  status: 'success' | 'partial' | 'error';
  message: string;
  syncedNames?: string[];
  updatedNames?: string[];
  duration?: number;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npm run build 2>&1 | head -30
```

Expected: build succeeds (new fields are optional — existing code is unaffected).

- [ ] **Step 3: Commit**

```bash
rtk git add src/types/index.ts && rtk git commit -m "feat(types): add syncedNames, updatedNames, duration to SyncEvent"
```

---

### Task 2: Update history transform test and `getHistory()` in Code.gs

**Files:**
- Modify: `apps-script/history-transform.test.ts`
- Modify: `apps-script/Code.gs` (function `getHistory`, line ~192)

- [ ] **Step 1: Write failing tests for new fields**

Append these two test cases to the `describe('getHistory transform', ...)` block in `apps-script/history-transform.test.ts`.

First update the `transformHistoryRecord` function signature at the top of the file to accept and pass through the new fields:

```ts
function transformHistoryRecord(
  r: {
    date: string;
    synced?: number;
    updated?: number;
    errors?: number;
    syncedNames?: string[];
    updatedNames?: string[];
    duration?: number;
  },
  _i: number
) {
  const filesProcessed = (r.synced || 0) + (r.updated || 0);
  const status =
    r.errors && r.errors > 0
      ? filesProcessed > 0
        ? 'partial'
        : 'error'
      : 'success';
  const message =
    (r.synced || 0) +
    ' synced, ' +
    (r.updated || 0) +
    ' updated' +
    (r.errors ? ', ' + r.errors + ' errors' : '');
  return {
    id: r.date,
    timestamp: r.date,
    filesProcessed,
    status,
    message,
    syncedNames: r.syncedNames || [],
    updatedNames: r.updatedNames || [],
    duration: r.duration || null,
  };
}
```

Then add these two tests to the existing `describe` block:

```ts
  it('passes through syncedNames and updatedNames when present', () => {
    const result = transformHistoryRecord(
      {
        date: '2025-01-01T00:00:00.000Z',
        synced: 2,
        updated: 1,
        errors: 0,
        syncedNames: ['Weekly Sync', '1:1 Lucas'],
        updatedNames: ['Team standup'],
      },
      0
    );
    expect(result.syncedNames).toEqual(['Weekly Sync', '1:1 Lucas']);
    expect(result.updatedNames).toEqual(['Team standup']);
  });

  it('defaults syncedNames, updatedNames to [] and duration to null when absent', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 1, updated: 0, errors: 0 },
      0
    );
    expect(result.syncedNames).toEqual([]);
    expect(result.updatedNames).toEqual([]);
    expect(result.duration).toBeNull();
  });

  it('passes through duration when present', () => {
    const result = transformHistoryRecord(
      { date: '2025-01-01T00:00:00.000Z', synced: 1, updated: 0, errors: 0, duration: 4200 },
      0
    );
    expect(result.duration).toBe(4200);
  });
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test -- apps-script/history-transform.test.ts 2>&1 | tail -20
```

Expected: the 3 new tests FAIL because the function doesn't return the new fields yet. (The 4 existing tests should still pass.)

- [ ] **Step 3: Update `getHistory()` in `apps-script/Code.gs`**

Find the `return { ... }` block inside the `.map()` in `getHistory()` (around line 199) and replace it:

```js
// BEFORE:
return {
  id: r.date,
  timestamp: r.date,
  filesProcessed: filesProcessed,
  status: status,
  message: message
};

// AFTER:
return {
  id: r.date,
  timestamp: r.date,
  filesProcessed: filesProcessed,
  status: status,
  message: message,
  syncedNames: r.syncedNames || [],
  updatedNames: r.updatedNames || [],
  duration: r.duration || null
};
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- apps-script/history-transform.test.ts 2>&1 | tail -20
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps-script/history-transform.test.ts apps-script/Code.gs && rtk git commit -m "feat(backend): pass syncedNames, updatedNames, duration through getHistory"
```

---

### Task 3: Store file names at sync time in Code.gs

**Files:**
- Modify: `apps-script/Code.gs` — both `logSyncRun_` call sites (~line 365 and ~line 647)

There are two functions that call `logSyncRun_`: `appendMeetNotesToMasterRestAPI` and `appendMeetNotesToMaster`. Both need the same change.

- [ ] **Step 1: Update `appendMeetNotesToMasterRestAPI` (~line 320–365)**

Locate the line `const syncedEntries = [];` near line 322 and add `updatedNames` initialization right after it:

```js
const syncedEntries = [];
const updatedNames = [];   // ← add this line
let errorCount = 0;
```

Inside the `for (const file of filesToProcess)` loop, find `const isUpdate = updatedIds.indexOf(file.id) !== -1;` and add the name collection right after it:

```js
const isUpdate = updatedIds.indexOf(file.id) !== -1;
if (isUpdate) updatedNames.push(file.name);   // ← add this line
```

Find the `logSyncRun_` call near line 365 and extend it:

```js
// BEFORE:
logSyncRun_({ date: new Date().toISOString(), synced: syncedEntries.length, updated: updatedIds.length, errors: errorCount, duration });

// AFTER:
logSyncRun_({
  date: new Date().toISOString(),
  synced: syncedEntries.length,
  updated: updatedIds.length,
  errors: errorCount,
  duration,
  syncedNames: syncedEntries.map(e => e.name),
  updatedNames
});
```

- [ ] **Step 2: Update `appendMeetNotesToMaster` (~line 594–647)**

Locate the line `const syncedEntries = [];` near line 594 and add `updatedNames` initialization right after it:

```js
const syncedEntries = [];
const updatedNames = [];   // ← add this line
let errorCount = 0;
```

Inside the `for (const file of filesToProcess)` loop, find `const isUpdate = updatedIds.indexOf(file.id) !== -1;` and add the name collection right after it:

```js
const isUpdate = updatedIds.indexOf(file.id) !== -1;
if (isUpdate) updatedNames.push(file.name);   // ← add this line
```

Find the `logSyncRun_` call near line 647 and extend it:

```js
// BEFORE:
logSyncRun_({ date: new Date().toISOString(), synced: syncedEntries.length, updated: updatedIds.length, errors: errorCount, duration });

// AFTER:
logSyncRun_({
  date: new Date().toISOString(),
  synced: syncedEntries.length,
  updated: updatedIds.length,
  errors: errorCount,
  duration,
  syncedNames: syncedEntries.map(e => e.name),
  updatedNames
});
```

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
rtk git add apps-script/Code.gs && rtk git commit -m "feat(backend): collect file names in sync runs and pass to logSyncRun_"
```

---

### Task 4: Update dev mocks with realistic file names

**Files:**
- Modify: `src/dev-mocks.ts`

- [ ] **Step 1: Add `syncedNames`, `updatedNames`, `duration` to seeded history**

Replace the `history` array in `src/dev-mocks.ts` with this version (file names match the seeded `files` array):

```ts
  history: [
    {
      id: 'h1',
      timestamp: new Date(now - 3 * day).toISOString(),
      filesProcessed: 2,
      status: 'partial',
      message: '1 synced, 1 updated, 2 errors',
      syncedNames: ['Weekly Sync — Product Team'],
      updatedNames: ['Q2 Planning Session'],
      duration: 3800,
    },
    {
      id: 'h2',
      timestamp: new Date(now - 2 * day).toISOString(),
      filesProcessed: 1,
      status: 'success',
      message: '1 synced, 0 updated',
      syncedNames: ['Customer Discovery — Acme Corp'],
      updatedNames: [],
      duration: 1200,
    },
    {
      id: 'h3',
      timestamp: new Date(now - 4 * day).toISOString(),
      filesProcessed: 0,
      status: 'partial',
      message: '0 synced, 0 updated',
      syncedNames: [],
      updatedNames: [],
      duration: 900,
    },
    {
      id: 'h4',
      timestamp: new Date(now - 5 * day).toISOString(),
      filesProcessed: 5,
      status: 'success',
      message: '3 synced, 2 updated',
      syncedNames: ['Engineering All-Hands', 'Weekly Sync — Product Team', 'Q2 Planning Session'],
      updatedNames: ['Customer Discovery — Acme Corp', '1:1 with Lucas'],
      duration: 6100,
    },
    {
      id: 'h5',
      timestamp: new Date(now - 7 * day).toISOString(),
      filesProcessed: 2,
      status: 'success',
      message: '2 synced, 0 updated',
      syncedNames: ['Weekly Sync — Product Team', 'Engineering All-Hands'],
      updatedNames: [],
      duration: 2200,
    },
    // Old entries without names — test graceful degradation
    { id: 'h6', timestamp: new Date(now - 8 * day).toISOString(), filesProcessed: 0, status: 'error', message: 'Failed: quota exceeded' },
    { id: 'h7', timestamp: new Date(now - 10 * day).toISOString(), filesProcessed: 4, status: 'success', message: '4 synced, 0 updated' },
    { id: 'h8', timestamp: new Date(now - 12 * day).toISOString(), filesProcessed: 2, status: 'success', message: '2 synced, 0 updated' },
  ],
```

- [ ] **Step 2: Run tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add src/dev-mocks.ts && rtk git commit -m "chore(dev): seed history entries with syncedNames, updatedNames, duration"
```

---

### Task 5: Write failing History component tests

**Files:**
- Create: `src/components/History.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/components/History.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { History } from './History';

const mockHistory = [
  {
    id: 'h1',
    timestamp: '2026-05-21T08:06:19.000Z',
    filesProcessed: 3,
    status: 'success' as const,
    message: '2 synced, 1 updated',
    syncedNames: ['Weekly Sync — Design review', '1:1 with Lucas'],
    updatedNames: ['Team standup'],
    duration: 4200,
  },
  {
    id: 'h2',
    timestamp: '2026-05-20T08:06:19.000Z',
    filesProcessed: 1,
    status: 'error' as const,
    message: '0 synced, 0 updated, 1 error',
    syncedNames: [],
    updatedNames: [],
    duration: 800,
  },
  // Old entry with no names — graceful degradation
  {
    id: 'h3',
    timestamp: '2026-05-19T08:06:19.000Z',
    filesProcessed: 2,
    status: 'success' as const,
    message: '2 synced, 0 updated',
  },
];

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({ history: mockHistory })),
}));

describe('History', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all events', () => {
    render(<History />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows a chevron for rows that have file names', () => {
    render(<History />);
    // h1 has names — chevron should be present
    const rows = screen.getAllByRole('listitem');
    expect(rows[0].querySelector('[data-testid="chevron"]')).toBeTruthy();
  });

  it('does NOT show a chevron for old entries with no names and no duration', () => {
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    // h3 (index 2) has no syncedNames, no updatedNames, no duration
    expect(rows[2].querySelector('[data-testid="chevron"]')).toBeNull();
  });

  it('is collapsed by default — file names not visible', () => {
    render(<History />);
    expect(screen.queryByText('Weekly Sync — Design review')).toBeNull();
  });

  it('expands a row on click, showing synced file names with ▸ prefix', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Weekly Sync — Design review')).toBeInTheDocument();
    expect(screen.getByText('1:1 with Lucas')).toBeInTheDocument();
  });

  it('shows updated file names with ↻ prefix when expanded', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Team standup')).toBeInTheDocument();
  });

  it('shows formatted duration when expanded', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText(/4\.2s/)).toBeInTheDocument();
  });

  it('collapses a row when clicked again', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Weekly Sync — Design review')).toBeInTheDocument();
    await user.click(rows[0]);
    expect(screen.queryByText('Weekly Sync — Design review')).toBeNull();
  });

  it('closes the open row when a different row is clicked', async () => {
    const user = userEvent.setup();
    render(<History />);
    const rows = screen.getAllByRole('listitem');
    await user.click(rows[0]);
    expect(screen.getByText('Weekly Sync — Design review')).toBeInTheDocument();
    await user.click(rows[1]);
    expect(screen.queryByText('Weekly Sync — Design review')).toBeNull();
  });

  it('filter buttons narrow the list', async () => {
    const user = userEvent.setup();
    render(<History />);
    await user.click(screen.getByRole('button', { name: /error/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test -- src/components/History.test.tsx 2>&1 | tail -30
```

Expected: most tests FAIL (no `role="listitem"`, no chevron, no expand behaviour yet).

---

### Task 6: Implement expandable History component

**Files:**
- Modify: `src/components/History.tsx`

- [ ] **Step 1: Rewrite `History.tsx`**

Replace the entire contents of `src/components/History.tsx`:

```tsx
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
                    {event.syncedNames?.map((name) => (
                      <p key={name} className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <span className="text-green-600 font-bold">▸</span>
                        {name}
                      </p>
                    ))}
                    {event.updatedNames?.map((name) => (
                      <p key={name} className="text-[11px] text-slate-600 flex items-center gap-1.5">
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
```

- [ ] **Step 2: Run History tests — expect all pass**

```bash
npm test -- src/components/History.test.tsx 2>&1 | tail -30
```

Expected: all 10 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS with no regressions.

- [ ] **Step 4: Commit**

```bash
rtk git add src/components/History.tsx src/components/History.test.tsx && rtk git commit -m "feat(ui): expandable history rows with file names and duration"
```

---

## Done

All 6 tasks complete. The full change set:
- Apps Script stores and returns `syncedNames`, `updatedNames`, `duration` per run
- Old history entries degrade gracefully (empty arrays, no chevron)
- History rows expand on click to show per-file detail
- Dev mocks reflect realistic data for preview
- 10 new component tests, existing test suite unaffected
