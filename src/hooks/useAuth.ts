import { useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { api } from '@/lib/api';
import { getBackendToken, clearCachedTokens } from '@/lib/auth';

let reauthInFlight: Promise<string | null> | null = null;

export function useAuth() {
  const { setAuthenticated, setLoading, setError, accessToken, isAuthenticated } = useSettingsStore();
  
  const signIn = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Evict both cached tokens (backend + deploy) so a stale/401'd token is never reused
      await clearCachedTokens();

      const token = await getBackendToken(true);
      
      setAuthenticated(token);
      
      try {
        const response = await api.getSettings(token);
        if (response.settings) {
          useSettingsStore.getState().setSettings(response.settings);
        }
      } catch {
        // Settings might not exist yet
      }
      
      return token;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setAuthenticated, setLoading, setError]);
  
  const signOut = useCallback(async () => {
    try {
      await clearCachedTokens();
    } catch {
      // Ignore errors on sign out
    }
    useSettingsStore.getState().logout();
  }, []);
  
  const reauth = useCallback(async (): Promise<string | null> => {
    if (reauthInFlight) return reauthInFlight;
    reauthInFlight = (async () => {
      try {
        const token = await signIn();
        return token ?? null;
      } catch {
        return null;
      } finally {
        reauthInFlight = null;
      }
    })();
    return reauthInFlight;
  }, [signIn]);

  return {
    signIn,
    signOut,
    reauth,
    isAuthenticated,
    accessToken,
  };
}
