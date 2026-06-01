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

describe('fetchApi error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function fetchApiAndCatch(): Promise<import('./api').ApiError> {
    const { ApiError, api } = await import('@/lib/api');
    try {
      await api.getStatus('token');
      throw new Error('expected ApiError');
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      return e;
    }
  }

  function mockUrl(): void {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      deploymentUrl: 'https://script.google.com/macros/s/AKfycb/exec',
    });
  }

  it('maps HTTP 401 to code=UNAUTHORIZED', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 401, statusText: 'Unauthorized',
      json: async () => ({}), text: async () => '',
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('maps HTTP 403 to code=FORBIDDEN', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 403, statusText: 'Forbidden',
      json: async () => ({}), text: async () => '',
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('FORBIDDEN');
  });

  it('maps HTTP 500 to code=SERVER', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 500, statusText: 'Internal Server Error',
      json: async () => ({}), text: async () => '',
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('SERVER');
  });

  it('maps HTML response to code=HTML_RESPONSE', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('not json'); },
      text: async () => '<!doctype html><html>...</html>',
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('HTML_RESPONSE');
  });

  it('maps invalid JSON to code=INVALID_JSON', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('parse fail'); },
      text: async () => 'definitely not json',
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('INVALID_JSON');
  });

  it('maps backend VALIDATION_FAILED to code=VALIDATION_FAILED with fieldErrors populated', async () => {
    mockUrl();
    const payload = {
      success: false,
      error: 'VALIDATION_FAILED',
      errors: [{ field: 'maxFilesPerRun', reason: 'must be integer 1-100' }],
    };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => payload, text: async () => JSON.stringify(payload),
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fieldErrors).toEqual([{ field: 'maxFilesPerRun', reason: 'must be integer 1-100' }]);
  });

  it('maps generic {success:false} to code=BACKEND', async () => {
    mockUrl();
    const payload = { success: false, error: 'Drive list failed' };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => payload, text: async () => JSON.stringify(payload),
    }) as unknown as typeof fetch;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('BACKEND');
  });

  it('maps AbortError to code=TIMEOUT', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockImplementationOnce(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('TIMEOUT');
  });

  it('maps generic network error to code=NETWORK', async () => {
    mockUrl();
    globalThis.fetch = vi.fn().mockImplementationOnce(() => Promise.reject(new Error('Failed to fetch'))) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('NETWORK');
  });
});

describe('api - status response passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('passes through backendIntegrity from status response', async () => {
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      deploymentUrl: 'https://script.google.com/macros/s/test/exec',
    });
    const responseData = {
      success: true,
      lastSync: null,
      docSize: 0,
      isConfigured: false,
      backendIntegrity: 'abc123def456',
    };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => responseData,
      text: async () => JSON.stringify(responseData),
    });
    const { api } = await import('@/lib/api');
    const result = await api.getStatus('test-token');
    expect((result as typeof responseData).backendIntegrity).toBe('abc123def456');
  });
});
