// Server-side trial loader. Imports data/trials.json statically so Next.js
// bundles it into the serverless function — works on Vercel without any
// runtime file-system access.
import trialsData from '../../data/trials.json';
import { TrialsDataFile, ExtractedTrial } from './types';

export function loadTrialsFile(): TrialsDataFile {
  return trialsData as unknown as TrialsDataFile;
}

export function getTrial(nctId: string): ExtractedTrial | undefined {
  return loadTrialsFile().trials.find((t) => t.nctId === nctId);
}

export function listTrials(): ExtractedTrial[] {
  return loadTrialsFile().trials;
}
