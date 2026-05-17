async function setupAlarm() {
  const { autoSyncEnabled, autoSyncIntervalMinutes } = await chrome.storage.sync.get([
    'autoSyncEnabled',
    'autoSyncIntervalMinutes',
  ]);
  await chrome.alarms.clear('auto-sync');
  if (autoSyncEnabled && autoSyncIntervalMinutes) {
    chrome.alarms.create('auto-sync', { periodInMinutes: Number(autoSyncIntervalMinutes) });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'auto-sync') return;

  const { deploymentUrl, autoSyncEnabled } = await chrome.storage.sync.get([
    'deploymentUrl',
    'autoSyncEnabled',
  ]);
  if (!deploymentUrl || !autoSyncEnabled) return;

  try {
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError || !token) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'No auth token'));
        } else {
          resolve(token as string);
        }
      });
    });

    const url = new URL(deploymentUrl as string);
    url.searchParams.set('action', 'sync');
    url.searchParams.set('token', token);
    await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[auto-sync] failed:', e);
  }
});

// Re-configure alarm whenever auto-sync settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if ('autoSyncEnabled' in changes || 'autoSyncIntervalMinutes' in changes) {
    setupAlarm();
  }
});

// Initialize on service worker start / restart
setupAlarm();
