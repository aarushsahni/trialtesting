// Run once after setting DATABASE_URL: npm run init-db
import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // also fall back to .env
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set in .env.local');
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nct_id TEXT NOT NULL,
      reviewed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, nct_id)
    )
  `);

  console.log('DB ready: users, reviews');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
