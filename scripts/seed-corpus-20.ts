// One-off seed: 20 trials from CT.gov + 5 test experts + per-user assignments
// (18 regular + 2 test trials). Destructive — wipes annotations, reference
// keys, assignments, and trials first.
//
//   npm run seed-corpus-20

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { CancerType } from '../src/lib/types';
import { snapshotSchema } from '../src/lib/schema/field-schemas';
import { fetchStudy, studyToInsertValues } from '../src/lib/ctgov';

const SCHEMA_VERSION_TAG = process.env.SCHEMA_VERSION_TAG || 'v2.0';
const TEST_DOB = '01/01/1990';

// 20 trials. First 2 are the test trials. Each row carries its CancerType
// mapping for the schema's per-cancer-type descriptor blocks.
const TRIALS: { nctId: string; cancerType: CancerType }[] = [
  { nctId: 'NCT04026412', cancerType: 'LUNG' },              // Test #1 — Nivolumab+CCRT NSCLC PHASE3
  { nctId: 'NCT02206984', cancerType: 'BREAST' },            // Test #2 — Endocrine response invasive lobular PHASE2
  { nctId: 'NCT01725633', cancerType: 'BREAST' },
  { nctId: 'NCT02933255', cancerType: 'PROSTATE' },
  { nctId: 'NCT01859221', cancerType: 'PROSTATE' },
  { nctId: 'NCT01740648', cancerType: 'COLORECTAL' },
  { nctId: 'NCT02737787', cancerType: 'OVARIAN' },
  { nctId: 'NCT01882816', cancerType: 'HEAD_AND_NECK' },
  { nctId: 'NCT02703493', cancerType: 'HEAD_AND_NECK' },
  { nctId: 'NCT03552965', cancerType: 'HEAD_AND_NECK' },
  { nctId: 'NCT04408092', cancerType: 'CNS' },
  { nctId: 'NCT03194906', cancerType: 'CNS' },
  { nctId: 'NCT04676633', cancerType: 'BILIARY' },
  { nctId: 'NCT03259581', cancerType: 'HCC' },
  { nctId: 'NCT03269136', cancerType: 'PLASMA_CELL' },
  { nctId: 'NCT03309111', cancerType: 'PLASMA_CELL' },
  { nctId: 'NCT02921893', cancerType: 'PLASMA_CELL' },
  { nctId: 'NCT02464228', cancerType: 'MATURE_T_NK_CELL' },
  { nctId: 'NCT02507336', cancerType: 'MATURE_B_CELL' },
  { nctId: 'NCT01495598', cancerType: 'OTHER' },
];

const TEST_TRIAL_COUNT = 2;
const TEST_EXPERT_NAMES = [
  'Test Expert 1',
  'Test Expert 2',
  'Test Expert 3',
  'Test Expert 4',
  'Test Expert 5',
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  // Fetch CT.gov studies before opening the txn so the txn stays short.
  console.log(`Fetching ${TRIALS.length} studies from CT.gov...`);
  const studies: { nctId: string; cancerType: CancerType; values: ReturnType<typeof studyToInsertValues> }[] = [];
  for (const t of TRIALS) {
    process.stdout.write(`  ${t.nctId} [${t.cancerType}]... `);
    const study = await fetchStudy(t.nctId);
    const values = studyToInsertValues(study, [t.cancerType]);
    console.log('ok');
    studies.push({ ...t, values });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Schema version
    const schemaJson = snapshotSchema();
    let schemaVersionId: string;
    const sv = await client.query(
      `SELECT id FROM schema_versions WHERE version_tag = $1`,
      [SCHEMA_VERSION_TAG],
    );
    if (sv.rowCount && sv.rowCount > 0) {
      schemaVersionId = sv.rows[0].id;
    } else {
      const r = await client.query(
        `INSERT INTO schema_versions (version_tag, schema_json) VALUES ($1, $2) RETURNING id`,
        [SCHEMA_VERSION_TAG, JSON.stringify(schemaJson)],
      );
      schemaVersionId = r.rows[0].id;
    }
    console.log(`schema_version: ${SCHEMA_VERSION_TAG} (${schemaVersionId})`);

    // Wipe trial-side state. Users are NOT touched.
    const wAdj = await client.query(`DELETE FROM trial_adjudications`);
    const wAnn = await client.query(`DELETE FROM annotations`);
    const wRk = await client.query(`DELETE FROM reference_keys`);
    const wAsg = await client.query(`DELETE FROM trial_assignments`);
    const wTr = await client.query(`DELETE FROM trials`);
    console.log(
      `Wiped: ${wAdj.rowCount} adjudications, ${wAnn.rowCount} annotations, ` +
      `${wRk.rowCount} ref_keys, ${wAsg.rowCount} assignments, ${wTr.rowCount} trials.`,
    );

    // Insert trials, preserving the order in TRIALS via `position`.
    for (let i = 0; i < studies.length; i++) {
      const { values: v } = studies[i];
      await client.query(
        `INSERT INTO trials (
          nct_id, brief_title, brief_summary, detailed_description,
          eligibility_raw, conditions, interventions,
          ctgov_sex, ctgov_min_age, ctgov_max_age,
          overall_status, study_type, phases, assigned_cancer_types,
          schema_version_id, position
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          v.nctId, v.briefTitle, v.briefSummary, v.detailedDescription,
          v.eligibilityRaw, v.conditions, v.interventions,
          v.ctgovSex, v.ctgovMinAge, v.ctgovMaxAge,
          v.overallStatus, v.studyType, v.phases, v.assignedCancerTypes,
          schemaVersionId, i,
        ],
      );
    }
    console.log(`Inserted ${studies.length} trials.`);

    // Create / reuse test experts.
    const dobHash = await bcrypt.hash(TEST_DOB, 10);
    const expertIds: { name: string; id: string }[] = [];
    for (const name of TEST_EXPERT_NAMES) {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE name = $1 AND role = 'expert'`,
        [name],
      );
      if (existing.rowCount) {
        expertIds.push({ name, id: existing.rows[0].id });
        console.log(`  reused ${name}`);
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (name, role, dob_hash) VALUES ($1, 'expert', $2) RETURNING id`,
          [name, dobHash],
        );
        expertIds.push({ name, id: inserted.rows[0].id });
        console.log(`  created ${name}  (DOB ${TEST_DOB})`);
      }
    }

    // Test trials → every expert. Non-test trials → exactly 2 experts each,
    // round-robin so the load is even (~7-8 non-test trials per expert).
    const testStudies = studies.slice(0, TEST_TRIAL_COUNT);
    const nonTestStudies = studies.slice(TEST_TRIAL_COUNT);
    let assignmentsInserted = 0;

    for (const s of testStudies) {
      for (const { id: expertId } of expertIds) {
        await client.query(
          `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
           VALUES ($1, $2, TRUE)`,
          [expertId, s.values.nctId],
        );
        assignmentsInserted++;
      }
    }

    // Round-robin: trial i goes to experts (i % N) and ((i + 1) % N).
    const nonTestPerExpert: Record<string, number> = Object.fromEntries(expertIds.map((e) => [e.name, 0]));
    for (let i = 0; i < nonTestStudies.length; i++) {
      const a = expertIds[i % expertIds.length];
      const b = expertIds[(i + 1) % expertIds.length];
      await client.query(
        `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
         VALUES ($1, $2, FALSE)`,
        [a.id, nonTestStudies[i].values.nctId],
      );
      await client.query(
        `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
         VALUES ($1, $2, FALSE)`,
        [b.id, nonTestStudies[i].values.nctId],
      );
      nonTestPerExpert[a.name]++;
      nonTestPerExpert[b.name]++;
      assignmentsInserted += 2;
    }

    console.log(
      `Inserted ${assignmentsInserted} assignments: ` +
      `${testStudies.length} test trials × ${expertIds.length} experts = ${testStudies.length * expertIds.length} test slots, ` +
      `${nonTestStudies.length} non-test trials × 2 experts = ${nonTestStudies.length * 2} non-test slots.`,
    );
    console.log('Non-test load per expert:');
    for (const [name, count] of Object.entries(nonTestPerExpert)) {
      console.log(`  ${name}: ${count}`);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log('\nTest trials:');
  for (const s of studies.slice(0, TEST_TRIAL_COUNT)) {
    console.log(`  ${s.values.nctId}  [${s.cancerType}]  ${s.values.briefTitle.slice(0, 80)}`);
  }
  console.log('\nTest experts (DOB 01/01/1990):');
  for (const name of TEST_EXPERT_NAMES) console.log(`  ${name}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
