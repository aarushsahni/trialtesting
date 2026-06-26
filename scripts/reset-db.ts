// ⚠️ DESTRUCTIVE: drops every table and recreates schema from scratch.
// Requires --force flag to actually run.
//
//   npm run reset-db -- --force
//
// Always run `npm run backup` first if you might want any of the data back.

import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { Pool } from 'pg';
import { spawn } from 'node:child_process';

// Drop order is FK-safe given CASCADE: leaves go first, roots last.
const TABLES = [
  // legacy tables — kept here so reset-db continues to clean up old DBs
  'corpus_adjudications',
  'corpus_reviews',
  'corpus_trials',
  'qualification_attempts',
  'qualification_sets',
  'qualification_trials',
  // current schema
  'trial_adjudications',
  'annotations',
  'reference_keys',
  'trial_assignments',
  'trials',
  'annotation_guide',
  'schema_versions',
  'users',
];

async function main() {
  if (!process.argv.includes('--force')) {
    console.error(`
⚠️  reset-db is DESTRUCTIVE — it drops every table.

To actually run this:
  npm run reset-db -- --force

Strongly recommend running 'npm run backup' first.
`.trim() + '\n');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in .env.local');
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  console.log('Dropping tables...');
  for (const t of TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    console.log(`  dropped ${t}`);
  }
  await pool.end();

  console.log('\nRunning init-db to recreate schema...');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['run', 'init-db'], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`init-db exited ${code}`))));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
