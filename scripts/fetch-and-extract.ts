// Fetch 5 completed trials per cancer type, run both extractors, write data/trials.json.
//   npm run fetch
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ClinicalTrialsAPI, studyToProcessedTrial } from '../src/lib/ctgov';
import { StructuredEligibilityExtractor } from '../src/lib/extractors/structured-eligibility';
import { ClinicalDescriptorExtractor, TrialForDescriptorExtraction } from '../src/lib/extractors/clinical-descriptors';
import { CancerType, ExtractedTrial, ProcessedTrial, TrialsDataFile } from '../src/lib/types';

// Per-cancer-type CT.gov condition queries.
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

const TRIALS_PER_TYPE = 5;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const CHECKPOINT_DIR = join(process.cwd(), 'data', 'checkpoints');

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function writeCheckpoint(name: string, payload: unknown) {
  ensureDir(CHECKPOINT_DIR);
  const path = join(CHECKPOINT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2));
  console.log(`Checkpoint: ${path}`);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set in .env.local');
  }

  const api = new ClinicalTrialsAPI();
  const basicExtractor = new StructuredEligibilityExtractor(MODEL);
  const descExtractor = new ClinicalDescriptorExtractor(MODEL);

  // 1. Fetch trials per cancer type
  const fetched: { cancerType: CancerType; trial: ProcessedTrial }[] = [];
  const seenNctIds = new Set<string>();

  for (const [cancerType, query] of Object.entries(CONDITION_QUERIES) as [CancerType, string][]) {
    process.stdout.write(`Fetching ${cancerType}... `);
    try {
      const studies = await api.fetchCompletedByCondition(query, TRIALS_PER_TYPE * 3);
      let count = 0;
      for (const s of studies) {
        if (count >= TRIALS_PER_TYPE) break;
        const trial = studyToProcessedTrial(s);
        if (seenNctIds.has(trial.nctId)) continue; // avoid duplicates across categories
        if (!trial.eligibilityRaw) continue; // skip trials with no eligibility text
        seenNctIds.add(trial.nctId);
        fetched.push({ cancerType, trial });
        count++;
      }
      console.log(`${count} trials`);
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message}`);
    }
  }

  console.log(`\nTotal: ${fetched.length} trials\n`);
  writeCheckpoint('01-fetched', {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    totalFetched: fetched.length,
    trials: fetched,
  });

  // 2. Basic eligibility extraction
  console.log('Extracting basic eligibility (gpt-5.5, high reasoning)...');
  const basicMap = await basicExtractor.extractBatch(
    fetched.map((f) => f.trial),
    4,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`),
  );
  console.log('\n');
  writeCheckpoint('02-basic-eligibility', {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    totalFetched: fetched.length,
    basicByNctId: Object.fromEntries(basicMap),
  });

  // 3. Cancer-specific descriptors. Use the assignedCancerType so we always
  //    extract the descriptor for the cancer type the trial was sampled for,
  //    even if the LLM didn't list it in basic.cancerTypes.
  console.log('Extracting cancer-specific descriptors...');
  const descInputs: TrialForDescriptorExtraction[] = fetched.map(({ cancerType, trial }) => {
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
  const descMap = await descExtractor.extractBatch(
    descInputs,
    4,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`),
  );
  console.log('\n');
  writeCheckpoint('03-descriptors', {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    totalFetched: fetched.length,
    descriptorsByNctId: Object.fromEntries(descMap),
  });

  // 4. Assemble & write
  const extracted: ExtractedTrial[] = fetched.map(({ cancerType, trial }) => ({
    ...trial,
    assignedCancerType: cancerType,
    basicFields: basicMap.get(trial.nctId) ?? { cancerTypes: ['OTHER'], acceptsAllSolidTumors: false },
    descriptors: descMap.get(trial.nctId) ?? {},
  }));

  const out: TrialsDataFile = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    trials: extracted,
  };

  const dataDir = join(process.cwd(), 'data');
  ensureDir(dataDir);
  const path = join(dataDir, 'trials.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path} (${extracted.length} trials)`);
  writeCheckpoint('04-final', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
