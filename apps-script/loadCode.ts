// Test harness: evaluates the REAL apps-script/Code.gs in a node:vm sandbox with
// stubbed Apps Script globals, so tests exercise the shipped code, not a copy.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const SOURCE = readFileSync(resolve(__dirname, 'Code.gs'), 'utf-8');

export type FetchStub = (url: string, opts?: unknown) => { code: number; body: string };

export interface LoadCodeOptions {
  /** Script properties; mutated in place, so keep a reference to assert on writes. */
  props?: Record<string, string>;
  /** Script cache; mutated in place. */
  cache?: Record<string, string>;
  /** Emails returned by Session.getActiveUser() / Session.getEffectiveUser(). */
  session?: { activeEmail?: string; effectiveEmail?: string; timeZone?: string };
  /** UrlFetchApp.fetch stub. Default throws (no network in tests). */
  fetch?: FetchStub;
  /** Extra or overriding globals (Drive, DocumentApp, Logger, console, ...). */
  globals?: Record<string, unknown>;
}

// Apps Script returns Java-style signed bytes (-128..127).
const signedBytes = (buf: Buffer) => [...buf].map((b) => (b > 127 ? b - 256 : b));

/** Evaluates Code.gs and returns its global scope (functions, `var`s, plus CONFIG). */
export function loadCode(opts: LoadCodeOptions = {}): Record<string, any> {
  const props = opts.props ?? {};
  const cache = opts.cache ?? {};
  const session = opts.session ?? {};
  const fetch: FetchStub = opts.fetch ?? (() => { throw new Error('UrlFetchApp.fetch not stubbed'); });
  const noop = () => {};

  const sandbox: Record<string, any> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (k in props ? props[k] : null),
        setProperty: (k: string, v: string) => { props[k] = String(v); },
        deleteProperty: (k: string) => { delete props[k]; },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => (k in cache ? cache[k] : null),
        put: (k: string, v: string) => { cache[k] = String(v); },
        remove: (k: string) => { delete cache[k]; },
      }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => session.activeEmail ?? '' }),
      getEffectiveUser: () => ({ getEmail: () => session.effectiveEmail ?? '' }),
      getScriptTimeZone: () => session.timeZone ?? 'UTC',
    },
    UrlFetchApp: {
      fetch: (url: string, o?: unknown) => {
        const r = fetch(url, o);
        return { getResponseCode: () => r.code, getContentText: () => r.body };
      },
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg: string, value: string) => signedBytes(createHash(alg).update(value, 'utf8').digest()),
      sleep: noop,
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: noop, releaseLock: noop }) },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    ScriptApp: { getOAuthToken: () => 'script-oauth-token' },
    Logger: { log: noop },
    console: { log: noop, warn: noop, error: noop, info: noop },
    ...opts.globals,
  };

  vm.createContext(sandbox);
  // `const CONFIG` is lexical, so expose it explicitly for tests.
  vm.runInContext(SOURCE + '\n;this.CONFIG = CONFIG;', sandbox, { filename: 'Code.gs' });
  return sandbox;
}
