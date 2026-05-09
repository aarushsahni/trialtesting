// ClinicalTrials.gov API v2 client — fetches COMPLETED trials.

import { CTGovSearchResponse, CTGovStudy, ProcessedTrial } from './types';
import { createCTGovRateLimiter, withRetry } from './rate-limiter';

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

export class ClinicalTrialsAPI {
  private rateLimiter = createCTGovRateLimiter();

  /**
   * Fetch up to N completed INTERVENTIONAL trials matching a condition.
   * Filters out observational, community-health, registry, and validation studies —
   * none of which the eligibility extractors are designed for. No phase restriction.
   */
  async fetchCompletedByCondition(condition: string, limit: number): Promise<CTGovStudy[]> {
    const results: CTGovStudy[] = [];
    let pageToken: string | undefined;

    while (results.length < limit) {
      await this.rateLimiter.acquire();
      const remaining = limit - results.length;
      const params = new URLSearchParams({
        'query.cond': condition,
        'query.term': 'AREA[StudyType]INTERVENTIONAL',
        'filter.overallStatus': 'COMPLETED',
        pageSize: String(Math.min(remaining, 50)),
        countTotal: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `${BASE_URL}?${params.toString()}`;
      const json = await withRetry(async () => {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`CT.gov error ${res.status} ${res.statusText}`);
        return res.json() as Promise<CTGovSearchResponse>;
      });

      results.push(...json.studies);
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }

    return results.slice(0, limit);
  }
}

export function studyToProcessedTrial(study: CTGovStudy): ProcessedTrial {
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
    briefSummary: desc?.briefSummary,
    detailedDescription: desc?.detailedDescription,
    eligibilityRaw: elig?.eligibilityCriteria,
    conditions: cond?.conditions ?? [],
    interventions: (arms?.interventions ?? []).map((i) => i.name),
    ctGovSex: elig?.sex,
    ctGovMinAge: elig?.minimumAge,
    ctGovMaxAge: elig?.maximumAge,
    overallStatus: status?.overallStatus,
    studyType: design?.studyType,
    phases: design?.phases,
  };
}
