# MeetSync Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring MeetSync's stack and code up to date (rebrand leftovers, dependency upgrades through React 19 / Recharts 3 / Tailwind 4, code audit) without changing behavior.

**Architecture:** Staged by risk. Each task ends green (`npm test` + `npm run build`) and gets its own commit so it can be reverted alone. Visual regressions are checked against baseline screenshots taken before any upgrade.

**Tech Stack:** Vite, Vitest (jsdom), TypeScript, React, Zustand, Recharts, Tailwind, lucide-react, Chrome MV3, Google Apps Script.

**Spec:** `docs/superpowers/specs/2026-10-01-modernization-design.md`

**Conventions used below**
- `$REPO` = `/Users/benoitprentout/github repos/meetsync` (path has a space — always quote it).
- `$SHOTS` = the session scratchpad dir + `/shots` (baseline and after-change screenshots).
- "Green" means: `npm test` exits 0 AND `npm run build` exits 0.
- Do NOT rename the Zustand persist key `meet-gemini-storage` (`src/store/settingsStore.ts:88`, `src/dev-mocks.ts:4`). Renaming it would wipe every existing user's saved UI state for no benefit.
- Historical docs under `docs/superpowers/specs|plans/2026-05-*` keep their old names (they're records, not live docs).

---

### Task 1: Baseline — install, test, build, screenshots

**Files:** none modified (only a new `$SHOTS` dir outside the repo).

- [ ] **Step 1: Install exactly what the lockfile says**

```bash
cd "/Users/benoitprentout/github repos/meetsync" && npm ci
```
Expected: completes without error. If it fails with an integrity error, run `npm install` instead and note it (commit the lockfile change as `chore: refresh lockfile`).

- [ ] **Step 2: Run tests and build, record results**

```bash
npm test 2>&1 | tail -25
npm run build 2>&1 | tail -15
```
Expected: both exit 0. If anything is red, STOP and fix it (or report) before any upgrade; do not upgrade on a red baseline. Write the pass counts down (e.g. "N test files, M tests").

- [ ] **Step 3: Record audit and outdated state**

```bash
npm audit 2>&1 | tail -15
npm outdated 2>&1
```
Note the output in the task report; no changes.

- [ ] **Step 4: Capture baseline screenshots**

Start the dev server in the background (`npm run dev`). With the Playwright browser tools, navigate to each URL, take a full-page screenshot into `$SHOTS/baseline-<name>.png`:
- `http://localhost:5173/popup-dev.html` → `popup`
- `http://localhost:5173/dashboard-dev.html` → click each tab (Overview, History, Files, Analytics, Settings, Help — use whatever tabs exist) → `dashboard-<tab>`
- `http://localhost:5173/wizard-dev.html` → each scenario in the picker → `wizard-<scenario>`

Stop the dev server. Expected: ~12 PNGs. These are the reference for Tasks 5 and 6.

- [ ] **Step 5: No commit** (nothing changed). Report baseline numbers.

---

### Task 2: Rebrand cleanup

**Files:**
- Modify: `package.json:2,10`
- Modify: `.github/workflows/release.yml:25`
- Modify: `README.md:36,142`
- Modify: `AGENTS.md:23`
- Modify: `CLAUDE.md:19`
- Modify: `docs/google-cloud-setup.md:17`

- [ ] **Step 1: Edit `package.json`**

Change `"name": "meet-gemini-chrome-extension"` → `"name": "meetsync"` and in the `package` script replace `meet-gemini-notebooklm.zip` → `meetsync.zip`:

```json
"package": "npm run build && cd dist && zip -r ../meetsync.zip . && cd ..",
```

- [ ] **Step 2: Replace the zip name everywhere else**

```bash
sed -i '' 's/meet-gemini-notebooklm\.zip/meetsync.zip/g' .github/workflows/release.yml README.md AGENTS.md CLAUDE.md
sed -i '' 's/`meet-gemini-notebooklm`/`meetsync`/' docs/google-cloud-setup.md
```

- [ ] **Step 3: Refresh the lockfile name and verify nothing live still uses the old names**

```bash
npm install --package-lock-only
grep -rniE "meet-gemini|gemini-notebooklm" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=superpowers --exclude=package-lock.json .
```
Expected: only `src/dev-mocks.ts:4` and `src/store/settingsStore.ts:88` (`meet-gemini-storage`, intentionally kept).

- [ ] **Step 4: Verify green**

```bash
npm test 2>&1 | tail -6 && npm run build 2>&1 | tail -4
```
Expected: same counts as the Task 1 baseline.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
chore: finish MeetSync rebrand in package name, zip name and docs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Low-risk upgrades (Vite, Vitest, TypeScript, types, lucide, Zustand)

**Files:**
- Modify: `package.json`, `package-lock.json`
- Possibly modify: `vite.config.ts`, `vitest.config.ts`, files importing lucide icons, `src/store/settingsStore.ts`

Do these as three sub-steps, each verified green before the next, so a breakage points at one package.

- [ ] **Step 1: Toolchain — Vite, Vitest, TypeScript, plugin-react, @types/chrome**

```bash
npm install -D vite@latest vitest@latest @vitest/coverage-v8@latest typescript@latest @vitejs/plugin-react@latest @types/chrome@latest jsdom@latest tsx@latest
npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -8
```
Expected: green. Likely fixes if red: new `tsc` strictness errors (fix the code, don't loosen `tsconfig`), Vite plugin API changes in `vite.config.ts` (the custom `backendChecksumPlugin` and `copy-manifest` plugins use only `buildStart`/`closeBundle`, which are stable). Verify `dist/background.js` exists at the dist root and `dist/manifest.json` exists:

```bash
ls dist/background.js dist/manifest.json
```
Commit: `chore(deps): upgrade Vite, Vitest, TypeScript and tooling` (with the Co-Authored-By trailer).

- [ ] **Step 2: lucide-react**

```bash
npm install lucide-react@latest
npm run build 2>&1 | tail -12
```
Expected: green. If `tsc` reports a missing icon export, find the renamed icon in the lucide changelog/`node_modules/lucide-react/dist/lucide-react.d.ts` and update the import. Check usage first: `grep -rhoE "from 'lucide-react'" src | wc -l`.
Commit: `chore(deps): upgrade lucide-react`.

- [ ] **Step 3: Zustand 5**

```bash
npm install zustand@latest
npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -8
```
Zustand 5 breaks selectors that return a new object/array each render (infinite loop: "Maximum update depth exceeded"). Check: `grep -rnE "useSettingsStore\(\(s(tate)?\) => \(\{|useSettingsStore\(\(s(tate)?\) => \[" src`. Fix any hit by selecting primitives individually or wrapping in `useShallow` from `zustand/react/shallow`. The persist middleware API in `src/store/settingsStore.ts` is unchanged in v5.
Commit: `chore(deps): upgrade zustand to v5`.

- [ ] **Step 4: Visual check**

Start `npm run dev`, screenshot the same pages as Task 1 into `$SHOTS/stage1-<name>.png`, compare against baseline (open both with the Read tool). Expected: no visible difference. Stop the dev server.

---

### Task 4: React 19 + Recharts 3

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src/components/AnalyticsChart.tsx`, `src/components/Analytics.tsx`, their tests, and anything else `tsc` flags

- [ ] **Step 1: Upgrade together**

```bash
npm install react@latest react-dom@latest recharts@latest
npm install -D @types/react@latest @types/react-dom@latest @testing-library/react@latest @testing-library/user-event@latest @testing-library/jest-dom@latest
npm test 2>&1 | tail -20 && npm run build 2>&1 | tail -15
```
Expected: may be red. Known React 19 breakers to check: `React.FC` children typing, `useRef()` now requires an argument, `ReactDOM.render`/`findDOMNode` removed (grep `src/main.tsx`, `src/dashboard/main.tsx`, `src/popup/*` for `createRoot` — should already be used), `forwardRef` still works. Known Recharts 3 changes: `CategoricalChartState` and `activeIndex` props removed, `Tooltip`/`Legend` typing stricter, `ResponsiveContainer` still exists. Fix by reading the compiler errors; do not loosen types.

- [ ] **Step 2: Fix until green**

Re-run `npm test` and `npm run build` until both exit 0 with the baseline test count.

- [ ] **Step 3: Visual check, Analytics first**

Start `npm run dev`; screenshot all pages into `$SHOTS/stage2-<name>.png`. Compare Analytics (charts render, tooltips on hover work, axes/legend present) and all other tabs against baseline. Also open the browser console via the Playwright tool and confirm no React warnings/errors on any page.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
chore(deps): upgrade to React 19 and Recharts 3

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tailwind 4

**Files:**
- Delete: `postcss.config.js`, `tailwind.config.js`
- Modify: `vite.config.ts`, `src/index.css`, `package.json`
- Modify: `src/components/ui/{card,switch,badge,button,input}.tsx`, `Settings.tsx`, `SetupWizard.tsx`, `Analytics.tsx`, `FileExplorer.tsx` (class renames)

Context: `tailwind.config.js` is effectively empty (`extend: {}`); the shadcn variables in `src/index.css` are plain CSS variables used directly (not mapped into Tailwind colors), so the migration risk is mainly class renames and changed defaults.

- [ ] **Step 1: Run the official upgrade tool on a clean tree**

```bash
git status --short   # must be empty
npx @tailwindcss/upgrade
```
It rewrites `src/index.css` (`@import "tailwindcss";`), updates class names, and edits `package.json`. Review `git diff` fully.

- [ ] **Step 2: Switch to the Vite plugin and drop PostCSS**

```bash
npm install tailwindcss@latest @tailwindcss/vite@latest
npm uninstall autoprefixer postcss
git rm -f postcss.config.js tailwind.config.js 2>/dev/null; true
```
In `vite.config.ts` add and register the plugin:

```ts
import tailwindcss from '@tailwindcss/vite';
// ...
plugins: [
  backendChecksumPlugin(),
  react(),
  tailwindcss(),
  { name: 'copy-manifest', /* unchanged */ },
],
```
`vitest.config.ts` needs no Tailwind (tests don't assert styling).

- [ ] **Step 3: Confirm `src/index.css` shape**

It must start with `@import "tailwindcss";`, keep the `:root { --background … --radius }` block and the `body` font rule (if the tool wrapped them in `@layer base`, that is fine). If the upgrade tool left a `@config` line pointing at the deleted file, remove it.

- [ ] **Step 4: Handle v4 default changes**

In v4: default border color is `currentColor` (was gray-200), `ring` is 1px (was 3px), `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded-sm`→`rounded-xs`, `outline-none`→`outline-hidden`. The upgrade tool renames utilities; it does NOT restore the border-color default. Add to `src/index.css` to keep current looks:

```css
@layer base {
  *, ::after, ::before, ::backdrop, ::file-selector-button {
    border-color: hsl(var(--border));
  }
}
```
(This also matches the shadcn `--border` variable, which was the intended color.) Then grep for bare `ring` and `border` usages and confirm each against screenshots: `grep -rnE "\bring\b|ring-offset" src --include=*.tsx`. Where a bare `ring` was intended to be 3px, change to `ring-3`.

- [ ] **Step 5: Verify green**

```bash
npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -10
ls dist/background.js dist/manifest.json
```
Also confirm CSS was generated: `ls dist/assets/*.css` and `grep -c "bg-" dist/assets/*.css` (non-zero).

- [ ] **Step 6: Visual check against baseline**

Start `npm run dev`; screenshot all pages into `$SHOTS/stage3-<name>.png`; compare each against `baseline-*` (Read both). Look for: border colors, focus rings (Tab through inputs in Settings and the wizard), button/card shadows and radii, switch component, font (Plus Jakarta Sans). Fix any difference by adjusting the class on the offending component to match baseline. Repeat until identical in all ~12 screens.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
chore(deps): migrate to Tailwind CSS 4 via @tailwindcss/vite

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Audit of earlier-model code

**Files:**
- Read-only: `apps-script/Code.gs`, `src/**`, `public/manifest.json`
- Create: `docs/superpowers/specs/2026-10-01-audit-findings.md`
- Modify: only files with confirmed bugs

- [ ] **Step 1: Run the reviews in parallel**

Dispatch three independent review subagents (read-only; each returns findings with `file:line`, the defect, and a concrete failure scenario — no style opinions):
1. `apps-script/Code.gs` — correctness, auth (`validateCaller_`, `OWNER_EMAIL` fallback), quota/timeouts, error handling, `SETTINGS_KEY_MAP_` consistency.
2. `src/` extension code — correctness, `background.ts` alarm logic, `api.ts` error handling, store/persist behavior, dead code.
3. Platform currency — web-search current Manifest V3 requirements for `public/manifest.json`, whether `script.projects`/`script.deployments` scopes still work for the auto-deploy flow, Chrome Web Store sensitive-scope verification implications, and any Apps Script runtime/`appsscript.json` changes.

- [ ] **Step 2: Triage**

Write `docs/superpowers/specs/2026-10-01-audit-findings.md` with findings ranked by severity, each marked `confirmed` (reproduced or provable from code) or `speculative`. Only `confirmed` items proceed to Step 3.

- [ ] **Step 3: Fix each confirmed bug with TDD**

For each confirmed finding, in its own commit: write a failing test that demonstrates it (`npx vitest run <file> -t "<name>"` → FAIL), apply the minimal fix, re-run (PASS), then full `npm test`. For `Code.gs` changes: the existing Apps Script tests are in `apps-script/**/*.test.ts`; also run `npm run update:checksum` if the repo's checksum flow requires it (check `scripts/compute-checksum.ts`) and tell the user the Apps Script editor copy must be re-pasted and redeployed manually.

- [ ] **Step 4: Commit the findings doc**

```bash
git add docs/superpowers/specs/2026-10-01-audit-findings.md && git commit -m "$(cat <<'EOF'
docs: add modernization audit findings

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Final verification and docs sync

**Files:**
- Modify: `CLAUDE.md`, `AGENTS.md`, `README.md` only where the stack description is now wrong

- [ ] **Step 1: Clean install, full green**

```bash
rm -rf node_modules dist && npm ci && npm test 2>&1 | tail -8 && npm run package 2>&1 | tail -6 && ls -la meetsync.zip
```
Expected: tests pass, `meetsync.zip` produced.

- [ ] **Step 2: Load-test the built extension**

Tell the user to load `dist/` unpacked in `chrome://extensions` and check popup, dashboard, setup wizard sign-in, and a manual sync. (Extension pages cannot be driven by the tools; this is a manual user step.)

- [ ] **Step 3: Sync docs**

`grep -nE "React 18|Tailwind 3|Vite 5|tailwind.config|postcss" CLAUDE.md AGENTS.md README.md` and update every hit to match the new stack (e.g. remove references to `tailwind.config.js`/PostCSS).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
docs: sync stack description after modernization

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** Stage 0 → Task 1; Stage 1 → Tasks 2–3; Stage 2 → Task 4; Stage 3 → Task 5; Stage 4 → Task 6; final verification/docs → Task 7. Out-of-scope items (features, Web Store submission) have no tasks, as intended.
- **Deliberate deviation from spec:** the persist key `meet-gemini-storage` is kept (renaming wipes users' saved state). Spec's rename list covered only package, zip and docs, so no conflict.
- **Execution branch:** do this on a feature branch (`chore/modernization`), not `main`; open one PR at the end.
