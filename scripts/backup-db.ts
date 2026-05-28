// Dump every table to a single timestamped JSON file in /backups.
// Run any time you want a safety snapshot — before risky operations,
// after major reviewer activity, etc.
//
//   npm run backup
//
// Restore: there's no automated restore script (it's tricky with foreign
// keys). Use Neon's point-in-time restore for accidents, or hand-craft
// SQL INSERTs from the JSON for surgical recovery.

import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { Pool } from 'pg';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TABLES = [
  'users',
  'schema_versions',
  'qualification_sets',
  'qualification_trials',
  'reference_keys',
  'qualification_attempts',
  'annotation_guide',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in .env.local');
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const data: Record<string, unknown> = {
    backed_up_at: new Date().toISOString(),
    database_host: new URL(url).host,
    tables: {},
  };

  let totalRows = 0;
  for (const table of TABLES) {
    const res = await pool.query(`SELECT * FROM ${table}`);
    (data.tables as Record<string, unknown[]>)[table] = res.rows;
    totalRows += res.rowCount ?? 0;
    console.log(`  ${table}: ${res.rowCount} rows`);
  }
  await pool.end();

  const backupDir = join(process.cwd(), 'backups');
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = join(backupDir, `${stamp}.json`);
  writeFileSync(filename, JSON.stringify(data, null, 2));

  console.log(`\nBackup written: ${filename}`);
  console.log(`Total rows: ${totalRows}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
