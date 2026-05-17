import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, SyncEvent, SyncFile } from '@/types';

interface SettingsState {
  isAuthenticated: boolean;
  accessToken: string | null;
  deploymentUrl: string | null;
  settings: Settings | null;
  lastSync: string | null;
  docSize: number;
  history: SyncEvent[];
  files: SyncFile[];
  isLoading: boolean;
  error: string | null;

  setAuthenticated: (token: string) => void;
  setDeploymentUrl: (url: string | null) => void;
  setSettings: (settings: Settings) => void;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setHistory: (history: SyncEvent[]) => void;
  addToHistory: (event: SyncEvent) => void;
  setFiles: (files: SyncFile[]) => void;
  setStatus: (lastSync: string, docSize: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      accessToken: null,
      deploymentUrl: null,
      settings: null,
      lastSync: null,
      docSize: 0,
      history: [],
      files: [],
      isLoading: false,
      error: null,
      
      setAuthenticated: (token) => set({ accessToken: token, isAuthenticated: true }),

      setDeploymentUrl: (url) => set({ deploymentUrl: url }),

      setSettings: (settings) => set({ settings }),
      
      updateSetting: (key, value) =>
        set((state) => ({
          settings: state.settings ? { ...state.settings, [key]: value } : null,
        })),
      
      setHistory: (history) => set({ history }),
      
      addToHistory: (event) =>
        set((state) => ({
          history: [event, ...state.history].slice(0, state.settings?.historySize || 20),
        })),
      
      setFiles: (files) => set({ files }),
      
      setStatus: (lastSync, docSize) => set({ lastSync, docSize }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
      
      logout: () => set({
        isAuthenticated: false,
        accessToken: null,
        settings: null,
        history: [],
        files: [],
        error: null,
      }),
    }),
    {
      name: 'meet-gemini-storage',
      partialize: (state) => ({
        settings: state.settings,
        lastSync: state.lastSync,
        docSize: state.docSize,
        history: state.history,
        files: state.files,
      }),
    }
  )
);