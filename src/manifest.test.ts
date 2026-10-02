import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

// The OAuth client (Chrome extension type) accepts exactly one Item ID.
// Changing or removing `key` changes the extension ID and breaks sign-in.
const EXPECTED_EXTENSION_ID = 'mbbmbndohpgkigldmbpbilfcimbpkkje';

function extensionIdFromKey(key: string): string {
  const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

describe('public/manifest.json', () => {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../public/manifest.json'), 'utf-8'));

  it('pins the extension ID with a fixed key', () => {
    expect(typeof manifest.key).toBe('string');
    expect(extensionIdFromKey(manifest.key)).toBe(EXPECTED_EXTENSION_ID);
  });
});
