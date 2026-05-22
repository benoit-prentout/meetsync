# History Expandable Rows — Design Spec

**Date:** 2026-05-22  
**Status:** Approved

## Problem

Each history row shows only a summary ("X synced, Y updated"), a timestamp, and a file count badge. There is no way to see which specific files were processed in a given run, nor how long the sync took. `duration` is already stored in the backend but never returned or displayed.

## Goal

Make each history row expandable so the user can see the names of synced and updated files, plus the run duration, without cluttering the default list view.

## Approach

Store file names at sync time (when they are already available), pass them through the API, add them to the frontend type, and render an expandable row UI.

## Backend Changes (`apps-script/Code.gs`)

### `logSyncRun_` call sites (lines ~365 and ~647)

Both call sites have `syncedEntries` (objects with `.name`) and access to updated file objects. Extend the logged run object with two new fields:

```js
logSyncRun_({
  date: new Date().toISOString(),
  synced: syncedEntries.length,
  updated: updatedIds.length,
  errors: errorCount,
  duration: Date.now() - startTime,
  syncedNames: syncedEntries.map(e => e.name),
  updatedNames: updatedEntries.map(e => e.name),  // collect alongside updatedIds
});
```

`updatedNames` is derived in the processing loop where `isUpdate` is already computed (`const isUpdate = updatedIds.indexOf(file.id) !== -1`). Collect into a parallel `updatedNames` array there rather than trying to map from `updatedIds` after the fact (those are bare IDs with no name).

### `getHistory()` (line ~192)

Pass through the three new fields when present:

```js
return {
  id: r.date,
  timestamp: r.date,
  filesProcessed: filesProcessed,
  status: status,
  message: message,
  syncedNames: r.syncedNames || [],
  updatedNames: r.updatedNames || [],
  duration: r.duration || null,
};
```

Old entries that lack these fields degrade gracefully to empty arrays / null.

## Type Changes (`src/types/index.ts`)

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

## UI Changes (`src/components/History.tsx`)

### Expandable row behaviour

- Add `expandedId: string | null` state.
- Clicking a row toggles it open/closed (click again or click another row to close).
- A `ChevronDown` / `ChevronUp` icon (Lucide) appears on the right when the row has names or duration to show. Rows with no extra data (old entries with empty arrays and no duration) remain flat — no chevron, not clickable.

### Expanded section layout

Rendered below the summary line inside the same card, separated by a subtle top border:

- `▸ filename` for each entry in `syncedNames` — slate/green tint text
- `↻ filename` for each entry in `updatedNames` — slate/blue tint text
- `⏱ Xs` (e.g. "⏱ 4.2s") for duration if present — slate muted text
- Error count row if `status === 'error' || status === 'partial'` — already surfaced in the badge, no extra action needed

### Visual spec (collapsed / expanded)

```
┌─────────────────────────────────────────────────────────┐
│ ✓  3 synced, 1 updated          21/05 08:06  4 files  ∨ │
├─────────────────────────────────────────────────────────┤
│   ▸ Weekly Sync — Design review                         │
│   ▸ 1:1 with Lucas                                      │
│   ↻ Team standup (updated)                              │
│   ⏱ 4.2s                                               │
└─────────────────────────────────────────────────────────┘
```

## Out of Scope

- Error-level detail per file (which file failed and why) — not stored.
- Searching/filtering by file name — future work.
- Retroactive backfill of names for existing history entries — old entries simply show no detail.

## Testing

- Existing Vitest suite must pass unchanged (new fields are optional).
- Dev mocks in `src/dev-mocks.ts` should be updated to include `syncedNames` and `updatedNames` on seeded history entries so the expanded UI renders with realistic data during dev preview.
