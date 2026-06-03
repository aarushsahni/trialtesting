// Fully replace the trial set from a CSV manifest.
//
// Reads data/annotator-qualification-trials.csv (columns:
//   cancer_type,nct_id,official_title,status,phase,primary_completion_date,url)
// preserving CSV row order, maps each cancer_type to its lowercase BlockKey,
// fetches each NCT ID's full study from CT.gov v2, then in ONE transaction:
//   1. deletes all reference_keys, qualification_attempts, qualification_sets,
//      qualification_trials (FK-safe order),
//   2. reuses (or creates) the v1.0 schema_version,
//   3. inserts the new qualification_trials,
//   4. creates a qualification set with trial_nct_ids in CSV order.
//
// Run:
//   npm run seed-from-csv
//
// WARNING: this is destructive — it wipes all existing trials, sets, reference
// keys, and attempts. Back up first (npm run backup).

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { BlockKey, ALL_BLOCK_KEYS, CTGovStudy } from '../src/lib/types';
import { snapshotSchema } from '../src/lib/schema/field-schemas';

const SET_NAME = process.env.QUALIFICATION_SET_NAME || 'qualification-v1';
const SCHEMA_VERSION_TAG = process.env.SCHEMA_VERSION_TAG || 'v1.0';
const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';
const CSV_PATH = join(process.cwd(), 'data', 'annotator-qualification-trials.csv');

interface CsvRow {
  cancerType: string;
  nctId: string;
  officialTitle: string;
}

// Minimal CSV parser: handles double-quoted fields with embedded commas and
// escaped double-quotes (""). Sufficient for the CT.gov manifest format.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function loadCsv(): CsvRow[] {
  const raw = readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = {
    cancer_type: header.indexOf('cancer_type'),
    nct_id: header.indexOf('nct_id'),
    official_title: header.indexOf('official_title'),
  };
  if (idx.cancer_type < 0 || idx.nct_id < 0) {
    throw new Error(`CSV missing required columns. Header: ${header.join(', ')}`);
  }
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      cancerType: cells[idx.cancer_type].trim(),
      nctId: cells[idx.nct_id].trim(),
      officialTitle: idx.official_title >= 0 ? cells[idx.official_title].trim() : '',
    };
  });
}

async function fetchStudy(nctId: string): Promise<CTGovStudy> {
  const res = await fetch(`${BASE_URL}/${nctId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`CT.gov error for ${nctId}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as CTGovStudy;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  // 1. Parse CSV (preserving order) and map cancer_type → BlockKey
  const rows = loadCsv();
  console.log(`Loaded ${rows.length} rows from ${CSV_PATH}\n`);

  const blockKeySet = new Set<string>(ALL_BLOCK_KEYS);
  const planned: { row: CsvRow; block: BlockKey }[] = [];
  for (const row of rows) {
    const block = row.cancerType.toLowerCase() as BlockKey;
    if (!blockKeySet.has(block)) {
      throw new Error(
        `Row "${row.nctId}" has cancer_type "${row.cancerType}" which is not a valid BlockKey.`,
      );
    }
    planned.push({ row, block });
  }

  // 2. Fetch all studies from CT.gov (sequentially, to be polite)
  const fetched: { study: CTGovStudy; block: BlockKey }[] = [];
  for (const { row, block } of planned) {
    process.stdout.write(`Fetching ${row.nctId} [${block}]... `);
    const study = await fetchStudy(row.nctId);
    const elig = study.protocolSection.eligibilityModule?.eligibilityCriteria?.trim();
    console.log(elig ? 'ok' : 'ok (no eligibility text!)');
    fetched.push({ study, block });
  }
  console.log(`\nFetched ${fetched.length} studies.\n`);

  const pool = new Pool({
    connectionString: url,
    ssl:
      url.includes('sslmode=require') || url.includes('neon.tech')
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 3. Reuse or create schema_version
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

    // 4. FULL REPLACE — delete in FK-safe order
    const delKeys = await client.query(`DELETE FROM reference_keys`);
    const delAttempts = await client.query(`DELETE FROM qualification_attempts`);
    const delSets = await client.query(`DELETE FROM qualification_sets`);
    const delTrials = await client.query(`DELETE FROM qualification_trials`);
    console.log(
      `Deleted: ${delKeys.rowCount} reference_keys, ${delAttempts.rowCount} attempts, ` +
        `${delSets.rowCount} sets, ${delTrials.rowCount} trials.`,
    );

    // 5. Insert new trials (in CSV order)
    for (const { study, block } of fetched) {
      const id = study.protocolSection.identificationModule;
      const desc = study.protocolSection.descriptionModule;
      const cond = study.protocolSection.conditionsModule;
      const arms = study.protocolSection.armsInterventionsModule;
      const elig = study.protocolSection.eligibilityModule;
      const status = study.protocolSection.statusModule;
      const design = study.protocolSection.designModule;

      await client.query(
        `INSERT INTO qualification_trials (
          nct_id, brief_title, brief_summary, detailed_description,
          eligibility_raw, conditions, interventions,
          ctgov_sex, ctgov_min_age, ctgov_max_age,
          overall_status, study_type, phases, assigned_blocks
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id.nctId,
          id.briefTitle,
          desc?.briefSummary ?? null,
          desc?.detailedDescription ?? null,
          elig?.eligibilityCriteria ?? null,
          cond?.conditions ?? [],
          (arms?.interventions ?? []).map((i) => i.name),
          elig?.sex ?? null,
          elig?.minimumAge ?? null,
          elig?.maximumAge ?? null,
          status?.overallStatus ?? null,
          design?.studyType ?? null,
          design?.phases ?? null,
          [block],
        ],
      );
    }
    console.log(`Inserted ${fetched.length} trials.`);

    // 6. Create qualification set with trial_nct_ids in CSV order
    const nctIds = fetched.map((f) => f.study.protocolSection.identificationModule.nctId);
    await client.query(
      `INSERT INTO qualification_sets (name, schema_version_id, trial_nct_ids)
       VALUES ($1, $2, $3)`,
      [SET_NAME, schemaVersionId, nctIds],
    );
    console.log(`Created qualification set "${SET_NAME}" with ${nctIds.length} trials.`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  // 7. Summary
  console.log('\nTrials (in order):');
  fetched.forEach(({ study, block }, i) => {
    const t = study.protocolSection.identificationModule;
    const title = t.briefTitle.length > 70 ? t.briefTitle.slice(0, 67) + '...' : t.briefTitle;
    console.log(`  ${String(i + 1).padStart(2)}. ${t.nctId.padEnd(13)} [${block}]  ${title}`);
  });

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
