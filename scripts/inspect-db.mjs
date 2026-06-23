// One-off read-only inspection. Lists tables, row counts, and the column
// signatures of the tables most affected by the schema refactor.
// Run with:  node scripts/inspect-db.mjs
import { config } from 'dotenv';
config({ path: '.env.local' });
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set in .env.local');
  process.exit(1);
}
const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const tables = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' ORDER BY table_name
`);
console.log('Tables:');
console.log('  ' + (tables.rows.map(r => r.table_name).join(', ') || '(none)'));
console.log();

console.log('Row counts:');
for (const { table_name } of tables.rows) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table_name}"`);
    console.log(`  ${table_name.padEnd(28)} ${r.rows[0].n}`);
  } catch (e) {
    console.log(`  ${table_name.padEnd(28)} error: ${e.message}`);
  }
}
console.log();

// Column names for new core tables
const colQ = `
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = $1
  ORDER BY ordinal_position
`;
for (const t of ['trials', 'trial_assignments', 'annotations', 'reference_keys', 'trial_adjudications']) {
  try {
    const r = await pool.query(colQ, [t]);
    if (r.rows.length === 0) {
      console.log(`${t}: (table not present)`);
    } else {
      console.log(`${t} columns:`);
      console.log('  ' + r.rows.map(x => x.column_name).join(', '));
    }
  } catch (e) {
    console.log(`${t}: error ${e.message}`);
  }
}
console.log();

// PK of trial_adjudications
try {
  const r = await pool.query(`
    SELECT a.attname AS col
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.trial_adjudications'::regclass AND i.indisprimary
    ORDER BY array_position(i.indkey::int[], a.attnum)
  `);
  console.log('trial_adjudications PK columns:', r.rows.map(x => x.col).join(', ') || '(none)');
} catch (e) {
  console.log('trial_adjudications PK lookup:', e.message);
}

await pool.end();
