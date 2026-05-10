// Find trials in data/trials.json with all-empty descriptor sections and
// re-run descriptor extraction only on those, merging results back in.
//   npm run refill

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ClinicalDescriptorExtractor,
  TrialForDescriptorExtraction,
} from '../src/lib/extractors/clinical-descriptors';
import { CancerType, TrialsDataFile } from '../src/lib/types';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const trialsPath = join(process.cwd(), 'data', 'trials.json');
  const data = JSON.parse(readFileSync(trialsPath, 'utf8')) as TrialsDataFile;

  // Identify trials whose every descriptor section is empty
  const empties = data.trials.filter((t) => {
    const sections = Object.entries(t.descriptors || {});
    if (sections.length === 0) return true;
    return sections.every(([, v]) => !v || Object.keys(v).length === 0);
  });

  console.log(`Found ${empties.length} trials with all-empty descriptors`);
  if (empties.length === 0) return;

  for (const t of empties) console.log(`  ${t.nctId} (${t.assignedCancerType})`);

  const descExtractor = new ClinicalDescriptorExtractor(MODEL);

  const inputs: TrialForDescriptorExtraction[] = empties.map((t) => {
    const types = new Set<CancerType>(t.basicFields.cancerTypes ?? []);
    types.add(t.assignedCancerType);
    types.delete('OTHER');
    return {
      nctId: t.nctId,
      briefTitle: t.briefTitle,
      briefSummary: t.briefSummary,
      eligibilityRaw: t.eligibilityRaw,
      conditions: t.conditions,
      interventions: t.interventions,
      cancerTypes: Array.from(types),
    };
  });

  console.log('\nRe-extracting descriptors...');
  const map = await descExtractor.extractBatch(
    inputs,
    4,
    (n, total) => process.stdout.write(`\r  ${n}/${total}`),
  );
  console.log('\n');

  // Merge new descriptors back into trials.json
  let stillEmpty = 0;
  for (const t of data.trials) {
    if (map.has(t.nctId)) {
      const newDesc = map.get(t.nctId)!;
      const sections = Object.entries(newDesc);
      const hasAny = sections.some(([, v]) => v && Object.keys(v).length > 0);
      if (hasAny) {
        t.descriptors = newDesc;
      } else {
        stillEmpty++;
      }
    }
  }

  data.generatedAt = new Date().toISOString();
  writeFileSync(trialsPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${trialsPath}`);
  console.log(`Refilled: ${empties.length - stillEmpty} / ${empties.length}`);
  if (stillEmpty > 0) {
    console.log(`Still empty after retry: ${stillEmpty} (likely genuinely uninformative eligibility text)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
