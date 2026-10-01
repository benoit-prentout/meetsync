// Exercises the real apps-script/Code.gs validateSettings_ via the loadCode harness.
import { describe, it, expect } from 'vitest';
import { loadCode } from './loadCode';

type Result = { ok: true } | { ok: false; errors: { field: string; reason: string }[] };

const gs = loadCode();
const validateSettings = (settings: Record<string, unknown>): Result => gs.validateSettings_(settings);

const DOC_ID = '1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT_uV-wXyZ';

describe('validateSettings', () => {
  it('accepts an empty object', () => {
    expect(validateSettings({})).toEqual({ ok: true });
  });
  it('accepts a valid full payload', () => {
    expect(validateSettings({
      sourceFolderName: 'Meet', maxFilesPerRun: 20, archiveThresholdChars: 800000,
      enableMonthlyArchive: true, enableUpdateDetection: true, maxAgeDays: 0,
      archiveFolderId: '', masterDocId: DOC_ID, maxRetries: 3, historySize: 20,
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

  it.each(['masterDocId', 'archiveFolderId'])('accepts a Drive ID or empty string for %s', (k) => {
    expect(validateSettings({ [k]: DOC_ID })).toEqual({ ok: true });
    expect(validateSettings({ [k]: '' })).toEqual({ ok: true });
  });
  it.each(['masterDocId', 'archiveFolderId'])('rejects malformed IDs for %s', (k) => {
    for (const bad of ['abc', '../../drive/v3/files', 'abcdefghij?fields=x', 'abcdefghij/../x', 'abc def ghijk']) {
      const r = validateSettings({ [k]: bad }) as Exclude<Result, { ok: true }>;
      expect(r.ok).toBe(false);
      expect(r.errors).toContainEqual({ field: k, reason: 'must be a Drive ID (letters, digits, _ or -, 10+ chars)' });
    }
  });
  it('rejects malformed IDs through updateSettings without persisting', () => {
    const props: Record<string, string> = {};
    const g = loadCode({ props });
    const r = g.updateSettings({ masterDocId: 'x/../y?z=1' });
    expect(r.success).toBe(false);
    expect(props.CONFIG_OVERRIDES).toBeUndefined();
  });
});
