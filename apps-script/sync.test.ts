// Sync path tests against the REAL Code.gs (runSync / appendMeetNotesToMaster) via loadCode.
import { describe, it, expect, vi } from 'vitest';
import { loadCode } from './loadCode';

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
        getUi: () => ({ alert: (m: string) => alerts.push(m) }),
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
