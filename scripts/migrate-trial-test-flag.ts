// One-off migration: add trials.is_test_trial and backfill it.
//
//   npm run migrate-trial-test-flag
//
// Steps:
//   1. ALTER TABLE trials ADD COLUMN IF NOT EXISTS is_test_trial BOOLEAN NOT NULL DEFAULT FALSE
//   2. Backfill trials.is_test_trial = TRUE for any trial that currently has
//      at least one trial_assignments row with is_test_trial = TRUE.
//   3. Explicitly mark trials whose assignments were already cascade-deleted
//      (i.e., we have no signal left) but that we still know are test trials.
//
// Idempotent.

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';

// Trials known to be test trials but with no current is_test_trial=TRUE
// assignments (assignments were cascade-deleted when test users were removed).
const KNOWN_TEST_TRIALS = ['NCT03511664', 'NCT03391466'];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE trials ADD COLUMN IF NOT EXISTS is_test_trial BOOLEAN NOT NULL DEFAULT FALSE`);
    console.log('Column ensured.');

    const fromAssignments = await client.query(`
      UPDATE trials t SET is_test_trial = TRUE
       WHERE NOT t.is_test_trial
         AND EXISTS (
           SELECT 1 FROM trial_assignments a
            WHERE a.nct_id = t.nct_id AND a.is_test_trial = TRUE
         )
    `);
    console.log(`Backfilled ${fromAssignments.rowCount} trials from assignments.`);

    const explicit = await client.query(
      `UPDATE trials SET is_test_trial = TRUE WHERE nct_id = ANY($1) AND NOT is_test_trial`,
      [KNOWN_TEST_TRIALS],
    );
    console.log(`Explicitly marked ${explicit.rowCount} known test trials.`);

    const summary = await client.query<{ nct_id: string; is_test_trial: boolean; brief_title: string }>(
      `SELECT nct_id, is_test_trial, brief_title FROM trials ORDER BY position`,
    );
    console.log('\nFinal state:');
    for (const r of summary.rows) {
      console.log(`  ${r.nct_id}  is_test=${r.is_test_trial}  ${r.brief_title.slice(0, 60)}`);
    }

    await client.query('COMMIT');
    console.log('\nDone.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
