// Delete all test expert users. A test user is any users row with
// role='expert' whose name starts with "Test Expert".
//
// Their trial_assignments and annotations cascade (ON DELETE CASCADE).
// Loose user-id references on other tables (test_reviewed_by, decided_by,
// built_by_reviewer_id, edited_by_user_id) are nulled out first so the
// DELETE doesn't trip an FK constraint.
//
//   npm run remove-test-users

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

    const users = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE role = 'expert' AND name LIKE 'Test Expert%' ORDER BY name`,
    );
    if (users.rowCount === 0) {
      console.log('No test users found.');
      await client.query('COMMIT');
      return;
    }
    console.log(`Found ${users.rowCount} test users:`);
    for (const u of users.rows) console.log(`  ${u.name} (${u.id})`);

    const ids = users.rows.map((u) => u.id);

    // Pre-delete counts.
    const a = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM trial_assignments WHERE expert_id = ANY($1)`,
      [ids],
    );
    const n = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM annotations WHERE expert_id = ANY($1)`,
      [ids],
    );
    console.log(`  cascading: ${a.rows[0].n} assignments, ${n.rows[0].n} annotations`);

    // Null out loose references to these users so the user DELETE can proceed.
    const tr = await client.query(
      `UPDATE trial_assignments SET test_reviewed_by = NULL WHERE test_reviewed_by = ANY($1)`,
      [ids],
    );
    const adj = await client.query(
      `UPDATE trial_adjudications SET decided_by = NULL WHERE decided_by = ANY($1)`,
      [ids],
    );
    const rk = await client.query(
      `UPDATE reference_keys SET built_by_reviewer_id = NULL WHERE built_by_reviewer_id = ANY($1)`,
      [ids],
    );
    const ag = await client.query(
      `UPDATE annotation_guide SET edited_by_user_id = NULL WHERE edited_by_user_id = ANY($1)`,
      [ids],
    );
    console.log(`  nulled refs: ${tr.rowCount} test_reviewed_by, ${adj.rowCount} decided_by, ${rk.rowCount} built_by_reviewer_id, ${ag.rowCount} edited_by_user_id`);

    const del = await client.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    console.log(`Deleted ${del.rowCount} users.`);

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
