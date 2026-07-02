// Seed the `trials` table with the 120 main (non-test) trials sampled
// from ClinicalTrials.gov, tagged with the two annotator slots each trial
// is assigned to.
//
// Input: data/sample_ctgov_trials.csv (produced by scripts/sample_ctgov_trials.py).
// Required columns: nct_id, annotator_1, annotator_2.
//
// Behavior:
//   - Per row: fetch the study from CT.gov v2 and insert/update the trials
//     row with is_test_trial=FALSE, annotator_slot_1=annotator_1,
//     annotator_slot_2=annotator_2, assigned_cancer_types=[] (main trials
//     aren't pre-classified — the expert supplies cancerTypes at labeling time).
//   - Idempotent: skips rows already in the DB unless --update is passed.
//   - Position starts after existing test trials so main trials sort last.
//
// Run:
//   npm run seed-main-trials
//   npm run seed-main-trials -- --update    # refresh CT.gov data + slot tags

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { snapshotSchema } from '../src/lib/schema/field-schemas';
import { fetchStudy, studyToInsertValues } from '../src/lib/ctgov';

const SCHEMA_VERSION_TAG = process.env.SCHEMA_VERSION_TAG || 'v2.0';
const CSV_PATH = join(process.cwd(), 'data', 'sample_ctgov_trials.csv');
const UPDATE_EXISTING = process.argv.includes('--update');

interface CsvRow {
  nctId: string;
  slot1: number;
  slot2: number;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadCsv(): CsvRow[] {
  const raw = readFileSync(CSV_PATH, 'utf8');
  // Split on newline but respect quoted fields (the raw CSV has embedded
  // newlines inside eligibility_criteria/brief_summary). We'll do a full-
  // file tokenizer instead of naive line-split.
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { cur.push(cell); cell = ''; }
    else if (ch === '\n') { cur.push(cell); cell = ''; rows.push(cur); cur = []; }
    else if (ch === '\r') { /* skip */ }
    else cell += ch;
  }
  if (cell.length > 0 || cur.length > 0) { cur.push(cell); rows.push(cur); }

  if (rows.length === 0) throw new Error(`Empty CSV: ${CSV_PATH}`);
  const header = rows[0].map((h) => h.trim());
  const idxId = header.indexOf('nct_id');
  const idxA1 = header.indexOf('annotator_1');
  const idxA2 = header.indexOf('annotator_2');
  if (idxId < 0 || idxA1 < 0 || idxA2 < 0) {
    throw new Error(
      `CSV missing required columns (need nct_id, annotator_1, annotator_2). Header: ${header.join(', ')}`,
    );
  }
  const out: CsvRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (!cells[idxId] || !cells[idxId].trim()) continue;
    const s1 = Number(cells[idxA1]);
    const s2 = Number(cells[idxA2]);
    if (!Number.isInteger(s1) || s1 < 1 || s1 > 5) {
      throw new Error(`Row ${r + 1}: annotator_1 must be 1..5, got "${cells[idxA1]}"`);
    }
    if (!Number.isInteger(s2) || s2 < 1 || s2 > 5) {
      throw new Error(`Row ${r + 1}: annotator_2 must be 1..5, got "${cells[idxA2]}"`);
    }
    if (s1 === s2) {
      throw new Error(`Row ${r + 1}: annotator_1 and annotator_2 must differ (${s1})`);
    }
    out.push({ nctId: cells[idxId].trim(), slot1: s1, slot2: s2 });
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const rows = loadCsv();
  console.log(`Loaded ${rows.length} rows from ${CSV_PATH}\n`);

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Reuse or create schema_version.
    const schemaJson = snapshotSchema();
    let schemaVersionId: string;
    const sv = await client.query(
      `SELECT id FROM schema_versions WHERE version_tag = $1`,
      [SCHEMA_VERSION_TAG],
    );
    if (sv.rowCount && sv.rowCount > 0) {
      schemaVersionId = sv.rows[0].id;
      console.log(`Reusing schema_version ${SCHEMA_VERSION_TAG} (id=${schemaVersionId})`);
    } else {
      const r = await client.query(
        `INSERT INTO schema_versions (version_tag, schema_json) VALUES ($1, $2) RETURNING id`,
        [SCHEMA_VERSION_TAG, JSON.stringify(schemaJson)],
      );
      schemaVersionId = r.rows[0].id;
      console.log(`Created schema_version ${SCHEMA_VERSION_TAG} (id=${schemaVersionId})`);
    }

    // Position: place main trials after any existing rows.
    const maxPos = await client.query(`SELECT COALESCE(MAX(position), -1) AS m FROM trials`);
    const startPos = Number(maxPos.rows[0].m) + 1;

    let inserted = 0, updated = 0, skipped = 0;
    for (let i = 0; i < rows.length; i++) {
      const { nctId, slot1, slot2 } = rows[i];
      const exists = await client.query(`SELECT 1 FROM trials WHERE nct_id = $1`, [nctId]);
      if (exists.rowCount && !UPDATE_EXISTING) {
        skipped++;
        process.stdout.write(`Skipping ${nctId} (already in DB; pass --update to refresh)\n`);
        continue;
      }
      process.stdout.write(`Fetching ${nctId} [slots ${slot1},${slot2}]... `);
      const study = await fetchStudy(nctId);
      const v = studyToInsertValues(study, []);
      console.log('ok');

      await client.query(
        `INSERT INTO trials (
          nct_id, brief_title, brief_summary, detailed_description,
          eligibility_raw, conditions, interventions,
          ctgov_sex, ctgov_min_age, ctgov_max_age,
          overall_status, study_type, phases, assigned_cancer_types,
          schema_version_id, position, is_test_trial,
          annotator_slot_1, annotator_slot_2
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,FALSE,$17,$18)
        ON CONFLICT (nct_id) DO UPDATE SET
          brief_title = EXCLUDED.brief_title,
          brief_summary = EXCLUDED.brief_summary,
          detailed_description = EXCLUDED.detailed_description,
          eligibility_raw = EXCLUDED.eligibility_raw,
          conditions = EXCLUDED.conditions,
          interventions = EXCLUDED.interventions,
          ctgov_sex = EXCLUDED.ctgov_sex,
          ctgov_min_age = EXCLUDED.ctgov_min_age,
          ctgov_max_age = EXCLUDED.ctgov_max_age,
          overall_status = EXCLUDED.overall_status,
          study_type = EXCLUDED.study_type,
          phases = EXCLUDED.phases,
          schema_version_id = EXCLUDED.schema_version_id,
          annotator_slot_1 = EXCLUDED.annotator_slot_1,
          annotator_slot_2 = EXCLUDED.annotator_slot_2,
          fetched_at = NOW()`,
        [
          v.nctId, v.briefTitle, v.briefSummary, v.detailedDescription,
          v.eligibilityRaw, v.conditions, v.interventions,
          v.ctgovSex, v.ctgovMinAge, v.ctgovMaxAge,
          v.overallStatus, v.studyType, v.phases, v.assignedCancerTypes,
          schemaVersionId, startPos + i, slot1, slot2,
        ],
      );
      if (exists.rowCount) updated++; else inserted++;
    }

    await client.query('COMMIT');
    console.log(`\nInserted ${inserted}, updated ${updated}, skipped ${skipped}.`);
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
