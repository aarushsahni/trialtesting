// Top-up: take the existing data/trials.json, drop NA-phase trials,
// fetch replacement trials (interventional + phase 1-4) for any cancer type
// that has fewer than 5, run extractions on just those replacements, and
// write a merged trials.json.
//   npm run topup

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
import {
  CancerType,
  ExtractedTrial,
  TrialsDataFile,
} from '../src/lib/types';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const TARGET_PER_TYPE = 5;
const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

// Same condition queries as fetch-and-extract.ts, kept separate so this
// script is self-contained.
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

// Fetch interventional + phase 1-4 trials, deduping against an existing set of NCT IDs.
async function fetchPhasedReplacements(
  condition: string,
  needed: number,
  exclude: Set<string>,
): Promise<CTGovStudy[]> {
  const out: CTGovStudy[] = [];
  let pageToken: string | undefined;
  // Cap how many pages we'll trawl — avoid infinite loop on tiny conditions.
  for (let page = 0; page < 5 && out.length < needed; page++) {
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
      if (!elig) continue; // need eligibility text for extraction
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

  // 1. Load current trials.json
  const trialsPath = join(process.cwd(), 'data', 'trials.json');
  const current = JSON.parse(readFileSync(trialsPath, 'utf8')) as TrialsDataFile;
  console.log(`Loaded ${current.trials.length} existing trials`);

  // 2. Drop trials with NA phase or no phase
  const isPhased = (phases?: string[]) =>
    !!phases && phases.length > 0 && !phases.includes('NA') && !phases.includes('N/A');
  const kept = current.trials.filter((t) => isPhased(t.phases));
  const dropped = current.trials.length - kept.length;
  console.log(`Dropped ${dropped} NA-phase trials, keeping ${kept.length}`);

  // 3. Group kept trials by cancer type, identify gaps
  const byType = new Map<CancerType, ExtractedTrial[]>();
  for (const t of kept) {
    const arr = byType.get(t.assignedCancerType) ?? [];
    arr.push(t);
    byType.set(t.assignedCancerType, arr);
  }

  const usedNctIds = new Set(kept.map((t) => t.nctId));
  // Also track NCT IDs from the dropped trials so we don't re-fetch them.
  for (const t of current.trials) usedNctIds.add(t.nctId);

  // 4. For each cancer type, fetch enough replacements to reach 5
  type Replacement = { cancerType: CancerType; study: CTGovStudy };
  const replacements: Replacement[] = [];

  for (const [cancerType, condition] of Object.entries(CONDITION_QUERIES) as [CancerType, string][]) {
    const have = byType.get(cancerType)?.length ?? 0;
    const need = TARGET_PER_TYPE - have;
    if (need <= 0) {
      console.log(`  ${cancerType}: ${have}/${TARGET_PER_TYPE} ✓`);
      continue;
    }
    process.stdout.write(`  ${cancerType}: ${have}/${TARGET_PER_TYPE}, fetching ${need}... `);
    const newStudies = await fetchPhasedReplacements(condition, need, usedNctIds);
    console.log(`got ${newStudies.length}`);
    for (const s of newStudies) replacements.push({ cancerType, study: s });
  }

  if (replacements.length === 0) {
    console.log('\nNothing to top up. Writing as-is.');
    const out: TrialsDataFile = { ...current, trials: kept };
    writeFileSync(trialsPath, JSON.stringify(out, null, 2));
    return;
  }

  console.log(`\nTotal replacements to extract: ${replacements.length}\n`);

  // 5. Run basic extraction on the replacements
  const basicExtractor = new StructuredEligibilityExtractor(MODEL);
  const replacementTrials = replacements.map((r) => studyToProcessedTrial(r.study));
  console.log('Extracting basic eligibility for replacements...');
  const basicMap = await basicExtractor.extractBatch(
    replacementTrials,
    4,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`),
  );
  console.log('\n');

  // 6. Run descriptor extraction on the replacements
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

  // 7. Assemble new ExtractedTrial[] for replacements
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

  // 8. Merge: kept + newExtracted, write
  const merged: ExtractedTrial[] = [...kept, ...newExtracted];

  // Sort by cancer type (alphabetical for stable order) so the UI grouping reads cleanly
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

  // Final per-type tally
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
