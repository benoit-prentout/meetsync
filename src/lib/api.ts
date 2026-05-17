import type { ApiResponse, StatusResponse, Settings, SyncEvent, SyncFile } from '@/types';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getDeploymentUrl(): Promise<string> {
  const result = await chrome.storage.sync.get('deploymentUrl');
  const url = result.deploymentUrl;
  if (typeof url !== 'string' || !url) {
    throw new Error('Deployment URL not configured. Please complete setup first.');
  }
  return url;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  accessToken?: string
): Promise<T> {
  const base = await getDeploymentUrl();
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new ApiError('Invalid deployment URL. Please check your setup settings.');
  }
  url.searchParams.set('action', endpoint);
  // Apps Script web apps strip Authorization headers; token must be a query param
  if (accessToken) {
    url.searchParams.set('token', accessToken);
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new ApiError(`API request failed: ${response.statusText}`, response.status);
  }

  const text = await response.text();
  if (text.trimStart().startsWith('<')) {
    throw new ApiError(
      'Apps Script returned HTML instead of JSON — the deployment URL may be incorrect or the script needs to be re-deployed.'
    );
  }

  let data: ApiResponse<T>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(`Invalid JSON response from server: ${text.slice(0, 100)}`);
  }

  if (!data.success) {
    throw new ApiError(data.error || 'Unknown error');
  }

  return data as T;
}

export const api = {
  getStatus: (accessToken: string) =>
    fetchApi<StatusResponse>('status', { method: 'GET' }, accessToken),

  sync: (accessToken: string) =>
    fetchApi<{ result: unknown }>('sync', { method: 'POST' }, accessToken),

  archive: (accessToken: string) =>
    fetchApi<{ result: unknown }>('archive', { method: 'POST' }, accessToken),

  getHistory: (accessToken: string) =>
    fetchApi<{ history: SyncEvent[] }>('history', { method: 'GET' }, accessToken),

  getSettings: (accessToken: string) =>
    fetchApi<{ settings: Settings }>('settings', { method: 'GET' }, accessToken),

  updateSettings: (accessToken: string, settings: Partial<Settings>) =>
    fetchApi<{ message: string }>('settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }, accessToken),

  getFiles: (accessToken: string) =>
    fetchApi<{ files: SyncFile[] }>('files', { method: 'GET' }, accessToken),
};
