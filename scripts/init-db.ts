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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('reviewer', 'expert')),
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

  // Single global trial catalog. Annotation is fully manual — no AI prefill.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trials (
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
      assigned_cancer_types TEXT[] NOT NULL,
      schema_version_id UUID REFERENCES schema_versions(id),
      position INT NOT NULL DEFAULT 0,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS trials_position_idx ON trials(position, nct_id)`);
  // Drop the legacy ai_answers column on existing DBs.
  await pool.query(`ALTER TABLE trials DROP COLUMN IF EXISTS ai_answers`);

  // Per-expert pool. Test trials are the gate that locks the rest.
  // test_reviewed_at flips when the reviewer marks the expert's submission
  // for that test trial reviewed; unlock for the expert is derived from the
  // absence of any unreviewed test-trial assignment.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trial_assignments (
      expert_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nct_id TEXT NOT NULL REFERENCES trials(nct_id) ON DELETE CASCADE,
      is_test_trial BOOLEAN NOT NULL DEFAULT FALSE,
      test_reviewed_at TIMESTAMPTZ,
      test_reviewed_by UUID REFERENCES users(id),
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (expert_id, nct_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS trial_assignments_expert_idx ON trial_assignments(expert_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS trial_assignments_nct_idx ON trial_assignments(nct_id)`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS trial_assignments_pending_test_idx
      ON trial_assignments(expert_id)
      WHERE is_test_trial = TRUE AND test_reviewed_at IS NULL
  `);

  // Trial-centric annotations. One row per (trial, expert). cohort_map is the
  // reviewer's mapping from expert cohortKey → reference cohortKey for test
  // trials — applied before scoring so that the expert and reviewer can name
  // cohorts independently. score_data is populated at submit time and
  // recomputed whenever the cohort_map changes.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS annotations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nct_id TEXT NOT NULL REFERENCES trials(nct_id) ON DELETE CASCADE,
      expert_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      schema_version_id UUID REFERENCES schema_versions(id),
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT NOT NULL DEFAULT '',
      flags JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted')),
      cohort_map JSONB NOT NULL DEFAULT '{}'::jsonb,
      score_data JSONB,
      scored_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (nct_id, expert_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS annotations_expert_idx ON annotations(expert_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS annotations_nct_idx ON annotations(nct_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS annotations_status_idx ON annotations(status)`);
  // Backfill: add cohort_map on existing DBs.
  await pool.query(`ALTER TABLE annotations ADD COLUMN IF NOT EXISTS cohort_map JSONB NOT NULL DEFAULT '{}'::jsonb`);

  // Reviewer ground truth per trial (re-keyed to nct_id; no set scoping).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reference_keys (
      nct_id TEXT PRIMARY KEY REFERENCES trials(nct_id) ON DELETE CASCADE,
      schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
      key_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT NOT NULL DEFAULT '',
      flags JSONB NOT NULL DEFAULT '{}'::jsonb,
      complete BOOLEAN NOT NULL DEFAULT FALSE,
      built_by_reviewer_id UUID REFERENCES users(id),
      built_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Per-field reviewer adjudication for non-test annotations (replaces
  // corpus_adjudications). Trial-level fields use the sentinel '__TRIAL__'
  // (TRIAL_LEVEL_SENTINEL in src/lib/types.ts) for both cohort_key and
  // cancer_type. final_value wraps the FieldValue as {"v": ...} so JSON null
  // is distinguishable from SQL NULL.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trial_adjudications (
      nct_id TEXT NOT NULL REFERENCES trials(nct_id) ON DELETE CASCADE,
      cohort_key TEXT NOT NULL,
      cancer_type TEXT NOT NULL,
      field_key TEXT NOT NULL,
      final_value JSONB NOT NULL,
      decided_by UUID REFERENCES users(id),
      decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (nct_id, cohort_key, cancer_type, field_key)
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

  // Seed the annotation guide — only if no row exists yet.
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
