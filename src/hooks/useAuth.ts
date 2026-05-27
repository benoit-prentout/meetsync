import { useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { api } from '@/lib/api';

export function useAuth() {
  const { setAuthenticated, setLoading, setError, accessToken, isAuthenticated } = useSettingsStore();
  
  const signIn = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Clear any cached token to force re-auth with current manifest scopes
      const oldToken = await new Promise<string | undefined>((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => resolve(token));
      });
      if (oldToken) {
        await new Promise<void>((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: oldToken }, () => resolve());
        });
      }

      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (authToken) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (authToken) {
            resolve(authToken);
          } else {
            reject(new Error('No auth token received'));
          }
        });
      });
      
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
    if (accessToken) {
      try {
        await new Promise<void>((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: accessToken }, () => resolve());
        });
      } catch {
        // Ignore errors on sign out
      }
    }
    
    useSettingsStore.getState().logout();
  }, [accessToken]);
  
  return {
    signIn,
    signOut,
    isAuthenticated,
    accessToken,
  };
}
