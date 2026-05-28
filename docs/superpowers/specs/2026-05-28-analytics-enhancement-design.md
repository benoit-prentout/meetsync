# Analytics Page Enhancement

**Date:** 2026-05-28
**Status:** Approved

## Summary

Redesign the Analytics page from a single-chart stat dashboard into a multi-section insights page covering doc health, performance, reliability, and content breakdown. All data is computed client-side from existing Zustand store data. Backend changes are minimal (~10 lines) to add doc size snapshots to sync history records and track archive events.

## Architecture

**No new endpoints, no new API calls.** The analytics page reads entirely from `useSettingsStore` state that is already fetched by the dashboard on mount (`getStatus`, `getHistory`, `getFiles`). Two tiny backend modifications make the data more accurate going forward.

### Data flow

```
Backend (Code.gs)                             Frontend (Analytics.tsx)
────────────────────                           ────────────────────────
logSyncRun_ now stores          GET history     Zustand store
  estimatedChars per entry     ────────────►   history: SyncEvent[]
                                                .filesProcessed
checkAndArchive_ records        GET status       .duration
  archive events in            ────────────►   .syncedNames[]
  archiveHistory prop                           .updatedNames[]
                                                .status
                              GET files          docSize, lastSync
                             ────────────►      files: SyncFile[]
```

## Sections

### 1. Top Stat Cards (Row 1 — unchanged)

| Card | Formula | Notes |
|------|---------|-------|
| Total Syncs | `history.length` | Kept as-is |
| Files Processed | `sum(filesProcessed)` | Kept as-is |
| Avg Files / Sync | `total / count` | Kept as-is |
| Success Rate | `successCount / total` | Kept as-is |

### 2. Stat Cards (Row 2 — new)

| Card | Formula | Backend Dep? |
|------|---------|-------------|
| Growth Rate | `docSize / daysSinceFirstSync` in KB/day | No |
| Days to Archive | `(threshold - docSize) / growthRatePerDay` | No |
| Avg Duration | `mean(history[].duration)` | No |
| Success Streak | Consecutive `status === 'success'` from newest | No |

### 3. Doc Health (2-column)

**Left — Doc Size Growth area chart:**
- X-axis: sync timestamps (formatted as Mon DD or MMM)
- Y-axis: estimated doc size in KB
- Area fill: Google blue gradient (`#1a73e8`, 30% opacity, solid at baseline)
- Archive events shown as vertical dashed red lines with label "Archive"
- Archive detection: backend stores doc size in history; a drop in size between consecutive entries signals an archive
- Empty state: "Not enough data yet — keep syncing"

**Right — Threshold Gauge card:**
- Current doc size / threshold (KB)
- Progress bar (replaces the current small bar in the doc size card)
- Growth rate below: "+X KB/day"
- Projection below: "~N days until archive"
- Color: blue ≤60%, amber ≤80%, red >80%

**Data source:** Doc size per sync estimated from `filesProcessed * (docSize / totalFiles)` for backward calculation. Once backend starts storing `docSize` in history entries, the chart auto-corrects with real data for new syncs.

### 4. Performance + Reliability (2-column)

**Left — Sync Duration line chart:**
- X-axis: sync timestamps
- Y-axis: duration in seconds
- Line: Google blue with dots per data point
- Reveals: is the sync slowing down as the doc grows?
- Empty state: "Duration data appears after the first sync completes"

**Right — Reliability mini-dashboard:**
- Visual strip: colored blocks for last 20 syncs (green = success, amber = partial, red = error)
- Stat row: Avg duration · Best · Worst
- Stat row: Total errors · Partial · Clean
- Empty state: "No sync history yet"

### 5. Content Breakdown (2-column)

**Left — New vs Updated stacked bar chart:**
- X-axis: sync timestamps
- Y-axis: file count
- Blue bars: `syncedNames.length` (new)
- Amber bars: `updatedNames.length` (updated)
- Stacked: total bar height = filesProcessed
- Empty state: "No sync history yet"

**Right — Most Updated Files list:**
- Top 5 files by update count across all history
- Shows: file name + update count
- Scanned from iterating all `updatedNames` arrays in history
- Empty state: "No file updates yet"
- Tertiary stat row: "New files: N | Updates: N"

### 6. Source Overview (bottom row — 4 compact stat cards)

| Card | Formula |
|------|---------|
| Last Sync | `formatLastSync(lastSync, true)` |
| Total Unique Files | `files.length` |
| Most Active Day | `max(dayOfWeek frequency from timestamps)` |
| Syncs / Week | `totalSyncs / weeksElapsed` |

## Backend Changes (Code.gs)

### 1. logSyncRun_ — add docSize field

```javascript
function logSyncRun_(run) {
  var props = PropertiesService.getScriptProperties();
  run.docSize = parseInt(props.getProperty('estimatedChars') || '0', 10);
  // ... existing logic
}
```

One line. Makes `docSize` available per sync for accurate growth charting from deploy-forward.

### 2. checkAndArchive_ — record archive events

```javascript
// At end of successful archive:
var archiveHistory = JSON.parse(props.getProperty('archiveHistory') || '[]');
archiveHistory.unshift({
  date: new Date().toISOString(),
  sizeBefore: estimatedChars,
  reason: archiveReason
});
if (archiveHistory.length > 10) archiveHistory.length = 10;
props.setProperty('archiveHistory', JSON.stringify(archiveHistory));
```

Stored as a capped array (max 10 entries) under `archiveHistory` script property. Consumed by the frontend via the existing `status` response — add the last few archive events to `getStatus()` return value.

### 3. getStatus — expose archive events

```javascript
function getStatus() {
  // ... existing fields
  var archiveHistory = JSON.parse(props.getProperty('archiveHistory') || '[]');
  return {
    success: true,
    lastSync: ...,
    docSize: ...,
    isConfigured: ...,
    backendIntegrity: ...,
    archiveEvents: archiveHistory.slice(0, 5)
  };
}
```

Frontend stores `archiveEvents` in Zustand (new field in store, non-persisted). Used to draw archive markers on the growth chart.

## Frontend Changes

### Files modified

| File | Change |
|------|--------|
| `src/components/Analytics.tsx` | Full rewrite — multi-section layout |
| `src/store/settingsStore.ts` | Add `archiveEvents` state field + setter (non-persisted) |
| `src/types/index.ts` | Add `archiveEvents` to `StatusResponse` |
| `src/hooks/useApi.ts` | No change — `getStatus` already returns full response |
| `src/dev-mocks.ts` | Add mock archive events for dev preview |

### Files unchanged

- `src/lib/api.ts` — no new endpoints needed
- `src/background.ts` — no analytics involvement
- `apps-script/Code.gs` — see backend changes above

### New component

One new component extracted for cleanliness:

- `src/components/AnalyticsChart.tsx` — reusable chart wrapper (handles empty state, loading, responsive container, consistent axis styling). Used by all 4 chart instances (growth, duration, new-vs-updated, reliability strip).

The charts:
1. **Doc Size Growth** — `AreaChart` (recharts)
2. **Sync Duration** — `LineChart` (recharts)
3. **New vs Updated** — `BarChart` stacked (recharts)
4. **Reliability Strip** — custom div grid (colored blocks, no recharts needed)

## Empty States

Every chart section has a targeted empty-state message:
- "Not enough data yet — keep syncing" (growth chart, needs ≥2 data points)
- "Duration data appears after the first sync completes" (duration chart)
- "No sync history yet" (reliability, new-vs-updated)
- "No file updates yet" (most-updated files)

## Color Palette

| Token | Usage |
|-------|-------|
| `#1a73e8` | Google blue — primary chart fill, line |
| `#16a34a` | Green — success status, good rate |
| `#f59e0b` | Amber — partial, warning threshold |
| `#ef4444` | Red — error, archive marker line |
| `#e2e8f0` | Slate-200 — card borders |
| `#f8fafc` | Slate-50 — page background |
| `#94a3b8` | Slate-400 — muted text, axis ticks |

## Out of Scope

- Dark mode
- Export/share analytics
- Real-time updates (re-fetches on tab switch, same as other tabs)
- Historical archive events before this deploy (only tracked forward)
