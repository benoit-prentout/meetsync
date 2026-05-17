import { useEffect, useState } from 'react';
import { Dashboard } from './Dashboard';
import { SetupWizard } from '@/components/SetupWizard';
import { useAuth } from '@/hooks/useAuth';
import { useApi } from '@/hooks/useApi';
import { useSettingsStore } from '@/store/settingsStore';

function App() {
  const { isAuthenticated } = useAuth();
  const { getStatus, getHistory, getFiles, getSettings } = useApi();
  const { setDeploymentUrl } = useSettingsStore();
  const [storageChecked, setStorageChecked] = useState(false);
  const [hasDeploymentUrl, setHasDeploymentUrl] = useState(false);

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

  return <Dashboard />;
}

export default App;
