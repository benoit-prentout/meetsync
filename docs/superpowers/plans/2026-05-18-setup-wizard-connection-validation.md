# Setup Wizard Connection Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface Apps Script deployment errors during setup (not after), and fix stale documentation that says "Anyone with Google account" instead of "Anyone".

**Architecture:** Add a `api.getStatus(token)` call inside `SetupWizard.handleSave()` after `signIn()` succeeds. Map thrown errors to user-facing inline messages and roll back `chrome.storage.sync` on failure. Also update the HTML error message in `api.ts` and fix two documentation files.

**Tech Stack:** React + TypeScript, Vitest + Testing Library, `chrome.storage.sync`, `@/lib/api` (`api.getStatus`, `ApiError`)

---

## File Map

| File | Change |
|---|---|
| `src/components/SetupWizard.tsx` | Add connection validation phase and error mapping |
| `src/components/SetupWizard.test.tsx` | Add tests for connection failure / success paths |
| `src/lib/api.ts` | Improve HTML error message (line 53) |
| `src/components/Help.tsx` | Fix "Anyone with Google account" → "Anyone" (lines 57, 106) |
| `CLAUDE.md` | Fix "Anyone with Google account" → "Anyone" (Deployment section) |

---

## Task 1: Write failing tests for SetupWizard connection validation

**Files:**
- Modify: `src/components/SetupWizard.test.tsx`

The existing test file mocks `@/hooks/useAuth` and `@/store/settingsStore` but does not mock `@/lib/api`. Add a module-level mock for `@/lib/api` so tests can control what `api.getStatus` returns. Then add three new tests.

- [ ] **Step 1: Add the api mock and update the signIn mock to return a token**

Open `src/components/SetupWizard.test.tsx`. Add the `api` mock **before** the existing `useAuth` mock. Also update `signIn` to resolve with `'test-token'` (matching the real `signIn()` return type — it already returns the token string):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupWizard } from '@/components/SetupWizard';

// Mock api module — tests control getStatus behavior per-test
vi.mock('@/lib/api', () => ({
  api: {
    getStatus: vi.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    signIn: vi.fn().mockResolvedValue('test-token'),
  })),
}));

// Mock useSettingsStore
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    setDeploymentUrl: vi.fn(),
  })),
}));
```

- [ ] **Step 2: Update beforeEach to reset the api mock and fix signIn return value**

Replace the existing `beforeEach` block with this version (keeps all existing setup, adds api reset, fixes signIn return value):

```ts
beforeEach(async () => {
  vi.clearAllMocks();

  const { api } = await import('@/lib/api');
  (api.getStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

  const { useAuth } = await import('@/hooks/useAuth');
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    signIn: vi.fn().mockResolvedValue('test-token'),
  });

  const { useSettingsStore } = await import('@/store/settingsStore');
  (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    setDeploymentUrl: vi.fn(),
  });
  (useSettingsStore as unknown as { getState: () => { setError: ReturnType<typeof vi.fn> } }).getState = vi.fn().mockReturnValue({
    setError: vi.fn(),
  });

  (chrome.storage.sync.set as ReturnType<typeof vi.fn>).mockImplementation(
    (_data: Record<string, unknown>, cb: () => void) => cb()
  );
  (chrome.storage.sync.remove as ReturnType<typeof vi.fn>).mockImplementation(() => {});
});
```

- [ ] **Step 3: Add the three new tests at the end of the describe block**

```ts
it('calls api.getStatus with the token after signIn succeeds', async () => {
  const { api } = await import('@/lib/api');
  render(<SetupWizard />);
  const input = screen.getByLabelText(/apps script deployment url/i);
  await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
  await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
  await waitFor(() => {
    expect(api.getStatus).toHaveBeenCalledWith('test-token');
  });
});

it('shows HTML error and removes stored URL when connection test returns HTML', async () => {
  const { api } = await import('@/lib/api');
  (api.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error('Apps Script returned HTML instead of JSON')
  );
  render(<SetupWizard />);
  const input = screen.getByLabelText(/apps script deployment url/i);
  await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
  await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
  await waitFor(() => {
    expect(screen.getByText(/Apps Script deployment not responding correctly/i)).toBeInTheDocument();
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith('deploymentUrl');
  });
});

it('shows network error and removes stored URL when connection test throws TypeError', async () => {
  const { api } = await import('@/lib/api');
  (api.getStatus as ReturnType<typeof vi.fn>).mockRejectedValue(
    new TypeError('Failed to fetch')
  );
  render(<SetupWizard />);
  const input = screen.getByLabelText(/apps script deployment url/i);
  await userEvent.type(input, 'https://script.google.com/macros/s/test/exec');
  await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
  await waitFor(() => {
    expect(screen.getByText(/Could not reach the deployment URL/i)).toBeInTheDocument();
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith('deploymentUrl');
  });
});
```

- [ ] **Step 4: Run the tests and verify the new ones fail (existing ones should still pass)**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|SetupWizard)"
```

Expected: the 3 new tests FAIL (component doesn't call `api.getStatus` yet), all existing tests PASS.

- [ ] **Step 5: Commit the failing tests**

```bash
rtk git add src/components/SetupWizard.test.tsx && rtk git commit -m "test(SetupWizard): add failing tests for connection validation"
```

---

## Task 2: Implement SetupWizard connection validation

**Files:**
- Modify: `src/components/SetupWizard.tsx`

- [ ] **Step 1: Add the import and phase state**

Replace the current import line and state declarations with:

```ts
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSettingsStore } from '@/store/settingsStore';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetupWizard() {
  const { signIn } = useAuth();
  const { setDeploymentUrl } = useSettingsStore();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'verifying'>('idle');
  const [error, setError] = useState<string | null>(null);
```

- [ ] **Step 2: Replace handleSave with the new implementation**

Replace the entire `handleSave` function:

```ts
async function handleSave() {
  const validationError = validateUrl(url);
  if (validationError) {
    setUrlError(validationError);
    return;
  }
  setPhase('connecting');
  setError(null);
  useSettingsStore.getState().setError(null);
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set({ deploymentUrl: url.trim() }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
    const token = await signIn();
    setPhase('verifying');
    await api.getStatus(token);
    // Only transition to Dashboard after connection test succeeds
    setDeploymentUrl(url.trim());
  } catch (err) {
    chrome.storage.sync.remove('deploymentUrl');
    if (err instanceof TypeError) {
      setError('Could not reach the deployment URL — check the URL and your internet connection.');
    } else if (err instanceof Error && err.message.includes('HTML')) {
      setError(
        "Apps Script deployment not responding correctly — make sure you saved Code.gs and deployed a new version (not an existing one) in the Apps Script editor."
      );
    } else if (err instanceof Error && /unauthori[sz]ed/i.test(err.message)) {
      setError(
        'Authorization failed — make sure the script is deployed as Execute as: Me and Who has access: Anyone.'
      );
    } else {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    }
  } finally {
    setPhase('idle');
  }
}
```

- [ ] **Step 3: Update the button in the JSX to use phase**

Replace the button element:

```tsx
<button
  onClick={handleSave}
  disabled={phase !== 'idle' || !!urlError || !url}
  className="w-full bg-[#1a73e8] hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed"
>
  {phase === 'verifying' ? 'Verifying…' : phase === 'connecting' ? 'Connecting…' : 'Save & Connect'}
</button>
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|SetupWizard)"
```

Expected: all 11 tests PASS (8 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
rtk git add src/components/SetupWizard.tsx && rtk git commit -m "feat(SetupWizard): validate Apps Script connection before completing setup"
```

---

## Task 3: Improve api.ts HTML error message

**Files:**
- Modify: `src/lib/api.ts:52-56`

- [ ] **Step 1: Update the error message**

In `src/lib/api.ts`, find this block (around line 52):

```ts
  if (text.trimStart().startsWith('<')) {
    throw new ApiError(
      'Apps Script returned HTML instead of JSON — the deployment URL may be incorrect or the script needs to be re-deployed.'
    );
  }
```

Replace with:

```ts
  if (text.trimStart().startsWith('<')) {
    throw new ApiError(
      'Apps Script returned HTML instead of JSON. This usually means the deployed version is missing the doGet function. In the Apps Script editor: save Code.gs, then deploy a new version (not an existing version).'
    );
  }
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
rtk git add src/lib/api.ts && rtk git commit -m "fix(api): improve HTML error message to mention doGet and new version requirement"
```

---

## Task 4: Fix documentation errors

**Files:**
- Modify: `src/components/Help.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix Help.tsx Step 3 access setting (line 57)**

Find this text in `src/components/Help.tsx`:

```tsx
            Deploy the <strong>Apps Script backend</strong>: open the script editor, paste <code className="bg-slate-100 px-1 rounded text-[10px]">Code.gs</code>, deploy as a web app (<em>Execute as: Me</em>, <em>Who has access: Anyone with Google account</em>), and copy the deployment URL.
```

Replace with:

```tsx
            Deploy the <strong>Apps Script backend</strong>: open the script editor, paste <code className="bg-slate-100 px-1 rounded text-[10px]">Code.gs</code>, deploy as a web app (<em>Execute as: Me</em>, <em>Who has access: Anyone</em>), and copy the deployment URL.
```

- [ ] **Step 2: Fix the checklist item in Help.tsx (around line 106)**

Find this checklist item:

```tsx
              'The Apps Script backend is deployed with Execute as: Me — the script runs under your account and has access to your Drive.',
```

Replace with:

```tsx
              'The Apps Script backend is deployed with Execute as: Me and Who has access: Anyone (not "Anyone with Google account") — the script runs under your account and has access to your Drive.',
```

- [ ] **Step 3: Fix CLAUDE.md deployment instructions**

In `CLAUDE.md`, find:

```
3. Deploy as web app: **Execute as: Me**, **Who has access: Anyone with Google account**.
```

Replace with:

```
3. Deploy as web app: **Execute as: Me**, **Who has access: Anyone**.
```

- [ ] **Step 4: Run tests to confirm nothing broke**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add src/components/Help.tsx CLAUDE.md && rtk git commit -m "docs: fix Apps Script access setting — Anyone not Anyone with Google account"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| SetupWizard calls api.getStatus after signIn | Task 2 |
| Connecting… / Verifying… button states | Task 2 Step 3 |
| HTML error → specific message + rollback | Task 1 (test), Task 2 (impl) |
| Network error → specific message + rollback | Task 1 (test), Task 2 (impl) |
| Auth error → specific message + rollback | Task 2 (impl; no test — auth errors come from signIn, already tested in existing test "shows error and removes stored URL when signIn fails") |
| api.ts HTML error message improvement | Task 3 |
| Help.tsx Step 3 access fix | Task 4 Step 1 |
| Help.tsx checklist item fix | Task 4 Step 2 |
| CLAUDE.md access fix | Task 4 Step 3 |

All requirements covered. No gaps.

**Type/name consistency:** `api.getStatus` is used in tests (Task 1) and implementation (Task 2) — matches the export in `src/lib/api.ts:73`. `phase` state type `'idle' | 'connecting' | 'verifying'` is consistent across Steps 1, 2, and 3 of Task 2.

**Note on auth error path:** `validateCaller_` in Apps Script returns `{success: false, error: '...'}` for token mismatches — this comes back as an `ApiError` (not HTML), so the `unauthori[sz]ed` regex check in `handleSave` catches it correctly. The HTML branch is for a missing `doGet`, not for auth failures.
