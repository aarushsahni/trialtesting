// One-off migration: rename users.dob_hash → users.password_hash.
// Existing bcrypt hashes still validate (just renamed); users can keep using
// their old DOB string as the password until they change it from /account.
//
//   npm run migrate-password-column

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

  const result = await pool.query(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='dob_hash')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash')
      THEN
        ALTER TABLE users RENAME COLUMN dob_hash TO password_hash;
        RAISE NOTICE 'Renamed users.dob_hash → password_hash';
      ELSE
        RAISE NOTICE 'No rename needed.';
      END IF;
    END $$;
  `);
  console.log('Migration complete.');

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
