# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Two-layer project: a **Chrome MV3 extension** (React + TypeScript + Vite + Tailwind + shadcn/ui) and a **Google Apps Script web app** backend. The extension lets users configure and monitor syncing of Google Meet notes into a master Google Doc for use with any AI tool.

- Extension source: `src/` — built with `npm run build`, output to `dist/`
- Backend: `apps-script/Code.gs` (~1080 lines) — deployed manually via Apps Script editor

## Chrome Extension Commands

```bash
npm run dev                         # Vite dev server at localhost:5173
npm run build                       # Build extension → dist/
npm test                            # Run Vitest test suite
npm run test:watch                  # Watch mode
npm run package                     # Build + zip → meet-gemini-notebooklm.zip
npx vitest run src/lib/api.test.ts  # Run a single test file
npx vitest run -t "test name"       # Run tests matching a name pattern
```

Load `dist/` as unpacked extension in Chrome (chrome://extensions → Developer mode → Load unpacked).

## Deployment

### Apps Script
1. Edit `apps-script/Code.gs`.
2. Copy full contents into the Apps Script editor bound to a Google Doc.
3. Deploy as web app: **Execute as: Me**, **Who has access: Anyone**.
4. Copy the deployment URL — user enters it in the extension's setup wizard.

### Extension
1. `npm run build` (or `npm run package` for a zip).
2. Load `dist/` unpacked in Chrome, or attach zip to a GitHub Release via the release workflow.
3. OAuth client ID must be set in `public/manifest.json` before building.

## Architecture

### Apps Script REST API

- `handleRequest(e)` is the single entry point for GET/POST.
- Auth: token passed as `?token=<accessToken>` query param — **Apps Script strips `Authorization` headers**, so `fetchApi` in `api.ts` appends the token to the URL.
- `validateCaller_(accessToken)` calls Google tokeninfo endpoint, compares email to `Session.getActiveUser().getEmail()`, caches 5 min via `CacheService`.
- `CONFIG_OVERRIDES` loaded from `PropertiesService` on startup via IIFE; `updateSettings` persists changes there.
- `SETTINGS_KEY_MAP_` maps camelCase frontend keys ↔ SCREAMING_SNAKE_CASE `CONFIG` keys.
- POST detection uses `e.postData` (not `e.method === 'POST'` — that field doesn't exist in Apps Script).
- `getHistory()` returns `{id, timestamp, filesProcessed, status, message, syncedNames, updatedNames, duration}` matching `SyncEvent` type.
- `getFiles()` returns `{id, name, lastSynced, size}` matching `SyncFile` type; fetches name from `Drive.Files.get`.

### Chrome Extension

- **Path alias**: `@` maps to `src/` — used throughout the codebase (`import { api } from '@/lib/api'`).
- **Auth**: `chrome.identity.getAuthToken` with scopes from `manifest.json` (`openid`, `email`, `script.projects`, `script.deployments` — the latter two for backend auto-deploy). The extension token is used solely to verify identity in `validateCaller_`; Apps Script uses `ScriptApp.getOAuthToken()` for Drive/Docs.
- **Config**: `deploymentUrl` is the source of truth in `chrome.storage.sync`. It is mirrored into Zustand by `App.tsx` on mount but is **not persisted** by the store's `partialize` — `chrome.storage.sync` is always the authoritative copy. `api.ts` reads it directly from storage via `getDeploymentUrl()`.
- **Auto-sync** is driven by `src/background.ts` (MV3 service worker) via `chrome.alarms`. It reads `autoSyncEnabled` and `autoSyncIntervalMinutes` from `chrome.storage.sync` directly (no Zustand access from the service worker). Settings changes trigger `chrome.storage.onChanged` to reconfigure the alarm.
- **State layer**: `useSettingsStore` (Zustand + `persist`) holds runtime UI state. `useApi` hook wraps `api.ts` calls and writes results into the store. `useAuth` manages the `chrome.identity` token lifecycle.
- **First run**: `App.tsx` reads `chrome.storage.sync` on mount; renders `<SetupWizard />` if URL not set.
- **SetupWizard ordering**: `setDeploymentUrl(url)` must be called AFTER `await signIn()` resolves — calling it before causes `App.tsx` to unmount the wizard mid-flow.
- **OAuth client ID**: set in `public/manifest.json` under `oauth2.client_id`. Format: `<id>.apps.googleusercontent.com`.

### Distribution

- **GitHub Releases**: tag `v*` triggers `.github/workflows/release.yml` → builds, zips, and attaches to a release
- **`PRIVACY.md`**: covers data handling — no third-party data transmission
- **Version**: shown in popup and dashboard headers via `chrome.runtime.getManifest().version`

### Key Entry Points

| Function | Purpose |
|---|---|
| `appendMeetNotesToMaster()` | Main sync: discovers, filters, cleans, and batch-inserts meeting notes |
| `checkAndArchive_(docId, tz, force)` | Triggers monthly or at ~800k chars; `force=true` skips threshold check |
| `cleanGeminiText_()` | Strips Gemini metadata, markdown headers/bold, and excess whitespace |
| `CONFIG` (top of file) | Controls `MAX_FILES_PER_RUN`, `ARCHIVE_THRESHOLD_CHARS`, `ENABLE_MONTHLY_ARCHIVE`, `MAX_AGE_DAYS` |

## Dev Preview Workflow (preferred for UI iteration)

Chrome extensions can't be navigated to directly (`chrome-extension://` URLs are blocked by tools). Instead, use the Vite dev server to iterate visually without rebuilding or reloading the extension:

```bash
npm run dev   # starts Vite dev server at http://localhost:5173
```

Four dev entry points are available:

| URL | Entry point | What it shows |
|---|---|---|
| `/dashboard.html` | `src/dashboard/main.tsx` (conditional mock) | Full auth + dashboard flow |
| `/dashboard-dev.html` | `src/dashboard/dev-main.tsx` | `<Dashboard />` directly, mocked data |
| `/popup-dev.html` | `src/popup/popup-dev-main.tsx` | `<Popup />` directly, mocked data |
| `/wizard-dev.html` | `src/wizard-dev-main.tsx` | `<SetupWizard />` with scenario picker (success / HTML error / network error / auth error) |

**How dev mode works:**
- `src/dashboard/main.tsx` conditionally imports `src/dev-mocks.ts` when `import.meta.env.DEV` is true.
- `src/dev-mocks.ts` stubs out `window.chrome` (storage, identity, tabs, runtime) and seeds the Zustand store with realistic fake data so all tabs render with content.
- `src/dashboard/dev-main.tsx` renders `<Dashboard />` directly, bypassing the auth/setup flow.
- `src/wizard-dev-main.tsx` inlines its own chrome mock and exposes a scenario picker to test different API response states.
- Dev mocks are tree-shaken out of production builds — they never appear in `dist/`.

**Verification workflow for UI changes:**
1. Start dev server: `npm run dev`
2. Open `http://localhost:5173/dashboard-dev.html` in a browser
3. Navigate tabs and inspect visually or via browser DevTools

## Testing

```bash
npm test   # runs vitest (jsdom, globals: true)
```

- Test files: `src/**/*.test.{ts,tsx}`, `apps-script/**/*.test.ts`
- `tsconfig.json` excludes test files from tsc build — required to avoid "Cannot find name 'vi'" errors.
- `src/test/setup.ts` mocks `chrome.storage.sync`, `chrome.identity`, `chrome.runtime`, `chrome.tabs`.
- `vi` must be imported explicitly in setup.ts (`import { vi } from 'vitest'`) even with `globals: true`.

## Known Gotchas

- `dist/` is gitignored — build artifacts are not committed.
- `Drive.Files.get` returns `size: "0"` for Google Docs (not binary files) — `getFiles()` treats this as `0`.
- `Session.getActiveUser().getEmail()` returns empty for some account types; `validateCaller_` logs a warning and returns false.
- Email notifications via `MailApp` silently fail when quota is exceeded or on personal accounts.
- Archive email failure is caught and logged but does not abort the archive.
- **shadcn/ui CSS variables ARE defined** in `src/index.css` (`--primary`, `--input`, `--background`, `--ring`, etc.). They can be used directly.
- **`background.js` must land at the dist root**, not `dist/assets/`. Vite routes it there via `output.entryFileNames` callback in `vite.config.ts` — don't remove that logic.
- **Auto-sync settings** (`autoSyncEnabled`, `autoSyncIntervalMinutes`) live in `chrome.storage.sync` directly, not in Zustand — the background service worker reads them at alarm time without access to the store.
