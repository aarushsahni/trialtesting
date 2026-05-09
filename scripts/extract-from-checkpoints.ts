// Recovery script: assemble data/trials.json from existing checkpoints.
// Skips CT.gov fetch + basic extraction (already done in checkpoints 01 + 02)
// and only re-runs descriptor extraction (with the new 120s timeout).
//   npm run recover

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ClinicalDescriptorExtractor, TrialForDescriptorExtraction } from '../src/lib/extractors/clinical-descriptors';
import {
  CancerType,
  ExtractedTrial,
  ProcessedTrial,
  StructuredEligibilityFields,
  TrialsDataFile,
} from '../src/lib/types';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const CHECKPOINT_DIR = join(process.cwd(), 'data', 'checkpoints');

interface FetchedCheckpoint {
  generatedAt: string;
  model: string;
  totalFetched: number;
  trials: { cancerType: CancerType; trial: ProcessedTrial }[];
}

interface BasicCheckpoint {
  generatedAt: string;
  model: string;
  basicByNctId: Record<string, StructuredEligibilityFields>;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const fetchedPath = join(CHECKPOINT_DIR, '01-fetched.json');
  const basicPath = join(CHECKPOINT_DIR, '02-basic-eligibility.json');
  if (!existsSync(fetchedPath) || !existsSync(basicPath)) {
    throw new Error('Missing checkpoints 01-fetched.json or 02-basic-eligibility.json');
  }

  const fetched = JSON.parse(readFileSync(fetchedPath, 'utf8')) as FetchedCheckpoint;
  const basicCp = JSON.parse(readFileSync(basicPath, 'utf8')) as BasicCheckpoint;
  console.log(`Loaded ${fetched.trials.length} trials and ${Object.keys(basicCp.basicByNctId).length} basic extractions`);

  const descExtractor = new ClinicalDescriptorExtractor(MODEL);

  const descInputs: TrialForDescriptorExtraction[] = fetched.trials.map(({ cancerType, trial }) => {
    const basic = basicCp.basicByNctId[trial.nctId];
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

  console.log('Re-running descriptor extraction with 120s timeout...');
  const descMap = await descExtractor.extractBatch(
    descInputs,
    4,
    (n, t) => process.stdout.write(`\r  ${n}/${t}`),
  );
  console.log('\n');

  const extracted: ExtractedTrial[] = fetched.trials.map(({ cancerType, trial }) => ({
    ...trial,
    assignedCancerType: cancerType,
    basicFields: basicCp.basicByNctId[trial.nctId] ?? {
      cancerTypes: ['OTHER'],
      acceptsAllSolidTumors: false,
    },
    descriptors: descMap.get(trial.nctId) ?? {},
  }));

  const out: TrialsDataFile = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    trials: extracted,
  };

  const dataDir = join(process.cwd(), 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, 'trials.json');
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`Wrote ${path} (${extracted.length} trials)`);

  // Quick stats
  const empty = extracted.filter((t) => Object.values(t.descriptors).every((d) => !d || Object.keys(d).length === 0)).length;
  console.log(`Trials with empty descriptors: ${empty}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
