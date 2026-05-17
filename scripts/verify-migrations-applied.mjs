#!/usr/bin/env node
/**
 * Verify every SQL file in packages/database/src/migrations is recorded in
 * drizzle.__drizzle_migrations on the connected database. Exits non-zero if
 * any file is missing, so the migrate Docker container fails loud and
 * docker-compose's `service_completed_successfully` blocks dependent
 * services from starting against a stale schema.
 *
 * This catches the silent-skip footgun where drizzle-kit's migrator returns
 * "applied successfully" but actually skipped a migration whose journal
 * `when` was less than the latest applied row's created_at.
 *
 * Usage (run from packages/database/, where postgres is in node_modules):
 *   node ../../scripts/verify-migrations-applied.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'packages/database/src/migrations');

// Load .env if it exists so this script behaves like every other dev command
// (drizzle-kit handles it via its own config; this script previously errored
// out with "DATABASE_URL not set" on shells that hadn't `source`d the file).
const ENV_FILE = join(REPO_ROOT, '.env');
if (existsSync(ENV_FILE)) {
  const text = readFileSync(ENV_FILE, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m == null) continue;
    const key = m[1];
    let value = m[2].trim();
    if (value.startsWith('#')) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Fall back to the dev default that matches drizzle.config.ts so a fresh
// clone with neither shell env nor .env entry still verifies.
const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://evtivity:evtivity@localhost:5433/evtivity';

const sqlFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const expected = sqlFiles.map((f) => {
  const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
  return { tag: f.replace(/\.sql$/, ''), hash: createHash('sha256').update(sql).digest('hex') };
});

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const rows = await sql`
    SELECT hash FROM drizzle.__drizzle_migrations
  `;
  const applied = new Set(rows.map((r) => r.hash));
  const missing = expected.filter((e) => !applied.has(e.hash));

  if (missing.length > 0) {
    console.error(`verify-migrations-applied: ${missing.length} migration(s) NOT applied:`);
    for (const m of missing) console.error(`  - ${m.tag} (sha256 ${m.hash.slice(0, 12)}...)`);
    console.error(
      `\nThe migrate command reported success but these files were silently skipped. ` +
        `Most common cause: a journal entry whose 'when' is less than the latest applied ` +
        `row's created_at. Run 'node scripts/check-migrations.mjs' to see which.`,
    );
    process.exit(1);
  }

  console.log(
    `verify-migrations-applied OK: ${expected.length} files all present in __drizzle_migrations`,
  );
} finally {
  await sql.end();
}
