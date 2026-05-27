import { describe, it, expect, vi, beforeEach } from 'vitest';

const SCRIPT_ID = '1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02';
const DEPLOYMENT_URL = 'https://script.google.com/macros/s/AKfycbz2x9dliN_v88iuSVOitiiWAN-cUboL4mx3JBXRZ804r3rs-ZlspTM6uHVXP_wlyGD1ww/exec';

describe('deployApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses provided scriptId for API calls', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        files: [
          { name: 'Code', type: 'SERVER_JS', id: 'file1' },
          { name: 'appsscript', type: 'JSON', id: 'file2' },
        ],
      }), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versionNumber: 5 }), text: async () => '{"versionNumber":5}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        deployments: [{
          deploymentId: 'deploy1',
          deploymentConfig: { versionNumber: 4 },
          entryPoints: [{ entryPointType: 'WEB_APP', url: DEPLOYMENT_URL }],
        }],
      }), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' });

    const result = await deployBackendUpdate(
      SCRIPT_ID,
      DEPLOYMENT_URL,
      'function doGet() { return ContentService.createTextOutput("ok"); }',
      '{"timeZone":"UTC"}',
      'test-token'
    );

    expect(result.versionNumber).toBe(5);
    expect(fetch).toHaveBeenCalledTimes(5);

    // Verify the GET uses the provided scriptId
    expect(fetch.mock.calls[0][0]).toContain(SCRIPT_ID);

    // Verify the PUT body includes the existing file IDs
    const putCall = fetch.mock.calls[1];
    const putBody = JSON.parse(putCall[1].body);
    expect(putBody.files).toHaveLength(2);
    expect(putBody.files[0]).toEqual({
      name: 'Code', type: 'SERVER_JS', source: expect.any(String), id: 'file1'
    });
    expect(putBody.files[1]).toEqual({
      name: 'appsscript', type: 'JSON', source: '{"timeZone":"UTC"}', id: 'file2'
    });
  });

  it('throws if scriptId is empty', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    await expect(deployBackendUpdate('', DEPLOYMENT_URL, 'code', 'manifest', 'token')).rejects.toThrow(
      'Script project ID is required'
    );
  });

  it('throws if no matching deployment found', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ files: [] }), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versionNumber: 1 }), text: async () => '{"versionNumber":1}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deployments: [] }), text: async () => '{}' });

    await expect(deployBackendUpdate(
      SCRIPT_ID,
      DEPLOYMENT_URL,
      'code',
      'manifest',
      'token'
    )).rejects.toThrow('Could not find a deployment');
  });

  it('throws ApiError on API failure during GET content', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Permission denied',
    });

    await expect(deployBackendUpdate(
      SCRIPT_ID,
      DEPLOYMENT_URL,
      'code',
      'manifest',
      'token'
    )).rejects.toThrow('Apps Script API GET projects/1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02/content failed (403)');
  });
});
