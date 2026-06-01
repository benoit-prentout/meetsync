// Mirrors apps-script/Code.gs validateSettings_ (added in Task 4).
// If you change one, update the other — there is no shared module.
import { describe, it, expect } from 'vitest';

type Result = { ok: true } | { ok: false; errors: { field: string; reason: string }[] };

const ALLOWED_KEYS = [
  'sourceFolderName', 'maxFilesPerRun', 'archiveThresholdChars', 'enableMonthlyArchive',
  'enableUpdateDetection', 'maxAgeDays', 'archiveFolderId', 'masterDocId',
  'maxRetries', 'historySize', 'enableNotifications', 'sourceFileNamePattern',
  'exclusionPatterns', 'enableTimeWindow', 'syncWindowStart', 'syncWindowEnd',
];

function validateSettings(settings: Record<string, unknown>): Result {
  const errors: { field: string; reason: string }[] = [];
  const push = (field: string, reason: string) => errors.push({ field, reason });
  const isInt = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
  const isBool = (v: unknown) => typeof v === 'boolean';
  const isStr = (v: unknown) => typeof v === 'string';
  const isHHMM = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

  for (const key of Object.keys(settings)) {
    if (!ALLOWED_KEYS.includes(key)) push(key, 'unknown setting');
  }
  if ('maxFilesPerRun' in settings) {
    const v = settings.maxFilesPerRun;
    if (!isInt(v) || (v as number) < 1 || (v as number) > 100) push('maxFilesPerRun', 'must be integer 1–100');
  }
  if ('maxAgeDays' in settings) {
    const v = settings.maxAgeDays;
    if (!isInt(v) || (v as number) < 0) push('maxAgeDays', 'must be integer ≥ 0');
  }
  if ('archiveThresholdChars' in settings) {
    const v = settings.archiveThresholdChars;
    if (!isInt(v) || (v as number) < 0 || (v as number) > 1_000_000) push('archiveThresholdChars', 'must be integer 0–1000000');
  }
  if ('maxRetries' in settings) {
    const v = settings.maxRetries;
    if (!isInt(v) || (v as number) < 1 || (v as number) > 10) push('maxRetries', 'must be integer 1–10');
  }
  if ('historySize' in settings) {
    const v = settings.historySize;
    if (!isInt(v) || (v as number) < 1 || (v as number) > 200) push('historySize', 'must be integer 1–200');
  }
  for (const k of ['enableMonthlyArchive', 'enableUpdateDetection', 'enableNotifications', 'enableTimeWindow'] as const) {
    if (k in settings && !isBool(settings[k])) push(k, 'must be boolean');
  }
  for (const k of ['sourceFolderName', 'archiveFolderId', 'masterDocId', 'sourceFileNamePattern', 'exclusionPatterns'] as const) {
    if (k in settings && !isStr(settings[k])) push(k, 'must be string');
  }
  for (const k of ['syncWindowStart', 'syncWindowEnd'] as const) {
    if (k in settings && !isHHMM(settings[k])) push(k, 'must be HH:MM (24h)');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

describe('validateSettings', () => {
  it('accepts an empty object', () => {
    expect(validateSettings({})).toEqual({ ok: true });
  });
  it('accepts a valid full payload', () => {
    expect(validateSettings({
      sourceFolderName: 'Meet', maxFilesPerRun: 20, archiveThresholdChars: 800000,
      enableMonthlyArchive: true, enableUpdateDetection: true, maxAgeDays: 0,
      archiveFolderId: '', masterDocId: 'abc', maxRetries: 3, historySize: 20,
      enableNotifications: true, sourceFileNamePattern: '', exclusionPatterns: '',
      enableTimeWindow: false, syncWindowStart: '09:00', syncWindowEnd: '17:00',
    })).toEqual({ ok: true });
  });
  it('rejects unknown keys', () => {
    const r = validateSettings({ bogus: 1 }) as Exclude<Result, { ok: true }>;
    expect(r.ok).toBe(false);
    expect(r.errors).toContainEqual({ field: 'bogus', reason: 'unknown setting' });
  });
  it('rejects maxFilesPerRun out of range', () => {
    const r = validateSettings({ maxFilesPerRun: 0 }) as Exclude<Result, { ok: true }>;
    expect(r.errors[0]).toEqual({ field: 'maxFilesPerRun', reason: 'must be integer 1–100' });
  });
  it('rejects non-integer maxFilesPerRun', () => {
    const r = validateSettings({ maxFilesPerRun: 2.5 }) as Exclude<Result, { ok: true }>;
    expect(r.errors[0].field).toBe('maxFilesPerRun');
  });
  it('rejects non-boolean enableMonthlyArchive', () => {
    const r = validateSettings({ enableMonthlyArchive: 'yes' }) as Exclude<Result, { ok: true }>;
    expect(r.errors[0]).toEqual({ field: 'enableMonthlyArchive', reason: 'must be boolean' });
  });
  it('rejects malformed syncWindowStart', () => {
    const r = validateSettings({ syncWindowStart: '9:0' }) as Exclude<Result, { ok: true }>;
    expect(r.errors[0].field).toBe('syncWindowStart');
  });
  it('accepts HH:MM at boundaries', () => {
    expect(validateSettings({ syncWindowStart: '00:00', syncWindowEnd: '23:59' })).toEqual({ ok: true });
  });
  it('collects multiple errors', () => {
    const r = validateSettings({ maxFilesPerRun: 0, maxAgeDays: -1 }) as Exclude<Result, { ok: true }>;
    expect(r.errors.length).toBe(2);
  });
});
