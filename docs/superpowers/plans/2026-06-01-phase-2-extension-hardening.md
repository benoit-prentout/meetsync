# Phase 2 — Extension Reliability & API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the extension side of the contract so that backend reliability work from Phase 1 actually surfaces to the user: typed errors with `code` for branching, request timeouts so the UI never hangs, double-click protection in `useApi`, an alarm-outcome ring buffer so silent auto-sync failures become diagnosable, an `<ErrorBoundary>` as a render-time safety net, and a richer `wizard-dev` scenario picker for testing all new error paths.

**Architecture:** Extend the existing `ApiError` class with a `code` field (don't introduce a parallel `BackendError`). Centralize timeouts in `fetchApi`. Wrap the four `useApi` methods that hit the backend with a per-action in-flight `Promise` cache. Replace the fire-and-forget `fetch()` in `background.ts` with the shared `fetchApi` so alarms get timeouts too, and record `{timestamp, ok, error?, durationMs}` to `chrome.storage.local['alarmOutcomes']` (ring buffer of 20). Wrap the top-level entry points in a small `<ErrorBoundary>` component that renders a recovery card.

**Tech Stack:** React 18 + TypeScript + Vite + Zustand + Vitest + jsdom + `chrome.*` APIs (mocked in `src/test/setup.ts`).

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/lib/api.ts` | Modify | Add `ApiError.code`, derive `code` from status/payload, add AbortController + 90s timeout to `fetchApi`. |
| `src/lib/api.test.ts` | Modify | Add cases for 401/403/500/timeout/HTML/non-JSON, assert `code` and `statusCode`. |
| `src/lib/apiErrorCode.ts` | Create | Single export of the `ApiErrorCode` string-literal union + a `mapStatusToCode(status, payload)` helper. |
| `src/hooks/useApi.ts` | Modify | Per-action in-flight `Promise` cache so concurrent calls share a single backend round-trip. |
| `src/hooks/useApi.test.ts` | Create | New tests for the de-dup behavior. |
| `src/hooks/useAuth.ts` | Modify | Add `reauth()` helper that calls `chrome.identity.removeCachedAuthToken` then `getAuthToken({interactive:true})`. |
| `src/components/ErrorBoundary.tsx` | Create | Class-component boundary that renders a recovery card and reports to `console.error` + `chrome.runtime`. |
| `src/components/ErrorBoundary.test.tsx` | Create | Verify boundary catches a thrown render error. |
| `src/dashboard/main.tsx` | Modify | Wrap `<App />` in `<ErrorBoundary>`. |
| `src/popup/main.tsx` | Modify | Wrap `<Popup />` in `<ErrorBoundary>`. |
| `src/popup/popup-dev-main.tsx` | Modify | Same wrapper for the dev preview. |
| `src/background.ts` | Modify | Replace direct `fetch()` with `fetchApi`; push `AlarmOutcome` to `chrome.storage.local`; cap at 20. |
| `src/lib/alarmOutcomes.ts` | Create | Tiny module: `AlarmOutcome` type + `pushAlarmOutcome` + `getAlarmOutcomes` (typed wrappers over `chrome.storage.local`). |
| `src/lib/alarmOutcomes.test.ts` | Create | Test the ring-buffer cap and shape. |
| `src/wizard-dev-main.tsx` | Modify | Add scenarios: `timeout`, `validation-error`, `auth-email-mismatch`. |

Files NOT touched in Phase 2 (kept for later phases): `src/components/Dashboard.tsx`, `src/components/Popup.tsx`, `src/components/Settings.tsx` — Phase 2 is plumbing; Settings consuming the new `diagnostics` endpoint lands in Phase 3 or 4.

---

## Task 1: Introduce `ApiErrorCode` and extend `ApiError`

**Files:**
- Create: `src/lib/apiErrorCode.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1.1: Create `src/lib/apiErrorCode.ts`**

```ts
export type ApiErrorCode =
  | 'NETWORK'         // fetch threw before getting a response (offline, DNS, CORS)
  | 'TIMEOUT'         // AbortController fired the 90s deadline
  | 'HTML_RESPONSE'   // backend returned HTML (typically a missing-doGet or login-redirect)
  | 'INVALID_JSON'    // 2xx body wasn't valid JSON
  | 'UNAUTHORIZED'    // HTTP 401
  | 'FORBIDDEN'       // HTTP 403 (auth email mismatch, owner mismatch)
  | 'VALIDATION_FAILED' // backend returned {success:false, error:'VALIDATION_FAILED'}
  | 'SERVER'          // HTTP 5xx
  | 'BACKEND'         // {success:false} with an arbitrary error string
  | 'UNKNOWN';

export function mapStatusToCode(status: number | undefined, payload: unknown): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status !== undefined && status >= 500) return 'SERVER';
  if (payload && typeof payload === 'object' && 'error' in payload && (payload as { error?: string }).error === 'VALIDATION_FAILED') {
    return 'VALIDATION_FAILED';
  }
  return 'BACKEND';
}
```

- [ ] **Step 1.2: Extend `ApiError` in `src/lib/api.ts`**

Replace the existing `ApiError` class (currently at the top of the file) with:

```ts
import type { ApiErrorCode } from './apiErrorCode';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code: ApiErrorCode = 'UNKNOWN',
    public fieldErrors?: Array<{ field: string; reason: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

Then update every existing `throw new ApiError(...)` site in `api.ts` to pass a `code`:

| Existing throw | New code |
|---|---|
| `'API request failed: ${response.statusText}'` with `response.status` | use `mapStatusToCode(response.status, payload)` if payload was parsed, else infer from status alone |
| HTML response branch | `'HTML_RESPONSE'` |
| Invalid JSON branch | `'INVALID_JSON'` |
| `data.error \|\| 'Unknown error'` with `success: false` | `mapStatusToCode(undefined, data)` — usually `'BACKEND'`; the validator's `'VALIDATION_FAILED'` is picked up by `mapStatusToCode` |
| No deployment URL configured | `'BACKEND'` (or a dedicated `'NOT_CONFIGURED'` — but adding a code requires updating the union; prefer `'BACKEND'` for now) |

When the backend returns `{ success: false, error: 'VALIDATION_FAILED', errors: [...] }`, populate `fieldErrors` from `data.errors`.

- [ ] **Step 1.3: Add new tests in `src/lib/api.test.ts`**

Add to the existing test file (after the current cases). Use the same hand-rolled `vi.fn()` fetch mock pattern already in the file:

```ts
import { ApiError } from './api';
// (existing imports stay)

describe('fetchApi error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.storage.sync.get as ReturnType<typeof vi.fn>).mockResolvedValue({ deploymentUrl: 'https://script.google.com/macros/s/AKfycb/exec' });
  });

  it('maps HTTP 401 to code=UNAUTHORIZED', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 401, statusText: 'Unauthorized',
      json: async () => ({}), text: async () => '',
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('maps HTTP 403 to code=FORBIDDEN', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 403, statusText: 'Forbidden',
      json: async () => ({}), text: async () => '',
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('FORBIDDEN');
  });

  it('maps HTTP 500 to code=SERVER', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 500, statusText: 'Internal Server Error',
      json: async () => ({}), text: async () => '',
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('SERVER');
  });

  it('maps HTML response (ok:true but text starts with <) to code=HTML_RESPONSE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('not json'); },
      text: async () => '<!doctype html><html>...</html>',
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('HTML_RESPONSE');
  });

  it('maps invalid JSON to code=INVALID_JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => { throw new Error('parse fail'); },
      text: async () => 'definitely not json',
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('INVALID_JSON');
  });

  it('maps backend VALIDATION_FAILED to code=VALIDATION_FAILED with fieldErrors populated', async () => {
    const payload = { success: false, error: 'VALIDATION_FAILED', errors: [{ field: 'maxFilesPerRun', reason: 'must be integer 1–100' }] };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => payload, text: async () => JSON.stringify(payload),
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fieldErrors).toEqual([{ field: 'maxFilesPerRun', reason: 'must be integer 1–100' }]);
  });

  it('maps generic {success:false} to code=BACKEND', async () => {
    const payload = { success: false, error: 'Drive list failed' };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => payload, text: async () => JSON.stringify(payload),
    }) as any;
    const err = await fetchApiAndCatch();
    expect(err.code).toBe('BACKEND');
  });
});

async function fetchApiAndCatch(): Promise<ApiError> {
  try {
    await (await import('./api')).api.getStatus();
    throw new Error('expected ApiError');
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return e;
  }
}
```

Adjust import paths and the action used (`api.getStatus`) to match what `api.ts` exports. If the surface is different (e.g., `fetchApi` is internal and only the `api.X` wrappers are exported), call `api.getStatus()` instead — the assertions on `err.code` and `err.fieldErrors` are what matter.

- [ ] **Step 1.4: Run tests**

```bash
npx vitest run src/lib/api.test.ts
```

Expected: all existing tests still pass; 7 new cases green.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/apiErrorCode.ts src/lib/api.ts src/lib/api.test.ts
git commit -m "feat(api): structured ApiError.code and fieldErrors for typed error branching"
```

---

## Task 2: Add `AbortController` + 90s timeout to `fetchApi`

**Files:**
- Modify: `src/lib/api.ts` (the `fetchApi` body)
- Modify: `src/lib/api.test.ts`

- [ ] **Step 2.1: Update `fetchApi`**

In `src/lib/api.ts`, around the `fetch(url, options)` call inside `fetchApi`, add:

```ts
const controller = new AbortController();
const timeoutMs = 90_000;
const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
let response: Response;
try {
  response = await fetch(url, { ...options, signal: controller.signal });
} catch (e) {
  if ((e as { name?: string }).name === 'AbortError') {
    throw new ApiError(`Request timed out after ${timeoutMs / 1000}s`, undefined, 'TIMEOUT');
  }
  throw new ApiError(`Network error: ${(e as Error).message}`, undefined, 'NETWORK');
} finally {
  clearTimeout(timeoutId);
}
// ...existing parsing/branching continues from response
```

Keep the rest of `fetchApi`'s logic intact. Do NOT pass `signal` to the AbortController-aware path if `options.signal` is already provided — that's a future concern; document with a one-line `// TODO: respect caller-provided signal` comment if you want, then move on.

- [ ] **Step 2.2: Add timeout test**

In `src/lib/api.test.ts`, in the `describe('fetchApi error mapping', ...)` block:

```ts
it('maps AbortError to code=TIMEOUT', async () => {
  globalThis.fetch = vi.fn().mockImplementationOnce(() => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    return Promise.reject(err);
  }) as any;
  const err = await fetchApiAndCatch();
  expect(err.code).toBe('TIMEOUT');
});

it('maps generic network error to code=NETWORK', async () => {
  globalThis.fetch = vi.fn().mockImplementationOnce(() => Promise.reject(new Error('Failed to fetch'))) as any;
  const err = await fetchApiAndCatch();
  expect(err.code).toBe('NETWORK');
});
```

- [ ] **Step 2.3: Run tests**

```bash
npx vitest run src/lib/api.test.ts
```

Expected: 2 new cases green; no regressions.

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/api.ts src/lib/api.test.ts
git commit -m "feat(api): AbortController-driven 90s timeout in fetchApi"
```

---

## Task 3: Per-action in-flight de-duplication in `useApi`

**Files:**
- Modify: `src/hooks/useApi.ts`
- Create: `src/hooks/useApi.test.ts`

- [ ] **Step 3.1: Write the failing test first**

Create `src/hooks/useApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApi } from './useApi';

// Mock the api module so we control what each call returns.
vi.mock('@/lib/api', () => {
  const sync = vi.fn();
  return {
    api: { sync, getStatus: vi.fn().mockResolvedValue({ success: true, lastSync: null }) },
    __mocks: { sync },
  };
});

describe('useApi.sync de-duplication', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires the backend once when sync() is called twice in parallel', async () => {
    const { api } = await import('@/lib/api');
    (api.sync as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20))
    );

    const { result } = renderHook(() => useApi());
    let firstPromise!: Promise<unknown>;
    let secondPromise!: Promise<unknown>;
    await act(async () => {
      firstPromise = result.current.sync();
      secondPromise = result.current.sync();
      await Promise.all([firstPromise, secondPromise]);
    });

    expect((api.sync as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('allows a new sync after the previous one resolves', async () => {
    const { api } = await import('@/lib/api');
    (api.sync as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    const { result } = renderHook(() => useApi());
    await act(async () => { await result.current.sync(); });
    await act(async () => { await result.current.sync(); });
    expect((api.sync as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});
```

Note: `@testing-library/react` and `@testing-library/react-hooks` may already be a dev dependency. If not, the test will fail to import — STOP and ask the controller before installing anything. Existing component tests in `src/components/*.test.tsx` should reveal whether the package is present.

- [ ] **Step 3.2: Run the test — should fail**

```bash
npx vitest run src/hooks/useApi.test.ts
```

Expected: FAIL on the "fires backend once" spec because `useApi` doesn't de-dup yet.

- [ ] **Step 3.3: Implement de-dup**

In `src/hooks/useApi.ts`, at module scope (above the hook export), add:

```ts
const inflight = new Map<string, Promise<unknown>>();

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
```

Then wrap each of the four backend-hitting methods. For example, `sync`:

```ts
const sync = useCallback(async () => {
  return dedupe('sync', async () => {
    setLoading(true);
    try {
      const result = await api.sync();
      // existing post-success logic (refresh history, files, etc.)
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  });
}, [setLoading, setError /* and whatever the existing deps are */]);
```

Apply the same wrapper to `archive`, `getHistory`, `getFiles`, `updateSettings`. For `updateSettings`, key by `'updateSettings:' + JSON.stringify(settings)` so two different setting payloads don't share a promise.

- [ ] **Step 3.4: Run the tests**

```bash
npx vitest run src/hooks/useApi.test.ts
```

Expected: both specs green.

- [ ] **Step 3.5: Commit**

```bash
git add src/hooks/useApi.ts src/hooks/useApi.test.ts
git commit -m "feat(useApi): per-action in-flight de-duplication"
```

---

## Task 4: `<ErrorBoundary>` for render-time safety

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Create: `src/components/ErrorBoundary.test.tsx`
- Modify: `src/dashboard/main.tsx`
- Modify: `src/popup/main.tsx`
- Modify: `src/popup/popup-dev-main.tsx`

- [ ] **Step 4.1: Write the failing test**

Create `src/components/ErrorBoundary.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): JSX.Element {
  throw new Error('Kaboom');
}

describe('ErrorBoundary', () => {
  it('catches a render-time error and shows the recovery card', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/Kaboom/)).toBeTruthy();
    spy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
```

- [ ] **Step 4.2: Run the test — should fail (no ErrorBoundary file yet)**

```bash
npx vitest run src/components/ErrorBoundary.test.tsx
```

Expected: import fails.

- [ ] **Step 4.3: Create `src/components/ErrorBoundary.tsx`**

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] render-time error', error, info);
  }

  private handleReload = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="m-6 max-w-xl rounded-md border border-red-300 bg-red-50 p-4 text-red-900">
          <h2 className="text-lg font-semibold">Something went wrong.</h2>
          <p className="mt-1 text-sm">The UI crashed. Reloading often fixes it. If it keeps happening, copy this and report it:</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-red-100 p-2 text-xs">{this.state.error.message}</pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-3 rounded bg-red-700 px-3 py-1 text-sm text-white hover:bg-red-800"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4.4: Run the test — should now pass**

```bash
npx vitest run src/components/ErrorBoundary.test.tsx
```

- [ ] **Step 4.5: Wrap the entry points**

In `src/dashboard/main.tsx`, change:

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

to:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary';
// ...
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

Apply the same wrap to `src/popup/main.tsx` (around `<Popup />`) and `src/popup/popup-dev-main.tsx`.

- [ ] **Step 4.6: Run all tests**

```bash
npm test
```

Expected: all green; no existing component test broken by the wrapper.

- [ ] **Step 4.7: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/components/ErrorBoundary.test.tsx src/dashboard/main.tsx src/popup/main.tsx src/popup/popup-dev-main.tsx
git commit -m "feat(ui): ErrorBoundary safety net around dashboard and popup entry points"
```

---

## Task 5: Alarm-outcome ring buffer in the background service worker

**Files:**
- Create: `src/lib/alarmOutcomes.ts`
- Create: `src/lib/alarmOutcomes.test.ts`
- Modify: `src/background.ts`

- [ ] **Step 5.1: Write the failing test**

Create `src/lib/alarmOutcomes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushAlarmOutcome, getAlarmOutcomes, MAX_ALARM_OUTCOMES, type AlarmOutcome } from './alarmOutcomes';

beforeEach(() => {
  // chrome.storage.local mock backed by a simple object — extend existing setup pattern.
  const store: Record<string, unknown> = {};
  globalThis.chrome = {
    ...(globalThis.chrome ?? {}),
    storage: {
      ...(globalThis.chrome?.storage ?? {}),
      local: {
        get: vi.fn((_key, cb?: (v: unknown) => void) => {
          const value = { alarmOutcomes: store.alarmOutcomes ?? [] };
          if (cb) cb(value);
          return Promise.resolve(value);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(store, items);
          return Promise.resolve();
        }),
      },
    },
  } as unknown as typeof chrome;
});

describe('alarmOutcomes', () => {
  it('appends a new outcome', async () => {
    await pushAlarmOutcome({ timestamp: '2026-06-01T00:00:00Z', ok: true, durationMs: 1200 });
    const all = await getAlarmOutcomes();
    expect(all).toHaveLength(1);
    expect(all[0].ok).toBe(true);
  });

  it(`caps at ${MAX_ALARM_OUTCOMES} entries, evicting oldest`, async () => {
    for (let i = 0; i < MAX_ALARM_OUTCOMES + 5; i++) {
      await pushAlarmOutcome({ timestamp: `2026-06-01T00:00:${String(i).padStart(2, '0')}Z`, ok: true });
    }
    const all = await getAlarmOutcomes();
    expect(all).toHaveLength(MAX_ALARM_OUTCOMES);
    // Oldest 5 should have been evicted; the last entry is index MAX+4
    expect(all[all.length - 1].timestamp).toContain('59'); // adjust if MAX changes
  });

  it('records a failed outcome with error string', async () => {
    await pushAlarmOutcome({ timestamp: '2026-06-01T00:00:00Z', ok: false, error: 'TIMEOUT' });
    const all = await getAlarmOutcomes();
    expect(all[0].ok).toBe(false);
    expect(all[0].error).toBe('TIMEOUT');
  });
});
```

The "padStart" / "59" assertion above will need to be adjusted if `MAX_ALARM_OUTCOMES !== 20` — `i = MAX + 4` so for `MAX=20` the last index is `24`, padded `'24'`. Fix the literal accordingly when you write the file: `expect(all[all.length - 1].timestamp).toContain(':24Z')`.

- [ ] **Step 5.2: Run the test — should fail**

```bash
npx vitest run src/lib/alarmOutcomes.test.ts
```

- [ ] **Step 5.3: Create the module**

`src/lib/alarmOutcomes.ts`:

```ts
export const MAX_ALARM_OUTCOMES = 20;

export type AlarmOutcome = {
  timestamp: string;     // ISO
  ok: boolean;
  durationMs?: number;
  error?: string;        // ApiError.code if available, else .message
};

export async function getAlarmOutcomes(): Promise<AlarmOutcome[]> {
  const result = await chrome.storage.local.get('alarmOutcomes');
  const outcomes = (result as { alarmOutcomes?: AlarmOutcome[] }).alarmOutcomes;
  return Array.isArray(outcomes) ? outcomes : [];
}

export async function pushAlarmOutcome(outcome: AlarmOutcome): Promise<void> {
  const existing = await getAlarmOutcomes();
  const next = existing.concat(outcome);
  const trimmed = next.length > MAX_ALARM_OUTCOMES ? next.slice(next.length - MAX_ALARM_OUTCOMES) : next;
  await chrome.storage.local.set({ alarmOutcomes: trimmed });
}
```

- [ ] **Step 5.4: Run the test — should pass**

```bash
npx vitest run src/lib/alarmOutcomes.test.ts
```

- [ ] **Step 5.5: Wire `background.ts` to record outcomes**

In `src/background.ts`, replace the existing direct `fetch()` call inside the alarm handler with a call to `api.sync()` from `@/lib/api` (so it benefits from timeouts and error mapping), AND record an `AlarmOutcome`.

```ts
import { api, ApiError } from '@/lib/api';
import { pushAlarmOutcome } from '@/lib/alarmOutcomes';

// ...inside the existing alarms.onAlarm listener:
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'auto-sync') return;
  const startedAt = Date.now();
  try {
    await api.sync();
    await pushAlarmOutcome({
      timestamp: new Date(startedAt).toISOString(),
      ok: true,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const code = e instanceof ApiError ? e.code : 'UNKNOWN';
    const message = e instanceof Error ? e.message : String(e);
    await pushAlarmOutcome({
      timestamp: new Date(startedAt).toISOString(),
      ok: false,
      durationMs: Date.now() - startedAt,
      error: `${code}: ${message}`,
    });
    console.error('[auto-sync] failed:', e);
  }
});
```

Note: `api.sync()` reads `deploymentUrl` from `chrome.storage.sync` and the token from `chrome.identity`. The background script already has these permissions per `manifest.json`. If `api.sync()` calls into `useApi`'s store logic, that won't work in a service worker — `api` from `@/lib/api` is a plain object of functions that do NOT touch React/Zustand, so this is safe. Verify by reading `src/lib/api.ts` exports before this step.

- [ ] **Step 5.6: Smoke-test build**

```bash
npm run build
```

Expected: `dist/` produced. `background.js` should still appear at the dist root (per `vite.config.ts` `output.entryFileNames` callback). If it lands in `dist/assets/`, STOP — the build config drifted; report BLOCKED.

- [ ] **Step 5.7: Commit**

```bash
git add src/lib/alarmOutcomes.ts src/lib/alarmOutcomes.test.ts src/background.ts
git commit -m "feat(background): record auto-sync alarm outcomes to chrome.storage.local ring buffer"
```

---

## Task 6: Add `reauth()` to `useAuth` and wire `UNAUTHORIZED` recovery

**Files:**
- Modify: `src/hooks/useAuth.ts`
- Modify: `src/hooks/useApi.ts` (one targeted catch)

- [ ] **Step 6.1: Add `reauth` to `useAuth`**

In `src/hooks/useAuth.ts`, add a `reauth` function returned from the hook:

```ts
const reauth = useCallback(async (): Promise<string | null> => {
  const cached = await new Promise<string | undefined>((resolve) =>
    chrome.identity.getAuthToken({ interactive: false }, (t) => resolve(t))
  );
  if (cached) {
    await new Promise<void>((resolve) =>
      chrome.identity.removeCachedAuthToken({ token: cached }, () => resolve())
    );
  }
  return signIn();
}, [signIn]);

return { signIn, signOut, reauth, isAuthenticated, accessToken };
```

`signIn` already exists and resolves to a fresh token; `reauth` just guarantees the stale Chrome-side cached token is purged first. If `signIn`'s current return type is `void`, leave it `void`-returning and have `reauth` not return the token — components only need a "tried" signal.

- [ ] **Step 6.2: Trigger reauth from `useApi` when an action returns UNAUTHORIZED**

In `src/hooks/useApi.ts`, inside the existing `try/catch` of each wrapped method, before re-throwing, add:

```ts
if (e instanceof ApiError && e.code === 'UNAUTHORIZED') {
  // Best-effort silent reauth; do NOT retry the action automatically — let the user re-click.
  reauth().catch(() => {});
}
```

`reauth` must be obtained from `useAuth()` at the top of `useApi`. Don't add a retry loop — auto-retry hides real problems and risks infinite loops if the backend always 401s. Surfacing the error and refreshing the token is the right discipline.

- [ ] **Step 6.3: Run all tests**

```bash
npm test
```

Expected: no regressions. (Token-refresh behavior is hard to unit-test without heavy mocking — accept that this step is verified manually in Step 6.4.)

- [ ] **Step 6.4: Manual verification (add to checklist; do not block CI)**

In `dashboard-dev.html`:
1. Open DevTools → Application → Storage → Cookies/Storage; inspect `chrome.identity` state.
2. From the React DevTools, call `reauth()` and confirm a fresh token replaces the cached one.

Skip this if no easy way to exercise without a real OAuth flow; note it in the commit message as a manual gate.

- [ ] **Step 6.5: Commit**

```bash
git add src/hooks/useAuth.ts src/hooks/useApi.ts
git commit -m "feat(auth): reauth() helper and silent retry on UNAUTHORIZED responses"
```

---

## Task 7: Extend `wizard-dev` scenario picker

**Files:**
- Modify: `src/wizard-dev-main.tsx`

- [ ] **Step 7.1: Extend the `Scenario` union**

Find the `type Scenario = 'success' | 'html-error' | 'network-error' | 'auth-error';` declaration. Replace with:

```ts
type Scenario =
  | 'success'
  | 'html-error'
  | 'network-error'
  | 'auth-error'
  | 'timeout'
  | 'validation-error'
  | 'auth-email-mismatch';
```

- [ ] **Step 7.2: Add three entries to `SCENARIOS`**

Append to the array:

```ts
{ id: 'timeout',             label: '⏱ Timeout (90s)',         color: 'bg-slate-100 border-slate-400 text-slate-800' },
{ id: 'validation-error',    label: '✗ Validation failed',     color: 'bg-amber-100 border-amber-400 text-amber-800' },
{ id: 'auth-email-mismatch', label: '✗ Email mismatch (403)',  color: 'bg-pink-100 border-pink-400 text-pink-800' },
```

- [ ] **Step 7.3: Extend `applyScenario`**

Inside the existing `switch (scenario)`, add cases:

```ts
case 'timeout':
  api.getStatus = vi.fn(() => Promise.reject(new ApiError('Request timed out after 90s', undefined, 'TIMEOUT')));
  break;
case 'validation-error':
  api.getStatus = vi.fn(() => Promise.reject(new ApiError('VALIDATION_FAILED', 200, 'VALIDATION_FAILED', [
    { field: 'maxFilesPerRun', reason: 'must be integer 1–100' },
  ])));
  break;
case 'auth-email-mismatch':
  api.getStatus = vi.fn(() => Promise.reject(new ApiError('Forbidden — email mismatch', 403, 'FORBIDDEN')));
  break;
```

Make sure `vi` and `ApiError` are imported at the top of the file — the existing scenarios already import them.

- [ ] **Step 7.4: Manual verification (no test gate)**

```bash
npm run dev
```

Open `http://localhost:5173/wizard-dev.html`. The three new buttons should appear and clicking each should trigger the scenario in the wizard.

- [ ] **Step 7.5: Commit**

```bash
git add src/wizard-dev-main.tsx
git commit -m "feat(wizard-dev): timeout, validation-error, auth-email-mismatch scenarios"
```

---

## Cross-Cutting Verification (after all 7 tasks)

- [ ] **Full test suite green**

```bash
npm test
```

Expected: all Phase 1 + Phase 2 specs pass. Phase 2 adds ~14 new specs (7 in `api.test.ts`, 2 in `useApi.test.ts`, 2 in `ErrorBoundary.test.tsx`, 3 in `alarmOutcomes.test.ts`).

- [ ] **Build still succeeds**

```bash
npm run build
```

Expected: `dist/` produced; `background.js` at dist root.

- [ ] **Manual smoke**

1. Load unpacked `dist/` in Chrome.
2. Trigger Sync from the popup; observe a single backend round-trip even if you double-click.
3. From DevTools console in the service-worker context, run `chrome.storage.local.get('alarmOutcomes').then(console.log)` after letting an alarm fire — confirm outcomes are recorded.
4. Throw an error in a component (temporarily insert `throw new Error('boundary check')` in `Dashboard.tsx` render) and confirm `<ErrorBoundary>` catches it. Revert the throw.
5. In `wizard-dev.html`, exercise each new scenario.

---

## Notes for the Executor

- **`ApiError` is the typed error contract — don't introduce a parallel `BackendError`.** Phase 1's `validateSettings_` returns `{success:false, error:'VALIDATION_FAILED', errors:[...]}`; Task 1 maps this into `ApiError.code === 'VALIDATION_FAILED'` with `fieldErrors` populated.
- **ErrorBoundary does NOT catch async errors.** React class boundaries only intercept render-phase throws. The existing Zustand-driven error UI in `Dashboard.tsx:167-171` continues to handle async failures from `useApi`; the boundary is a render-time safety net for unexpected crashes.
- **Don't auto-retry on UNAUTHORIZED.** Task 6 only refreshes the token — the user must re-trigger the action. Auto-retry hides real backend rejections and risks infinite loops.
- **`background.ts` adopts `fetchApi`.** This is the only place in Phase 2 where the background service worker's behavior changes. If the existing implementation depends on a specific token-passing pattern that `fetchApi` doesn't preserve, STOP and report — don't reshape `api.ts` to fit the service worker on the fly.
- **Don't refactor anything outside the file map above.** Settings UI wiring to the new `diagnostics` endpoint is Phase 3, not Phase 2.

---

## Self-Review

**Spec coverage:** Roadmap Phase 2 bullets → tasks: ErrorBoundary (Task 4), AbortController timeout (Task 2), in-flight dedup (Task 3), alarm outcome ring buffer (Task 5), typed error class (Task 1), error-path tests (Task 1+2), wizard-dev scenarios (Task 7). Reauth (Task 6) is the bonus addition to close the UNAUTHORIZED loop. All covered.

**Placeholders:** No "TBD" / "add error handling" — every step has exact code or a precise diff target.

**Type consistency:** `ApiError` used everywhere (Tasks 1, 2, 5, 6, 7). `ApiErrorCode` is a single source of truth. `AlarmOutcome` shape consistent between producer (`background.ts`) and tests.
