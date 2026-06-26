// Surgical replacement of test trials. Does NOT touch the main (non-test)
// trial group, its assignments, or its annotations.
//
//   npm run replace-test-trials
//
// What it does, per (oldNct → newNct) pair, in one transaction:
//   1. Looks up the old trial's `position` and `schema_version_id` so the
//      new trial slots in at the same place under the same schema version.
//   2. Identifies test experts as the users who had `is_test_trial=TRUE`
//      assignments for the old trial.
//   3. Fetches the new trial from CT.gov.
//   4. DELETE FROM trials WHERE nct_id = <oldNct> — cascades to
//      trial_assignments, annotations, reference_keys, trial_adjudications.
//   5. INSERT the new trial with the preserved position + schema_version_id.
//   6. INSERT is_test_trial=TRUE assignments for each test expert.
//
// Idempotent if re-run with the same pairs (skips pairs where the new trial
// is already present).

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';
import { CancerType } from '../src/lib/types';
import { fetchStudy, studyToInsertValues } from '../src/lib/ctgov';

interface Swap {
  oldNct: string;
  newNct: string;
  cancerType: CancerType;
  label: string;
}

const SWAPS: Swap[] = [
  {
    oldNct: 'NCT04026412',
    newNct: 'NCT03511664',
    cancerType: 'PROSTATE',
    label: 'VISION — Lu-177 PSMA-617 in mCRPC (PHASE 3, COMPLETED 2021-01-27)',
  },
  {
    oldNct: 'NCT02206984',
    newNct: 'NCT03391466',
    cancerType: 'MATURE_B_CELL',
    label: 'ZUMA-7 — axi-cel vs SOC in 2L R/R LBCL (PHASE 3, COMPLETED 2021-03-18)',
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  // Fetch CT.gov studies outside the txn.
  console.log(`Fetching ${SWAPS.length} new studies from CT.gov...`);
  const fetched: { swap: Swap; values: ReturnType<typeof studyToInsertValues> }[] = [];
  for (const s of SWAPS) {
    process.stdout.write(`  ${s.newNct} [${s.cancerType}]... `);
    const study = await fetchStudy(s.newNct);
    const values = studyToInsertValues(study, [s.cancerType]);
    console.log('ok');
    fetched.push({ swap: s, values });
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

    for (const { swap, values: v } of fetched) {
      console.log(`\n${swap.oldNct} → ${swap.newNct}  [${swap.cancerType}]`);
      console.log(`  ${swap.label}`);

      // Skip if the new trial is already in place (idempotent re-run).
      const already = await client.query<{ nct_id: string }>(
        `SELECT nct_id FROM trials WHERE nct_id = $1`,
        [swap.newNct],
      );
      if (already.rowCount && already.rowCount > 0) {
        console.log(`  ! ${swap.newNct} already in trials — skipping`);
        continue;
      }

      const oldRow = await client.query<{ position: number; schema_version_id: string | null }>(
        `SELECT position, schema_version_id FROM trials WHERE nct_id = $1`,
        [swap.oldNct],
      );
      if (oldRow.rowCount === 0) {
        console.error(`  ! old trial ${swap.oldNct} not found — aborting`);
        throw new Error(`old trial ${swap.oldNct} not in DB`);
      }
      const { position, schema_version_id } = oldRow.rows[0];
      console.log(`  position=${position}, schema_version_id=${schema_version_id ?? 'null'}`);

      // Capture the test experts (those who had is_test_trial=TRUE for the
      // old trial) before we cascade-delete the assignments.
      const testExperts = await client.query<{ expert_id: string; expert_name: string }>(
        `SELECT a.expert_id, u.name AS expert_name
           FROM trial_assignments a
           JOIN users u ON u.id = a.expert_id
          WHERE a.nct_id = $1 AND a.is_test_trial = TRUE`,
        [swap.oldNct],
      );
      console.log(`  found ${testExperts.rowCount} test-expert assignments to migrate`);

      // Delete the old trial — cascades to trial_assignments, annotations,
      // reference_keys, trial_adjudications.
      const del = await client.query(
        `DELETE FROM trials WHERE nct_id = $1`,
        [swap.oldNct],
      );
      console.log(`  deleted old trial (${del.rowCount} row)`);

      // Insert the new trial at the same position + schema_version.
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
          schema_version_id, position,
        ],
      );
      console.log(`  inserted ${swap.newNct}`);

      // Re-create test assignments for the same expert set.
      for (const row of testExperts.rows) {
        await client.query(
          `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
           VALUES ($1, $2, TRUE)`,
          [row.expert_id, swap.newNct],
        );
      }
      console.log(`  inserted ${testExperts.rowCount} test assignments`);
    }

    await client.query('COMMIT');
    console.log('\nDone. Main trial group untouched.');
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
