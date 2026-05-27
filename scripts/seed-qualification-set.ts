// Build a fixed qualification set:
//   1. Register the current schema as a new schema_versions row (if not yet)
//   2. Fetch trials from CT.gov using study-plan filters per block
//   3. Insert qualification_trials rows
//   4. Create a qualification_sets row pointing at the chosen NCT IDs
//
// Run:
//   npm run seed-qualification
//
// Re-running is idempotent: if a set with the same name already exists,
// the script bails out (use a different name if you want a new set).

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';
import { BlockKey, CTGovSearchResponse, CTGovStudy } from '../src/lib/types';
import { snapshotSchema } from '../src/lib/schema/field-schemas';

const SET_NAME = process.env.QUALIFICATION_SET_NAME || 'qualification-v1';
const SCHEMA_VERSION_TAG = process.env.SCHEMA_VERSION_TAG || 'v1.0';
const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

// ──────────────────────────────────────────────────────────────────────────
// Per-block fetch plan: condition phrase + strict keywords for client-side
// confirmation + how many trials to pull. Total = 16 trials across 14 blocks
// + 1 deliberate basket trial.
// ──────────────────────────────────────────────────────────────────────────

interface Plan {
  block: BlockKey;
  count: number;
  // CT.gov condition query (fuzzy)
  cond: string;
  // Strict keywords — at least one must appear in conditions or title
  mustMatch: string[];
  // Optional negative filters — if any appears, reject the trial
  excludeKeywords?: string[];
}

const BLOCK_PLAN: Plan[] = [
  { block: 'prostate', count: 1, cond: 'prostate cancer', mustMatch: ['prostate'] },
  { block: 'breast', count: 2, cond: 'breast cancer', mustMatch: ['breast'] },
  { block: 'lung', count: 2, cond: 'non small cell lung cancer', mustMatch: ['lung', 'nsclc', 'sclc'] },
  { block: 'colorectal', count: 1, cond: 'colorectal cancer', mustMatch: ['colorectal', 'colon', 'rectal'], excludeKeywords: ['polyp', 'irritable'] },
  { block: 'urothelial', count: 1, cond: 'urothelial carcinoma', mustMatch: ['urothelial', 'bladder', 'upper tract'] },
  { block: 'rcc', count: 1, cond: 'renal cell carcinoma', mustMatch: ['renal cell', 'rcc', 'kidney cancer'] },
  { block: 'ovarian', count: 1, cond: 'ovarian cancer', mustMatch: ['ovarian', 'fallopian', 'peritoneal carcinoma'], excludeKeywords: ['polycystic ovary', 'pcos', 'fertility', 'ivf'] },
  { block: 'head_and_neck', count: 1, cond: 'head and neck cancer', mustMatch: ['head and neck', 'oropharyn', 'larynx', 'nasopharyn', 'salivary'] },
  { block: 'gastroesophageal', count: 1, cond: 'gastric cancer', mustMatch: ['gastric', 'esophageal', 'esophagus', 'stomach', 'gastroesophageal'] },
  { block: 'melanoma', count: 1, cond: 'melanoma', mustMatch: ['melanoma'] },
  { block: 'mesothelioma', count: 1, cond: 'mesothelioma', mustMatch: ['mesothelioma'] },
  { block: 'cns', count: 1, cond: 'glioblastoma', mustMatch: ['glioma', 'glioblastoma', 'astrocytoma', 'oligodendroglioma', 'medulloblastoma'] },
  { block: 'mature_b_cell', count: 1, cond: 'diffuse large b-cell lymphoma', mustMatch: ['lymphoma', 'dlbcl', 'cll', 'follicular', 'mantle cell', 'hodgkin'] },
  { block: 'myeloid_neoplasm', count: 1, cond: 'acute myeloid leukemia', mustMatch: ['acute myeloid', 'aml', 'myelodysplastic', 'mds', 'cml', 'mpn'] },
  { block: 'precursor_lymphoid', count: 1, cond: 'acute lymphoblastic leukemia', mustMatch: ['acute lymphoblastic', 'all ', 'lymphoblastic'] },
  { block: 'plasma_cell', count: 1, cond: 'multiple myeloma', mustMatch: ['myeloma', 'plasma cell'] },
  { block: 'pancreatic', count: 1, cond: 'pancreatic cancer', mustMatch: ['pancreatic', 'pancreas'], excludeKeywords: ['islet'] },
];

// Plus one basket trial deliberately included
const BASKET_PLAN = {
  cond: 'advanced solid tumor',
  count: 1,
  mustMatch: ['solid tumor'],
  basketBlocks: [
    'prostate', 'breast', 'lung', 'colorectal', 'urothelial', 'rcc',
    'ovarian', 'pancreatic', 'gastroesophageal', 'melanoma',
    'head_and_neck', 'cervical', 'uterine', 'mesothelioma', 'biliary',
    'hcc', 'neuroendocrine',
  ] as BlockKey[],
};

const MUST_BE_RECENT = (study: CTGovStudy): boolean => {
  // Primary completion date 2021-2025 — CT.gov stores as YYYY-MM-DD or YYYY-MM.
  const d = study.protocolSection.statusModule?.primaryCompletionDateStruct?.date;
  if (!d) return false;
  const year = parseInt(d.slice(0, 4), 10);
  return year >= 2021 && year <= 2025;
};

const MATCHES_KEYWORDS = (
  study: CTGovStudy,
  must: string[],
  exclude?: string[],
): boolean => {
  const title = (study.protocolSection.identificationModule.briefTitle ?? '').toLowerCase();
  const conds = (study.protocolSection.conditionsModule?.conditions ?? []).join(' ').toLowerCase();
  const haystack = `${title} ${conds}`;
  if (exclude?.some((kw) => haystack.includes(kw.toLowerCase()))) return false;
  return must.some((kw) => haystack.includes(kw.toLowerCase()));
};

const HAS_ELIGIBILITY = (study: CTGovStudy): boolean =>
  !!study.protocolSection.eligibilityModule?.eligibilityCriteria?.trim();

// ──────────────────────────────────────────────────────────────────────────
// CT.gov fetch
// ──────────────────────────────────────────────────────────────────────────

async function fetchByCondition(
  cond: string,
  pageSize = 100,
): Promise<CTGovStudy[]> {
  const params = new URLSearchParams({
    'query.cond': cond,
    'query.term':
      'AREA[StudyType]INTERVENTIONAL AND ' +
      'AREA[Phase](PHASE1 OR PHASE2 OR PHASE3 OR PHASE4) AND ' +
      'AREA[LocationCountry]"United States"',
    'filter.overallStatus': 'COMPLETED',
    pageSize: String(pageSize),
  });
  const url = `${BASE_URL}?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CT.gov error: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as CTGovSearchResponse;
  return json.studies ?? [];
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

interface SelectedTrial {
  study: CTGovStudy;
  blocks: BlockKey[];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  // 1. Bail out if the set already exists
  const existing = await pool.query(
    `SELECT id FROM qualification_sets WHERE name = $1`,
    [SET_NAME],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log(`Qualification set "${SET_NAME}" already exists. Pick a different name via QUALIFICATION_SET_NAME=... or DROP first.`);
    await pool.end();
    return;
  }

  // 2. Insert (or upsert) schema_versions
  const schemaJson = snapshotSchema();
  let schemaVersionId: string;
  const sv = await pool.query(
    `SELECT id FROM schema_versions WHERE version_tag = $1`,
    [SCHEMA_VERSION_TAG],
  );
  if (sv.rowCount && sv.rowCount > 0) {
    schemaVersionId = sv.rows[0].id;
    console.log(`Reusing existing schema_version ${SCHEMA_VERSION_TAG} (id=${schemaVersionId})`);
  } else {
    const r = await pool.query(
      `INSERT INTO schema_versions (version_tag, schema_json) VALUES ($1, $2) RETURNING id`,
      [SCHEMA_VERSION_TAG, JSON.stringify(schemaJson)],
    );
    schemaVersionId = r.rows[0].id;
    console.log(`Created schema_version ${SCHEMA_VERSION_TAG} (id=${schemaVersionId})`);
  }

  // 3. Fetch per-block trials
  const selected: SelectedTrial[] = [];
  const seenNctIds = new Set<string>();

  for (const plan of BLOCK_PLAN) {
    process.stdout.write(`Fetching ${plan.block} (need ${plan.count})... `);
    const candidates = await fetchByCondition(plan.cond);
    let picked = 0;
    for (const study of candidates) {
      if (picked >= plan.count) break;
      const nctId = study.protocolSection.identificationModule.nctId;
      if (seenNctIds.has(nctId)) continue;
      if (!HAS_ELIGIBILITY(study)) continue;
      if (!MUST_BE_RECENT(study)) continue;
      if (!MATCHES_KEYWORDS(study, plan.mustMatch, plan.excludeKeywords)) continue;
      selected.push({ study, blocks: [plan.block] });
      seenNctIds.add(nctId);
      picked++;
    }
    console.log(`picked ${picked}/${plan.count}`);
  }

  // 4. Fetch a basket trial
  process.stdout.write(`Fetching basket trial (need ${BASKET_PLAN.count})... `);
  const baskets = await fetchByCondition(BASKET_PLAN.cond);
  let pickedBasket = 0;
  for (const study of baskets) {
    if (pickedBasket >= BASKET_PLAN.count) break;
    const nctId = study.protocolSection.identificationModule.nctId;
    if (seenNctIds.has(nctId)) continue;
    if (!HAS_ELIGIBILITY(study)) continue;
    if (!MUST_BE_RECENT(study)) continue;
    if (!MATCHES_KEYWORDS(study, BASKET_PLAN.mustMatch)) continue;
    selected.push({ study, blocks: BASKET_PLAN.basketBlocks });
    seenNctIds.add(nctId);
    pickedBasket++;
  }
  console.log(`picked ${pickedBasket}/${BASKET_PLAN.count}`);

  console.log(`\nTotal trials selected: ${selected.length}\n`);

  // 5. Insert into qualification_trials
  for (const { study, blocks } of selected) {
    const id = study.protocolSection.identificationModule;
    const desc = study.protocolSection.descriptionModule;
    const cond = study.protocolSection.conditionsModule;
    const arms = study.protocolSection.armsInterventionsModule;
    const elig = study.protocolSection.eligibilityModule;
    const status = study.protocolSection.statusModule;
    const design = study.protocolSection.designModule;

    await pool.query(
      `INSERT INTO qualification_trials (
        nct_id, brief_title, brief_summary, detailed_description,
        eligibility_raw, conditions, interventions,
        ctgov_sex, ctgov_min_age, ctgov_max_age,
        overall_status, study_type, phases, assigned_blocks
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (nct_id) DO UPDATE SET assigned_blocks = EXCLUDED.assigned_blocks`,
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
        blocks,
      ],
    );
  }
  console.log(`Inserted ${selected.length} trials.`);

  // 6. Create qualification set
  const nctIds = selected.map(s => s.study.protocolSection.identificationModule.nctId);
  await pool.query(
    `INSERT INTO qualification_sets (name, schema_version_id, trial_nct_ids)
     VALUES ($1, $2, $3)`,
    [SET_NAME, schemaVersionId, nctIds],
  );
  console.log(`Created qualification set "${SET_NAME}" with ${nctIds.length} trials.`);

  // 7. Summary
  console.log('\nTrials:');
  for (const { study, blocks } of selected) {
    const t = study.protocolSection.identificationModule;
    const title = t.briefTitle.length > 75 ? t.briefTitle.slice(0, 72) + '...' : t.briefTitle;
    console.log(`  ${t.nctId.padEnd(13)} [${blocks.join(', ')}]  ${title}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
