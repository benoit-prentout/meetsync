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
  // Like Apps Script, reject property values over 9 KB.
  const putProp = (k: string, v: string) => {
    const s = String(v);
    if (Buffer.byteLength(s, 'utf8') > 9 * 1024) throw new Error(`Argument too large: ${k}`);
    props[k] = s;
  };

  const sandbox: Record<string, any> = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (k in props ? props[k] : null),
        setProperty: putProp,
        deleteProperty: (k: string) => { delete props[k]; },
        getProperties: () => ({ ...props }),
        setProperties: (o: Record<string, string>) => {
          for (const k in o) putProp(k, o[k]);
        },
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
      // ponytail: UTC only, yyyy/MM/dd/HH/mm tokens; override via `globals` if a test needs real time zones.
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const p = (n: number) => String(n).padStart(2, '0');
        return fmt.replace(/'([^']*)'/g, '$1').replace('yyyy', String(d.getUTCFullYear()))
          .replace('MM', p(d.getUTCMonth() + 1)).replace('dd', p(d.getUTCDate()))
          .replace('HH', p(d.getUTCHours())).replace('mm', p(d.getUTCMinutes()));
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: noop, releaseLock: noop }) },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    ScriptApp: { getOAuthToken: () => 'script-oauth-token' },
    Logger: { log: noop },
    console: { log: noop, warn: noop, error: noop, info: noop, time: noop, timeEnd: noop },
    ...opts.globals,
  };

  vm.createContext(sandbox);
  // `const CONFIG` is lexical, so expose it explicitly for tests.
  vm.runInContext(SOURCE + '\n;this.CONFIG = CONFIG;', sandbox, { filename: 'Code.gs' });
  return sandbox;
}

// Builds entries whose JSON is exactly `bytes` long (ASCII), padding the last one's `pad` string.
export function fillTo<T>(make: (i: number, pad: string) => T, bytes: number): T[] {
  const arr: T[] = [];
  while (JSON.stringify([...arr, make(arr.length, '')]).length <= bytes) arr.push(make(arr.length, ''));
  arr[arr.length - 1] = make(arr.length - 1, 'x'.repeat(bytes - JSON.stringify(arr).length));
  return arr;
}
