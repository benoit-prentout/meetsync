# MeetSync Product Improvements — Design

Date: 2026-10-02

## Goal

Make MeetSync easier to set up, cut the manual work in the NotebookLM / Gemini Notebook hand-off, and get it found, without spending money and without a Chrome Web Store listing for now.

## Decisions already made

- **GitHub-only distribution for now.** The Chrome Web Store ($5 one-time, covers any number of extensions) is deferred until the extension is production-ready. Nothing here should make a later listing harder.
- **No spend.** Everything below is free.
- **Official Google paths only** for the notebook hand-off. No browser automation of the notebook site (fragile, unofficial, conflicts with a later store review).
- **Users are a mix** of Workspace (business) and personal Google accounts, so every hand-off feature needs a path that works for personal accounts.
- **Keep the Apps Script backend.** Each user owns their deployment (privacy story, no Drive scopes on our side). No rewrite.

## Facts this design relies on (checked 2026-10-02)

- NotebookLM was renamed **Gemini Notebook** on 2026-07-16 (same product; `notebook.google.com`, old URL redirects).
- Since 2026-05-26, **Docs, Sheets and Slides sources auto-sync from Drive**. The README's "click Refresh every time" step is obsolete.
- Source limits per notebook: 50 (free), 100 (Plus), 300 (Pro), 600 (Ultra). The README's "limited to 50" is outdated.
- Workspace Studio has an **"Add a source to Gemini Notebook"** step (since 2026-08-06). Business, Enterprise and Education only; private notebooks only; not for personal accounts. It adds one source per item.
- The binding size limit for the master doc is Google Docs' own ~1M characters, not NotebookLM's 500k words per source. The backend already caps `ARCHIVE_THRESHOLD_CHARS` at 900000, so size-triggered archives cannot be avoided. Monthly archives can.
- The OAuth client in `public/manifest.json` is in **Testing** status (confirmed by the owner). Only listed test users can sign in and their tokens expire after 7 days, so the release zip does not work for anyone else without a rebuild against their own client.
- Apps requesting only non-sensitive scopes (`openid`, `email`) need no OAuth verification. `script.projects` and `script.deployments` are sensitive scopes.

## Work order

1. Setup and stale-doc cleanup (unblocks everything else).
2. Notebook hand-off.
3. Discoverability and positioning.

Each is its own plan and commit series; 1 is the only one with real code risk.

## 1. Simpler setup

### 1a. Shared OAuth client (removes the per-user GCP step)

- Publish the consent screen to **In production** (owner action in Google Cloud Console; free). Normal sign-in uses `getBackendToken()` (`openid email` override) and needs no verification and no user cap.
- Only the optional **Deploy Backend** button uses `getDeployToken()` and triggers the sensitive consent: Google's "unverified app" warning and a 100-user lifetime cap. This is acceptable because, with 1b, nobody needs Deploy Backend to get started (the template already contains the code); it is only used to push updates.
- `docs/google-cloud-setup.md` is retitled as an advanced "use your own OAuth client / fork" guide. README stops listing it as step 1.
- Document the unverified-app screen ("Advanced → Go to MeetSync") next to the Deploy Backend instructions.
- **Before release:** sign in from a Google account that is *not* on the test-user list and confirm there is no warning and the token works for 7+ days. Check how the consent screen shows the app name and logo when unverified and set expectations in the docs accordingly.

### 1b. One "connection code" instead of two fields

- New menu item in the template: **🚀 NotebookLM → Connect extension** (`Code.gs`). It shows a dialog with one copyable code: base64url of `{"v":1,"url":"<web app /exec url>","scriptId":"<id>"}` using `ScriptApp.getService().getUrl()` and `ScriptApp.getScriptId()`.
- If the script is not deployed yet, the dialog says so and shows the exact deploy steps (Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone) instead of a code.
- `SetupWizard.tsx` gets a single "Connection code" field. A new `src/lib/connectionCode.ts` decodes and validates it (reusing `isAppsScriptExecUrl`). Manual URL + script ID entry remains under an "Enter manually" toggle. Script ID is optional in manual mode (only Deploy Backend needs it).
- Existing wizard behavior is kept: draft saved in `storage.local`, `setDeploymentUrl` only after `await signIn()`, same error messages.
- **Risk:** `ScriptApp.getService().getUrl()` may return a `/dev` URL or `null` depending on how the menu item is invoked. A short spike must confirm it returns the `/exec` URL from a container-bound menu; if not, the dialog asks the user to paste the URL and only generates the code from it.

### 1c. README and Help rewritten around two paths

- **Path 1, no extension:** copy template → authorize → Sync Now → Enable Auto-Sync.
- **Path 2, adds the dashboard:** install the release zip → deploy as web app → paste connection code.
- Remove the Refresh step, correct the source-limit claim, mention Gemini Notebook alongside NotebookLM.
- Reconcile the access setting: code, wizard and CLAUDE.md say **Anyone**; `docs/google-cloud-setup.md` says "Anyone with a Google account". Pick the one that actually works with `?token=` auth and use it everywhere.
- Update `src/components/Help.tsx` to match.

## 2. Less manual work with the notebook

- **Docs/wizard:** replace the "Connecting to NotebookLM" section with a short checklist: create a notebook, add the master doc as a Drive source, done (it auto-syncs). Same text in the Help tab.
- **"Connect to Gemini Notebook" card** in the dashboard (Quick Actions area) and as the last wizard step: a copy-link button for the master doc (`https://docs.google.com/document/d/<masterDocId>/edit`, built from the existing `getSettings` `masterDocId`, so no backend change) and an open-notebook button (`https://notebook.google.com`). No deep link to "add source" is assumed to exist.
- **Monthly archiving off by default:** `ENABLE_MONTHLY_ARCHIVE: false` in `Code.gs`. Archives then happen only when the doc nears its size limit (every few months). Installs that already saved the setting keep it; installs that never saved it and redeploy `Code.gs` pick up the new default. Call this out in the release notes.
- **Archive email:** add one line to the archive notification: add this archive to your notebook, with the archive link, plus a pointer to the automation recipe.
- **Workspace Studio recipe (docs only)** for Business/Enterprise/Education accounts: set `archiveFolderId` in Settings (otherwise archives are not moved into a folder), then build a flow "When an item is added to a folder" → "Add a source to Gemini Notebook" with the folder and a private notebook. State the limits: private notebooks only, not for personal accounts.
- Any `Code.gs` change requires `npm run update:checksum` and a version bump; update the "update available" flow notes accordingly.

## 3. Discoverability and positioning (no store)

- **Positioning:** lead with "all your meetings, one clean doc, no source-cap problem, works with any AI tool", not "sync to NotebookLM". Differentiators: includes colleagues' shared notes, strips Gemini boilerplate, consolidates around the per-notebook source cap.
- **README:** one-line value prop, a ~30 s demo GIF at the top, both "NotebookLM" and "Gemini Notebook" in the first paragraph, and a short "How this compares" note covering Workspace Studio (one source per meeting, business accounts only), source-management extensions (ExtendLM, NotebookTools), and Google's generic Apps Script aggregation sample.
- **GitHub:** repo description, topics (`notebooklm`, `gemini-notebook`, `google-meet`, `apps-script`, `chrome-extension`, `meeting-notes`), `assets/branding/hero.png` as social preview.
- **Releases:** real release notes per version (the Releases page is the install page).
- **Posts (owner writes/posts, drafts can be prepared):** r/notebooklm update, r/GoogleWorkspace and r/gsuite ("put all your Meet notes into one notebook"), a LinkedIn post, genuine replies to existing questions about getting notes into NotebookLM.
- **Directories:** free listings on AlternativeTo and awesome-notebooklm-style GitHub lists.
- **Not doing:** separate landing site (README already ranks for the project name), analytics (conflicts with the no-data-collection promise; GitHub traffic insights are enough).

## Out of scope

Chrome Web Store submission, Edge/Firefox ports, browser automation of the notebook site, automatic backend deployment on first run (needs the sensitive scopes for every user), auto-creating the archive folder, a rewrite away from Apps Script, a landing site.

## Testing

- `npm test` stays green. New tests: `connectionCode` encode/decode/validation (including malformed, wrong version, non-`/exec` URL); wizard accepts a valid code and falls back to manual entry; Settings/default test for `enableMonthlyArchive: false`; backend test via `loadCode()` for the connect-extension payload and the archive email text.
- Wizard and dashboard card visually checked on `/wizard-dev.html` and `/dashboard-dev.html`.
- Manual release gates (owner): second-account sign-in against the production consent screen; fresh template copy → connection code → wizard on a clean Chrome profile.

## Risks and open items

- Publishing the consent screen: confirm the declared-scope list on the consent screen and that unverified production status behaves as expected for non-sensitive sign-in only (checked in the pre-release gate above).
- `getUrl()` behavior (1b spike).
- Changing the monthly-archive default is a behavior change for some existing installs.
- Google may ship native "Meet notes → notebook" automation; section 2 is deliberately light for that reason.
