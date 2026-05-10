// Drop trials where the CT.gov fuzzy-match pulled in the wrong topic
// (e.g. "Polycystic Ovary Syndrome" in the OVARIAN slot, "Glioma" in
// TESTICULAR), then refill with stricter condition validation.
//   npm run scrub

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CTGovSearchResponse, CTGovStudy } from '../src/lib/types';
import { studyToProcessedTrial } from '../src/lib/ctgov';
import { createCTGovRateLimiter, withRetry } from '../src/lib/rate-limiter';
import { StructuredEligibilityExtractor } from '../src/lib/extractors/structured-eligibility';
import {
  ClinicalDescriptorExtractor,
  TrialForDescriptorExtraction,
} from '../src/lib/extractors/clinical-descriptors';
import { CancerType, ExtractedTrial, TrialsDataFile } from '../src/lib/types';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const TARGET_PER_TYPE = 5;
const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

// Required-keyword sets — a trial's conditions field must contain at
// least one of these to count for that cancer type. Designed to exclude
// look-alike topics (PCOS, fibroids, glioma, etc.).
const REQUIRED_KEYWORDS: Record<Exclude<CancerType, 'OTHER'>, string[]> = {
  PROSTATE: ['prostate'],
  UROTHELIAL: ['urothelial', 'bladder cancer', 'bladder carcinoma', 'upper tract', 'urethral cancer', 'utuc'],
  RCC: ['renal cell', 'rcc', 'kidney cancer', 'clear cell renal'],
  TESTICULAR: ['testicular', 'seminoma', 'testis cancer', 'testis carcinoma'],
  BREAST: ['breast cancer', 'breast carcinoma', 'breast neoplasm', 'breast adenocarcinoma'],
  LUNG: ['lung cancer', 'lung carcinoma', 'lung neoplasm', 'nsclc', 'sclc', 'non-small cell', 'non small cell', 'small cell lung'],
  COLORECTAL: ['colorectal', 'colon cancer', 'colon carcinoma', 'rectal cancer', 'rectal carcinoma', 'crc'],
  HEAD_AND_NECK: ['head and neck', 'oropharyngeal', 'laryngeal', 'oral cavity', 'hypopharyngeal', 'nasopharyngeal', 'salivary gland', 'hnscc'],
  OVARIAN: ['ovarian cancer', 'ovarian carcinoma', 'ovarian neoplasm', 'fallopian tube', 'primary peritoneal'],
  UTERINE: ['endometrial', 'uterine cancer', 'uterine carcinoma', 'uterine sarcoma', 'uterine neoplasm', 'carcinosarcoma'],
  CERVICAL: ['cervical cancer', 'cervical carcinoma', 'cervix cancer', 'cervical squamous', 'cervical adenocarcinoma'],
  MELANOMA: ['melanoma'],
  MESOTHELIOMA: ['mesothelioma'],
  GASTROESOPHAGEAL: ['gastric cancer', 'gastric carcinoma', 'gastric adenocarcinoma', 'gastroesophageal', 'esophageal cancer', 'esophageal carcinoma', 'stomach cancer', 'gej'],
  NEUROENDOCRINE: ['neuroendocrine', 'carcinoid'],
  PANCREATIC: ['pancreatic cancer', 'pancreatic adenocarcinoma', 'pancreas cancer', 'pdac', 'pancreatic ductal'],
  MATURE_B_CELL: ['dlbcl', 'follicular lymphoma', 'mantle cell lymphoma', 'cll', 'small lymphocytic', 'marginal zone lymphoma', 'waldenstrom', 'waldenström', 'hodgkin lymphoma', 'b-cell lymphoma', 'b cell lymphoma', 'diffuse large b-cell', 'hairy cell leukemia'],
  MATURE_T_NK_CELL: ['ptcl', 't-cell lymphoma', 't cell lymphoma', 'cutaneous t-cell', 'mycosis fungoides', 'sezary', 'sézary', 'aitl', 'angioimmunoblastic', 'alcl', 'anaplastic large cell', 'nk/t', 'nk-t', 'nk t-cell', 'hepatosplenic', 'enteropathy-associated'],
  MYELOID_NEOPLASM: ['acute myeloid', 'aml', 'myelodysplastic', 'mds', 'cmml', 'myeloproliferative', 'chronic myeloid', 'cml', 'polycythemia vera', 'essential thrombocythemia', 'myelofibrosis'],
  PRECURSOR_LYMPHOID: ['acute lymphoblastic', 'acute lymphocytic', 'b-all', 't-all', 'lymphoblastic lymphoma', 'lymphoblastic leukemia'],
  PLASMA_CELL: ['multiple myeloma', 'plasma cell', 'amyloidosis', 'plasmacytoma', 'pcl'],
};

// Same condition queries used in the original fetch.
const CONDITION_QUERIES: Record<Exclude<CancerType, 'OTHER'>, string> = {
  PROSTATE: 'prostate cancer',
  UROTHELIAL: 'urothelial carcinoma OR bladder cancer',
  RCC: 'renal cell carcinoma',
  TESTICULAR: 'testicular cancer OR germ cell tumor',
  BREAST: 'breast cancer',
  LUNG: 'lung cancer',
  COLORECTAL: 'colorectal cancer',
  HEAD_AND_NECK: 'head and neck cancer',
  OVARIAN: 'ovarian cancer',
  UTERINE: 'endometrial cancer OR uterine cancer',
  CERVICAL: 'cervical cancer',
  MELANOMA: 'melanoma',
  MESOTHELIOMA: 'mesothelioma',
  GASTROESOPHAGEAL: 'gastric cancer OR esophageal cancer',
  NEUROENDOCRINE: 'neuroendocrine tumor',
  PANCREATIC: 'pancreatic cancer',
  MATURE_B_CELL: 'diffuse large B-cell lymphoma',
  MATURE_T_NK_CELL: 'peripheral T-cell lymphoma',
  MYELOID_NEOPLASM: 'acute myeloid leukemia',
  PRECURSOR_LYMPHOID: 'acute lymphoblastic leukemia',
  PLASMA_CELL: 'multiple myeloma',
};

const rateLimiter = createCTGovRateLimiter();

function conditionsMatch(conditions: string[], cancerType: CancerType): boolean {
  if (cancerType === 'OTHER') return true;
  const keywords = REQUIRED_KEYWORDS[cancerType];
  if (!keywords) return true;
  const text = conditions.join(' ').toLowerCase();
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

async function fetchValidated(
  cancerType: Exclude<CancerType, 'OTHER'>,
  needed: number,
  exclude: Set<string>,
): Promise<CTGovStudy[]> {
  const condition = CONDITION_QUERIES[cancerType];
  const out: CTGovStudy[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 10 && out.length < needed; page++) {
    await rateLimiter.acquire();
    const params = new URLSearchParams({
      'query.cond': condition,
      'query.term':
        'AREA[StudyType]INTERVENTIONAL AND ' +
        'AREA[Phase](PHASE1 OR PHASE2 OR PHASE3 OR PHASE4)',
      'filter.overallStatus': 'COMPLETED',
      pageSize: '50',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const json = await withRetry(async () => {
      const res = await fetch(`${BASE_URL}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`CT.gov error ${res.status} ${res.statusText}`);
      return res.json() as Promise<CTGovSearchResponse>;
    });

    for (const s of json.studies) {
      if (out.length >= needed) break;
      const nctId = s.protocolSection.identificationModule.nctId;
      if (exclude.has(nctId)) continue;
      const elig = s.protocolSection.eligibilityModule?.eligibilityCriteria;
      if (!elig) continue;
      const conditions = s.protocolSection.conditionsModule?.conditions ?? [];
      // Also include the title in the keyword check — sometimes the cancer
      // type is in the title but not the structured conditions list.
      const haystack = [...conditions, s.protocolSection.identificationModule.briefTitle];
      if (!conditionsMatch(haystack, cancerType)) {
        exclude.add(nctId);
        continue;
      }
      out.push(s);
      exclude.add(nctId);
    }

    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const trialsPath = join(process.cwd(), 'data', 'trials.json');
  const data = JSON.parse(readFileSync(trialsPath, 'utf8')) as TrialsDataFile;
  console.log(`Loaded ${data.trials.length} trials`);

  // 1. Identify miscategorized trials: assigned-cancer-type keywords absent
  // from conditions+title. Allow basket trials and trials with non-empty
  // descriptors to pass through (those are the LLM saying they're real).
  const miscategorized: ExtractedTrial[] = [];
  const kept: ExtractedTrial[] = [];

  for (const t of data.trials) {
    if (t.assignedCancerType === 'OTHER') {
      kept.push(t);
      continue;
    }
    const haystack = [...t.conditions, t.briefTitle];
    const matches = conditionsMatch(haystack, t.assignedCancerType);
    const isBasket = !!t.basicFields?.acceptsAllSolidTumors;
    if (!matches && !isBasket) {
      miscategorized.push(t);
    } else {
      kept.push(t);
    }
  }

  console.log(`\nDropping ${miscategorized.length} miscategorized trials:`);
  for (const t of miscategorized) {
    console.log(`  ${t.nctId} | ${t.assignedCancerType} | ${t.briefTitle.slice(0, 70)}`);
  }
  console.log(`Keeping ${kept.length}`);

  if (miscategorized.length === 0) {
    console.log('Nothing to scrub.');
    return;
  }

  // 2. Compute gaps per cancer type
  const byType = new Map<CancerType, ExtractedTrial[]>();
  for (const t of kept) {
    const arr = byType.get(t.assignedCancerType) ?? [];
    arr.push(t);
    byType.set(t.assignedCancerType, arr);
  }

  const usedNctIds = new Set(data.trials.map((t) => t.nctId)); // exclude EVERYTHING we've ever seen

  // 3. Fetch validated replacements
  type Replacement = { cancerType: Exclude<CancerType, 'OTHER'>; study: CTGovStudy };
  const replacements: Replacement[] = [];

  console.log('\nFetching replacements with strict condition matching:');
  for (const cancerType of Object.keys(CONDITION_QUERIES) as Exclude<CancerType, 'OTHER'>[]) {
    const have = byType.get(cancerType)?.length ?? 0;
    const need = TARGET_PER_TYPE - have;
    if (need <= 0) {
      console.log(`  ${cancerType}: ${have}/${TARGET_PER_TYPE} ✓`);
      continue;
    }
    process.stdout.write(`  ${cancerType}: ${have}/${TARGET_PER_TYPE}, fetching ${need}... `);
    const newStudies = await fetchValidated(cancerType, need, usedNctIds);
    console.log(`got ${newStudies.length}`);
    for (const s of newStudies) replacements.push({ cancerType, study: s });
  }

  if (replacements.length === 0) {
    console.log('\nNo replacements found. Writing kept trials only.');
    const out: TrialsDataFile = { ...data, generatedAt: new Date().toISOString(), trials: kept };
    writeFileSync(trialsPath, JSON.stringify(out, null, 2));
    return;
  }

  console.log(`\nTotal replacements to extract: ${replacements.length}\n`);

  // 4. Basic extraction
  const basicExtractor = new StructuredEligibilityExtractor(MODEL);
  const replacementTrials = replacements.map((r) => studyToProcessedTrial(r.study));
  console.log('Extracting basic eligibility for replacements...');
  const basicMap = await basicExtractor.extractBatch(
    replacementTrials,
    4,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`),
  );
  console.log('\n');

  // 5. Descriptor extraction
  const descExtractor = new ClinicalDescriptorExtractor(MODEL);
  const descInputs: TrialForDescriptorExtraction[] = replacements.map(({ cancerType, study }) => {
    const trial = studyToProcessedTrial(study);
    const basic = basicMap.get(trial.nctId);
    const types = new Set<CancerType>(basic?.cancerTypes ?? []);
    types.add(cancerType);
    types.delete('OTHER');
    return {
      nctId: trial.nctId,
      briefTitle: trial.briefTitle,
      briefSummary: trial.briefSummary,
      eligibilityRaw: trial.eligibilityRaw,
      conditions: trial.conditions,
      interventions: trial.interventions,
      cancerTypes: Array.from(types),
    };
  });
  console.log('Extracting descriptors for replacements...');
  const descMap = await descExtractor.extractBatch(
    descInputs,
    4,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`),
  );
  console.log('\n');

  // 6. Assemble
  const newExtracted: ExtractedTrial[] = replacements.map(({ cancerType, study }) => {
    const trial = studyToProcessedTrial(study);
    return {
      ...trial,
      assignedCancerType: cancerType,
      basicFields: basicMap.get(trial.nctId) ?? {
        cancerTypes: ['OTHER'],
        acceptsAllSolidTumors: false,
      },
      descriptors: descMap.get(trial.nctId) ?? {},
    };
  });

  const merged: ExtractedTrial[] = [...kept, ...newExtracted];
  merged.sort((a, b) =>
    a.assignedCancerType.localeCompare(b.assignedCancerType) ||
    a.nctId.localeCompare(b.nctId),
  );

  const out: TrialsDataFile = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    trials: merged,
  };
  writeFileSync(trialsPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${trialsPath} (${merged.length} trials = ${kept.length} kept + ${newExtracted.length} new)`);

  // Final tally
  const tally = new Map<CancerType, number>();
  for (const t of merged) tally.set(t.assignedCancerType, (tally.get(t.assignedCancerType) ?? 0) + 1);
  console.log('\nFinal counts per cancer type:');
  for (const [ct, n] of Array.from(tally.entries()).sort()) {
    const flag = n < TARGET_PER_TYPE ? ' ⚠️ short' : '';
    console.log(`  ${ct}: ${n}${flag}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
