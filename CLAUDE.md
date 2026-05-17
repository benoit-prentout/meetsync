# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Two-layer project: a **Chrome MV3 extension** (React + TypeScript + Vite + Tailwind + shadcn/ui) and a **Google Apps Script web app** backend. The extension lets users configure and monitor syncing of Google Meet "Notes by Gemini" into a master Google Doc for use as a NotebookLM source.

- Extension source: `src/` — built with `npm run build`, output to `dist/`
- Backend: `apps-script/Code.gs` (~780 lines) — deployed manually via Apps Script editor

## Chrome Extension Commands

```bash
npm run build        # Build extension → dist/
npm test             # Run Vitest test suite (23 tests)
npm run test:watch   # Watch mode
npm run package      # Build + zip → meet-gemini-notebooklm.zip
```

Load `dist/` as unpacked extension in Chrome (chrome://extensions → Developer mode → Load unpacked).

## Deployment

### Apps Script
1. Edit `apps-script/Code.gs`.
2. Copy full contents into the Apps Script editor bound to a Google Doc.
3. Deploy as web app: **Execute as: Me**, **Who has access: Anyone with Google account**.
4. Copy the deployment URL — user enters it in the extension's setup wizard.

### Extension
1. `npm run build` (or `npm run package` for a zip).
2. Load `dist/` unpacked in Chrome, or upload zip to Chrome Web Store.
3. OAuth client ID must be set in `public/manifest.json` before building.

## Architecture

### Apps Script REST API

- `handleRequest(e)` is the single entry point for GET/POST.
- Auth: token passed as `?token=<accessToken>` query param — **Apps Script strips `Authorization` headers**, so `fetchApi` in `api.ts` appends the token to the URL.
- `validateCaller_(accessToken)` calls Google tokeninfo endpoint, compares email to `Session.getActiveUser().getEmail()`, caches 5 min via `CacheService`.
- `CONFIG_OVERRIDES` loaded from `PropertiesService` on startup via IIFE; `updateSettings` persists changes there.
- `SETTINGS_KEY_MAP_` maps camelCase frontend keys ↔ SCREAMING_SNAKE_CASE `CONFIG` keys.
- POST detection uses `e.postData` (not `e.method === 'POST'` — that field doesn't exist in Apps Script).
- `getHistory()` returns `{id, timestamp, filesProcessed, status, message}` matching `SyncEvent` type.
- `getFiles()` returns `{id, name, lastSynced, size}` matching `SyncFile` type; fetches name from `Drive.Files.get`.

### Chrome Extension

- **Auth**: `chrome.identity.getAuthToken` with `openid email` scopes only. The extension token is used solely to verify identity in `validateCaller_`; Apps Script uses `ScriptApp.getOAuthToken()` for Drive/Docs.
- **Config**: `deploymentUrl` stored in `chrome.storage.sync` — NOT in Zustand (intentional). Read via `getDeploymentUrl()` in `api.ts`.
- **First run**: `App.tsx` reads `chrome.storage.sync` on mount; renders `<SetupWizard />` if URL not set.
- **SetupWizard ordering**: `setDeploymentUrl(url)` must be called AFTER `await signIn()` resolves — calling it before causes `App.tsx` to unmount the wizard mid-flow.
- **OAuth client ID**: set in `public/manifest.json` under `oauth2.client_id`. Format: `<id>.apps.googleusercontent.com`.

### Key Entry Points

| Function | Purpose |
|---|---|
| `appendMeetNotesToMaster()` | Main sync: discovers, filters, cleans, and batch-inserts meeting notes |
| `checkAndArchive_(docId, tz, force)` | Triggers monthly or at ~800k chars; `force=true` skips threshold check |
| `cleanGeminiText_()` | Strips Gemini metadata, markdown headers/bold, and excess whitespace |
| `CONFIG` (top of file) | Controls `MAX_FILES_PER_RUN`, `ARCHIVE_THRESHOLD_CHARS`, `ENABLE_MONTHLY_ARCHIVE`, `MAX_AGE_DAYS` |

## Dev Preview Workflow (preferred for UI iteration)

Chrome extensions can't be navigated to directly (`chrome-extension://` URLs are blocked by tools). Instead, use the Vite dev server + Claude Preview MCP to iterate visually without rebuilding or reloading the extension:

```bash
npm run dev   # starts Vite dev server at http://localhost:5173
```

Then open `http://localhost:5173/dashboard.html` in Claude Preview. Changes hot-reload instantly.

**How dev mode works:**
- `src/dashboard/main.tsx` conditionally imports `src/dev-mocks.ts` when `import.meta.env.DEV` is true.
- `src/dev-mocks.ts` stubs out `window.chrome` (storage, identity, tabs, runtime) and seeds the Zustand store with realistic fake data so all tabs render with content.
- `src/dashboard/dev-main.tsx` is an alternate entry that renders `<Dashboard />` directly, bypassing the auth/setup flow entirely.
- `dashboard-dev.html` points to `dev-main.tsx`; the main `dashboard.html` uses the conditional import path.
- Dev mocks are tree-shaken out of production builds — they never appear in `dist/`.

**Verification workflow for UI changes:**
1. Start dev server with `preview_start` (name: `dashboard`)
2. Screenshot with `preview_screenshot` to check layout
3. Use `preview_eval` to click nav buttons: `document.querySelectorAll('nav button')[n].click()`
4. Use `preview_inspect` to verify computed CSS properties (colors, dimensions)
5. Use `preview_eval` to query DOM state (e.g. `data-state` attributes on toggles)

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
- **shadcn/ui CSS variables are not defined** in `src/index.css` — `--primary`, `--input`, `--background`, `--ring` etc. are all unset. Any shadcn component using these tokens (e.g. `bg-primary`, `bg-input`) will render transparent. Use explicit Tailwind classes instead (e.g. `bg-[#1a73e8]`, `bg-slate-200`, `bg-white`).
- **`background.js` must land at the dist root**, not `dist/assets/`. Vite routes it there via `output.entryFileNames` callback in `vite.config.ts` — don't remove that logic.
- **Auto-sync settings** (`autoSyncEnabled`, `autoSyncIntervalMinutes`) live in `chrome.storage.sync` directly, not in Zustand — the background service worker reads them at alarm time without access to the store.
