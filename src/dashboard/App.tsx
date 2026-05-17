import { useEffect, useRef, useState } from 'react';
import { Dashboard } from './Dashboard';
import { SetupWizard } from '@/components/SetupWizard';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settingsStore';

function App() {
  const { isAuthenticated } = useAuth();
  const { getStatus, getHistory, getFiles, getSettings } = useApi();
  const { setDeploymentUrl, setAuthenticated } = useSettingsStore();
  const [storageChecked, setStorageChecked] = useState(false);
  const [hasDeploymentUrl, setHasDeploymentUrl] = useState(false);
  // Tracks whether the user explicitly signed out — prevents the auto-auth
  // effect from immediately re-authenticating after a deliberate sign-out.
  const signedOutRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    chrome.storage.sync.get('deploymentUrl', (result) => {
      if (!isMounted) return;
      if (result.deploymentUrl) {
        setDeploymentUrl(result.deploymentUrl as string);
        setHasDeploymentUrl(true);
      }
      setStorageChecked(true);
    });
    return () => { isMounted = false; };
  }, [setDeploymentUrl]);

  // Silently restore auth token from Chrome's cache on every page load.
  // isAuthenticated is not persisted in Zustand, so without this, API calls
  // never fire on fresh dashboard loads (accessToken stays null → "Not authenticated").
  // Skipped when the user explicitly signed out to prevent immediate re-auth.
  useEffect(() => {
    if (isAuthenticated || signedOutRef.current) return;
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) return;
      setAuthenticated(token);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      getStatus().catch(console.error);
      getHistory().catch(console.error);
      getFiles().catch(console.error);
      getSettings().catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (!storageChecked) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-sm text-slate-500">Loading…</span>
      </div>
    );
  }

  if (!hasDeploymentUrl) {
    return <SetupWizard />;
  }

  const handleSignOut = () => {
    signedOutRef.current = true;
  };

  return <Dashboard onSignOut={handleSignOut} />;
}

export default App;
