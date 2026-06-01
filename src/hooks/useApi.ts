import { useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { api, ApiError } from '@/lib/api';
import { useAuth } from './useAuth';

const inflight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export { dedupe as _dedupeForTest };

export function useApi() {
  const { accessToken, setLoading, setError, setStatus, setHistory, setFiles, setSettings, setArchiveEvents } = useSettingsStore();
  const { reauth } = useAuth();

  const getStatus = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('getStatus', async () => {
      setLoading(true);

      try {
        const response = await api.getStatus(accessToken);
        setStatus(response.lastSync || '', response.docSize);
        setArchiveEvents(response.archiveEvents ?? []);
        return response;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to get status');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      } finally {
        setLoading(false);
      }
    });
  }, [accessToken, setLoading, setError, setStatus, setArchiveEvents, reauth]);

  const getHistory = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('getHistory', async () => {
      try {
        const response = await api.getHistory(accessToken);
        setHistory(response.history ?? []);
        return response.history;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to get history');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      }
    });
  }, [accessToken, setHistory, setError, reauth]);

  const getFiles = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('getFiles', async () => {
      try {
        const response = await api.getFiles(accessToken);
        setFiles(response.files ?? []);
        return response.files;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to get files');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      }
    });
  }, [accessToken, setFiles, setError, reauth]);

  const getSettings = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('getSettings', async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.getSettings(accessToken);
        if (response.settings) setSettings(response.settings);
        return response.settings;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to get settings');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      } finally {
        setLoading(false);
      }
    });
  }, [accessToken, setLoading, setSettings, setError, reauth]);

  const sync = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('sync', async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.sync(accessToken);
        await Promise.all([getStatus(), getHistory(), getFiles()]);
        return response;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Sync failed');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      } finally {
        setLoading(false);
      }
    });
  }, [accessToken, setLoading, setError, getStatus, getHistory, getFiles, reauth]);

  const archive = useCallback(async () => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('archive', async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.archive(accessToken);
        await Promise.all([getStatus(), getHistory()]);
        return response;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Archive failed');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      } finally {
        setLoading(false);
      }
    });
  }, [accessToken, setLoading, setError, getStatus, getHistory, reauth]);

  const updateSettings = useCallback(async (settings: Parameters<typeof api.updateSettings>[1]) => {
    if (!accessToken) throw new Error('Not authenticated');
    return dedupe('updateSettings:' + JSON.stringify(settings), async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.updateSettings(accessToken, settings);
        await getStatus();
        return response;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to update settings');
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          reauth().catch(() => {});
        }
        throw error;
      } finally {
        setLoading(false);
      }
    });
  }, [accessToken, setLoading, setError, getStatus, reauth]);

  return {
    getStatus,
    sync,
    archive,
    getHistory,
    getFiles,
    getSettings,
    updateSettings,
  };
}
