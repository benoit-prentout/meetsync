# AGENTS.md

## Two-Layer Architecture

- **Chrome MV3 extension** (`src/`): React 18 + TypeScript + Vite + Tailwind CSS + Zustand — built with `npm run build`, output to `dist/`.
- **Apps Script backend** (`apps-script/Code.gs`): ~1080 lines of Google Apps Script, deployed manually by copy-paste into the Apps Script editor.
- `CLAUDE.md` has the authoritative detailed reference — this file captures only what's easy to miss.

## Quick Commands

```bash
npm run dev       # Vite dev server at localhost:5173 (chrome APIs mocked via dev-mocks.ts)
npm run build     # tsc + vite build → dist/
npm test          # vitest run (jsdom, globals: true)
npm run package   # build + zip → meet-gemini-notebooklm.zip
npm run test:watch
npx vitest run -t "test name"   # single test by name
```

## Dev Preview (preferred over building+loading extension)

Four dev entry points bypass `chrome-extension://` restrictions:

| URL | What it renders |
|-----|----------------|
| `/dashboard.html` | Full auth + dashboard flow (conditional mock) |
| `/dashboard-dev.html` | `<Dashboard />` directly, mocked data |
| `/popup-dev.html` | `<Popup />` directly, mocked data |
| `/wizard-dev.html` | `<SetupWizard />` with scenario picker |

Mocks live in `src/dev-mocks.ts` — stubs chrome.storage, identity, tabs, runtime and seeds Zustand with fake data. Tree-shaken from production builds.

**Apps Script test files** (`apps-script/*.test.ts`) replicate backend transform logic in TypeScript for Vitest — they are NOT runnable in Apps Script. Keep them in sync when changing Code.gs.

## Apps Script Deployment

- Copy `apps-script/Code.gs` into the Apps Script editor bound to a Google Doc.
- Enable Drive API (v3) and Docs API (v1) via Services panel.
- Deploy as web app: Execute as Me, Who has access: Anyone.
- The web app URL (`/macros/s/{deploymentId}/exec`) goes into the extension's SetupWizard (`chrome.storage.sync: deploymentUrl`).
- The **script project ID** (from the editor URL `/home/projects/{scriptId}/edit`) is a SEPARATE field — it's NOT the same as the deployment ID in the web app URL. The extension stores it as `chrome.storage.sync: scriptId`.
- `Session.getActiveUser().getEmail()` returns empty for some account types — `validateCaller_` logs a warning and returns false.
- POST detection must use `e.postData` (not `e.method` — that field doesn't exist in Apps Script).
- Config overrides persist in `PropertiesService.getScriptProperties()` under key `CONFIG_OVERRIDES`.

## Programmatic Deployment (`src/lib/deployApi.ts`)

The extension can push Code.gs updates via the Apps Script REST API:

1. **OAuth scopes** required in `public/manifest.json`:
   - `https://www.googleapis.com/auth/script.projects` — for `projects.getContent` / `projects.updateContent`
   - `https://www.googleapis.com/auth/script.deployments` — for `projects.deployments.list` / `projects.deployments.update`
2. **SetupWizard** collects both the deployment URL AND the script project ID separately since they are different identifiers.
3. **Flow**: GET content (verify + get file IDs) → PUT updated content → POST new version → GET deployments → PUT deployment with new version
4. When adding new OAuth scopes to the manifest, the cached Chrome identity token must be cleared (`chrome.identity.removeCachedAuthToken`) — the extension clears it on each signIn.
5. `chrome.identity.getAuthToken` ignores the `scopes` parameter in modern Chrome — use manifest scopes only.
6. Deployment matching uses `deploymentId` extracted from the URL (`/macros/s/{id}/exec`) rather than full URL comparison, which is fragile to trailing slashes and encoding differences.
7. Content update must send BOTH `Code.gs` (SERVER_JS) and `appsscript.json` (JSON) with existing file IDs from the GET step. Missing file IDs can cause 400 errors.

## Extension Auth & Token Flow

- Extension uses `chrome.identity.getAuthToken` with scopes from `manifest.json` (`oauth2.scopes`). The `scopes` parameter in JS is ignored by modern Chrome.
- Token is passed as `?token=<accessToken>` query param (Apps Script strips `Authorization` headers).
- Apps Script validates via Google tokeninfo endpoint + email comparison; caches result 5 min via `CacheService`.
- OAuth client ID lives in `public/manifest.json` under `oauth2.client_id`.
- `chrome.identity.removeCachedAuthToken` is called before each signIn to ensure fresh tokens with current manifest scopes.

## Auto-Sync (Background Service Worker)

- `src/background.ts` uses `chrome.alarms` — reads `autoSyncEnabled` and `autoSyncIntervalMinutes` directly from `chrome.storage.sync` (no Zustand available in service worker).
- `chrome.storage.onChanged` reconfigures the alarm when settings change.

## Key Gotchas

- **dist/ is gitignored** — `npm run build` before loading unpacked in Chrome.
- **`background.js` must land at dist root**, not `dist/assets/`. Vite routes it via `output.entryFileNames` callback in vite.config.ts.
- **deploymentUrl** is source of truth in `chrome.storage.sync`; Zustand mirrors it but does NOT persist it (see `partialize` in settingsStore).
- **scriptId** is stored separately in `chrome.storage.sync` — it's the value from the script editor URL, NOT from the deployment URL.
- **SetupWizard ordering**: `setDeploymentUrl(url)` must be called AFTER `await signIn()` resolves — calling it before unmounts the wizard mid-flow.
- **Drive.Files.get** returns `size: "0"` for Google Doc files — `getFiles()` treats this as 0.
- **MailApp** notifications silently fail on quota exceeded or personal accounts (caught and logged, does not abort archive).
- **CSS variables ARE defined** in `src/index.css` (`--primary`, `--input`, etc.) — the CLAUDE.md warning about them being unset is outdated.
- **Code.gs syntax errors** surface as `Unexpected token` during API upload, not at compile time. Check for orphaned braces in IIFEs — the CONFIG overrides loader had a duplicate `})();`.
- **Deployment matching** extracts the `deploymentId` from the URL path segment (`/macros/s/{id}/exec`) rather than comparing full URLs, avoiding trailing-slash/encoding mismatches.
