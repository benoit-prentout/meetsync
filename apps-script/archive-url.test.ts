import { describe, it, expect, vi } from 'vitest';
import { loadCode } from './loadCode';

describe('checkAndArchive_ Docs API URL', () => {
  it('URL-encodes the doc ID before fetching with the owner token', () => {
    const fetch = vi.fn(() => ({ code: 200, body: JSON.stringify({ body: { content: [{ endIndex: 1 }] } }) }));
    const gs = loadCode({
      props: { CONFIG_OVERRIDES: JSON.stringify({ ENABLE_MONTHLY_ARCHIVE: false }) },
      fetch,
      globals: {
        Drive: { Files: { copy: () => ({ id: 'archiveCopyId123' }) } },
        Docs: { Documents: { batchUpdate: vi.fn() } },
        MailApp: { sendEmail: vi.fn() },
      },
    });
    gs.checkAndArchive_('abc/../x?y#z', 'UTC', true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(
      'https://docs.googleapis.com/v1/documents/abc%2F..%2Fx%3Fy%23z?fields=body.content.endIndex',
    );
  });
});
