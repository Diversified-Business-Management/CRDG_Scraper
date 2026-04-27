#!/usr/bin/env node
// Apply all migrations in supabase/migrations/ to the configured Supabase DB.
// Usage: node scripts/db-push.mjs [--dry] [--file <path>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function loadEnv() {
  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(process.env.HOME || '', 'crdg-secrets.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

loadEnv();

const dryRun = process.argv.includes('--dry');
const fileArg = process.argv.indexOf('--file');
const onlyFile = fileArg >= 0 ? process.argv[fileArg + 1] : null;

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('SUPABASE_DB_URL is not set. Add it to .env or ~/crdg-secrets.env');
  process.exit(1);
}

const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const toRun = onlyFile ? files.filter(f => f.endsWith(onlyFile)) : files;

console.log(`db-push: ${toRun.length} migration(s) to apply${dryRun ? ' (dry run)' : ''}`);

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(`
    create table if not exists _migrations (
      filename text primary key,
      applied_at timestamptz default now()
    )
  `);

  for (const f of toRun) {
    const { rowCount } = await client.query('select 1 from _migrations where filename = $1', [f]);
    if (rowCount > 0) {
      console.log(`  skip   ${f} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    if (dryRun) {
      console.log(`  dry    ${f} (${sql.length} bytes)`);
      continue;
    }
    process.stdout.write(`  apply  ${f} ... `);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into _migrations (filename) values ($1)', [f]);
      await client.query('commit');
      console.log('OK');
    } catch (e) {
      await client.query('rollback');
      console.log('FAIL');
      console.error(e.message);
      process.exit(1);
    }
  }
  console.log('db-push: done');
} finally {
  await client.end();
}
