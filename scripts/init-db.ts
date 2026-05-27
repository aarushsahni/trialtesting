// Initialize the v2 database. Drops old tables (users, reviews) from the
// previous app version and creates the qualification-phase schema.
//   npm run init-db
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
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

  console.log('Dropping any existing tables (v1 or v2 from a prior init)...');
  await pool.query(`DROP TABLE IF EXISTS qualification_attempts CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS reference_keys CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS qualification_sets CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS qualification_trials CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS schema_versions CASCADE`);
  await pool.query(`DROP TABLE IF EXISTS reviews CASCADE`); // v1
  await pool.query(`DROP TABLE IF EXISTS users CASCADE`);

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  console.log('Creating v2 tables...');

  // Users: roles are 'annotator' (builds reference key, passkey-gated)
  //        or 'reviewer' (takes the test, open signup).
  // dob_hash: bcrypt-hashed date of birth, used as the "password".
  await pool.query(`
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('annotator', 'reviewer')),
      dob_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // schema_versions: every reference key + attempt is stamped with one of these.
  // schema_json contains the SECTION_DEFS-equivalent so we know the exact field
  // shapes that were in effect at the time.
  await pool.query(`
    CREATE TABLE schema_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      version_tag TEXT NOT NULL UNIQUE,
      schema_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // qualification_sets: a named collection of trials.
  // Once locked_at is set, the set is frozen — no more edits to the reference
  // key. Reviewers can only take a locked set.
  await pool.query(`
    CREATE TABLE qualification_sets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
      trial_nct_ids TEXT[] NOT NULL,
      locked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // qualification_trials: the underlying trial text from CT.gov. Fetched once.
  // Keyed by NCT ID; same trial can be referenced from multiple sets.
  await pool.query(`
    CREATE TABLE qualification_trials (
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

  // reference_keys: the "correct" answer per trial, built by an annotator.
  // key_data shape: { basic: { field: value }, descriptors: { block: { field: value } } }
  await pool.query(`
    CREATE TABLE reference_keys (
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

  // qualification_attempts: a reviewer's single attempt at a qualification set.
  // answers shape mirrors key_data.
  // score_data shape: { overall_f1, hard_exclude_f1, null_vs_value_f1, per_field: {...} }
  // status: in_progress | submitted | passed | failed
  await pool.query(`
    CREATE TABLE qualification_attempts (
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

  console.log('v2 DB ready: users, schema_versions, qualification_sets, qualification_trials, reference_keys, qualification_attempts');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
