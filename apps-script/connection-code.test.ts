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
