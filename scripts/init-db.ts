// Initialize the database. SAFE: idempotent — uses CREATE TABLE IF NOT
// EXISTS + ADD COLUMN IF NOT EXISTS. Re-running on an existing DB is a
// no-op for existing data.
//
//   npm run init-db
//
// To wipe and start over from scratch, use `npm run reset-db -- --force`.

import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

  // ────────────────────────────────────────────────────────────────────
  // CREATE TABLE IF NOT EXISTS — current schema in full
  // ────────────────────────────────────────────────────────────────────

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('annotator', 'reviewer')),
      dob_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      version_tag TEXT NOT NULL UNIQUE,
      schema_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qualification_sets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
      trial_nct_ids TEXT[] NOT NULL,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qualification_trials (
      nct_id TEXT PRIMARY KEY,
      brief_title TEXT NOT NULL,
      brief_summary TEXT,
      detailed_description TEXT,
      eligibility_raw TEXT,
      conditions TEXT[] NOT NULL DEFAULT '{}',
      interventions TEXT[] NOT NULL DEFAULT '{}',
      ctgov_sex TEXT,
      ctgov_min_age TEXT,
      ctgov_max_age TEXT,
      overall_status TEXT,
      study_type TEXT,
      phases TEXT[],
      assigned_blocks TEXT[] NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reference_keys (
      qualification_set_id UUID NOT NULL REFERENCES qualification_sets(id) ON DELETE CASCADE,
      nct_id TEXT NOT NULL REFERENCES qualification_trials(nct_id),
      schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
      key_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT NOT NULL DEFAULT '',
      flags JSONB NOT NULL DEFAULT '{}'::jsonb,
      complete BOOLEAN NOT NULL DEFAULT FALSE,
      built_by_annotator_id UUID REFERENCES users(id),
      built_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (qualification_set_id, nct_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qualification_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      qualification_set_id UUID NOT NULL REFERENCES qualification_sets(id) ON DELETE CASCADE,
      schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      per_trial_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      completed_nct_ids TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted', 'passed', 'failed')),
      score_data JSONB,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      UNIQUE (reviewer_id, qualification_set_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS annotation_guide (
      id INT PRIMARY KEY DEFAULT 0 CHECK (id = 0),
      markdown TEXT NOT NULL,
      edited_by_user_id UUID REFERENCES users(id),
      edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // ────────────────────────────────────────────────────────────────────
  // ADD COLUMN IF NOT EXISTS — for forward compatibility when schemas
  // evolve. Keep these in sync with new columns added in CREATE TABLE
  // above. Existing data is preserved; defaults backfill new columns.
  // ────────────────────────────────────────────────────────────────────

  // (no pending column additions — current schema baked into CREATE above)

  // ────────────────────────────────────────────────────────────────────
  // Seed the annotation guide — only if no row exists yet.
  // Preserves any edits made via the UI on existing DBs.
  // ────────────────────────────────────────────────────────────────────

  const seedPath = join(process.cwd(), 'src/lib/annotation-guide.md');
  const seedMarkdown = readFileSync(seedPath, 'utf8');
  const result = await pool.query(
    `INSERT INTO annotation_guide (id, markdown) VALUES (0, $1)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [seedMarkdown],
  );
  if (result.rowCount && result.rowCount > 0) {
    console.log(`Seeded annotation_guide from ${seedPath} (${seedMarkdown.length} chars)`);
  } else {
    console.log('annotation_guide already has a row — leaving as-is');
  }

  console.log('init-db done. All tables present, no data dropped.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
