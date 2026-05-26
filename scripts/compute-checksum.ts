import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CODEGS_PATH = resolve(__dirname, '../apps-script/Code.gs');

function computeChecksum(content: string): string {
  const lines = content.split('\n');
  const filtered = lines.filter(line => !line.includes('SCRIPT_INTEGRITY'));
  return createHash('sha256').update(filtered.join('\n')).digest('hex');
}

function main() {
  const content = readFileSync(CODEGS_PATH, 'utf-8');
  const hash = computeChecksum(content);

  const updated = content.replace(
    /(SCRIPT_INTEGRITY\s*=\s*')([^']*)(')/,
    `$1${hash}$3`
  );

  if (updated === content) {
    console.error('ERROR: Could not find SCRIPT_INTEGRITY constant in Code.gs');
    process.exit(1);
  }

  writeFileSync(CODEGS_PATH, updated, 'utf-8');
  console.log(`Checksum updated: ${hash}`);
}

main();
