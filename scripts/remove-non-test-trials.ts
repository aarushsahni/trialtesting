// Delete every trial that is NOT a test trial. A trial counts as a test
// trial if at least one trial_assignments row has is_test_trial=TRUE for it.
// All non-test trials are deleted, cascading to their assignments,
// annotations, reference keys, and adjudications.
//
//   npm run remove-non-test-trials

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';

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

    // Show what we'll keep.
    const keep = await client.query<{ nct_id: string; brief_title: string }>(`
      SELECT t.nct_id, t.brief_title
        FROM trials t
       WHERE EXISTS (
         SELECT 1 FROM trial_assignments a
          WHERE a.nct_id = t.nct_id AND a.is_test_trial = TRUE
       )
       ORDER BY t.position
    `);
    console.log(`Keeping ${keep.rowCount} test trials:`);
    for (const r of keep.rows) {
      console.log(`  ${r.nct_id}  ${r.brief_title.slice(0, 80)}`);
    }

    // Show what we'll delete.
    const drop = await client.query<{ nct_id: string; brief_title: string; assignment_count: string; annotation_count: string }>(`
      SELECT t.nct_id, t.brief_title,
             (SELECT COUNT(*)::text FROM trial_assignments a WHERE a.nct_id = t.nct_id) AS assignment_count,
             (SELECT COUNT(*)::text FROM annotations         n WHERE n.nct_id = t.nct_id) AS annotation_count
        FROM trials t
       WHERE NOT EXISTS (
         SELECT 1 FROM trial_assignments a
          WHERE a.nct_id = t.nct_id AND a.is_test_trial = TRUE
       )
       ORDER BY t.position
    `);
    console.log(`\nDeleting ${drop.rowCount} non-test trials:`);
    for (const r of drop.rows) {
      console.log(`  ${r.nct_id}  (${r.assignment_count} assigns, ${r.annotation_count} annotations)  ${r.brief_title.slice(0, 60)}`);
    }

    if (drop.rowCount && drop.rowCount > 0) {
      const del = await client.query(`
        DELETE FROM trials
         WHERE NOT EXISTS (
           SELECT 1 FROM trial_assignments a
            WHERE a.nct_id = trials.nct_id AND a.is_test_trial = TRUE
         )
      `);
      console.log(`\nDeleted ${del.rowCount} trials.`);
    }

    await client.query('COMMIT');
    console.log('Done.');
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
