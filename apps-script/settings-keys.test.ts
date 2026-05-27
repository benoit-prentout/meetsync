import { describe, it, expect } from 'vitest';

// Replicate SETTINGS_KEY_MAP_ from Code.gs
const SETTINGS_KEY_MAP: Record<string, string> = {
  sourceFolderName: 'SOURCE_FOLDER_NAME',
  maxFilesPerRun: 'MAX_FILES_PER_RUN',
  archiveThresholdChars: 'ARCHIVE_THRESHOLD_CHARS',
  enableMonthlyArchive: 'ENABLE_MONTHLY_ARCHIVE',
  enableUpdateDetection: 'ENABLE_UPDATE_DETECTION',
  maxAgeDays: 'MAX_AGE_DAYS',
  archiveFolderId: 'ARCHIVE_FOLDER_ID',
  masterDocId: 'MASTER_DOC_ID',
  maxRetries: 'MAX_RETRIES',
  historySize: 'HISTORY_SIZE',
  enableNotifications: 'ENABLE_NOTIFICATIONS',
  sourceFileNamePattern: 'SOURCE_FILE_NAME_PATTERN',
  exclusionPatterns: 'EXCLUSION_PATTERNS',
  enableTimeWindow: 'ENABLE_TIME_WINDOW',
  syncWindowStart: 'SYNC_WINDOW_START',
  syncWindowEnd: 'SYNC_WINDOW_END',
};

// Replicate the Settings TypeScript interface keys
const TYPESCRIPT_SETTINGS_KEYS = [
  'sourceFolderName',
  'maxFilesPerRun',
  'archiveThresholdChars',
  'enableMonthlyArchive',
  'enableUpdateDetection',
  'maxAgeDays',
  'archiveFolderId',
  'masterDocId',
  'maxRetries',
  'historySize',
  'enableNotifications',
  'sourceFileNamePattern',
  'exclusionPatterns',
  'enableTimeWindow',
  'syncWindowStart',
  'syncWindowEnd',
];

describe('Settings key mapping contract', () => {
  it('all TypeScript Settings interface keys have a backend mapping', () => {
    for (const key of TYPESCRIPT_SETTINGS_KEYS) {
      expect(SETTINGS_KEY_MAP).toHaveProperty(key);
    }
  });

  it('all backend mapping values are SCREAMING_SNAKE_CASE', () => {
    for (const [_camel, snake] of Object.entries(SETTINGS_KEY_MAP)) {
      expect(snake).toMatch(/^[A-Z_]+$/);
    }
  });

  it('all camelCase keys match their SCREAMING_SNAKE_CASE equivalent', () => {
    const toSnakeCase = (s: string) => s.replace(/([A-Z])/g, '_$1').toUpperCase();
    for (const [camel, snake] of Object.entries(SETTINGS_KEY_MAP)) {
      expect(snake).toBe(toSnakeCase(camel));
    }
  });

  it('the mapping is bijective (no duplicate values)', () => {
    const values = Object.values(SETTINGS_KEY_MAP);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
