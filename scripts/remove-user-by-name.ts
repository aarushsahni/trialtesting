// Remove a single user account by exact name match. Cascades trial_assignments
// and annotations; nulls user-id references on reviewer-bookkeeping tables.
//
// Edit USER_NAME below and re-run as needed.
//
//   npm run remove-user-by-name

import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { Pool } from 'pg';

const USER_NAME = 'Test';

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

    const u = await client.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE name = $1`,
      [USER_NAME],
    );
    if (u.rowCount === 0) {
      console.log(`No user named "${USER_NAME}" found.`);
      await client.query('COMMIT');
      return;
    }
    const ids = u.rows.map((r) => r.id);
    console.log(`Removing ${u.rowCount} user(s) named "${USER_NAME}": role=${u.rows[0].role}`);

    const a = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM trial_assignments WHERE expert_id = ANY($1)`,
      [ids],
    );
    const n = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM annotations WHERE expert_id = ANY($1)`,
      [ids],
    );
    console.log(`  cascading: ${a.rows[0].n} assignments, ${n.rows[0].n} annotations`);

    await client.query(`UPDATE trial_assignments SET test_reviewed_by = NULL WHERE test_reviewed_by = ANY($1)`, [ids]);
    await client.query(`UPDATE trial_adjudications SET decided_by = NULL WHERE decided_by = ANY($1)`, [ids]);
    await client.query(`UPDATE reference_keys SET built_by_reviewer_id = NULL WHERE built_by_reviewer_id = ANY($1)`, [ids]);
    await client.query(`UPDATE annotation_guide SET edited_by_user_id = NULL WHERE edited_by_user_id = ANY($1)`, [ids]);

    const del = await client.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    console.log(`Deleted ${del.rowCount} user(s).`);

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

main().catch((e) => { console.error(e); process.exit(1); });
