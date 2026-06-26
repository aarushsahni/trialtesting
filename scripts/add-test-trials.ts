// Surgically add new test trials to the existing corpus. Does NOT touch
// existing trials, assignments, annotations, reference keys, or adjudications.
//
//   npm run add-test-trials
//
// Per (newNct + cancerType) entry, in one transaction:
//   1. Fetches the trial from CT.gov.
//   2. INSERTs into trials at the next available position, using the same
//      schema_version_id as the existing trials.
//   3. Finds the current test-expert set (users who already have at least
//      one is_test_trial=TRUE assignment) and creates an is_test_trial=TRUE
//      assignment for each of them on the new trial.
//
// Idempotent: skips entries whose nct_id is already in the trials table.

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';
import { CancerType } from '../src/lib/types';
import { fetchStudy, studyToInsertValues } from '../src/lib/ctgov';

interface NewTestTrial {
  nctId: string;
  cancerType: CancerType;
  label: string;
}

const NEW_TEST_TRIALS: NewTestTrial[] = [
  {
    nctId: 'NCT03901339',
    cancerType: 'BREAST',
    label: 'TROPiCS-02 — sacituzumab govitecan vs TPC in HR+/HER2- MBC (PHASE 3, COMPLETED 2023-10-20)',
  },
  {
    nctId: 'NCT03275285',
    cancerType: 'PLASMA_CELL',
    label: 'IKEMA — isatuximab + carfilzomib/dex vs Kd in R/R MM (PHASE 3, COMPLETED 2022-01-14)',
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  console.log(`Fetching ${NEW_TEST_TRIALS.length} new studies from CT.gov...`);
  const fetched: { entry: NewTestTrial; values: ReturnType<typeof studyToInsertValues> }[] = [];
  for (const t of NEW_TEST_TRIALS) {
    process.stdout.write(`  ${t.nctId} [${t.cancerType}]... `);
    const study = await fetchStudy(t.nctId);
    const values = studyToInsertValues(study, [t.cancerType]);
    console.log('ok');
    fetched.push({ entry: t, values });
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pick the schema_version_id from any existing trial (all current trials
    // share one). If none exists, abort.
    const schemaRow = await client.query<{ schema_version_id: string | null }>(
      `SELECT schema_version_id FROM trials WHERE schema_version_id IS NOT NULL LIMIT 1`,
    );
    if (schemaRow.rowCount === 0) {
      throw new Error('No existing trials with a schema_version_id — run seed-corpus-20 first');
    }
    const schemaVersionId = schemaRow.rows[0].schema_version_id;
    console.log(`Using schema_version_id=${schemaVersionId}`);

    // Test-expert set = anyone who has at least one is_test_trial=TRUE row.
    const testExperts = await client.query<{ expert_id: string; expert_name: string }>(
      `SELECT DISTINCT a.expert_id, u.name AS expert_name
         FROM trial_assignments a
         JOIN users u ON u.id = a.expert_id
        WHERE a.is_test_trial = TRUE`,
    );
    if (testExperts.rowCount === 0) {
      throw new Error('No test experts found (no is_test_trial=TRUE assignments anywhere)');
    }
    console.log(`Found ${testExperts.rowCount} test experts: ${testExperts.rows.map((r) => r.expert_name).join(', ')}`);

    for (const { entry, values: v } of fetched) {
      console.log(`\n${entry.nctId}  [${entry.cancerType}]`);
      console.log(`  ${entry.label}`);

      // Skip if already in the trials table (idempotent re-run).
      const already = await client.query<{ nct_id: string }>(
        `SELECT nct_id FROM trials WHERE nct_id = $1`,
        [entry.nctId],
      );
      if (already.rowCount && already.rowCount > 0) {
        console.log(`  ! ${entry.nctId} already in trials — skipping`);
        continue;
      }

      // Next available position.
      const posRow = await client.query<{ next_pos: number }>(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM trials`,
      );
      const position = posRow.rows[0].next_pos;
      console.log(`  position=${position}`);

      await client.query(
        `INSERT INTO trials (
           nct_id, brief_title, brief_summary, detailed_description,
           eligibility_raw, conditions, interventions,
           ctgov_sex, ctgov_min_age, ctgov_max_age,
           overall_status, study_type, phases, assigned_cancer_types,
           schema_version_id, position, is_test_trial
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE)`,
        [
          v.nctId, v.briefTitle, v.briefSummary, v.detailedDescription,
          v.eligibilityRaw, v.conditions, v.interventions,
          v.ctgovSex, v.ctgovMinAge, v.ctgovMaxAge,
          v.overallStatus, v.studyType, v.phases, v.assignedCancerTypes,
          schemaVersionId, position,
        ],
      );
      console.log(`  inserted ${entry.nctId}`);

      for (const row of testExperts.rows) {
        await client.query(
          `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
           VALUES ($1, $2, TRUE)`,
          [row.expert_id, entry.nctId],
        );
      }
      console.log(`  inserted ${testExperts.rowCount} test assignments`);
    }

    await client.query('COMMIT');
    console.log('\nDone. Existing trials and assignments untouched.');
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
