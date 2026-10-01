// Sync path tests against the REAL Code.gs (runSync / appendMeetNotesToMaster) via loadCode.
import { describe, it, expect, vi } from 'vitest';
import { loadCode, fillTo } from './loadCode';

const DOC = 'masterDoc000';
const DOC_MIME = 'application/vnd.google-apps.document';
const T = Date.parse('2026-09-01T11:00:00.000Z');

type DriveFile = { id: string; name: string; mimeType?: string; createdTime: string; modifiedTime: string };

const note = (id: string, over: Partial<DriveFile> = {}): DriveFile => ({
  id,
  name: `Notes by Gemini ${id}`,
  mimeType: DOC_MIME,
  createdTime: '2026-09-01T10:00:00.000Z',
  modifiedTime: new Date(T).toISOString(),
  ...over,
});

function setup(o: {
  files?: DriveFile[];
  pages?: DriveFile[][];
  folders?: { id: string }[];
  props?: Record<string, string>;
  config?: Record<string, unknown>;
  batchUpdate?: (...a: unknown[]) => unknown;
  globals?: Record<string, unknown>;
} = {}) {
  const props: Record<string, string> = {
    CONFIG_OVERRIDES: JSON.stringify({
      MASTER_DOC_ID: DOC,
      ARCHIVE_THRESHOLD_CHARS: 0,
      ENABLE_MONTHLY_ARCHIVE: false,
      ENABLE_NOTIFICATIONS: false,
      ...o.config,
    }),
    ...o.props,
  };
  const pages = o.pages ?? [o.files ?? []];
  const list = vi.fn((p: { q: string; pageToken?: string }) => {
    if (p.q.includes("mimeType = 'application/vnd.google-apps.folder'")) return { files: o.folders ?? [] };
    const i = p.pageToken ? Number(p.pageToken) : 0;
    return { files: pages[i], nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined };
  });
  const batchUpdate = vi.fn(o.batchUpdate ?? (() => ({})));
  const exported: string[] = [];
  const fetch = (url: string) => {
    const m = url.match(/\/files\/([^/]+)\/export/);
    if (!m) throw new Error('unexpected fetch ' + url);
    exported.push(decodeURIComponent(m[1]));
    return { code: 200, body: 'Body of ' + m[1] };
  };
  const alerts: string[] = [];
  const gs = loadCode({
    props,
    fetch,
    globals: {
      Drive: { Files: { list } },
      Docs: { Documents: { batchUpdate } },
      DocumentApp: {
        getActiveDocument: () => ({ getId: () => 'boundDoc0000' }),
        getUi: () => ({
          alert: (m: string) => { alerts.push(m); return 'YES'; },
          Button: { YES: 'YES' },
          ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
        }),
      },
      ...o.globals,
    },
  });
  const syncMarkers = () => Object.keys(props).filter((k) => k.startsWith('SYNC_')).sort();
  const sourceQuery = () => list.mock.calls.map((c) => c[0].q).find((q) => !q.includes('google-apps.folder')) ?? '';
  return { gs, props, list, batchUpdate, exported, alerts, syncMarkers, sourceQuery };
}

describe('appendMeetNotesToMaster (menu/trigger) delegates to the REST sync', () => {
  it('writes to CONFIG.MASTER_DOC_ID, not the bound document', () => {
    const s = setup({ files: [note('a1')] });
    s.gs.appendMeetNotesToMaster();
    expect(s.batchUpdate).toHaveBeenCalledTimes(1);
    expect(s.batchUpdate.mock.calls[0][1]).toBe(DOC);
    expect(s.alerts).toEqual(['✅ 1 meeting(s) added.']);
  });

  it('falls back to the bound document when MASTER_DOC_ID is empty', () => {
    const s = setup({ files: [note('a1')], config: { MASTER_DOC_ID: '' } });
    s.gs.appendMeetNotesToMaster();
    expect(s.batchUpdate.mock.calls[0][1]).toBe('boundDoc0000');
  });

  it('honours the sync time window', () => {
    const s = setup({ files: [note('a1')], config: { ENABLE_TIME_WINDOW: true, SYNC_WINDOW_START: '23:59', SYNC_WINDOW_END: '00:00' } });
    s.gs.appendMeetNotesToMaster();
    expect(s.list).not.toHaveBeenCalled();
    expect(s.batchUpdate).not.toHaveBeenCalled();
  });

  it('alerts when everything is already up to date', () => {
    const s = setup({ files: [] });
    s.gs.appendMeetNotesToMaster();
    expect(s.alerts).toEqual(['Everything is already up to date!']);
  });

  it('reports export errors in the alert', () => {
    const s = setup({ files: [note('a1'), note('a2')] });
    const realFetch = s.gs.UrlFetchApp.fetch;
    s.gs.UrlFetchApp.fetch = (url: string, opts: unknown) => {
      if (url.includes('/a2/')) return { getResponseCode: () => 500, getContentText: () => 'boom' };
      return realFetch(url, opts);
    };
    s.gs.appendMeetNotesToMaster();
    expect(s.alerts[0]).toMatch(/^✅ 1 meeting\(s\) added\. ⚠️ 1 error\(s\)/);
  });
});

describe('update detection (G1)', () => {
  it('re-syncs a note edited 3 minutes after the stored modifiedTime', () => {
    const edited = T + 3 * 60 * 1000;
    const s = setup({ files: [note('a1', { modifiedTime: new Date(edited).toISOString() })], props: { SYNC_a1: String(T) } });
    const out = s.gs.runSync();
    expect(out.result).toMatchObject({ synced: 1, updated: 1 });
    expect(s.exported).toEqual(['a1']);
    expect(s.props.SYNC_a1).toBe(String(edited));
  });

  it('skips a note whose modifiedTime equals the stored one', () => {
    const s = setup({ files: [note('a1')], props: { SYNC_a1: String(T) } });
    expect(s.gs.runSync().result.message).toBe('All files are already synced');
    expect(s.exported).toEqual([]);
  });
});

describe('sync markers (B1)', () => {
  it('writes no SYNC_ markers and surfaces the error when batchUpdate fails', () => {
    const s = setup({ files: [note('a1'), note('a2')], batchUpdate: () => { throw new Error('Docs API down'); } });
    expect(() => s.gs.runSync()).toThrow('Docs API down');
    expect(s.syncMarkers()).toEqual([]);
    s.gs.validateCaller_ = () => true;
    const res = JSON.parse(s.gs.handleRequest({ parameter: { action: 'sync', token: 't' } }).text);
    expect(res).toEqual({ success: false, error: 'Docs API down' });
    expect(s.syncMarkers()).toEqual([]);
  });

  it('writes markers only after batchUpdate succeeds', () => {
    let markersAtWrite: string[] | null = null;
    const s = setup({ files: [note('a1'), note('a2')] });
    s.batchUpdate.mockImplementation(() => { markersAtWrite = s.syncMarkers(); return {}; });
    s.gs.runSync();
    expect(markersAtWrite).toEqual([]);
    expect(s.syncMarkers()).toEqual(['SYNC_a1', 'SYNC_a2']);
    expect(s.props.SYNC_a1).toBe(String(T));
  });
});

describe('master and archive docs are never imported (D1)', () => {
  it('leaves archive exclusion to the in-loop check, not the Drive query', () => {
    // Drive's multi-word `contains` could also drop real notes such as 'Archive review – Meeting notes'.
    const s = setup({ files: [note('a1', { name: 'Archive review – Meeting notes' })] });
    expect(s.gs.runSync().result.synced).toBe(1);
    expect(s.sourceQuery()).not.toContain('Meeting Notes Archive');
  });

  it('skips the master doc and archive copies even if Drive returns them', () => {
    const s = setup({
      files: [
        note('a1'),
        note(DOC, { name: 'Meeting notes master' }),
        note('arch1', { name: 'Meeting Notes Archive — 2026-09-01 — 10h00' }),
      ],
    });
    expect(s.gs.runSync().result).toMatchObject({ synced: 1, errors: 0 });
    expect(s.exported).toEqual(['a1']);
    expect(s.syncMarkers()).toEqual(['SYNC_a1']);
  });
});

describe('Meet notes discovery (PL1 / M1)', () => {
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => note(`${prefix}${i}`));

  it('searches Drive-wide by name + doc mimeType, with no parent-folder restriction by default', () => {
    const s = setup({ files: [note('a1')] });
    s.gs.runSync();
    const q = s.sourceQuery();
    expect(q).not.toContain('in parents');
    expect(q).toContain("mimeType = 'application/vnd.google-apps.document'");
    expect(q).toContain('trashed = false');
    for (const n of ['Notes de la réunion', 'Meeting notes', 'Notes for', 'Notes by Gemini', 'Notes par Gemini']) {
      expect(q).toContain(`name contains '${n}'`);
    }
    expect(s.list.mock.calls.some((c) => c[0].q.includes('google-apps.folder'))).toBe(false);
    expect(s.list.mock.calls[0][0]).toMatchObject({ supportsAllDrives: true, includeItemsFromAllDrives: true });
  });

  it('keeps the MAX_AGE_DAYS cutoff', () => {
    const s = setup({ files: [], config: { MAX_AGE_DAYS: 7 } });
    s.gs.runSync();
    expect(s.sourceQuery()).toMatch(/modifiedTime > '\d{4}-/);
  });

  it('pages past the first 100 results', () => {
    const s = setup({ pages: [many('p', 100), many('q', 100)], config: { MAX_FILES_PER_RUN: 150 } });
    expect(s.gs.runSync().result.synced).toBe(150);
    expect(s.list).toHaveBeenCalledTimes(2);
    expect(s.exported.filter((id) => id.startsWith('q'))).toHaveLength(50); // second page fetched via nextPageToken
  });

  it('finds new notes behind a full page of already-synced ones', () => {
    const synced = many('old', 100);
    const props = Object.fromEntries(synced.map((f) => ['SYNC_' + f.id, String(T)]));
    const s = setup({ pages: [synced, [note('new1')]], props });
    expect(s.gs.runSync().result.synced).toBe(1);
    expect(s.exported).toEqual(['new1']);
  });

  it('reads sync markers once per run, not one getProperty per file', () => {
    const synced = many('old', 100);
    const props = Object.fromEntries(synced.map((f) => ['SYNC_' + f.id, String(T)]));
    const s = setup({ pages: [synced, [note('new1')]], props });
    const real = s.gs.PropertiesService.getScriptProperties();
    const markerReads: string[] = [];
    s.gs.PropertiesService = {
      getScriptProperties: () => ({ ...real, getProperty: (k: string) => { if (k.startsWith('SYNC_')) markerReads.push(k); return real.getProperty(k); } }),
    };
    expect(s.gs.runSync().result).toMatchObject({ synced: 1, updated: 0, errors: 0 });
    expect(markerReads).toEqual([]);
    expect(s.exported).toEqual(['new1']);
  });

  it('stops paging once MAX_FILES_PER_RUN is reached', () => {
    const s = setup({ pages: [many('p', 30), many('q', 30)], config: { MAX_FILES_PER_RUN: 20 } });
    expect(s.gs.runSync().result.synced).toBe(20);
    expect(s.list).toHaveBeenCalledTimes(1);
  });

  it('does not double-count a shortcut to a note', () => {
    const s = setup({
      files: [note('a1'), note('sc1', { mimeType: 'application/vnd.google-apps.shortcut' })],
    });
    expect(s.gs.runSync().result.synced).toBe(1);
    expect(s.exported).toEqual(['a1']);
  });

  it('a configured folder that does not resolve does not hide name-matched notes', () => {
    const s = setup({ files: [note('a1')], config: { SOURCE_FOLDER_NAME: 'Gone' } });
    expect(s.gs.runSync().result.synced).toBe(1);
    expect(s.sourceQuery()).not.toContain('in parents');
  });

  it('a configured folder that resolves only widens the search', () => {
    const s = setup({ files: [note('a1')], folders: [{ id: 'F1' }], config: { SOURCE_FOLDER_NAME: 'My notes' } });
    s.gs.runSync();
    expect(s.sourceQuery()).toContain("('F1' in parents or (name contains");
  });
});

// Models Apps Script's script lock as NOT reentrant: one holder at a time, even within an execution.
function scriptLock(heldByOther = false) {
  const state = { held: heldByOther, waits: [] as number[] };
  const LockService = {
    getScriptLock: () => {
      let mine = false;
      return {
        tryLock: (ms: number) => {
          state.waits.push(ms);
          if (state.held) return false;
          state.held = mine = true;
          return true;
        },
        releaseLock: () => { if (mine) state.held = mine = false; },
        hasLock: () => mine,
      };
    },
  };
  return { state, LockService };
}

describe('sync/archive concurrency lock (B2)', () => {
  it('holds the script lock during the sync and still records history + run log', () => {
    const lock = scriptLock();
    let heldDuringWrite = false;
    const s = setup({ files: [note('a1')], globals: { LockService: lock.LockService } });
    s.batchUpdate.mockImplementation(() => { heldDuringWrite = lock.state.held; return {}; });
    expect(s.gs.runSync().result.synced).toBe(1);
    expect(heldDuringWrite).toBe(true);
    expect(lock.state.held).toBe(false);
    expect(JSON.parse(s.props.syncHistory)).toHaveLength(1);
    expect(JSON.parse(s.props.RUN_LOG)).toEqual([expect.objectContaining({ action: 'runSync', ok: true })]);
  });

  it('REST sync returns a busy error without touching Drive when another run holds the lock', () => {
    const lock = scriptLock(true);
    const s = setup({ files: [note('a1')], globals: { LockService: lock.LockService } });
    s.gs.validateCaller_ = () => true;
    const res = JSON.parse(s.gs.handleRequest({ parameter: { action: 'sync', token: 't' } }).text);
    expect(res).toEqual({ success: false, error: 'Another sync or archive is already running' });
    expect(lock.state.waits[0]).toBe(30000);
    expect(s.list).not.toHaveBeenCalled();
    expect(s.batchUpdate).not.toHaveBeenCalled();
  });

  it('REST archive returns a busy error when another run holds the lock', () => {
    const copy = vi.fn();
    const s = setup({ config: { ARCHIVE_THRESHOLD_CHARS: 800000 }, globals: { LockService: scriptLock(true).LockService, Drive: { Files: { copy } } } });
    s.gs.validateCaller_ = () => true;
    const res = JSON.parse(s.gs.handleRequest({ parameter: { action: 'archive', token: 't' } }).text);
    expect(res).toEqual({ success: false, error: 'Another sync or archive is already running' });
    expect(copy).not.toHaveBeenCalled();
  });

  it('time-driven trigger skips quickly and quietly when busy', () => {
    const lock = scriptLock(true);
    const s = setup({ files: [note('a1')], globals: { LockService: lock.LockService } });
    expect(() => s.gs.appendMeetNotesToMaster({ triggerUid: '123' })).not.toThrow();
    expect(lock.state.waits[0]).toBeLessThanOrEqual(1000);
    expect(s.list).not.toHaveBeenCalled();
  });

  it('menu Sync Now tells the user when busy', () => {
    const s = setup({ files: [note('a1')], globals: { LockService: scriptLock(true).LockService } });
    s.gs.appendMeetNotesToMaster();
    expect(s.alerts).toEqual([expect.stringContaining('Another sync or archive is already running')]);
  });

  it('menu Archive Now tells the user when busy and does not archive', () => {
    const copy = vi.fn();
    const s = setup({ config: { ARCHIVE_THRESHOLD_CHARS: 800000 }, globals: { LockService: scriptLock(true).LockService, Drive: { Files: { copy } } } });
    s.gs.forceArchive();
    expect(copy).not.toHaveBeenCalled();
    expect(s.alerts.at(-1)).toContain('Another sync or archive is already running');
  });
});

describe('sync history stays under the 9 KB property limit (F1b)', () => {
  const old = (i: number, pad: string) => ({
    date: `2026-08-01T00:00:${String(i).padStart(2, '0')}.000Z`, synced: 1, updated: 0, errors: 0,
    duration: 100, syncedNames: ['Old meeting ' + i + pad], updatedNames: [], docSize: 0,
  });

  it('records a successful run when the stored history is full, keeping the newest entries', () => {
    const prev = fillTo(old, 9200);
    const s = setup({ files: [note('a1')], props: { syncHistory: JSON.stringify(prev) }, config: { HISTORY_SIZE: 200 } });
    expect(s.gs.runSync()).toMatchObject({ success: true, result: { synced: 1 } });
    expect(s.props.syncHistory.length).toBeLessThanOrEqual(9000);
    const h = JSON.parse(s.props.syncHistory);
    expect(h[0].syncedNames).toEqual(['Notes by Gemini a1']);
    expect(h[1]).toEqual(prev[0]);
    expect(JSON.parse(s.props.RUN_LOG).at(-1)).toMatchObject({ action: 'runSync', ok: true });
  });

  it('caps names per entry (20) and name length (80); counts stay exact', () => {
    const files = Array.from({ length: 25 }, (_, i) => note('n' + i, { name: `Notes by Gemini ${i} ` + 'é'.repeat(300) }));
    const s = setup({ files, config: { MAX_FILES_PER_RUN: 25 } });
    expect(s.gs.runSync().result.synced).toBe(25);
    const [entry] = JSON.parse(s.props.syncHistory);
    expect(entry.synced).toBe(25);
    expect(entry.syncedNames).toHaveLength(20);
    expect(Math.max(...entry.syncedNames.map((n: string) => n.length))).toBeLessThanOrEqual(80);
  });

  it('keeps the getHistory() shape the extension expects (SyncEvent)', () => {
    const s = setup({ files: [note('a1')] });
    s.gs.runSync();
    const [ev] = s.gs.getHistory().history;
    expect(Object.keys(ev).sort()).toEqual(['duration', 'filesProcessed', 'id', 'message', 'status', 'syncedNames', 'timestamp', 'updatedNames']);
    expect(ev).toMatchObject({ filesProcessed: 1, status: 'success', message: '1 synced, 0 updated', syncedNames: ['Notes by Gemini a1'], updatedNames: [] });
    expect(ev.id).toBe(ev.timestamp);
    expect(typeof ev.duration).toBe('number');
  });
});
