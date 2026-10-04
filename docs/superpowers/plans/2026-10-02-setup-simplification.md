# Setup Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut MeetSync setup to "copy template → deploy web app → paste one code", remove the per-user Google Cloud step from the default path, and fix the stale NotebookLM docs.

**Architecture:** The template's Apps Script gets a "Connect extension" menu item that shows a single web-safe-base64 code (`{v:1,url,scriptId}`). The extension's setup wizard decodes it with a new `src/lib/connectionCode.ts` and fills the existing URL/script-ID state, so the save/sign-in/verify flow is unchanged. Docs are rewritten around two paths (sync only / add dashboard); publishing the OAuth consent screen is a documented owner step.

**Tech Stack:** TypeScript, React 19, Vitest (jsdom), Apps Script (`apps-script/Code.gs`, tested through the `loadCode()` node:vm harness).

**Spec:** `docs/superpowers/specs/2026-10-02-product-improvements-design.md`, section 1 (1a, 1b, 1c). Sections 2 and 3 get their own plans.

**Scope note:** This plan also fixes the stale "Refresh" tip and the "50 sources" claim in the docs (part of spec 1c). The dashboard "Connect to Gemini Notebook" card, archive-email line and monthly-archive default belong to plan 2.

**Baseline:** `npx vitest run` is green at the start (314 tests). Running vitest creates an untracked `.vitest/` folder; never use `git add -A` / `git add .`, always add files by path.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/connectionCode.ts` | Create | `decodeConnectionCode()`: parse and validate the pasted code |
| `src/lib/connectionCode.test.ts` | Create | Unit tests for the decoder |
| `apps-script/Code.gs` | Modify | `makeConnectionCode()`, `showConnectionCode()`, menu item, fix stale Help tip |
| `apps-script/loadCode.ts` | Modify | Add `Utilities.base64EncodeWebSafe` to the test sandbox |
| `apps-script/connection-code.test.ts` | Create | Backend tests + contract test against the TS decoder |
| `src/lib/backendChecksum.ts`, `src/lib/bundledBackend.ts` | Regenerate | Generated from `Code.gs`; committed |
| `src/components/SetupWizard.tsx` | Modify | Connection-code field, manual entry in a `<details>`, optional script ID |
| `src/components/SetupWizard.test.tsx` | Modify | Tests for the new behaviour |
| `README.md`, `docs/google-cloud-setup.md`, `src/components/Help.tsx`, `CLAUDE.md` | Modify | Two-path docs, fixes, advanced-only GCP guide |
| `package.json`, `public/manifest.json` | Modify | Version 1.1.0 → 1.2.0 |

---

### Task 1: Connection code decoder

**Files:**
- Create: `src/lib/connectionCode.ts`
- Test: `src/lib/connectionCode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/connectionCode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodeConnectionCode } from './connectionCode';

const URL = 'https://script.google.com/macros/s/AKfycbx-_123/exec';
const SID = '1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02';

// Same encoding as Code.gs makeConnectionCode(): web-safe base64 (padded) of the JSON.
const encode = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_');

describe('decodeConnectionCode', () => {
  it('decodes a valid code', () => {
    expect(decodeConnectionCode(encode({ v: 1, url: URL, scriptId: SID }))).toEqual({ url: URL, scriptId: SID });
  });

  it('accepts a Workspace /a/macros/<domain>/ URL', () => {
    const url = 'https://script.google.com/a/macros/example.com/s/AKfycbx/exec';
    expect(decodeConnectionCode(encode({ v: 1, url, scriptId: SID }))).toEqual({ url, scriptId: SID });
  });

  it('accepts unpadded codes and surrounding whitespace', () => {
    const code = encode({ v: 1, url: URL, scriptId: SID }).replace(/=+$/, '');
    expect(decodeConnectionCode(`  ${code}\n`)).toEqual({ url: URL, scriptId: SID });
  });

  it('allows a missing scriptId', () => {
    expect(decodeConnectionCode(encode({ v: 1, url: URL }))).toEqual({ url: URL, scriptId: undefined });
  });

  it.each([
    ['empty string', ''],
    ['garbage', 'not a code at all!!'],
    ['valid base64 but not JSON', btoa('hello')],
    ['JSON array', encode([1, 2])],
    ['JSON null', encode(null)],
    ['wrong version', encode({ v: 2, url: URL, scriptId: SID })],
    ['missing version', encode({ url: URL, scriptId: SID })],
    ['missing url', encode({ v: 1, scriptId: SID })],
    ['url not a string', encode({ v: 1, url: 42, scriptId: SID })],
    ['http url', encode({ v: 1, url: URL.replace('https', 'http'), scriptId: SID })],
    ['look-alike host', encode({ v: 1, url: 'https://script.google.com.evil.example/macros/s/x/exec', scriptId: SID })],
    ['dev url', encode({ v: 1, url: 'https://script.google.com/macros/s/x/dev', scriptId: SID })],
    ['scriptId too short', encode({ v: 1, url: URL, scriptId: 'abc' })],
    ['scriptId not a string', encode({ v: 1, url: URL, scriptId: 7 })],
  ])('rejects %s', (_label, code) => {
    expect(decodeConnectionCode(code)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/connectionCode.test.ts 2>&1 | tail -15`
Expected: FAIL, cannot resolve `./connectionCode`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/connectionCode.ts`:

```ts
import { isAppsScriptExecUrl } from './deploymentUrl';

export type ConnectionCode = { url: string; scriptId?: string };

/**
 * Decodes the code shown by the template's "Connect extension" menu
 * (Code.gs makeConnectionCode): web-safe base64 of {"v":1,"url":"…/exec","scriptId":"…"}.
 * Returns null for anything that is not a valid v1 code, so callers never trust a bad URL.
 */
export function decodeConnectionCode(input: string): ConnectionCode | null {
  try {
    const b64 = input.trim().replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data?.v !== 1 || typeof data.url !== 'string') return null;
    if (!isAppsScriptExecUrl(data.url) || !new URL(data.url).pathname.endsWith('/exec')) return null;
    const { scriptId } = data;
    if (scriptId !== undefined && (typeof scriptId !== 'string' || scriptId.length < 20)) return null;
    return { url: data.url, scriptId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/connectionCode.test.ts 2>&1 | tail -15`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectionCode.ts src/lib/connectionCode.test.ts
git commit -m "feat: add connection code decoder for the setup wizard" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Backend "Connect extension" menu item

**Files:**
- Modify: `apps-script/Code.gs` (menu in `onOpen` ~line 604, new block before `// ─── MAIN SYNC LOGIC`, Help tip ~line 708)
- Modify: `apps-script/loadCode.ts` (add `base64EncodeWebSafe` to the `Utilities` stub, next to `sleep: noop,`)
- Create: `apps-script/connection-code.test.ts`
- Regenerate: `src/lib/backendChecksum.ts`, `src/lib/bundledBackend.ts`

- [ ] **Step 1: Teach the test harness base64**

In `apps-script/loadCode.ts`, inside the `Utilities: { ... }` object, add this line directly after `sleep: noop,`:

```ts
      // Apps Script returns padded web-safe base64 (+ → -, / → _).
      base64EncodeWebSafe: (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
```

- [ ] **Step 2: Write the failing test**

Create `apps-script/connection-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadCode } from './loadCode';
import { decodeConnectionCode } from '../src/lib/connectionCode';

const EXEC = 'https://script.google.com/macros/s/AKfycbx-_123/exec';
const SID = '1PZjo-m8yf49TFg5dk1vbWz2m5l5zeqTH72K4uBrtZKzOlWqOjxvuLQ02';

function load(getUrl: () => string | null = () => EXEC) {
  const shown: { html: string }[] = [];
  const gs = loadCode({
    globals: {
      ScriptApp: { getOAuthToken: () => 't', getScriptId: () => SID, getService: () => ({ getUrl }) },
      HtmlService: {
        createHtmlOutput: (html: string) => {
          const out = { html, setWidth: () => out, setHeight: () => out };
          return out;
        },
      },
      DocumentApp: { getUi: () => ({ showModalDialog: (o: { html: string }) => shown.push(o) }) },
    },
  });
  return { gs, shown };
}

describe('makeConnectionCode', () => {
  it('encodes {v:1,url,scriptId} as web-safe base64', () => {
    const { gs } = load();
    const code: string = gs.makeConnectionCode(EXEC);
    const json = Buffer.from(code.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(JSON.parse(json)).toEqual({ v: 1, url: EXEC, scriptId: SID });
  });

  it('produces a code the extension decoder accepts (contract test)', () => {
    const { gs } = load();
    expect(decodeConnectionCode(gs.makeConnectionCode(`  ${EXEC}\n`))).toEqual({ url: EXEC, scriptId: SID });
  });

  it.each([
    ['empty', ''],
    ['http', 'http://script.google.com/macros/s/x/exec'],
    ['other host', 'https://evil.example/macros/s/x/exec'],
    ['look-alike host', 'https://script.google.com.evil.example/macros/s/x/exec'],
    ['dev url', 'https://script.google.com/macros/s/x/dev'],
    ['editor url', 'https://script.google.com/home/projects/abc/edit'],
  ])('rejects %s', (_label, url) => {
    const { gs } = load();
    expect(() => gs.makeConnectionCode(url)).toThrow(/ends in \/exec/);
  });
});

describe('showConnectionCode', () => {
  it('prefills the web app URL when the script is deployed', () => {
    const { gs, shown } = load();
    gs.showConnectionCode();
    expect(shown).toHaveLength(1);
    expect(shown[0].html).toContain(`value="${EXEC}"`);
  });

  it.each([
    ['dev url', () => 'https://script.google.com/macros/s/x/dev'],
    ['null', () => null],
    ['throws', () => { throw new Error('not deployed'); }],
  ])('leaves the URL field empty when getUrl() gives %s', (_label, getUrl) => {
    const { gs, shown } = load(getUrl as () => string | null);
    gs.showConnectionCode();
    expect(shown[0].html).toContain('value=""');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run apps-script/connection-code.test.ts 2>&1 | tail -15`
Expected: FAIL, `gs.makeConnectionCode is not a function`.

- [ ] **Step 4: Implement in Code.gs**

Open `apps-script/Code.gs`, find the line `// ─── MAIN SYNC LOGIC ───…` (just after `showHelp`). Insert the following block immediately **before** it (copy the original divider line exactly, do not retype it):

```js
// ─── EXTENSION CONNECTION ─────────────────────────────────────────────────────

var EXEC_URL_RE_ = /^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+|macros)\/s\/[A-Za-z0-9_-]+\/exec$/;

/**
 * Builds the one-paste code for the Chrome extension's setup wizard:
 * web-safe base64 of {v:1,url,scriptId}. Decoded by src/lib/connectionCode.ts.
 * Public (no trailing underscore) so the dialog can call it via google.script.run.
 */
function makeConnectionCode(url) {
  url = String(url || '').trim();
  if (!EXEC_URL_RE_.test(url)) {
    throw new Error('Paste the web app URL from Deploy → Manage deployments (it ends in /exec).');
  }
  return Utilities.base64EncodeWebSafe(JSON.stringify({ v: 1, url: url, scriptId: ScriptApp.getScriptId() }));
}

/**
 * Menu "Connect extension": shows the code. The URL field is prefilled when the web app is
 * deployed and detectable; otherwise the user pastes the /exec URL from "Manage deployments".
 */
function showConnectionCode() {
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* not deployed yet */ }
  if (!EXEC_URL_RE_.test(url)) url = '';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 15px; color: #3c4043; line-height: 1.5;">
      <p style="margin-top: 0;">1. Deploy this script as a web app: <b>Deploy → New deployment → Web app</b>, <b>Execute as: Me</b>, <b>Who has access: Anyone</b>.</p>
      <p>2. Web app URL (ends in <code>/exec</code>):</p>
      <input id="url" value="${url}" placeholder="https://script.google.com/macros/s/…/exec" style="width: 100%; box-sizing: border-box; padding: 6px;">
      <button onclick="gen()" style="margin: 8px 0;">Generate code</button>
      <p id="err" style="color: #d93025; margin: 0;"></p>
      <p>3. Paste this code into the extension's setup wizard:</p>
      <textarea id="code" readonly rows="4" style="width: 100%; box-sizing: border-box; font-family: monospace; font-size: 11px;"></textarea>
      <button onclick="copyCode()">Copy</button>
    </div>
    <script>
      function gen() {
        document.getElementById('err').textContent = '';
        google.script.run
          .withSuccessHandler(function (c) { document.getElementById('code').value = c; })
          .withFailureHandler(function (e) { document.getElementById('err').textContent = e.message; })
          .makeConnectionCode(document.getElementById('url').value);
      }
      function copyCode() { var t = document.getElementById('code'); t.select(); document.execCommand('copy'); }
      if (document.getElementById('url').value) gen();
    </script>
  `;
  const output = HtmlService.createHtmlOutput(html).setWidth(460).setHeight(340);
  DocumentApp.getUi().showModalDialog(output, 'Connect the MeetSync extension');
}

```

Then add the menu item. In `onOpen`, change:

```js
      .addItem('❓ Start Here / Help', 'showHelp')
      .addSeparator()
```

to:

```js
      .addItem('❓ Start Here / Help', 'showHelp')
      .addItem('🔌 Connect extension', 'showConnectionCode')
      .addSeparator()
```

Finally fix the stale tip in `showHelp`. Replace this line:

```js
      <p style="font-size: 0.9em;"><b>Pro Tip:</b> Add this document to a <a href="https://notebooklm.google.com" target="_blank">NotebookLM</a> notebook and remember to <b>Refresh</b> the source after syncing!</p>
```

with:

```js
      <p style="font-size: 0.9em;"><b>Pro Tip:</b> Add this document to a <a href="https://notebook.google.com" target="_blank">Gemini Notebook</a> (formerly NotebookLM) as a Google Drive source. It stays up to date on its own. When an archive is created, add that file as a source too.</p>
```

- [ ] **Step 5: Run the new tests**

Run: `npx vitest run apps-script/connection-code.test.ts 2>&1 | tail -15`
Expected: PASS, 12 tests.

- [ ] **Step 6: Update the integrity hash and regenerate bundled files**

`Code.gs` changed, so the stale-hash test would fail. Run:

```bash
npm run update:checksum
node --import tsx scripts/generate-bundled-files.ts
```

Expected: `Checksum updated: <64 hex chars>`; `src/lib/backendChecksum.ts` and `src/lib/bundledBackend.ts` now show up in `git status` as modified.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run 2>&1 | tail -8`
Expected: all tests pass (314 + 18 + 12 = 344), including `compute-checksum.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps-script/Code.gs apps-script/loadCode.ts apps-script/connection-code.test.ts src/lib/backendChecksum.ts src/lib/bundledBackend.ts
git commit -m "feat(backend): add Connect extension menu item and fix stale Help tip" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Setup wizard accepts the connection code

**Files:**
- Modify: `src/components/SetupWizard.tsx`
- Modify: `src/components/SetupWizard.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/SetupWizard.test.tsx`, add this helper below the `VALID_SID` constant:

```tsx
// Same encoding as Code.gs makeConnectionCode(): web-safe base64 of the JSON.
const makeCode = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_');
```

Then add these tests inside the top-level `describe('SetupWizard', ...)`, just before the final `});`:

```tsx
  describe('connection code', () => {
    async function pasteCode(code: string) {
      await userEvent.click(screen.getByLabelText(/connection code/i));
      await userEvent.paste(code);
    }

    it('renders the connection code field', () => {
      render(<SetupWizard />);
      expect(screen.getByLabelText(/connection code/i)).toBeInTheDocument();
    });

    it('a valid code fills the URL and script ID and enables the button', async () => {
      render(<SetupWizard />);
      await pasteCode(makeCode({ v: 1, url: VALID_URL, scriptId: VALID_SID }));
      expect(screen.getByLabelText(/apps script deployment url/i)).toHaveValue(VALID_URL);
      expect(screen.getByLabelText(/script project id/i)).toHaveValue(VALID_SID);
      expect(screen.getByRole('button', { name: /save & connect/i })).toBeEnabled();
    });

    it('saves what the code contained', async () => {
      render(<SetupWizard />);
      await pasteCode(makeCode({ v: 1, url: VALID_URL, scriptId: VALID_SID }));
      await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
      await waitFor(() => {
        expect(chrome.storage.sync.set).toHaveBeenCalledWith(
          { deploymentUrl: VALID_URL, scriptId: VALID_SID },
          expect.any(Function)
        );
      });
    });

    it('an invalid code shows an error and keeps the button disabled', async () => {
      render(<SetupWizard />);
      await pasteCode('definitely not a code');
      expect(screen.getByText(/connection code is not valid/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save & connect/i })).toBeDisabled();
    });

    it('clearing the code clears the error', async () => {
      render(<SetupWizard />);
      await pasteCode('definitely not a code');
      await userEvent.clear(screen.getByLabelText(/connection code/i));
      expect(screen.queryByText(/connection code is not valid/i)).not.toBeInTheDocument();
    });

    it('stores a code-supplied URL in the draft', async () => {
      render(<SetupWizard />);
      await pasteCode(makeCode({ v: 1, url: VALID_URL, scriptId: VALID_SID }));
      await waitFor(() => {
        expect(localStore.setupWizardDraft).toEqual({ url: VALID_URL, scriptId: VALID_SID });
      });
    });
  });

  describe('script ID is optional', () => {
    it('connects with only a URL and stores no scriptId', async () => {
      render(<SetupWizard />);
      await userEvent.type(screen.getByLabelText(/apps script deployment url/i), VALID_URL);
      const button = screen.getByRole('button', { name: /save & connect/i });
      expect(button).toBeEnabled();
      await userEvent.click(button);
      await waitFor(() => {
        expect(chrome.storage.sync.set).toHaveBeenCalledWith({ deploymentUrl: VALID_URL }, expect.any(Function));
      });
    });

    it('still rejects a script ID that looks too short', async () => {
      render(<SetupWizard />);
      await userEvent.type(screen.getByLabelText(/apps script deployment url/i), VALID_URL);
      await userEvent.type(screen.getByLabelText(/script project id/i), 'abc');
      await userEvent.click(screen.getByRole('button', { name: /save & connect/i }));
      expect(screen.getByText(/script project id looks too short/i)).toBeInTheDocument();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/components/SetupWizard.test.tsx 2>&1 | tail -25`
Expected: the new tests FAIL (no "connection code" label; script ID still required). Existing tests still pass.

- [ ] **Step 3: Implement in SetupWizard.tsx**

3a. Add the import below the existing `isAppsScriptExecUrl` import:

```tsx
import { decodeConnectionCode } from '@/lib/connectionCode';
```

3b. Add state next to the other `useState` calls (after `const [error, setError] = ...`):

```tsx
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
```

3c. In the draft-restore `useEffect`, add one line after the two existing `if (draft?...)` lines so a restored draft is visible:

```tsx
        if (draft?.url || draft?.scriptId) setManualOpen(true);
```

3d. Replace `validateScriptId` with:

```tsx
  function validateScriptId(value: string): string | null {
    const trimmed = value.trim();
    // Optional: only "Deploy Backend" in Settings needs it.
    if (trimmed && trimmed.length < 20) return 'Script project ID looks too short';
    return null;
  }
```

3e. Add this handler after `handleScriptIdChange`:

```tsx
  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setCode(value);
    if (!value.trim()) {
      setCodeError(null);
      return;
    }
    const decoded = decodeConnectionCode(value);
    if (!decoded) {
      setCodeError('That connection code is not valid. Copy it again from 🚀 NotebookLM → 🔌 Connect extension in your Google Doc.');
      return;
    }
    setCodeError(null);
    setUrl(decoded.url);
    setUrlError(null);
    setScriptIdValue(decoded.scriptId ?? '');
    setScriptIdError(null);
    saveDraft({ url: decoded.url, scriptId: decoded.scriptId ?? '' });
  }
```

3f. In `handleSave`, replace the script-ID block and storage write. Change:

```tsx
    const sidError = validateScriptId(scriptIdValue);
    if (sidError) {
      setScriptIdError(sidError);
      return;
    }
```

(keep as is, it now only fires for too-short IDs) and replace the `chrome.storage.sync.set(...)` call with:

```tsx
      const sid = scriptIdValue.trim();
      await new Promise<void>((resolve, reject) => {
        chrome.storage.sync.set({ deploymentUrl: url.trim(), ...(sid && { scriptId: sid }) }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
```

(the surrounding `await new Promise` it replaces is the existing one; do not leave two). Then replace the final two store calls:

```tsx
      setDeploymentUrl(url.trim());
      setScriptId(scriptIdValue.trim());
```

with:

```tsx
      setDeploymentUrl(url.trim());
      if (sid) setScriptId(sid);
```

3g. In the JSX, replace the intro paragraph and open the manual fields in a `<details>`. Replace:

```tsx
          <p className="text-sm text-slate-500">
            Enter your Apps Script deployment URL to get started.
          </p>
          <div className="space-y-2">
            <Label htmlFor="deployment-url">Apps Script Deployment URL</Label>
```

with:

```tsx
          <p className="text-sm text-slate-500">
            In your Google Doc, open <strong>🚀 NotebookLM → 🔌 Connect extension</strong> and paste the code here.
          </p>
          <div className="space-y-2">
            <Label htmlFor="connection-code">Connection code</Label>
            <Input
              id="connection-code"
              placeholder="eyJ2IjoxLCJ1cmwiOiJodHRwczovL3Nj…"
              value={code}
              onChange={handleCodeChange}
              disabled={phase !== 'idle'}
            />
            {codeError && (
              <p className="text-sm text-red-600">{codeError}</p>
            )}
          </div>
          <details open={manualOpen} onToggle={(e) => setManualOpen(e.currentTarget.open)} className="space-y-4">
            <summary className="text-xs text-slate-500 cursor-pointer">Or enter the URL and script ID manually</summary>
          <div className="space-y-2 mt-3">
            <Label htmlFor="deployment-url">Apps Script Deployment URL</Label>
```

Update the script ID label hint and close the `<details>`. Replace:

```tsx
            <Label htmlFor="script-id">Script Project ID</Label>
            <p className="text-[11px] text-slate-400">Found in the Apps Script editor URL under your project name, after <code className="text-slate-500">/home/projects/</code>.</p>
```

with:

```tsx
            <Label htmlFor="script-id">Script Project ID (optional)</Label>
            <p className="text-[11px] text-slate-400">Only needed for Deploy Backend in Settings. Found in the Apps Script editor URL, after <code className="text-slate-500">/home/projects/</code>.</p>
```

and replace the script-ID error block:

```tsx
            {scriptIdError && (
              <p className="text-sm text-red-600">{scriptIdError}</p>
            )}
          </div>
```

with:

```tsx
            {scriptIdError && (
              <p className="text-sm text-red-600">{scriptIdError}</p>
            )}
          </div>
          </details>
```

- [ ] **Step 4: Run the wizard tests**

Run: `npx vitest run src/components/SetupWizard.test.tsx 2>&1 | tail -25`
Expected: PASS, all old and new tests. The existing tests type into fields inside the (closed) `<details>`; jsdom does not hide `<details>` content, so they keep working. If any existing test fails only because the field is "not visible", stop and report it instead of editing the old tests.

- [ ] **Step 5: Type-check and run the whole suite**

Run: `npx tsc --noEmit 2>&1 | tail -10 && npx vitest run 2>&1 | tail -8`
Expected: no tsc errors; all tests pass.

- [ ] **Step 6: Visual check on the dev page**

Run: `npm run dev` (background), open `http://localhost:5173/wizard-dev.html`.
Check: the code field is first and the manual section is collapsed. Pasting garbage shows the red error. Pasting this valid code fills both fields (open the manual section to see them):
`eyJ2IjoxLCJ1cmwiOiJodHRwczovL3NjcmlwdC5nb29nbGUuY29tL21hY3Jvcy9zL0FLZnljYngtXzEyMy9leGVjIiwic2NyaXB0SWQiOiIxUFpqby1tOHlmNDlURmc1ZGsxdmJXejJtNWw1emVxVEg3Mks0dUJydFpLek9sV3FPanh2dUxRMDIifQ==`
Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/components/SetupWizard.tsx src/components/SetupWizard.test.tsx
git commit -m "feat(wizard): accept a single connection code, make script ID optional" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Two-path docs and stale-content fixes

**Files:**
- Modify: `README.md`, `docs/google-cloud-setup.md`, `src/components/Help.tsx`, `CLAUDE.md`

No tests; verification is a grep at the end. Use Read to view the exact lines before each Edit. Line numbers are as of commit `46f0d78`.

- [ ] **Step 1: README, intro line 6**

Replace "a living, unlimited knowledge base for NotebookLM or any other AI tool." with "a living, unlimited knowledge base for Gemini Notebook (formerly NotebookLM) or any other AI tool."

- [ ] **Step 2: README, Quick Start (lines 10–17)**

Replace from `## 🚀 Quick Start (One-Click Install)` through the 4th numbered step (`4. Run **🔄 Sync Now** and follow the authorization prompts.`) with:

```markdown
## 🚀 Quick Start

### Path 1: the sync only (2 minutes, nothing to install)

1. **[Click here to make a copy of the template](https://docs.google.com/document/d/1ptU9lzwjX2LfBi_IVZeT00YCLrkmm5D25KmqeqEwB_o/copy)**
2. In your new document, refresh the page. A **🚀 NotebookLM** menu appears.
3. Run **🔄 Sync Now** and follow the authorization prompts. Google shows an "unverified app" screen because the script is your own copy: click **Advanced → Go to … (unsafe)**.
4. Run **⏰ Enable Auto-Sync**. New meeting notes are added every 15 minutes.
5. In [Gemini Notebook](https://notebook.google.com) (formerly NotebookLM), add the doc as a Google Drive source. It stays up to date on its own.

### Path 2: add the dashboard (Chrome extension)

The extension adds a popup and dashboard: sync status, history, files, analytics and settings. Do Path 1 first, then:

1. In your doc, open **Extensions → Apps Script → Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**, then deploy.
2. Download `meetsync.zip` from the **[Releases page](https://github.com/benoit-prentout/meetsync/releases)**, unzip it, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. In your doc, open **🚀 NotebookLM → 🔌 Connect extension** and copy the code.
4. Open the extension and paste the code in the setup wizard. Then enter your Master Doc ID and Archive Folder ID in **Settings**.
```

- [ ] **Step 3: README, replace "Install from Releases" and "First-time setup" (lines 33–47)**

Replace from `## Install from Releases` through `3. **Enter your deployment URL** and **script project ID** in the extension's setup wizard.` with:

```markdown
## Install from Releases

See **Path 2** above. The release build ships a shared Google sign-in client, so there is nothing to create in Google Cloud. If you fork MeetSync or build from source with your own client, follow [Google Cloud Setup](docs/google-cloud-setup.md) (advanced).

To update the backend later, use **Deploy Backend** in the extension's Settings. Google shows an "unverified app" screen the first time: click **Advanced → Go to MeetSync (unsafe)**. This is expected, the extension is not verified by Google. If you prefer, paste the new `apps-script/Code.gs` into the Apps Script editor by hand and redeploy.
```

- [ ] **Step 4: README, source-limit claim (line 53) and Option A (line 88)**

Replace the sentence "NotebookLM limits its sources to 50. By grouping months of meetings into a single document, you enable any AI tool to make long-term connections without ever hitting source limits." with:

"Gemini Notebook (formerly NotebookLM) caps sources per notebook (50 on the free plan, up to 600 on Ultra) and Meet creates one doc per meeting. By grouping months of meetings into a single clean document, you stay far below the cap and any AI tool can make long-term connections."

Replace `**Option A — Auto-Deploy (recommended)**: Complete the Chrome extension Setup wizard, then in Settings click **Deploy Backend**. The extension pushes the code via the Apps Script API — no manual copy-paste needed.` with:

`**Option A — Auto-Deploy (to update an existing script)**: Complete the Chrome extension Setup wizard and enter your Script Project ID, then in Settings click **Deploy Backend**. The extension pushes the code via the Apps Script API. Google shows an "unverified app" screen the first time (**Advanced → Go to MeetSync (unsafe)**).`

- [ ] **Step 5: README, "Connecting to NotebookLM" section (lines 126–132)**

Replace from `## 🧠 Connecting to NotebookLM` through the archive step (`5. **Archives**: ...`) with:

```markdown
## 🧠 Connecting to Gemini Notebook (formerly NotebookLM)

1. Go to [Gemini Notebook](https://notebook.google.com).
2. Create a new notebook.
3. Add your **Master Google Doc** as a **Google Drive** source.
4. That's it: since May 2026, Docs sources sync from Drive automatically. To force an update, open the source and click **Click to sync with Google Drive**.
5. **Archives**: when an archive is created, add the archive file as a source too, so your full history stays available. The archive email contains the link.
```

- [ ] **Step 6: google-cloud-setup.md**

Change the title line to `# Google Cloud Console Setup (advanced: bring your own OAuth client)` and insert this paragraph directly after it:

```markdown
> **Most users do not need this guide.** The release build of MeetSync ships a shared Google sign-in client. Follow this guide only if you fork MeetSync or build it from source with your own OAuth client.
```

Replace both occurrences of `**Anyone with a Google account**` with `**Anyone**` (lines 104 and 129; the backend authenticates with the `?token=` query parameter, so the web app must be reachable without a Google browser session). In "Step 8: Configure the Extension", replace the first two list items with:

```markdown
1. Click the extension icon in Chrome. The Setup wizard opens on first run.
2. In your Google Doc, open **🚀 NotebookLM → 🔌 Connect extension**, copy the code and paste it into the wizard (or enter the Web App URL manually under "Or enter the URL and script ID manually").
```

(and keep the remaining item about **Save & Connect**.)

- [ ] **Step 7: Help.tsx "Getting Started" steps 1–4 and unverified-app note**

In `src/components/Help.tsx`, replace the four `<Step>` blocks `n={1}` to `n={4}` with:

```tsx
          <Step n={1}>
            Make a copy of the <strong>MeetSync template doc</strong> (link in the GitHub README). Refresh it, open <strong>🚀 NotebookLM → 🔄 Sync Now</strong> once and authorize. This doc is your <strong>Master Document</strong>; copy its ID from the URL:{' '}
            <code className="bg-slate-100 px-1 rounded-sm text-[10px]">docs.google.com/document/d/<strong>[ID]</strong>/edit</code>
          </Step>
          <Step n={2}>
            Create a Google Drive folder for <strong>Archives</strong>. When the master doc gets large, old content is moved here automatically. Copy the folder ID from its URL:{' '}
            <code className="bg-slate-100 px-1 rounded-sm text-[10px]">drive.google.com/drive/folders/<strong>[ID]</strong></code>
          </Step>
          <Step n={3}>
            In the doc, open <strong>Extensions → Apps Script → Deploy → New deployment → Web app</strong> (<em>Execute as: Me</em>, <em>Who has access: Anyone</em>), then open <strong>🚀 NotebookLM → 🔌 Connect extension</strong> and copy the connection code.
          </Step>
          <Step n={4}>
            Open the extension popup and complete the <strong>Setup Wizard</strong>: paste the connection code, click <strong>Save &amp; Connect</strong>. The wizard verifies the backend connection before completing.
          </Step>
```

In the "Backend Updates" section, after the paragraph that starts `One-click deploy uses the Apps Script API`, add:

```tsx
          <p className="mt-2">
            The first time, Google shows an <strong>"unverified app"</strong> screen: click <strong>Advanced → Go to MeetSync (unsafe)</strong>. This is expected, the extension is not verified by Google.
          </p>
```

In "Resources", replace the NotebookLM link block with:

```tsx
          <a
            href="https://notebook.google.com"
            onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: 'https://notebook.google.com' }); }}
            className="flex items-center gap-2 text-xs text-[#1a73e8] hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Gemini Notebook (formerly NotebookLM) — add your master doc as a source
          </a>
```

- [ ] **Step 8: CLAUDE.md**

In the "Chrome Extension" bullet list, after the **First run** bullet, add:

```markdown
- **Connection code**: the template's menu **🚀 NotebookLM → 🔌 Connect extension** (`showConnectionCode`/`makeConnectionCode` in `Code.gs`) shows web-safe base64 of `{v:1,url,scriptId}`. `src/lib/connectionCode.ts` decodes it; `SetupWizard` fills its URL/script-ID state from it (script ID is optional, only Deploy Backend needs it). Backend and decoder are tied by `apps-script/connection-code.test.ts`.
```

In "Known Gotchas", add:

```markdown
- **OAuth consent screen must be "In production"** for the shared client in `public/manifest.json` to work for users outside the test-user list. Only the Deploy Backend button requests the sensitive `script.*` scopes (unverified-app screen, 100-user cap); normal sign-in requests only `openid email`. `docs/google-cloud-setup.md` is the advanced bring-your-own-client guide.
```

- [ ] **Step 9: Verify nothing stale is left**

Run: `grep -rn -i "click the \*\*Refresh\|limits its sources to 50\|Anyone with a Google account\|paste your deployment URL AND" README.md docs src/components CLAUDE.md apps-script/Code.gs`
Expected: no output.

Run: `npx tsc --noEmit 2>&1 | tail -5 && npx vitest run 2>&1 | tail -6`
Expected: no tsc errors; all tests pass.

- [ ] **Step 10: Commit**

```bash
git add README.md docs/google-cloud-setup.md src/components/Help.tsx CLAUDE.md
git commit -m "docs: rewrite setup around two paths, fix stale Gemini Notebook and access-setting docs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Version bump and release build

**Files:**
- Modify: `package.json` (`"version"`), `public/manifest.json` (`"version"`)

- [ ] **Step 1: Bump the version**

Change `"version": "1.1.0"` to `"version": "1.2.0"` in both `package.json` and `public/manifest.json`. (Check `src/manifest.test.ts` does not pin the version: `grep -n version src/manifest.test.ts` should print nothing.)

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -6 && npm run package 2>&1 | tail -6`
Expected: no tsc errors; all tests pass; `meetsync.zip` is rebuilt (it is gitignored). `git status --short` shows only `package.json`, `public/manifest.json` and possibly regenerated `src/lib/bundledBackend.ts` / `backendChecksum.ts` (commit them if changed).

- [ ] **Step 3: Commit**

```bash
git add package.json public/manifest.json src/lib/bundledBackend.ts src/lib/backendChecksum.ts
git commit -m "chore: bump to 1.2.0" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(If the two `src/lib` files are unchanged, omit them from `git add`.)

- [ ] **Step 4: Stop here and hand over to the owner**

Do **not** push a `v1.2.0` tag or publish a release. Tell the owner that the code is ready and that Task 6 (owner runbook) must pass first, because a release built today would hand out a client that only works for test users.

---

### Task 6: Owner runbook, publish the consent screen and verify end to end

Manual steps for the repository owner. Not automatable; the agent only prints this checklist at the end of the work.

- [ ] **Step 1: Check the declared scopes before publishing**

Google Cloud Console (French UI), project number `445706616860` → **Google Auth Platform** → **Accès aux données** (Data access). Note which scopes are declared. Normal sign-in only needs `openid` and `email`. The two `script.projects` / `script.deployments` scopes may stay declared for the Deploy Backend button.

- [ ] **Step 2: Publish**

**Audience** (Public) → **Publier l'application** (Publish app) → confirm. The status changes from "Test" to "En production". Google may show a notice that sensitive scopes need verification: this is expected. It does not block users, it only adds the "unverified app" screen and a 100-user cap for Deploy Backend.

- [ ] **Step 3: Second-account test (the release gate)**

On a clean Chrome profile signed in with a Google account that is **not** in the old test-user list, load the new `meetsync.zip` unpacked, then:
1. Copy the template, run **Sync Now**, authorize, **Enable Auto-Sync**.
2. Deploy as web app (Execute as: Me, Anyone).
3. Open **🚀 NotebookLM → 🔌 Connect extension**. **Record whether the URL field was prefilled.** If it was empty, the `getUrl()` detection does not work from a menu: the dialog fallback (paste the `/exec` URL, click Generate) must still produce a code. Both outcomes are acceptable; note which one happened in the README Path 2 wording if the fallback is the norm.
4. Paste the code into the wizard and click **Save & Connect**. Expected: sign-in shows no "unverified app" screen and the dashboard opens.
5. Check the consent screen: note whether the app name/logo show. If not, that is expected for an unverified app.
6. Next day (and again after 7+ days) confirm the dashboard still loads without re-consent.

- [ ] **Step 4: Release**

If all of the above pass: `git tag v1.2.0 && git push origin main v1.2.0` (the release workflow builds and attaches `meetsync.zip`). Write real release notes on the GitHub release page: the new two-path setup, the connection code, "no Google Cloud setup needed".

---

## Self-review (against the spec)

- **1a Shared OAuth client:** Task 6 (publish, gate, unverified-app notes), Task 4 steps 3, 4, 6, 7, 8 (docs retitled, unverified-app screen documented next to Deploy Backend, CLAUDE.md gotcha).
- **1b Connection code:** Task 1 (decoder), Task 2 (menu item, `makeConnectionCode`, `showConnectionCode`, `getUrl()` fallback), Task 3 (wizard, manual fallback in `<details>`, optional script ID, draft/sign-in order untouched). The `getUrl()` risk is covered by the dialog design plus Task 6 step 3.
- **1c README/Help:** Task 4 (two paths, Refresh step and 50-source claim removed, Gemini Notebook wording, access setting reconciled to "Anyone", Help.tsx updated; the `showHelp` tip is fixed in Task 2).
- **Types:** `decodeConnectionCode(input): ConnectionCode | null`, `ConnectionCode = { url: string; scriptId?: string }` and `makeConnectionCode(url)` / `showConnectionCode()` are named identically in every task.
- **Not in this plan (by design):** dashboard "Connect to Gemini Notebook" card, archive-email line, monthly-archive default, Workspace Studio recipe (plan 2); GitHub/README discoverability work (plan 3). Follow-up idea, not built: include the doc ID in the code so Settings could prefill the Master Doc ID.
