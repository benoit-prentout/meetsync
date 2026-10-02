import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function computeChecksum(content: string): string {
  const lines = content.split('\n');
  const filtered = lines.filter(line => !/SCRIPT_INTEGRITY\s*=/.test(line));
  return createHash('sha256').update(filtered.join('\n')).digest('hex');
}

describe('computeChecksum', () => {
  it('returns a 64-character hex string', () => {
    const hash = computeChecksum('var x = 1;\n');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('excludes SCRIPT_INTEGRITY line from hash', () => {
    const content = 'var SCRIPT_INTEGRITY = "abc";\nfunction foo() { return 1; }';
    const hash = computeChecksum(content);

    const withoutLine = 'function foo() { return 1; }';
    const expectedHash = createHash('sha256').update(withoutLine).digest('hex');
    expect(hash).toBe(expectedHash);
  });

  it('produces different hash for different content', () => {
    const hash1 = computeChecksum('var x = 1;');
    const hash2 = computeChecksum('var x = 2;');
    expect(hash1).not.toBe(hash2);
  });

  it('is idempotent for same input', () => {
    const content = 'var x = 1;\nvar SCRIPT_INTEGRITY = "placeholder";\nvar y = 2;';
    expect(computeChecksum(content)).toBe(computeChecksum(content));
  });
});

describe('apps-script/Code.gs', () => {
  it('has an up-to-date SCRIPT_INTEGRITY (run `npm run update:checksum` after editing Code.gs)', () => {
    const content = readFileSync(resolve(__dirname, '../apps-script/Code.gs'), 'utf-8');
    const stored = /SCRIPT_INTEGRITY\s*=\s*'([^']*)'/.exec(content)?.[1];
    expect(stored).toBe(computeChecksum(content));
  });
});
