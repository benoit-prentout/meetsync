export const MAX_ALARM_OUTCOMES = 20;

export type AlarmOutcome = {
  timestamp: string;     // ISO
  ok: boolean;
  durationMs?: number;
  error?: string;        // ApiError.code if available, else .message
};

export async function getAlarmOutcomes(): Promise<AlarmOutcome[]> {
  const result = await chrome.storage.local.get('alarmOutcomes');
  const outcomes = (result as { alarmOutcomes?: AlarmOutcome[] }).alarmOutcomes;
  return Array.isArray(outcomes) ? outcomes : [];
}

export async function pushAlarmOutcome(outcome: AlarmOutcome): Promise<void> {
  const existing = await getAlarmOutcomes();
  const next = existing.concat(outcome);
  const trimmed = next.length > MAX_ALARM_OUTCOMES ? next.slice(next.length - MAX_ALARM_OUTCOMES) : next;
  await chrome.storage.local.set({ alarmOutcomes: trimmed });
}
