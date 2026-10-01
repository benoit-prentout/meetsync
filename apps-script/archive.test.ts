// Archive / doc-size protection tests against the REAL Code.gs via loadCode.
import { describe, it, expect, vi } from 'vitest';
import { loadCode } from './loadCode';

const DOC = 'masterDoc000';
const DOC_MIME = 'application/vnd.google-apps.document';
const thisMonth = () => new Date().toISOString().slice(0, 7); // harness formatDate is UTC

const note = (id: string) => ({
  id,
  name: `Notes by Gemini ${id}`,
  mimeType: DOC_MIME,
  createdTime: '2026-09-01T10:00:00.000Z',
  modifiedTime: '2026-09-01T11:00:00.000Z',
});

function setup(o: { docChars?: number; files?: { id: string }[]; props?: Record<string, string>; config?: Record<string, unknown>; copy?: () => unknown } = {}) {
  const props: Record<string, string> = {
    CONFIG_OVERRIDES: JSON.stringify({
      MASTER_DOC_ID: DOC,
      ARCHIVE_THRESHOLD_CHARS: 800000,
      ENABLE_MONTHLY_ARCHIVE: false,
      ENABLE_NOTIFICATIONS: false,
      ...o.config,
    }),
    ...o.props,
  };
  const state = { docChars: o.docChars ?? 5000 };
  const calls: string[] = [];
  const copy = vi.fn(o.copy ?? (() => { calls.push('copy'); return { id: 'archiveCopy01' }; }));
  const batchUpdate = vi.fn((req: { requests: { deleteContentRange?: unknown }[] }) => {
    calls.push(req.requests.some((r) => r.deleteContentRange) ? 'clear' : 'insert');
    return {};
  });
  const fetch = (url: string) => {
    const doc = url.match(/docs\.googleapis\.com\/v1\/documents\/([^?]+)\?fields=body\.content\.endIndex$/);
    if (doc) {
      calls.push('size:' + decodeURIComponent(doc[1]));
      return { code: 200, body: JSON.stringify({ body: { content: [{ endIndex: 1 }, { endIndex: state.docChars + 1 }] } }) };
    }
    const exp = url.match(/\/files\/([^/]+)\/export/);
    if (exp) return { code: 200, body: 'Body of ' + exp[1] };
    throw new Error('unexpected fetch ' + url);
  };
  const alerts: string[] = [];
  const gs = loadCode({
    props,
    fetch,
    globals: {
      Drive: { Files: { list: () => ({ files: (o.files ?? []).map((f) => note(f.id)) }), copy } },
      Docs: { Documents: { batchUpdate } },
      MailApp: { sendEmail: vi.fn() },
      DocumentApp: {
        getActiveDocument: () => ({ getId: () => 'boundDoc0000' }),
        openById: () => { throw new Error('no summary table in tests'); },
        getUi: () => ({
          alert: (...a: string[]) => { alerts.push(a.length > 1 ? a[1] : a[0]); return 'YES'; },
          Button: { YES: 'YES' },
          ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
        }),
      },
    },
  });
  return { gs, props, state, copy, batchUpdate, calls, alerts };
}

describe('doc-size protection uses the real doc size (E1a)', () => {
  it('archives an oversized doc even when the estimate was reset to 0', () => {
    const s = setup({ docChars: 850000, files: [note('a1')], props: { estimatedChars: '0' } });
    expect(s.gs.runSync().result.synced).toBe(1);
    expect(s.copy).toHaveBeenCalledTimes(1);
    expect(s.calls).toEqual([`size:${DOC}`, 'copy', 'clear', 'insert']);
  });

  it('counts the pending batch before inserting', () => {
    const block = s0BlockLength();
    const near = setup({ docChars: 800000 - block + 1, files: [note('a1')] });
    near.gs.runSync();
    expect(near.copy).toHaveBeenCalledTimes(1);

    const below = setup({ docChars: 800000 - block - 1, files: [note('a1')] });
    below.gs.runSync();
    expect(below.copy).not.toHaveBeenCalled();
    expect(below.props.estimatedChars).toBe(String(800000 - 1)); // real size + inserted batch
  });
});

// Length of the block runSync inserts for note('a1').
function s0BlockLength() {
  const s = setup({ docChars: 0, files: [note('a1')], config: { ARCHIVE_THRESHOLD_CHARS: 0 } });
  s.gs.runSync();
  return s.batchUpdate.mock.calls[0][0].requests[0].insertText.text.length;
}

describe('forced archive (E1b)', () => {
  it('archives when the size threshold is disabled (0)', () => {
    const s = setup({ config: { ARCHIVE_THRESHOLD_CHARS: 0 } });
    expect(s.gs.runArchive()).toEqual({ success: true, message: 'Archive created' });
    expect(s.copy).toHaveBeenCalledTimes(1);
    expect(s.calls).toEqual([`size:${DOC}`, 'copy', 'clear']);
  });

  it('reports "nothing to archive" for an empty / marker-only doc', () => {
    const s = setup({ docChars: 130 });
    expect(s.gs.runArchive()).toEqual({ success: false, error: 'Nothing to archive: the master document is empty' });
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.batchUpdate).not.toHaveBeenCalled();
  });

  it('menu Archive Now archives CONFIG.MASTER_DOC_ID, not the bound doc', () => {
    const s = setup({ config: { ARCHIVE_THRESHOLD_CHARS: 0 } });
    s.gs.forceArchive();
    expect(s.copy.mock.calls[0][1]).toBe(DOC);
    expect(s.alerts.at(-1)).toContain('Archive created');
  });

  it('menu Archive Now says so when there is nothing to archive', () => {
    const s = setup({ docChars: 0 });
    s.gs.forceArchive();
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.alerts.at(-1)).toContain('Nothing to archive');
  });
});

describe('monthly archive during sync with the size threshold disabled (E1c)', () => {
  it('still runs the monthly archive', () => {
    const s = setup({
      files: [note('a1')],
      props: { lastArchiveMonth: '2000-01' },
      config: { ARCHIVE_THRESHOLD_CHARS: 0, ENABLE_MONTHLY_ARCHIVE: true },
    });
    s.gs.runSync();
    expect(s.copy).toHaveBeenCalledTimes(1);
    expect(s.props.lastArchiveMonth).toBe(thisMonth());
  });

  it('makes no Docs size call when neither size nor monthly archive is enabled', () => {
    const s = setup({ files: [note('a1')], config: { ARCHIVE_THRESHOLD_CHARS: 0 } });
    s.gs.runSync();
    expect(s.calls).toEqual(['insert']);
  });
});

describe('lastArchiveMonth only advances after a successful archive (H1)', () => {
  const monthly = { ARCHIVE_THRESHOLD_CHARS: 0, ENABLE_MONTHLY_ARCHIVE: true };

  it('a failed monthly archive leaves lastArchiveMonth unchanged and is retried next run', () => {
    const s = setup({
      files: [note('a1')],
      props: { lastArchiveMonth: '2000-01' },
      config: monthly,
      copy: () => { throw new Error('Drive copy failed'); },
    });
    expect(s.gs.runSync().result.synced).toBe(1); // sync still goes through
    expect(s.props.lastArchiveMonth).toBe('2000-01');
    const attempts = s.copy.mock.calls.length;

    s.copy.mockImplementation(() => ({ id: 'archiveCopy01' }));
    delete s.props.SYNC_a1; // a new note so the next run reaches the archive check
    s.gs.runSync();
    expect(s.copy.mock.calls.length).toBe(attempts + 1);
    expect(s.props.lastArchiveMonth).toBe(thisMonth());
  });

  it('first run seeds the current month without archiving', () => {
    const s = setup({ files: [note('a1')], config: monthly });
    s.gs.runSync();
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.props.lastArchiveMonth).toBe(thisMonth());
  });

  it('a new month with an empty doc counts as done', () => {
    const s = setup({ docChars: 0, files: [note('a1')], props: { lastArchiveMonth: '2000-01' }, config: monthly });
    s.gs.runSync();
    expect(s.copy).not.toHaveBeenCalled();
    expect(s.props.lastArchiveMonth).toBe(thisMonth());
  });
});
