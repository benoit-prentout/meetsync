import { useCallback } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { api } from '@/lib/api';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/script.projects',
];

export function useAuth() {
  const { setAuthenticated, setLoading, setError, accessToken, isAuthenticated } = useSettingsStore();
  
  const signIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = await new Promise<string>((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true, scopes: SCOPES }, (authToken) => {
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
