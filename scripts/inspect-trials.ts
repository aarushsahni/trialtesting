import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL!;
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
  });
  const t = await pool.query<{ nct_id: string; brief_title: string; position: number }>(
    `SELECT nct_id, brief_title, position FROM trials ORDER BY position`,
  );
  console.log(`trials: ${t.rowCount}`);
  for (const r of t.rows) console.log(`  ${r.nct_id} (pos ${r.position}) ${r.brief_title.slice(0, 70)}`);
  const a = await pool.query<{ nct_id: string; is_test_trial: boolean; n: string }>(
    `SELECT nct_id, is_test_trial, COUNT(*)::text AS n FROM trial_assignments GROUP BY nct_id, is_test_trial ORDER BY nct_id`,
  );
  console.log(`assignments per (trial, is_test): ${a.rowCount}`);
  for (const r of a.rows) console.log(`  ${r.nct_id} test=${r.is_test_trial}: ${r.n}`);
  const u = await pool.query<{ name: string; role: string }>(
    `SELECT name, role FROM users ORDER BY role, name`,
  );
  console.log(`users: ${u.rowCount}`);
  for (const r of u.rows) console.log(`  ${r.name} (${r.role})`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
