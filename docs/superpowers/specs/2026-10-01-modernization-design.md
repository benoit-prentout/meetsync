# MeetSync Modernization — Design

Date: 2026-10-01

## Goal

Bring the project's stack and code up to date after a period of inactivity (last work: June–July 2026, done with older Claude models). Stabilize first, no new features, no Chrome Web Store submission.

## Approach

Staged by risk. Each stage ends with `npm test`, `npm run build`, and a visual check on the Vite dev-preview pages, then gets its own commit so it can be reverted independently.

## Stages

### Stage 0 — Baseline (no behavior changes)
- `npm ci`, then `npm test` and `npm run build`; record what passes and fails today.
- Capture `npm audit` and `npm outdated`.
- Fix anything already red before upgrading.

### Stage 1 — Rebrand cleanup and low-risk upgrades
- Rename package `meet-gemini-chrome-extension` → `meetsync`; zip `meet-gemini-notebooklm.zip` → `meetsync.zip`. Update `package.json` scripts, CLAUDE.md, README and `.github/workflows/release.yml`.
- Upgrade Vite, Vitest, TypeScript, `@types/chrome`, lucide-react, Zustand 5.
- Verify after each bump.

### Stage 2 — React 19 + Recharts 3
- Upgrade together (Recharts 3 expects modern React); update `@types/react*`.
- Primary risk: Analytics page charts. Check every dashboard tab.

### Stage 3 — Tailwind 4
- Use `@tailwindcss/vite`; remove `postcss.config.js` and `autoprefixer`; move config into CSS (`@import "tailwindcss"`, `@theme`). Run the `@tailwindcss/upgrade` tool first.
- Remap the shadcn CSS variables in `src/index.css` (`--primary`, `--input`, `--ring`, `--background`, …) into `@theme`.
- Watch for changed defaults (border color, ring width, renamed `shadow-sm` / `rounded-sm` / `outline-none`).
- Visual check: popup, dashboard (all tabs), wizard (all scenarios) via `/popup-dev.html`, `/dashboard-dev.html`, `/wizard-dev.html`.
- Kept separate from Stage 2 so a visual regression reverts without touching React.

### Stage 4 — Audit of older-model code
- Review `apps-script/Code.gs` (~1080 lines) and `src/` for bugs, dead code and over-engineering.
- Check current Manifest V3 requirements, OAuth scopes (`script.projects` and `script.deployments` are sensitive scopes), and Apps Script runtime changes.
- Output: ranked findings. Fix confirmed real bugs only; leave speculative items alone.

## Out of scope
New features, Chrome Web Store submission, any change to the Apps Script deployment model.

## Testing
Existing Vitest suite is the safety net (jsdom, `src/test/setup.ts` chrome mocks). Add a test only when a Stage 4 bug fix needs one. The deployed Apps Script copy is updated manually per CLAUDE.md if `Code.gs` changes.

## Risks
- shadcn variable remap in Stage 3 (most likely visual breakage).
- Recharts 3 API changes in Stage 2.
- `node_modules` is not currently installed; baseline may reveal pre-existing failures.
