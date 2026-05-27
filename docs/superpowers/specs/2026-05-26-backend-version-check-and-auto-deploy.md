# Backend Version Check & Auto-Deploy

## Summary

Two-phase feature to bridge the gap between the local `apps-script/Code.gs` and the deployed Apps Script web app:

- **Phase 1:** A visual indicator in the extension's Settings page showing whether the deployed backend matches the version bundled with the extension (via content hash comparison).
- **Phase 2:** A "Deploy Update" button in Settings that pushes the latest Code.gs to the Apps Script project via the Google Apps Script API, eliminating the manual copy-paste workflow.

---

## Phase 1: Backend Version Check Indicator

### 1.1 Content Integrity Hash (Code.gs)

Add a constant at the top of `apps-script/Code.gs` (line 6, after `CONFIG`):

```javascript
const SCRIPT_INTEGRITY = 'PLACEHOLDER';
```

This holds a SHA-256 hex digest of Code.gs **excluding the SCRIPT_INTEGRITY line itself** (so updating the hash doesn't change the hash).

Extend `getStatus()` (line ~168) to return the hash:

```javascript
function getStatus() {
  // ... existing code ...
  return {
    success: true,
    lastSync: ...,
    docSize: ...,
    isConfigured: ...,
    backendIntegrity: SCRIPT_INTEGRITY   // NEW
  };
}
```

### 1.2 Checksum Script (`scripts/compute-checksum.ts`)

**New file** — a TypeScript script (runnable via `npx tsx` or similar) that:

1. Reads `apps-script/Code.gs`
2. Removes the line matching `SCRIPT_INTEGRITY = '...'`
3. Computes `crypto.createHash('sha256').update(content).digest('hex')`
4. Replaces the `SCRIPT_INTEGRITY` value with the new digest
5. Writes the file back

**npm script** in `package.json`:

```json
{
  "scripts": {
    "update:checksum": "npx tsx scripts/compute-checksum.ts",
    "build": "tsc && vite build"
  }
}
```

This is a **manual step** to be run after editing Code.gs and before deploying. It's intentionally separate from `build` because the deploy is manual anyway.

### 1.3 Build-Time Hash Baking (vite.config.ts)

Add a Vite plugin (or a simple `scripts/bake-backend-hash.ts` run before build) that:

1. Reads `apps-script/Code.gs`
2. Computes the same hash (excluding SCRIPT_INTEGRITY line)
3. Writes `src/lib/backendChecksum.ts`:

```typescript
// Auto-generated — do not edit
export const EXPECTED_BACKEND_HASH = 'abc123def456...';
```

The file is gitignored (add to `.gitignore`).

### 1.4 Type Updates

In `src/types/index.ts`, add to `StatusResponse`:

```typescript
export interface StatusResponse {
  success: boolean;
  lastSync: string | null;
  docSize: number;
  isConfigured: boolean;
  backendIntegrity?: string;  // optional for backwards compat with older backends
}
```

### 1.5 UI: Backend Status Row (Settings.tsx)

Insert a live status row inside the existing "Apps Script Deployment" card (~line 108), right below the URL input.

States:

| State | Visual | Trigger |
|-------|--------|---------|
| Up to date | `● v4.1 — up to date` ✅ green | `backendIntegrity === EXPECTED_BACKEND_HASH` |
| Update available | `● v4.1 — update available` ⚠️ amber | `backendIntegrity` exists but !== expected |
| Unknown | `● Could not reach backend` ❌ red | `backendIntegrity` is `undefined` (old backend) or status call failed |
| Checking | `● Checking...` grey | Pending API response |

Data source: the existing `getStatus()` API call (already made by `useApi` hook). The comparison is done in the component using the already-loaded data.

### 1.6 Files Changed (Phase 1)

| File | Action |
|------|--------|
| `apps-script/Code.gs` | Add `SCRIPT_INTEGRITY`, extend `getStatus()` return |
| `scripts/compute-checksum.ts` | **Create** |
| `package.json` | Add `update:checksum` script |
| `vite.config.ts` | Add plugin to generate `backendChecksum.ts` |
| `.gitignore` | Add `src/lib/backendChecksum.ts` |
| `src/types/index.ts` | Add `backendIntegrity` to `StatusResponse` |
| `src/components/Settings.tsx` | Add backend status row |

---

## Phase 2: Auto-Deploy from Extension

### 2.1 New OAuth Scope

Add to `public/manifest.json` `oauth2.scopes`:

```json
{
  "oauth2": {
    "scopes": [
      "openid",
      "email",
      "https://www.googleapis.com/auth/script.projects"
    ]
  }
}
```

Update `src/hooks/useAuth.ts` `getAuthToken` call to include the new scope.

### 2.2 Bundle Code.gs in Extension

Extend the Vite plugin from Phase 1 to also generate `src/lib/bundledBackend.ts`:

```typescript
// Auto-generated — do not edit
export const BUNDLED_BACKEND_CODE = `...full raw content of Code.gs...`;
```

Add to `.gitignore`.

### 2.3 Script ID Extraction

Utility function to extract the script ID from the deployment URL:

```
https://script.google.com/macros/s/<SCRIPT_ID>/exec
```

```typescript
function extractScriptId(deploymentUrl: string): string | null {
  const match = deploymentUrl.match(/\/macros\/s\/([^/]+)/);
  return match ? match[1] : null;
}
```

### 2.4 Apps Script API Layer (`src/lib/deployApi.ts`)

**New module** with three API operations:

#### a) Update script content

```
PUT https://script.googleapis.com/v1/projects/{scriptId}/content
```

Body:
```json
{
  "files": [{
    "name": "Code",
    "type": "SERVER_JS",
    "source": "<bundled Code.gs content>"
  }]
}
```

#### b) Create a new version

```
POST https://script.googleapis.com/v1/projects/{scriptId}/versions
```

Body:
```json
{
  "description": "Deployed from MeetSync extension"
}
```

Returns a version number.

#### c) Update deployment

```
GET https://script.googleapis.com/v1/projects/{scriptId}/deployments
```

Find deployment whose `entryPoints[0].url` matches the stored deployment URL. Then:

```
PUT https://script.googleapis.com/v1/projects/{scriptId}/deployments/{deploymentId}
```

Body:
```json
{
  "deploymentConfig": {
    "versionNumber": <new version number>
  }
}
```

### 2.5 Orchestration

```typescript
async function deployBackendUpdate(
  deploymentUrl: string,
  bundledCode: string,
  accessToken: string
): Promise<void> {
  const scriptId = extractScriptId(deploymentUrl);
  if (!scriptId) throw new Error('Invalid deployment URL');

  // 1. Update content
  await updateContent(scriptId, bundledCode, accessToken);

  // 2. Create version
  const version = await createVersion(scriptId, accessToken);

  // 3. Find & update deployment
  const deployments = await listDeployments(scriptId, accessToken);
  const target = deployments.find(d =>
    d.entryPoints?.some(ep => ep.url === deploymentUrl)
  );
  if (!target) throw new Error('Could not find matching deployment');

  await updateDeployment(scriptId, target.deploymentId, version.versionNumber, accessToken);
}
```

### 2.6 UI: Deploy Button (Settings.tsx)

Inside the backend status row (from Phase 1), when status is "update available":

```
Backend Status:  ● v4.1 — update available  ⚠️  [Deploy Now]
```

On click:
1. Confirmation dialog: "This will replace the current deployed backend code. Continue?"
2. Progress: "Updating...", "Creating version...", "Deploying..."
3. Success: "✅ Deployed successfully! Backend is now up to date."
4. Error: ❌ show error message with retry option

### 2.7 Files Changed (Phase 2)

| File | Action |
|------|--------|
| `public/manifest.json` | Add `script.projects` scope |
| `src/hooks/useAuth.ts` | Pass additional scope |
| `vite.config.ts` | Extend to also generate `bundledBackend.ts` |
| `src/lib/bundledBackend.ts` | **Create, gitignored, auto-generated** |
| `src/lib/deployApi.ts` | **Create** |
| `src/components/Settings.tsx` | Add deploy button + deploy flow |

---

## Error Handling

| Scenario | Phase 1 | Phase 2 |
|----------|---------|---------|
| Backend unreachable | Show ❌ red indicator | N/A |
| Old backend (no backendIntegrity) | Show "unknown version" (grey) | N/A |
| Hash mismatch | Show ⚠️ amber "update available" | Deploy button enabled |
| API rate limit | N/A | Show error, retry with backoff |
| Deploy conflict (concurrent edit) | N/A | Show conflict error, suggest manual deploy |
| OAuth scope missing | N/A | Show "Additional permissions required" dialog |

---

## Testing

### Phase 1
- `compute-checksum.ts`: Unit test that hash is stable (same input → same hash), and that changing Code.gs content changes the hash
- `Settings.tsx`: Test that status row renders correctly in all 4 states
- `api.test.ts`: Test that `backendIntegrity` field is passed through

### Phase 2
- `deployApi.ts`: Unit tests with mocked fetch for all 3 API operations
- `Settings.tsx`: Test deploy button visibility, confirmation dialog, progress states, success/error display
- Integration test (manual): Full end-to-end deploy flow on a test Apps Script project

---

## Future Considerations

- Auto-deploy as a CI step (GitHub Action on push to main)
- Version history in the extension (track which versions were deployed and when)
- Ability to rollback to a previous deployment from the extension
