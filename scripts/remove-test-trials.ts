// Surgically remove specific test trials (and their assignments / annotations /
// reference keys / adjudications via ON DELETE CASCADE) from the corpus.
// Edit REMOVE_NCTS below and re-run as needed.
//
//   npm run remove-test-trials

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';

const REMOVE_NCTS = [
  'NCT03901339',  // TROPiCS-02 (BREAST)
  'NCT03275285',  // IKEMA (PLASMA_CELL)
];

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

    for (const nctId of REMOVE_NCTS) {
      const existing = await client.query<{ nct_id: string; brief_title: string }>(
        `SELECT nct_id, brief_title FROM trials WHERE nct_id = $1`,
        [nctId],
      );
      if (existing.rowCount === 0) {
        console.log(`  ${nctId}: not in trials — skipping`);
        continue;
      }
      console.log(`  ${nctId}: ${existing.rows[0].brief_title.slice(0, 70)}`);

      // Pre-delete counts for visibility.
      const assignmentCount = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM trial_assignments WHERE nct_id = $1`,
        [nctId],
      );
      const annotationCount = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM annotations WHERE nct_id = $1`,
        [nctId],
      );
      console.log(`    will cascade: ${assignmentCount.rows[0].n} assignments, ${annotationCount.rows[0].n} annotations`);

      const del = await client.query(`DELETE FROM trials WHERE nct_id = $1`, [nctId]);
      console.log(`    deleted (${del.rowCount} row).`);
    }

    await client.query('COMMIT');
    console.log('\nDone. Remaining trials and assignments untouched.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
