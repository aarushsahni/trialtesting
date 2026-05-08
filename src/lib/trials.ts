// Server-side trial loader. Reads data/trials.json once.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { TrialsDataFile, ExtractedTrial } from './types';

let cached: TrialsDataFile | null = null;

export function loadTrialsFile(): TrialsDataFile {
  if (cached) return cached;
  const path = join(process.cwd(), 'data', 'trials.json');
  if (!existsSync(path)) {
    return { generatedAt: '', model: '', trials: [] };
  }
  cached = JSON.parse(readFileSync(path, 'utf8')) as TrialsDataFile;
  return cached;
}

export function getTrial(nctId: string): ExtractedTrial | undefined {
  return loadTrialsFile().trials.find((t) => t.nctId === nctId);
}

export function listTrials(): ExtractedTrial[] {
  return loadTrialsFile().trials;
}
