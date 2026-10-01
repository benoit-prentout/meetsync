# MeetSync Audit Findings

Date: 2026-10-01. Three read-only reviews: backend (`apps-script/Code.gs`), extension (`src/`, manifest, scripts), platform currency (official docs fetched 2026-10-01).

Confidence: **CONFIRMED** = provable from the code (or reproduced in node). **SPECULATIVE** = depends on runtime/platform behavior not verified. Platform claims come from a research agent with source URLs; verify against your own Drive/Console before relying on them.

Status column: `open` for everything until fixed.

## Tier 1 — Security (fix first)

| ID | Where | Defect | Fix | Conf. |
|---|---|---|---|---|
| A1 | Code.gs:100-118 | `validateCaller_` accepts `info.email === sessionEmail`, where `sessionEmail` is the *caller's* identity. In a Workspace, a colleague's own token passes auth (can archive/wipe the master doc, set `masterDocId` to any doc the owner can edit, read file names). | Compare against `Session.getEffectiveUser().getEmail()` (the deployer under "Execute as: Me"); drop the sessionEmail OR-branch. | Code CONFIRMED; runtime SPECULATIVE |
| A2 | Code.gs:105-116 | When `OWNER_EMAIL` is unset and session email empty, the first valid Google token from anyone becomes the owner permanently. | Same fix as A1; remove seeding. | CONFIRMED |
| A3 / ext-F2 | Code.gs:91-97, manifest, api.ts | tokeninfo `aud`/`azp` never checked, and the extension sends its full-privilege token (`script.projects`, `script.deployments`) in the URL to whatever deployment URL is configured. | Backend: require `azp` = extension client ID. Extension: use a separate `openid email` token for backend calls; script scopes only for deploy. | CONFIRMED |
| ext-F1 | Settings.tsx:131-137, api.ts:30-41, SetupWizard.tsx:20-27 | Deployment URL is not validated before the token is appended; any host receives the token (incl. via CORS preflight). | One shared `isAppsScriptExecUrl()` (host `script.google.com`, path `/macros/s/<id>/exec` or `/a/macros/<domain>/s/<id>/exec`) used in wizard, Settings and `fetchApi`. | CONFIRMED |
| A4 | Code.gs:88,120 | Auth cache keyed on a 32-char token prefix. | Key on SHA-256 of the full token. | SPECULATIVE |
| P2 | Code.gs:298-300, 921 | `masterDocId`/`archiveFolderId` not validated; ID interpolated into a URL fetched with the owner's token. | Validate `/^[A-Za-z0-9_-]{10,}$/`, `encodeURIComponent`. | CONFIRMED |

## Tier 2 — Data loss / sync correctness

| ID | Where | Defect | Fix | Conf. |
|---|---|---|---|---|
| B1 | Code.gs:506,807 vs 515,818 | `SYNC_<id>` markers are written before `batchUpdate` succeeds → a failed write permanently skips those notes. | Collect markers, `setProperties` only after `batchUpdate` returns. | CONFIRMED |
| B2 / ext-F10 | Code.gs:372-399, 401, 684, 858 | No `LockService` around sync/archive; alarm sync, manual sync and the 15-min trigger can overlap → duplicate inserts, or archive deleting just-inserted notes. Client times out at 90 s while backend allows 5 min. | `getScriptLock().tryLock()` in `runSync`/`runArchive`/`appendMeetNotesToMaster`/`forceArchive`; client timeout ≥ 330 s. | CONFIRMED (no lock); races SPECULATIVE |
| C1 | Code.gs:1129 | `cleanGeminiText_` participants regex is unanchored and case-insensitive `[A-Z]`; deletes action-item sections (e.g. after "Présents:"). | Anchor and bound the pattern (see node-verified fix in review notes). | CONFIRMED |
| C2 | Code.gs:1106 | `extractParticipants_` swallows the note body when no blank line / CRLF. | Normalise `\r\n?` → `\n`; stop at first non-list line. | CONFIRMED (LF) |
| D1 | Code.gs:409-463, 919, 999-1003 | Master doc and archive docs not excluded from the source query; self-import loops possible. | Skip `file.id === docId`; exclude `name contains 'Meeting Notes Archive'`. | CONFIRMED |
| E1 | Code.gs:469, 891, 975-1005, 292 | Doc-size protection counts only inserted text, runs before the batch; threshold 0 makes forced archive a silent no-op. | Use real `endIndex`; make `force` independent of threshold. | CONFIRMED |
| H1 | Code.gs:883-887 | `lastArchiveMonth` set before the archive succeeds → failed monthly archive skipped for the month. | Set after success. | CONFIRMED |
| G1 | Code.gs:454-456,748-750 | 5-minute grace window compares against the file's own modifiedTime; late Gemini edits are never synced. | Strict `modified > syncedAt`. | CONFIRMED |
| F1b | Code.gs:1189-1227, 1035-1056 | 9 KB Properties value limit: RUN_LOG/syncHistory overflow makes *successful* runs return `success:false`. | try/catch `appendRunLog_`, truncate, trim to < 8.5 KB. | CONFIRMED |
| I1 | Code.gs:58-62 | Glob patterns not regex-escaped; `[Private]*` excludes unrelated notes, `(` throws on every sync. | Escape regex chars before translating `*`/`?`. | CONFIRMED |
| J1 | Code.gs:684-851 vs 401-547 | `appendMeetNotesToMaster` (trigger) duplicates the REST sync and ignores `MASTER_DOC_ID`/time window. | Delegate to the REST path; delete the duplicate. | CONFIRMED |
| O1 | Code.gs:501,1070 | Inserting at index 1 may collide with the summary table. | Verify on a real doc first. | SPECULATIVE |

## Tier 3 — Platform changes (Google, reported 2026)

| ID | Where | Finding | Action |
|---|---|---|---|
| PL1 | Code.gs:7, 410-411, 700-701, 1094 | **Meet now files notes in "Google Meet" → per-meeting sub-folders; "Meet Recordings" is renamed "Legacy Meet Recordings" from Sept 2026.** The exact-name folder lookup now returns null and `'<id>' in parents` misses sub-folders; discovery relies only on name filters (unconfirmed). Verify in your own Drive. | Drop folder matching; use the name query alone (or walk "Google Meet" sub-folders). |
| PL2 | Code.gs:1178 | Notes docs now have tabs (Quick/Full notes); unverified whether `text/plain` export includes all tabs. | Check one recent synced note. |
| PL3 | manifest scopes | `script.*` scopes on a shared client: unverified-app screen, 100-user cap, 7-day token expiry in Testing status, OAuth verification needed for public Web Store release. | Request `script.*` only at deploy time (`getAuthToken({scopes})` from the Deploy button). |
| PL4 | release.yml | Node 20 removed from GitHub Actions runners 2026-09-23; `checkout@v4`/`setup-node@v4` are Node-20 actions. Also `build` + `package` builds twice. | Bump actions, `node-version: 22/24`, drop duplicate build. |
| PL5 | manifest | No `key` → every unpacked/release install gets a different extension ID; OAuth client is bound to one ID, so sign-in fails for other users. | Add `key` or document own-client setup. |
| PL6 | manifest/background | `identity.email` unused; `minimum_chrome_version` missing (`AbortSignal.any` needs 116). Service worker is killed after 30 s waiting on a fetch, so long alarm syncs lose their outcome. | Remove permission; add min version; keep-alive ping or accept. |
| PL7 | docs, PRIVACY.md | `google-cloud-setup.md` describes the old identity-only setup and old console UI; access-level wording differs across README/setup doc/manifest (`ANYONE` vs "Anyone"); NotebookLM 50-source limit is free-tier only; PRIVACY.md lacks the Limited Use sentence; user must enable the Apps Script API at script.google.com/home/usersettings (error text omits it). | Doc updates. |

## Tier 4 — Extension correctness / UX

| ID | Where | Defect | Fix |
|---|---|---|---|
| ext-F3 / N1 | Code.gs:56, backendChecksum.ts, package.json:7 | `SCRIPT_INTEGRITY` constant never matches the build-computed hash → Settings shows "Update available" forever, redeploy loops. | Run `compute-checksum.ts` before `generate-bundled-files.ts` in `build` (or fail on mismatch). |
| ext-F4 | apiErrorCode.ts:13-21 | Backend returns HTTP 200 + `{error:'Unauthorized'}` → `UNAUTHORIZED` never produced; reauth never fires; revoked token never removed. | Map payload `/^unauthori[sz]ed$/i` to `UNAUTHORIZED`. |
| ext-F5 | deployApi.ts:39-48,165-184 | Deployment lookup fails for Workspace URLs (`/a/macros/<domain>/s/…`) and uses `ep.url` instead of `entryPoints[].webApp.url`; checked *after* the project was overwritten. | Resolve target first; fix regex and field. |
| ext-F6 | deployApi.ts:50-84 | `updateContent` replaces the whole project; other user files are deleted. | Send existing files back, replace only `Code`/`appsscript`. |
| ext-F7 | dashboard/App.tsx:13,22-25,62 | Wizard stays visible after setup (local state, not store). | Read `deploymentUrl` from the store. |
| ext-F8 | useAuth.ts:57-69 etc. | Sign-out doesn't stick; popup lacks `getSettings()` after silent re-auth. | Persist `signedOut`; fetch settings. |
| ext-F9 | Popup.tsx:124, Dashboard.tsx:221 | Reads `filesProcessed`; backend returns `{synced, updated, errors, duration}` → always "0 files synced". | Use `synced + updated`, show `errors`. |
| ext-F11 | Popup.tsx | Errors not rendered; unhandled rejections. | try/catch + render `error`. |
| ext-F12 | SetupWizard.tsx:63-78 | URL stored before interactive sign-in; popup closes on OAuth focus. | Store only after `getStatus` succeeds. (SPECULATIVE) |
| ext-F13 | background.ts:4-13,74-82 | Alarm recreated on every worker start (resets schedule); no `.catch`. | `alarms.get` first; add listeners. |
| ext-F14 | alarmOutcomes.ts | Auto-sync outcomes stored but never shown. | Surface or delete. |
| ext-F16 | Settings.tsx:54-58 | Snapshot effect → spurious dirty state. | Snapshot in `getSettings`. |
| K1 | Code.gs:74-83 | Overnight time window never true; UTC script timezone. | Fix comparison; use script tz. |
| L1/L2 | Code.gs | Wrong synced/updated counts; email lists raw IDs; all-fail runs not logged. | Separate arrays; log errors. |
| M1/M2/P1 | Code.gs | No paging past 100 files; archive-folder move probably fails; `getFiles` slow. | Page; `Drive.Files.copy` with parents; batch. |

## Dead code (CONFIRMED)
`src/components/Dashboard.tsx`, `src/components/QuickActions.tsx` (not imported), store `addToHistory`, unreachable `TypeError` branch in `SetupWizard.tsx:79`, duplicate `backendChecksumPlugin` in `vite.config.ts` vs `scripts/generate-bundled-files.ts`, unused `identity.email`.

## Test caveat
`apps-script/*.test.ts` test hand-copied versions of `Code.gs` functions, not `Code.gs` itself; none cover auth, sync or archive.

## Note on scope
Fixing `Code.gs` requires re-pasting the file into the Apps Script editor and redeploying manually (CLAUDE.md). Findings marked SPECULATIVE are not fixed without verification.

## Resolution (branch `chore/modernization`)

**Fixed (each with tests; backend tests run against the real `Code.gs` via `apps-script/loadCode.ts`):**
A1, A2, A4, P2, ext-F1, ext-F2 (narrow token for backend calls), B1, B2 (+ client timeout 330 s), C1, C2, D1, E1, G1, H1, F1b, I1, J1, PL1 (+ M1 paging).

**Deliberately not fixed:**
- A3 backend `azp` check — setup docs tell users to create their own OAuth client, so a hardcoded client ID would lock them out. The extension no longer sends the full-privilege token to the backend, which removes the main exposure.
- O1, ext-F12 — SPECULATIVE, need verification in a real doc / Chrome.

**Backlog (not started):** PL2–PL7, ext-F3/N1 (stale `SCRIPT_INTEGRITY`), ext-F4–F9, F11, F13, F14, F16, K1, L1, L2, M2, P1, dead code.

**Known side effects of the fixes:**
- History keeps at most 20 names (80 chars each) per run, so name-based counts in Analytics/FileExplorer undercount runs with more than 20 notes.
- `Dashboard.tsx` has no try/catch around archive, so the new honest "Nothing to archive" error also logs an unhandled rejection.
- Sign-in now requests only `openid email`; the first "Deploy Update" shows a second consent screen for the `script.*` scopes.
- New personal-account installs where `Session.getEffectiveUser()` is empty need `OWNER_EMAIL` set by hand in Script Properties.
