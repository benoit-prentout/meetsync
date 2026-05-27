import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('deployApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts script ID from deployment URL', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versionNumber: 5 }), text: async () => '{"versionNumber":5}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        deployments: [{
          deploymentId: 'deploy1',
          deploymentConfig: { versionNumber: 4 },
          entryPoints: [{ entryPointType: 'WEB_APP', url: 'https://script.google.com/macros/s/abc123/exec' }],
        }],
      }), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' });

    const result = await deployBackendUpdate(
      'https://script.google.com/macros/s/abc123/exec',
      'function doGet() { return ContentService.createTextOutput("ok"); }',
      'test-token'
    );

    expect(result.versionNumber).toBe(5);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('throws for invalid deployment URL', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    await expect(deployBackendUpdate('not-a-url', 'code', 'token')).rejects.toThrow(
      'Invalid deployment URL'
    );
  });

  it('throws if no matching deployment found', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versionNumber: 1 }), text: async () => '{"versionNumber":1}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deployments: [] }), text: async () => '{}' });

    await expect(deployBackendUpdate(
      'https://script.google.com/macros/s/abc123/exec',
      'code',
      'token'
    )).rejects.toThrow('Could not find a deployment');
  });

  it('throws ApiError on API failure', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Permission denied',
    });

    await expect(deployBackendUpdate(
      'https://script.google.com/macros/s/abc123/exec',
      'code',
      'token'
    )).rejects.toThrow('Apps Script API request failed (403)');
  });
});
