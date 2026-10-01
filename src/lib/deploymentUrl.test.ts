import { describe, it, expect } from 'vitest';
import { isAppsScriptExecUrl } from './deploymentUrl';

describe('isAppsScriptExecUrl', () => {
  it.each([
    'https://script.google.com/macros/s/AKfycbx-_123/exec',
    'https://script.google.com/macros/s/AKfycbx/dev',
    'https://script.google.com/a/macros/example.com/s/AKfycbx/exec',
    'https://script.google.com/macros/s/AKfycbx/exec?foo=bar',
    'https://script.google.com/macros/s/AKfycbx/exec#hash',
  ])('accepts %s', (url) => {
    expect(isAppsScriptExecUrl(url)).toBe(true);
  });

  it.each([
    ['http scheme', 'http://script.google.com/macros/s/AKfycbx/exec'],
    ['look-alike suffix host', 'https://script.google.com.evil.example/macros/s/AKfycbx/exec'],
    ['host in path', 'https://evil.example/script.google.com/macros/s/x/exec'],
    ['userinfo trick', 'https://script.google.com@evil.example/macros/s/x/exec'],
    ['userinfo on real host', 'https://user:pw@script.google.com/macros/s/x/exec'],
    ['prefix host', 'https://xscript.google.com/macros/s/x/exec'],
    ['non-default port', 'https://script.google.com:8443/macros/s/x/exec'],
    ['wrong path', 'https://script.google.com/home/projects/abc/edit'],
    ['missing id', 'https://script.google.com/macros/s//exec'],
    ['trailing slash', 'https://script.google.com/macros/s/x/exec/'],
    ['trailing junk', 'https://script.google.com/macros/s/x/exec/evil'],
    ['junk suffix', 'https://script.google.com/macros/s/x/execute'],
    ['empty string', ''],
    ['garbage', 'not a url at all'],
  ])('rejects %s', (_label, url) => {
    expect(isAppsScriptExecUrl(url)).toBe(false);
  });
});
