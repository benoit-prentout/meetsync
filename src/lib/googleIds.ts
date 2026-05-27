const DOCS_PATTERN = /^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_PATTERN = /^https:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/;
const RAW_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function extractDocId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(DOCS_PATTERN);
  if (match) return match[1];

  if (RAW_ID_PATTERN.test(trimmed)) return trimmed;

  return null;
}

export function extractFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(DRIVE_PATTERN);
  if (match) return match[1];

  if (RAW_ID_PATTERN.test(trimmed)) return trimmed;

  return null;
}
