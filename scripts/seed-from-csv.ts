// Populate the `trials` table from a CSV manifest.
//
// Reads data/annotator-qualification-trials.csv (columns:
//   cancer_type,nct_id,official_title,status,phase,primary_completion_date,url)
// preserving CSV row order, validates cancer_type against the CancerType enum,
// fetches each NCT ID's full study from CT.gov v2, then in ONE transaction:
//   1. (optionally) deletes annotations, reference_keys, trial_assignments,
//      trial_adjudications, trials in FK-safe order,
//   2. reuses (or creates) the schema_version,
//   3. inserts the new trials with CSV-order `position`.
//
// Run:
//   npm run seed-from-csv             (idempotent: skip if trial already exists)
//   npm run seed-from-csv -- --clean  (destructive: wipe trials + downstream)

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { CancerType, ALL_CANCER_TYPES } from '../src/lib/types';
import { snapshotSchema } from '../src/lib/schema/field-schemas';
import { fetchStudy, studyToInsertValues } from '../src/lib/ctgov';

const SCHEMA_VERSION_TAG = process.env.SCHEMA_VERSION_TAG || 'v2.0';
const CSV_PATH = join(process.cwd(), 'data', 'annotator-qualification-trials.csv');
const CLEAN = process.argv.includes('--clean');

interface CsvRow {
  cancerType: string;
  nctId: string;
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
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idxCt = header.indexOf('cancer_type');
  const idxId = header.indexOf('nct_id');
  if (idxCt < 0 || idxId < 0) {
    throw new Error(`CSV missing required columns. Header: ${header.join(', ')}`);
  }
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return { cancerType: cells[idxCt].trim(), nctId: cells[idxId].trim() };
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const rows = loadCsv();
  console.log(`Loaded ${rows.length} rows from ${CSV_PATH}\n`);

  const cancerTypeSet = new Set<string>(ALL_CANCER_TYPES);
  const planned: { row: CsvRow; cancerType: CancerType }[] = [];
  for (const row of rows) {
    const cancerType = row.cancerType as CancerType;
    if (!cancerTypeSet.has(cancerType)) {
      throw new Error(
        `Row "${row.nctId}" has cancer_type "${row.cancerType}" which is not a valid CancerType.`,
      );
    }
    planned.push({ row, cancerType });
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

    // Reuse or create schema_version
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

    if (CLEAN) {
      const delAdj = await client.query(`DELETE FROM trial_adjudications`);
      const delAnn = await client.query(`DELETE FROM annotations`);
      const delRk = await client.query(`DELETE FROM reference_keys`);
      const delAsg = await client.query(`DELETE FROM trial_assignments`);
      const delTr = await client.query(`DELETE FROM trials`);
      console.log(
        `Cleaned: ${delAdj.rowCount} adjudications, ${delAnn.rowCount} annotations, ` +
        `${delRk.rowCount} reference_keys, ${delAsg.rowCount} assignments, ${delTr.rowCount} trials.`,
      );
    }

    // Fetch + insert (idempotent: ON CONFLICT do nothing on nct_id PK).
    let inserted = 0, skipped = 0;
    for (let i = 0; i < planned.length; i++) {
      const { row, cancerType } = planned[i];
      const exists = await client.query(`SELECT 1 FROM trials WHERE nct_id = $1`, [row.nctId]);
      if (exists.rowCount && !CLEAN) {
        skipped++;
        process.stdout.write(`Skipping ${row.nctId} (already in DB)\n`);
        continue;
      }
      process.stdout.write(`Fetching ${row.nctId} [${cancerType}]... `);
      const study = await fetchStudy(row.nctId);
      const v = studyToInsertValues(study, [cancerType]);
      const elig = study.protocolSection.eligibilityModule?.eligibilityCriteria?.trim();
      console.log(elig ? 'ok' : 'ok (no eligibility text!)');

      await client.query(
        `INSERT INTO trials (
          nct_id, brief_title, brief_summary, detailed_description,
          eligibility_raw, conditions, interventions,
          ctgov_sex, ctgov_min_age, ctgov_max_age,
          overall_status, study_type, phases, assigned_cancer_types,
          schema_version_id, position
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
          assigned_cancer_types = EXCLUDED.assigned_cancer_types,
          schema_version_id = EXCLUDED.schema_version_id,
          position = EXCLUDED.position,
          fetched_at = NOW()`,
        [
          v.nctId, v.briefTitle, v.briefSummary, v.detailedDescription,
          v.eligibilityRaw, v.conditions, v.interventions,
          v.ctgovSex, v.ctgovMinAge, v.ctgovMaxAge,
          v.overallStatus, v.studyType, v.phases, v.assignedCancerTypes,
          schemaVersionId, i,
        ],
      );
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`\nInserted/updated ${inserted} trials, skipped ${skipped}.`);
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
