/**
 * Stamps license headers on all .ts and .tsx source files.
 * Reads the header template from scripts/license-header.txt.
 *
 * Usage:
 *   node scripts/add-license-headers.mjs          # Stamp all files
 *   node scripts/add-license-headers.mjs --check   # Check only, exit 1 if any missing
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const headerTemplate = readFileSync(join(__dirname, 'license-header.txt'), 'utf8').trimEnd();
const headerLines = headerTemplate.split('\n');
const headerBlock = headerTemplate + '\n\n';

const checkOnly = process.argv.includes('--check');

const IGNORE_DIRS = ['node_modules', 'dist', 'generated', 'coverage', '.next', 'build', '.turbo'];

async function getSourceFiles() {
  const files = [];
  for await (const entry of glob('packages/**/*.{ts,tsx}', { cwd: root })) {
    const full = join(root, entry);
    if (IGNORE_DIRS.some((dir) => full.includes(`/${dir}/`))) continue;
    files.push(full);
  }
  return files.sort();
}

function fileHasHeader(content) {
  for (const line of headerLines) {
    if (!content.includes(line)) return false;
  }
  return true;
}

function addHeader(content) {
  // Strip existing header if present but outdated
  const lines = content.split('\n');
  let startIndex = 0;

  // Skip shebang
  if (lines[0]?.startsWith('#!')) {
    startIndex = 1;
  }

  // Skip leading blank lines
  while (startIndex < lines.length && lines[startIndex].trim() === '') {
    startIndex++;
  }

  if (startIndex === 0) {
    return headerBlock + content;
  }

  const before = lines.slice(0, startIndex).join('\n');
  const after = lines.slice(startIndex).join('\n');
  return before + '\n' + headerBlock + after;
}

async function main() {
  const files = await getSourceFiles();
  let missing = 0;
  let stamped = 0;

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    if (fileHasHeader(content)) continue;

    missing++;
    const rel = file.replace(root + '/', '');

    if (checkOnly) {
      console.log(`MISSING: ${rel}`);
    } else {
      const updated = addHeader(content);
      writeFileSync(file, updated, 'utf8');
      stamped++;
    }
  }

  console.log(`\nScanned ${files.length} files.`);

  if (checkOnly) {
    if (missing > 0) {
      console.log(`${missing} files missing license header.`);
      process.exit(1);
    }
    console.log('All files have license headers.');
  } else {
    console.log(`${stamped} files stamped with license header.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
