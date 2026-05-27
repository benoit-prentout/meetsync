# Backend Version Check & Auto-Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual indicator in the extension Settings showing whether the deployed Apps Script backend matches the local version, and a "Deploy Update" button to push changes from the extension.

**Architecture:** A content hash (SHA-256) of `apps-script/Code.gs` is embedded both in Code.gs itself (returned via the `status` API endpoint) and baked into the extension at build time. The extension compares the two hashes. Phase 2 adds Apps Script API calls to push updated code and redeploy.

**Tech Stack:** Node.js crypto (for hashing), Vite plugin (build-time codegen), Google Apps Script API (Phase 2, `script.projects` scope), Vitest

---

## File Structure

### New files:
- `scripts/compute-checksum.ts` — computes SHA-256 of Code.gs (excluding SCRIPT_INTEGRITY line) and updates the constant
- `src/lib/backendChecksum.ts` — auto-generated, exports `EXPECTED_BACKEND_HASH`
- `src/lib/bundledBackend.ts` — auto-generated (Phase 2), exports `BUNDLED_BACKEND_CODE`
- `src/lib/deployApi.ts` — Apps Script API operations (Phase 2)

### Modified files:
- `apps-script/Code.gs` — add `SCRIPT_INTEGRITY` constant, extend `getStatus()` return
- `src/types/index.ts` — add `backendIntegrity` to `StatusResponse`
- `src/components/Settings.tsx` — add status row + deploy button
- `vite.config.ts` — add plugin for backend codegen
- `package.json` — add `update:checksum` script
- `.gitignore` — add auto-generated files
- `src/lib/api.test.ts` — add test for `backendIntegrity` field
- `public/manifest.json` — add `script.projects` scope (Phase 2)
- `src/hooks/useAuth.ts` — pass additional scope (Phase 2)

---

## Phase 1: Backend Version Check Indicator

### Task 1: Create checksum script

**Files:**
- Create: `scripts/compute-checksum.ts`

- [ ] **Step 1: Write the checksum script**

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

const CODEGS_PATH = resolve(__dirname, '../apps-script/Code.gs');

function computeChecksum(content: string): string {
  const lines = content.split('\n');
  const filtered = lines.filter(line => !line.includes('SCRIPT_INTEGRITY'));
  return createHash('sha256').update(filtered.join('\n')).digest('hex');
}

function main() {
  const content = readFileSync(CODEGS_PATH, 'utf-8');
  const hash = computeChecksum(content);

  const updated = content.replace(
    /(SCRIPT_INTEGRITY\s*=\s*')([^']*)(')/,
    `$1${hash}$3`
  );

  if (updated === content) {
    console.error('ERROR: Could not find SCRIPT_INTEGRITY constant in Code.gs');
    process.exit(1);
  }

  writeFileSync(CODEGS_PATH, updated, 'utf-8');
  console.log(`Checksum updated: ${hash}`);
}

main();
```

- [ ] **Step 2: Test the script manually**

Run: `mkdir -p scripts && node -e "require('tsx').register(); require('./scripts/compute-checksum')" 2>/dev/null || npx tsx scripts/compute-checksum.ts`

The script will initially fail because `SCRIPT_INTEGRITY` doesn't exist yet (Task 2 adds it). Expected: exits with error code 1.

- [ ] **Step 3: Add placeholder constant first**

Run this first to create the placeholder the script expects. Task 2 will refine it:

```bash
# Insert SCRIPT_INTEGRITY constant after CONFIG object
sed -i '' '/^const CONFIG = {/a\
const SCRIPT_INTEGRITY = '\''PLACEHOLDER'\'';
' apps-script/Code.gs
```

Wait — this approach is fragile. Let me just manually edit Code.gs in the next task instead.

- [ ] **Step 4: Verify the script works with the placeholder**

After Task 2 creates the placeholder, verify:
```bash
npx tsx scripts/compute-checksum.ts
```
Expected output: `Checksum updated: <64-char-hex>`

- [ ] **Step 5: Commit**

```bash
git add scripts/compute-checksum.ts
git commit -m "feat(scripts): add compute-checksum script for backend integrity"
```

---

### Task 2: Add SCRIPT_INTEGRITY to Code.gs and extend status endpoint

**Files:**
- Modify: `apps-script/Code.gs`

- [ ] **Step 1: Add SCRIPT_INTEGRITY constant**

Add after the CONFIG IIFE (line ~55), before `matchesPattern_`:

```javascript
var SCRIPT_INTEGRITY = 'PLACEHOLDER';
```

This is at the top level (not inside an IIFE), so it's accessible to all functions. Use `var` for Apps Script compatibility (not `const` which might not work in all V8 modes — actually Apps Script supports V8 and `const`, but `var` is safer for top-level access).

Actually, looking at the codebase, the CONFIG object uses `const` and works fine. Let me use `var` since the original code uses `var` in some places and `const` in others. But actually, the `SCRIPT_INTEGRITY` needs to be accessible globally. Using `var` at top level is the convention for global vars in Apps Script.

Wait, actually, looking at the existing code more carefully, the CONFIG object and functions like `matchesPattern_` are all at the top level using `var` or `function`. The IIFE at the top only handles CONFIG_OVERRIDES. So I should add it before the CONFIG IIFE or after it. Let me add it right after the CONFIG IIFE, before `matchesPattern_`.

Actually, let me put it inside the CONFIG area, right after the IIFE:

```javascript
(function() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('CONFIG_OVERRIDES');
    if (raw) Object.assign(CONFIG, JSON.parse(raw));
  } catch (_) {}
})();

var SCRIPT_INTEGRITY = 'PLACEHOLDER';
```

- [ ] **Step 2: Extend getStatus() to return backendIntegrity**

Modify `getStatus()` function (~line 168):

```javascript
function getStatus() {
  const props = PropertiesService.getScriptProperties();
  const estimatedChars = parseInt(props.getProperty('estimatedChars') || '0', 10);
  const lastSync = props.getProperty('lastSync');
  const isConfigured = Boolean(CONFIG.MASTER_DOC_ID && CONFIG.ARCHIVE_FOLDER_ID);

  return {
    success: true,
    lastSync: lastSync ? new Date(parseInt(lastSync, 10)).toISOString() : null,
    docSize: estimatedChars,
    isConfigured: isConfigured,
    backendIntegrity: SCRIPT_INTEGRITY      // NEW
  };
}
```

- [ ] **Step 3: Run the checksum script to update the hash**

```bash
npx tsx scripts/compute-checksum.ts
```
Expected output: `Checksum updated: <64-char-hex>`

Verify the file was updated:
```bash
grep SCRIPT_INTEGRITY apps-script/Code.gs
```
Expected: `var SCRIPT_INTEGRITY = '<64-char-hex>';` (not 'PLACEHOLDER')

- [ ] **Step 4: Commit**

```bash
git add apps-script/Code.gs
git commit -m "feat(backend): add SCRIPT_INTEGRITY hash and expose via status endpoint"
```

---

### Task 3: Add Vite plugin to generate backendChecksum.ts at build time

**Files:**
- Modify: `vite.config.ts`
- Create (auto-generated, never commit): `src/lib/backendChecksum.ts`

- [ ] **Step 1: Add Vite plugin**

Modify `vite.config.ts` — add a new plugin before the `copy-manifest` plugin:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

function backendChecksumPlugin() {
  return {
    name: 'backend-checksum',
    buildStart() {
      const codePath = resolve(__dirname, 'apps-script/Code.gs');
      const content = readFileSync(codePath, 'utf-8');
      const lines = content.split('\n');
      const filtered = lines.filter(line => !line.includes('SCRIPT_INTEGRITY'));
      const hash = createHash('sha256').update(filtered.join('\n')).digest('hex');
      const outDir = resolve(__dirname, 'src/lib');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      writeFileSync(
        resolve(outDir, 'backendChecksum.ts'),
        `// Auto-generated by build — do not edit\nexport const EXPECTED_BACKEND_HASH = '${hash}';\n`,
        'utf-8'
      );
    },
  };
}
```

Add it to the `plugins` array:

```typescript
export default defineConfig({
  plugins: [
    backendChecksumPlugin(),
    react(),
    // ... existing copy-manifest plugin
  ],
  // ...
});
```

- [ ] **Step 2: Verify the plugin works**

```bash
npm run build
```

Verify the generated file exists:
```bash
cat src/lib/backendChecksum.ts
```
Expected: `export const EXPECTED_BACKEND_HASH = '<64-char-hex>';`

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat(build): add Vite plugin to bake backend checksum into extension"
```

---

### Task 4: Update types, .gitignore, and package.json

**Files:**
- Modify: `src/types/index.ts`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Add backendIntegrity to StatusResponse**

In `src/types/index.ts`, modify `StatusResponse`:

```typescript
export interface StatusResponse {
  success: boolean;
  lastSync: string | null;
  docSize: number;
  isConfigured: boolean;
  backendIntegrity?: string;
}
```

- [ ] **Step 2: Update .gitignore**

Add to `.gitignore`:

```
src/lib/backendChecksum.ts
```

- [ ] **Step 3: Add npm script**

In `package.json`, add to `"scripts"`:

```json
"update:checksum": "npx tsx scripts/compute-checksum.ts",
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts .gitignore package.json
git commit -m "chore: add backendIntegrity type, gitignore, and checksum npm script"
```

---

### Task 5: Add backend status row to Settings.tsx

**Files:**
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports in `Settings.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EXPECTED_BACKEND_HASH } from '@/lib/backendChecksum';
```

Note: We already have `useEffect` and `useState` imported — just add `api` and `EXPECTED_BACKEND_HASH`.

- [ ] **Step 2: Add state for backend integrity check**

Add inside the `Settings` component, after existing state declarations (~line 22):

```typescript
const [backendStatus, setBackendStatus] = useState<'checking' | 'up-to-date' | 'update-available' | 'unknown'>('checking');
```

- [ ] **Step 3: Add effect to check backend integrity**

Add after the existing `useEffect` for loading settings (~line 57):

```typescript
useEffect(() => {
  if (!deploymentUrl) return;
  let cancelled = false;
  (async () => {
    try {
      const store = useSettingsStore.getState();
      const token = store.accessToken;
      if (!token) {
        if (!cancelled) setBackendStatus('unknown');
        return;
      }
      const status = await api.getStatus(token);
      if (cancelled) return;
      if (status.backendIntegrity && EXPECTED_BACKEND_HASH) {
        setBackendStatus(status.backendIntegrity === EXPECTED_BACKEND_HASH ? 'up-to-date' : 'update-available');
      } else {
        setBackendStatus('unknown');
      }
    } catch {
      if (!cancelled) setBackendStatus('unknown');
    }
  })();
  return () => { cancelled = true; };
}, [deploymentUrl]);
```

- [ ] **Step 4: Add status row UI**

Inside the "Apps Script Deployment" card, after the URL display (`{deploymentUrl && deploymentUrlInput.trim() === deploymentUrl && ...}`) at line ~110, add:

```tsx
{/* Backend Status */}
<div className="mt-3 pt-3 border-t border-slate-100">
  <div className="flex items-center justify-between">
    <span className="text-xs text-slate-500">Backend Status</span>
    <span className="text-xs flex items-center gap-1.5">
      {backendStatus === 'checking' && (
        <><RefreshCw className="w-3 h-3 text-slate-400 motion-safe:animate-spin" /><span className="text-slate-400">Checking...</span></>
      )}
      {backendStatus === 'up-to-date' && (
        <><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /><span className="text-green-700">Up to date</span></>
      )}
      {backendStatus === 'update-available' && (
        <><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /><span className="text-amber-700">Update available</span></>
      )}
      {backendStatus === 'unknown' && (
        <><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" /><span className="text-red-600">Could not verify</span></>
      )}
    </span>
  </div>
</div>
```

- [ ] **Step 5: Run tests to verify compilation**

```bash
npm test -- --run src/components/Settings.test.tsx 2>/dev/null || npm test
```

If no Settings test exists yet, the build should at least pass:
```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(ui): add backend version status indicator to Settings"
```

---

### Task 6: Update API tests

**Files:**
- Modify: `src/lib/api.test.ts`

- [ ] **Step 1: Add test for backendIntegrity field**

Add to the existing `api - getDeploymentUrl / fetchApi` describe block, after the existing tests:

```typescript
it('passes through backendIntegrity from status response', async () => {
  (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    deploymentUrl: 'https://script.google.com/macros/s/test/exec',
  });
  const responseData = {
    success: true,
    lastSync: null,
    docSize: 0,
    isConfigured: false,
    backendIntegrity: 'abc123def456',
  };
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => responseData,
    text: async () => JSON.stringify(responseData),
  });
  const { api } = await import('@/lib/api');
  const result = await api.getStatus('test-token');
  expect((result as typeof responseData).backendIntegrity).toBe('abc123def456');
});
```

- [ ] **Step 2: Run the tests**

```bash
npx vitest run src/lib/api.test.ts
```
Expected: All tests pass (including the new one).

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.test.ts
git commit -m "test: add test for backendIntegrity field in status response"
```

---

## Phase 2: Auto-Deploy from Extension

### Task 7: Add OAuth scope for Apps Script API

**Files:**
- Modify: `public/manifest.json`
- Modify: `src/hooks/useAuth.ts`

- [ ] **Step 1: Add scope to manifest**

In `public/manifest.json`, add to `oauth2.scopes`:

```json
"oauth2": {
  "scopes": [
    "openid",
    "email",
    "https://www.googleapis.com/auth/script.projects"
  ]
}
```

- [ ] **Step 2: Update useAuth to pass scopes**

In `src/hooks/useAuth.ts`, update the `SCOPES` constant:

```typescript
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/script.projects',
];
```

- [ ] **Step 3: Commit**

```bash
git add public/manifest.json src/hooks/useAuth.ts
git commit -m "feat(auth): add script.projects OAuth scope for backend auto-deploy"
```

---

### Task 8: Extend Vite plugin to bundle Code.gs

**Files:**
- Modify: `vite.config.ts`
- Create (auto-generated, never commit): `src/lib/bundledBackend.ts`

- [ ] **Step 1: Extend the Vite plugin**

Modify `backendChecksumPlugin` in `vite.config.ts` to also generate `bundledBackend.ts`:

```typescript
function backendChecksumPlugin() {
  return {
    name: 'backend-checksum',
    buildStart() {
      const codePath = resolve(__dirname, 'apps-script/Code.gs');
      const content = readFileSync(codePath, 'utf-8');
      const lines = content.split('\n');
      const filtered = lines.filter(line => !line.includes('SCRIPT_INTEGRITY'));
      const hash = createHash('sha256').update(filtered.join('\n')).digest('hex');
      const outDir = resolve(__dirname, 'src/lib');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      // Write checksum
      writeFileSync(
        resolve(outDir, 'backendChecksum.ts'),
        `// Auto-generated by build — do not edit\nexport const EXPECTED_BACKEND_HASH = '${hash}';\n`,
        'utf-8'
      );

      // Write bundled source
      const escaped = content
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$');
      writeFileSync(
        resolve(outDir, 'bundledBackend.ts'),
        `// Auto-generated by build — do not edit\nexport const BUNDLED_BACKEND_CODE = \`${escaped}\`;\n`,
        'utf-8'
      );
    },
  };
}
```

- [ ] **Step 2: Add to .gitignore**

Add to `.gitignore`:

```
src/lib/bundledBackend.ts
```

- [ ] **Step 3: Verify**

```bash
npm run build
cat src/lib/bundledBackend.ts | head -5
```
Expected: `export const BUNDLED_BACKEND_CODE = \`...`

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts .gitignore
git commit -m "feat(build): bundle full Code.gs source into extension for auto-deploy"
```

---

### Task 9: Create deployApi module

**Files:**
- Create: `src/lib/deployApi.ts`

- [ ] **Step 1: Write deployApi module**

```typescript
import { ApiError } from '@/lib/api';

function extractScriptId(deploymentUrl: string): string | null {
  const match = deploymentUrl.match(/\/macros\/s\/([^/]+)/);
  return match ? match[1] : null;
}

async function scriptsApiFetch<T>(
  path: string,
  options: RequestInit,
  accessToken: string
): Promise<T> {
  const url = `https://script.googleapis.com/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApiError(
      `Apps Script API request failed (${response.status}): ${body.slice(0, 200)}`,
      response.status
    );
  }

  return response.json();
}

interface ProjectContent {
  files: Array<{ name: string; type: string; source: string }>;
}

interface Version {
  versionNumber: number;
  description: string;
}

interface Deployment {
  deploymentId: string;
  deploymentConfig: {
    versionNumber: number;
  };
  entryPoints?: Array<{
    entryPointType: string;
    url?: string;
  }>;
}

async function updateContent(
  scriptId: string,
  source: string,
  accessToken: string
): Promise<void> {
  const body: ProjectContent = {
    files: [{
      name: 'Code',
      type: 'SERVER_JS',
      source,
    }],
  };
  await scriptsApiFetch<ProjectContent>(
    `projects/${scriptId}/content`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    accessToken
  );
}

async function createVersion(
  scriptId: string,
  accessToken: string,
  description = 'Deployed from MeetSync extension'
): Promise<Version> {
  return scriptsApiFetch<Version>(
    `projects/${scriptId}/versions`,
    {
      method: 'POST',
      body: JSON.stringify({ description }),
    },
    accessToken
  );
}

async function listDeployments(
  scriptId: string,
  accessToken: string
): Promise<Deployment[]> {
  const result = await scriptsApiFetch<{ deployments: Deployment[] }>(
    `projects/${scriptId}/deployments`,
    { method: 'GET' },
    accessToken
  );
  return result.deployments || [];
}

async function updateDeployment(
  scriptId: string,
  deploymentId: string,
  versionNumber: number,
  accessToken: string
): Promise<void> {
  await scriptsApiFetch<Deployment>(
    `projects/${scriptId}/deployments/${deploymentId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        deploymentConfig: { versionNumber },
      }),
    },
    accessToken
  );
}

export async function deployBackendUpdate(
  deploymentUrl: string,
  bundledCode: string,
  accessToken: string
): Promise<{ versionNumber: number }> {
  const scriptId = extractScriptId(deploymentUrl);
  if (!scriptId) {
    throw new ApiError('Invalid deployment URL: could not extract script ID');
  }

  // 1. Update the script content
  await updateContent(scriptId, bundledCode, accessToken);

  // 2. Create a new version
  const version = await createVersion(scriptId, accessToken);

  // 3. Find the matching deployment and update it
  const deployments = await listDeployments(scriptId, accessToken);
  const target = deployments.find(d =>
    d.entryPoints?.some(ep => ep.url === deploymentUrl)
  );

  if (!target) {
    throw new ApiError(
      'Could not find a deployment matching the current URL. The deployment may have been deleted.'
    );
  }

  await updateDeployment(scriptId, target.deploymentId, version.versionNumber, accessToken);

  return { versionNumber: version.versionNumber };
}
```

- [ ] **Step 2: Write deployApi test file**

Create `src/lib/deployApi.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('deployApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts script ID from deployment URL', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    // Mock the three API calls
    globalThis.fetch = vi.fn()
      // updateContent -> PUT projects/abc123/content
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' })
      // createVersion -> POST projects/abc123/versions
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versionNumber: 5 }), text: async () => '{"versionNumber":5}' })
      // listDeployments -> GET projects/abc123/deployments
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        deployments: [{
          deploymentId: 'deploy1',
          deploymentConfig: { versionNumber: 4 },
          entryPoints: [{ entryPointType: 'WEB_APP', url: 'https://script.google.com/macros/s/abc123/exec' }],
        }],
      }), text: async () => '{}' })
      // updateDeployment -> PUT projects/abc123/deployments/deploy1
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' });

    const result = await deployBackendUpdate(
      'https://script.google.com/macros/s/abc123/exec',
      'function doGet() { return ContentService.createTextOutput("ok"); }',
      'test-token'
    );

    expect(result.versionNumber).toBe(5);
    // Verify all 4 API calls were made
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('throws for invalid deployment URL', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    await expect(deployBackendUpdate('not-a-url', 'code', 'token')).rejects.toThrow(
      'Invalid deployment URL'
    );
  });

  it('throws if no matching deployment found', async () => {
    const { deployBackendUpdate } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}), text: async () => '{}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ versionNumber: 1 }), text: async () => '{"versionNumber":1}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ deployments: [] }), text: async () => '{}' });

    await expect(deployBackendUpdate(
      'https://script.google.com/macros/s/abc123/exec',
      'code',
      'token'
    )).rejects.toThrow('Could not find a deployment');
  });

  it('throws ApiError on API failure', async () => {
    const { deployBackendUpdate, default: _ } = await import('@/lib/deployApi');
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Permission denied',
    });

    await expect(deployBackendUpdate(
      'https://script.google.com/macros/s/abc123/exec',
      'code',
      'token'
    )).rejects.toThrow('Apps Script API request failed (403)');
  });
});
```

Note: The `default` import above is just to avoid unused variable warnings. In practice the `_` pattern works.

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/lib/deployApi.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/deployApi.ts src/lib/deployApi.test.ts
git commit -m "feat(api): add deployApi module for Apps Script auto-deploy"
```

---

### Task 10: Add deploy button and flow to Settings

**Files:**
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Add imports and state**

Add to imports in `Settings.tsx`:

```typescript
import { deployBackendUpdate } from '@/lib/deployApi';
import { BUNDLED_BACKEND_CODE } from '@/lib/bundledBackend';
```

Add state for deploy flow (~line 23):

```typescript
const [deploying, setDeploying] = useState(false);
const [deployMessage, setDeployMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
```

- [ ] **Step 2: Add deploy handler**

Add before the `return` statement:

```typescript
const handleDeploy = async () => {
  if (!deploymentUrl || !accessToken) return;
  if (!window.confirm('This will replace the currently deployed backend code with the version bundled in this extension. Continue?')) return;

  setDeploying(true);
  setDeployMessage(null);
  try {
    const result = await deployBackendUpdate(deploymentUrl, BUNDLED_BACKEND_CODE, accessToken);
    setDeployMessage({ type: 'success', text: `Deployed successfully (version ${result.versionNumber})` });
    setBackendStatus('up-to-date');
  } catch (err) {
    setDeployMessage({ type: 'error', text: err instanceof Error ? err.message : 'Deploy failed' });
  } finally {
    setDeploying(false);
  }
};
```

Need to get `accessToken` from the store. Add above the state declaration:

```typescript
const accessToken = useSettingsStore((state) => state.accessToken);
```

- [ ] **Step 3: Add deploy button to the status row**

In the backend status row, add a deploy button when update is available:

```tsx
{backendStatus === 'update-available' && (
  <button
    onClick={handleDeploy}
    disabled={deploying}
    className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] disabled:opacity-50"
  >
    {deploying ? 'Deploying...' : 'Deploy Update'}
  </button>
)}
```

Update the status row to include the button. Replace the existing `{backendStatus === 'update-available' && ...}` block with:

```tsx
{backendStatus === 'update-available' && (
  <div className="flex items-center gap-2">
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
    <span className="text-amber-700">Update available</span>
    <button
      onClick={handleDeploy}
      disabled={deploying}
      className="text-xs font-semibold text-[#1a73e8] hover:text-[#1557b0] disabled:opacity-50 ml-auto"
    >
      {deploying ? 'Deploying...' : 'Deploy Update'}
    </button>
  </div>
)}
```

- [ ] **Step 4: Add deploy result message**

After the backend status div, add:

```tsx
{deployMessage && (
  <div className={`mt-2 text-xs ${deployMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
    {deployMessage.text}
  </div>
)}
```

- [ ] **Step 5: Build to check compilation**

```bash
npm run build
```
Expected: Build succeeds.

Note: Since `src/lib/bundledBackend.ts` is auto-generated, you may need to run `npm run build` twice (first build generates it, second build picks it up) — or trigger generation separately. Actually, the Vite plugin runs during `buildStart`, which happens before module resolution, so a single build should work.

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat(ui): add deploy backend button to Settings with confirmation and progress"
```

---

### Task 11: Integration verification

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: All existing tests pass, plus the new ones from Tasks 6 and 9.

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 3: Verify build produces all expected outputs**

```bash
npm run build
ls dist/
```
Expected: `dist/` contains `manifest.json`, `background.js`, etc.

- [ ] **Step 4: Verify checksum script works end-to-end**

```bash
# Save current hash
CURRENT_HASH=$(grep SCRIPT_INTEGRITY apps-script/Code.gs | grep -oE "'[^']+'")
echo "Current: $CURRENT_HASH"

# Run checksum update (should be idempotent if file hasn't changed)
npx tsx scripts/compute-checksum.ts

# Verify hash is the same (idempotent)
NEW_HASH=$(grep SCRIPT_INTEGRITY apps-script/Code.gs | grep -oE "'[^']+'")
echo "After update: $NEW_HASH"
```

Expected: Both hashes are the same (script is idempotent).

---

## Self-Review Checklist

**Spec coverage:**
- Phase 1 (check indicator): Tasks 1-6 cover all spec items: checksum script, Code.gs integration, Vite plugin, type changes, UI status row, tests
- Phase 2 (auto-deploy): Tasks 7-11 cover all spec items: OAuth scope, bundled source, deployApi module, UI button, integration verification

**Placeholder check:** No "TBD", "TODO", or "implement later" in any task. Every code block has complete implementation code.

**Type consistency:** `StatusResponse.backendIntegrity?: string` in Task 4 matches the `SCRIPT_INTEGRITY` var in Task 2. Signature of `deployBackendUpdate` in Task 9 matches usage in Task 10.

**Edge cases covered:**
- Missing SCRIPT_INTEGRITY constant (Task 1 exits with error)
- Empty deployment URL (Task 5 guards with early return)
- Invalid deployment URL (Task 9 throws ApiError)
- No matching deployment (Task 9 throws ApiError)
- API failures at each step (Task 9 throws ApiError with status code)
- Old backend without backendIntegrity field (Task 5 shows 'unknown')
