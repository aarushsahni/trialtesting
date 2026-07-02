// One-off migration: add annotations.highlights (JSONB, default '{}').
// Backfills nothing — new column defaults to empty object for existing rows.
//
//   npm run migrate-add-highlights

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

  await pool.query(`
    ALTER TABLE annotations
      ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
  console.log('Migration complete: annotations.highlights ready.');

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
