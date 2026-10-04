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

  it('accepts a script ID with hyphens and underscores', () => {
    const sid = 'Ab-_Cd0123456789Ab-_Cd01';
    expect(decodeConnectionCode(encode({ v: 1, url: URL, scriptId: sid }))).toEqual({ url: URL, scriptId: sid });
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
    ['scriptId with path characters', encode({ v: 1, url: URL, scriptId: '../../projects/xxxxxxxxxxxxxxxx' })],
    ['scriptId with spaces', encode({ v: 1, url: URL, scriptId: 'a'.repeat(19) + ' b' })],
  ])('rejects %s', (_label, code) => {
    expect(decodeConnectionCode(code)).toBeNull();
  });
});
