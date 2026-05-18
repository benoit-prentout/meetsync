# Setup Wizard Connection Validation — Design Spec

**Date:** 2026-05-18  
**Status:** Approved

## Context

After a successful fix of the "Apps Script returned HTML instead of JSON" error (root cause: deployed version missing `doGet`/`doPost`; secondary cause: `script.googleusercontent.com` missing from `host_permissions`), two follow-up improvements are needed:

1. The Setup Wizard completes successfully even when the Apps Script deployment is broken — the error only surfaces later on the Settings tab.
2. Documentation in `Help.tsx` and `CLAUDE.md` still says "Anyone with Google account" for the Apps Script access setting, when the correct setting is "Anyone".

## Goals

- Surface deployment errors at setup time, with actionable inline messages, so users can fix them before reaching the dashboard.
- Correct stale documentation so future users deploy with the right settings on the first try.

## Non-goals

- Changing the wizard to multi-step.
- Adding retry logic or polling.
- Validating the Master Doc ID or Archive Folder ID at setup time.

---

## Section 1 — SetupWizard connection validation

**File:** `src/components/SetupWizard.tsx`

`signIn()` in `useAuth.ts` already returns the OAuth token. In `handleSave()`, after `await signIn()` resolves, add an explicit `api.getStatus(token)` call before calling `setDeploymentUrl()`.

### Flow

```
handleSave()
  1. Validate URL format (existing)
  2. chrome.storage.sync.set(deploymentUrl) (existing)
  3. await signIn() → token
  4. [NEW] await api.getStatus(token)
       ↳ throws → roll back deploymentUrl, show inline error, return
       ↳ succeeds → continue
  5. setDeploymentUrl(url) → transitions to Dashboard (existing)
```

### Button states

| Phase | Button label |
|---|---|
| Idle | Save & Connect |
| Auth in progress | Connecting… |
| Connection test in progress | Verifying… |

### Error message mapping

| Condition | Message |
|---|---|
| HTML response from Apps Script | "Apps Script deployment not responding correctly — make sure you saved Code.gs and deployed a **new version** (not an existing one) in the Apps Script editor." |
| Unauthorized / token mismatch | "Authorization failed — make sure the script is deployed as **Execute as: Me** and **Who has access: Anyone**." |
| Network / fetch failure (`TypeError: Failed to fetch`) | "Could not reach the deployment URL — check the URL and your internet connection." |
| Any other `ApiError` | Pass the raw `err.message` through |

All failures roll back `chrome.storage.sync` (remove `deploymentUrl`), same as the existing auth failure path.

---

## Section 2 — api.ts HTML error message

**File:** `src/lib/api.ts`, lines 52–56

Update the HTML detection error message to be actionable:

**Before:**
> Apps Script returned HTML instead of JSON — the deployment URL may be incorrect or the script needs to be re-deployed.

**After:**
> Apps Script returned HTML instead of JSON. This usually means the deployed version is missing the doGet function. In the Apps Script editor: save Code.gs, then deploy a **new version** (not an existing version).

This message surfaces in both the wizard (mapped above) and the Settings "Try again" flow.

---

## Section 3 — Documentation fixes

### Help.tsx

**File:** `src/components/Help.tsx`

- Step 3 (line 57): Change `"Anyone with Google account"` → `"Anyone"`.
- Checklist item (line ~106): Update the "Execute as: Me" item to also mention:
  > "The Apps Script backend is deployed with **Execute as: Me** and **Who has access: Anyone** — not 'Anyone with Google account'."

### CLAUDE.md

**File:** `CLAUDE.md` (Apps Script deployment section)

- Change `"Who has access: Anyone with Google account"` → `"Who has access: Anyone"`.

---

## Error classification logic

To distinguish "HTML from broken deployment" from "network error", the existing `ApiError` thrown by `fetchApi` when `text.startsWith('<')` carries a message starting with "Apps Script returned HTML". A `TypeError` (network failure / CORS) has a different type entirely. Map as follows in the wizard:

```ts
} catch (err) {
  if (err instanceof TypeError) {
    // network / CORS
  } else if (err instanceof ApiError && err.message.includes('HTML')) {
    // doGet missing / old version
  } else if (err instanceof ApiError && (err.message.includes('Unauthorized') || err.message.includes('unauthorized'))) {
    // auth mismatch
  } else {
    // raw message fallback
  }
}
```

---

## Files changed

| File | Change |
|---|---|
| `src/components/SetupWizard.tsx` | Add connection test step in `handleSave`, add `saving` phase state, map errors |
| `src/lib/api.ts` | Improve HTML error message |
| `src/components/Help.tsx` | Fix access setting in Step 3 and checklist |
| `CLAUDE.md` | Fix access setting in deployment instructions |

## Files NOT changed

- `src/hooks/useAuth.ts` — `signIn()` already returns the token; no modifications needed.
- `src/store/settingsStore.ts` — no changes.
- `public/manifest.json` — already fixed (contains `script.googleusercontent.com` in `host_permissions`).
