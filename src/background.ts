import { api, ApiError } from '@/lib/api';
import { pushAlarmOutcome } from '@/lib/alarmOutcomes';

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

  const startedAt = Date.now();
  let token: string;
  try {
    token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (t) => {
        if (chrome.runtime.lastError || !t) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'No auth token'));
        } else {
          resolve(t as string);
        }
      });
    });
  } catch (e) {
    await pushAlarmOutcome({
      timestamp: new Date(startedAt).toISOString(),
      ok: false,
      durationMs: Date.now() - startedAt,
      error: 'AUTH_TOKEN: ' + (e instanceof Error ? e.message : String(e)),
    });
    return;
  }

  try {
    await api.sync(token);
    await pushAlarmOutcome({
      timestamp: new Date(startedAt).toISOString(),
      ok: true,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'UNKNOWN';
    const message = e instanceof Error ? e.message : String(e);
    await pushAlarmOutcome({
      timestamp: new Date(startedAt).toISOString(),
      ok: false,
      durationMs: Date.now() - startedAt,
      error: `${code}: ${message}`,
    });
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
