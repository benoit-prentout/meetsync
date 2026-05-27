# Settings URL Auto-Extraction — Design Spec

**Date:** 2026-05-26
**Status:** Approved

## Context

Users paste full Google Docs/Drive URLs into the Master Document ID and Archive Folder ID fields. Currently there's no validation — the raw URL (e.g. `https://docs.google.com/document/d/abc123/edit`) is stored as-is, which breaks backend calls that expect a bare ID.

## Goals

- Accept both raw IDs and full URLs in the two ID fields
- Auto-extract the ID from URLs on paste/change
- Show the extracted ID in the editable portion of a decorated input
- Display the URL prefix as a non-editable visual label
- Show inline validation errors for invalid input

## Non-goals

- Server-side validation (Apps Script already handles that)
- Changing the stored data format (still raw ID for backward compat)
- URL extraction in the SetupWizard (only Settings page)
- Blocking Save on validation failure (field-level error display is sufficient)

## Decorated Input Pattern

Each ID field becomes a split/decorated input:

```
┌─────────────────────────────────────────────┐
│  Label                                      │
│  ┌────────────────────────────────────────┐ │
│  │ https://docs.google.com/document/d/ │ID│ │
│  └────────────────────────────────────────┘ │
│  Error text (if any)                        │
└─────────────────────────────────────────────┘
```

- **Prefix** (`<span>`): Gray, non-editable, non-focusable — shows the base Google URL
- **Input** (`<input>`): Editable, shows only the extracted/typed ID
- **On paste**: Intercept paste event, try to extract ID from URL. If it matches a known Google URL pattern, extract the ID and set only the ID. If it's just a raw ID, accept as-is. If it's a non-Google URL, show error.
- **On change**: Trim whitespace. No URL detection on keystroke (only paste).
- **Validation on blur**: Check non-empty. If the raw typed value looks like a full URL that doesn't match known patterns, show error "Enter a Google Doc ID, not a generic URL".

## Regex Patterns

```
Google Docs:   /^https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/
Google Drive:  /^https:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/
Raw ID fallback: /^[a-zA-Z0-9_-]+$/
```

If none match and the value contains `://`, it's a non-Google URL → error.

## File Changes

### New: `src/lib/googleIds.ts`

Export two functions:
- `extractDocId(input: string): string | null` — extracts Google Doc ID from URL or raw string
- `extractFolderId(input: string): string | null` — extracts Google Drive Folder ID from URL or raw string

### Modified: `src/components/Settings.tsx`

- Import `extractDocId`, `extractFolderId`
- Replace two plain `<Input>` fields with decorated input groups
- Add local `useState` for field-level errors (`docIdError`, `folderIdError`)
- Add paste handlers that extract IDs
- Add blur handlers that validate

### New test file: `src/lib/googleIds.test.ts`

Test URL extraction patterns, edge cases (trailing slashes, edit suffixes, query params, raw IDs).

## Validation Rules

| Input | Behavior |
|---|---|
| `abc123` | Accept as-is (raw ID) |
| `https://docs.google.com/document/d/abc123/edit` | Extract `abc123` |
| `https://drive.google.com/drive/folders/abc123` | Extract `abc123` |
| `https://example.com/bad` | Show error |
| Empty | Show error "This field is required" |
| Whitespace-only | Trim to empty → show error |

## Implementation Order

1. Write tests for `googleIds.ts`
2. Implement `googleIds.ts`
3. Modify `Settings.tsx` with decorated inputs + paste/validation
4. Run build + tests
