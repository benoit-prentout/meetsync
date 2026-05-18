import { describe, it, expect, vi, beforeEach } from 'vitest';

// api.test.ts — tests for the API layer
// We test via the exported `api` object, mocking chrome.storage.sync and fetch.

describe('ApiError', () => {
  it('is constructable with a message', async () => {
    const { ApiError } = await import('@/lib/api');
    const err = new ApiError('test error');
    expect(err.message).toBe('test error');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('accepts an optional statusCode', async () => {
    const { ApiError } = await import('@/lib/api');
    const err = new ApiError('not found', 404);
    expect(err.statusCode).toBe(404);
  });
});

describe('api - getDeploymentUrl / fetchApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('resolves when deploymentUrl is stored', async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentUrl: 'https://script.google.com/macros/s/test/exec',
    });
    const responseData = {
      success: true,
      lastSync: null,
      docSize: 0,
      isConfigured: false,
    };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData),
    });
    const { api } = await import('@/lib/api');
    const result = await api.getStatus('test-token');
    expect(result).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('action=status'),
      expect.any(Object)
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('token=test-token'),
      expect.any(Object)
    );
  });

  it('throws when no deploymentUrl is configured', async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    const { api } = await import('@/lib/api');
    await expect(api.getStatus('test-token')).rejects.toThrow(
      'Deployment URL not configured'
    );
  });

  it('throws ApiError with friendly message for invalid URL', async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentUrl: 'not-a-url',
    });
    const { ApiError, api } = await import('@/lib/api');
    await expect(api.getStatus('test-token')).rejects.toThrow(ApiError);
    await vi.resetModules();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentUrl: 'not-a-url',
    });
    const { api: api2 } = await import('@/lib/api');
    await expect(api2.getStatus('test-token')).rejects.toThrow('Invalid deployment URL');
  });

  it('throws ApiError when the HTTP response is not ok', async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentUrl: 'https://script.google.com/macros/s/test/exec',
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });
    const { ApiError, api } = await import('@/lib/api');
    await expect(api.getStatus('test-token')).rejects.toThrow(ApiError);
  });

  it('throws ApiError when the API returns success: false', async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentUrl: 'https://script.google.com/macros/s/test/exec',
    });
    const responseData = { success: false, error: 'Script error' };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData),
    });
    const { ApiError, api } = await import('@/lib/api');
    await expect(api.getStatus('test-token')).rejects.toThrow(ApiError);
  });
});
