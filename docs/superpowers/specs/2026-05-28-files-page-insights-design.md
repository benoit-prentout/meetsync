# Files Page Insights Design

## Overview

Transform the Files page from a basic flat list into an insightful file management hub with summary stats, per-file analytics, search/sort, and expandable sync history — all computed client-side from existing store data.

## Data Flow

A pure `computeFileStats(files, history)` function enriches each `SyncFile` with derived data:

```typescript
interface FileStats {
  updateCount: number;
  firstSeen: string | null;     // ISO date of first sync event
  daysSinceLastSync: number;
  status: 'fresh' | 'active' | 'stale' | 'never';
  events: { timestamp: string; type: 'new' | 'updated' }[];
}
```

- `updateCount` — occurrences in `history[].updatedNames`
- `firstSeen` — earliest `history` event referencing the file in `syncedNames` or `updatedNames`
- `daysSinceLastSync` — computed from `file.lastSynced`
- `status` — fresh (≤7d), active (8-30d), stale (>30d), never (no events)
- `events` — chronologically ordered subset of history events mentioning this file

**No backend changes.** Same pattern as Analytics.tsx — a compute function feeding into the component.

## Sections

### 1. Overview Stat Bar

Four compact stat cards in a grid, same style as the Analytics page:

| Total Files | Active This Week | Stale Files | Files with Updates |
|---|---|---|---|

Helps users assess the health of their file collection at a glance.

### 2. Search + Sort Toolbar

- Search input: filters files by name (case-insensitive substring match)
- Sort dropdown: sort by name, last synced (newest first), update count (highest first)

### 3. Enriched File List

Each row displays:
- **Status dot**: green (fresh), amber (active), red (stale), gray (never)
- **File name**: clickable link opening `https://drive.google.com/open?id={file.id}`
- **Size label**: "Google Doc" or "X.X KB"
- **Last synced**: relative time (e.g. "2d ago")
- **Update count**: "N upd" badge

Hover background highlight on rows.

### 4. Expandable Detail Panel (accordion)

Clicking a row toggles an inline panel with:
- First seen date, last sync date
- Chronological list of sync events involving this file
- Summary: "Updated N times across M syncs"

Only one file expanded at a time.

## Component Architecture

```
FileExplorer (container)
├── computeFileStats() — pure utility in a separate file
├── Stat cards row
├── Search + sort toolbar
├── File rows (mapped)
│   └── Expandable detail panel (conditional)
```

## File Changes

| File | Action |
|------|--------|
| `src/lib/fileStats.ts` | **New** — `computeFileStats()` utility |
| `src/components/FileExplorer.tsx` | **Rewrite** — 32 lines → ~180 lines |
| `src/components/FileExplorer.test.tsx` | **New** — test pure logic + component |

## Edge Cases

- Empty files array → stat cards show 0s, empty state message
- File with no history events → status = "never", updateCount = 0
- Very long file names → truncated with CSS
- Thumb enters search → debounced live filtering
- 1000+ files → list still renders all at once (no pagination in scope)
