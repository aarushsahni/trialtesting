// ClinicalTrials.gov API v2 helpers used by seed scripts and any
// reviewer-side "fetch a trial" code path.

import { CancerType, CTGovStudy } from './types';

// Parse a CT.gov age string ("18 Years", "6 Months", "N/A", "") into a number
// of years. Returns null when the value isn't a Year-denominated age.
// CT.gov uses Years for almost every trial — months/weeks/days are rare and
// rounding them silently would be misleading, so we leave them null.
export function parseCtgovAgeYears(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (!t || t.toUpperCase() === 'N/A') return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:Years?|yrs?)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

export async function fetchStudy(nctId: string): Promise<CTGovStudy> {
  const res = await fetch(`${BASE_URL}/${nctId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`CT.gov error for ${nctId}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as CTGovStudy;
}

// Map a CT.gov study to the columns of the `trials` table. assignedCancerTypes
// is supplied by the caller (from the seed CSV).
export interface TrialInsertValues {
  nctId: string;
  briefTitle: string;
  briefSummary: string | null;
  detailedDescription: string | null;
  eligibilityRaw: string | null;
  conditions: string[];
  interventions: string[];
  ctgovSex: string | null;
  ctgovMinAge: string | null;
  ctgovMaxAge: string | null;
  overallStatus: string | null;
  studyType: string | null;
  phases: string[] | null;
  assignedCancerTypes: CancerType[];
}

export function studyToInsertValues(
  study: CTGovStudy,
  assignedCancerTypes: CancerType[],
): TrialInsertValues {
  const id = study.protocolSection.identificationModule;
  const desc = study.protocolSection.descriptionModule;
  const cond = study.protocolSection.conditionsModule;
  const arms = study.protocolSection.armsInterventionsModule;
  const elig = study.protocolSection.eligibilityModule;
  const status = study.protocolSection.statusModule;
  const design = study.protocolSection.designModule;

  return {
    nctId: id.nctId,
    briefTitle: id.briefTitle,
    briefSummary: desc?.briefSummary ?? null,
    detailedDescription: desc?.detailedDescription ?? null,
    eligibilityRaw: elig?.eligibilityCriteria ?? null,
    conditions: cond?.conditions ?? [],
    interventions: (arms?.interventions ?? []).map((i) => i.name),
    ctgovSex: elig?.sex ?? null,
    ctgovMinAge: elig?.minimumAge ?? null,
    ctgovMaxAge: elig?.maximumAge ?? null,
    overallStatus: status?.overallStatus ?? null,
    studyType: design?.studyType ?? null,
    phases: design?.phases ?? null,
    assignedCancerTypes,
  };
}
