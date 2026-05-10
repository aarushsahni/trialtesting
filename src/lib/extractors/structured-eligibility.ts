// Basic eligibility extractor (cancer types, ECOG, prior treatment, age/sex).

import OpenAI from 'openai';
import {
  CancerType,
  SOLID_TUMOR_TYPES,
  TrialSex,
  StructuredEligibilityFields,
  ProcessedTrial,
} from '../types';
import { withRetry, runConcurrent } from '../rate-limiter';

const EXTRACTION_PROMPT = `You are a clinical trial eligibility extraction specialist. Analyze this clinical trial and extract ONLY the basic eligibility information about the target patient population.

TRIAL INFORMATION:
Title: {title}
Conditions: {conditions}
Interventions: {interventions}
Brief Summary: {summary}

ELIGIBILITY CRITERIA:
{eligibility}

Extract ONLY the following basic eligibility fields in JSON format. Use null for any values not explicitly stated or clearly implied.

IMPORTANT RULES:
1. For cancer types, identify ALL cancer types this trial accepts. Use these exact values:
   Solid tumors: PROSTATE, UROTHELIAL, RCC, TESTICULAR, BREAST, LUNG, COLORECTAL, HEAD_AND_NECK, OVARIAN, UTERINE, CERVICAL, MELANOMA, MESOTHELIOMA, GASTROESOPHAGEAL, NEUROENDOCRINE, PANCREATIC.
   Hematologic lineages (pick the LINEAGE; specific disease captured separately): MATURE_B_CELL, MATURE_T_NK_CELL, MYELOID_NEOPLASM, PRECURSOR_LYMPHOID, PLASMA_CELL.
   OTHER for cancers not fitting any category.

2. Set isBasketTrial=true if the trial accepts solid tumors broadly (e.g. "advanced solid tumor", "tumor agnostic", "basket"). When isBasketTrial=true, include ALL solid tumor types in cancerTypes.

3. For multi-cohort trials, include ALL cancer types with a dedicated cohort or explicitly mentioned as eligible.

4. When uncertain, INCLUDE the cancer type. False inclusions are less harmful than exclusions.

5. For ECOG performance status, extract the range (e.g., "ECOG 0-2" -> ecogMin: 0, ecogMax: 2).

6. For previouslyUntreated: true if the trial requires treatment-naive patients, false if prior treatment required, null if unspecified.

NOTE: Age and sex are extracted from structured CT.gov API fields, NOT from the eligibility text. Do NOT extract age or sex.

Respond with ONLY valid JSON matching this schema:

{
  "cancerTypes": [<one or more of the codes above>],
  "isBasketTrial": boolean,
  "ecogMin": number | null,
  "ecogMax": number | null,
  "previouslyUntreated": boolean | null
}`;

export class StructuredEligibilityExtractor {
  private openai: OpenAI;
  constructor(private model: string) {
    this.openai = new OpenAI({ timeout: 300_000, maxRetries: 0 });
  }

  async extractFromTrial(trial: ProcessedTrial): Promise<StructuredEligibilityFields> {
    const prompt = this.buildPrompt(trial);

    try {
      const response = await withRetry(async () => {
        return this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a clinical trial eligibility extraction specialist. Always respond with valid JSON only, no markdown or explanation.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          // gpt-5.x reasoning controls
          reasoning_effort: 'high',
        } as any);
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from LLM');
      const parsed = JSON.parse(content);
      const fields = this.validateAndNormalize(parsed);
      return this.applyCtGovNativeFields(fields, trial);
    } catch (error) {
      console.error(`Failed to extract structured eligibility for ${trial.nctId}:`, error);
      const fallback: StructuredEligibilityFields = {
        cancerTypes: ['OTHER'],
        acceptsAllSolidTumors: false,
      };
      return this.applyCtGovNativeFields(fallback, trial);
    }
  }

  async extractBatch(
    trials: ProcessedTrial[],
    batchSize = 5,
    onProgress?: (n: number, total: number) => void,
  ): Promise<Map<string, StructuredEligibilityFields>> {
    const results = new Map<string, StructuredEligibilityFields>();
    await runConcurrent(
      trials,
      batchSize,
      async (trial) => {
        const fields = await this.extractFromTrial(trial);
        results.set(trial.nctId, fields);
      },
      onProgress,
    );
    return results;
  }

  private buildPrompt(trial: ProcessedTrial): string {
    return EXTRACTION_PROMPT
      .replace('{title}', trial.briefTitle)
      .replace('{conditions}', trial.conditions.join(', ') || 'Not specified')
      .replace('{interventions}', trial.interventions.join(', ') || 'Not specified')
      .replace('{summary}', trial.briefSummary || 'Not available')
      .replace('{eligibility}', trial.eligibilityRaw || 'Not available');
  }

  private validateAndNormalize(data: unknown): StructuredEligibilityFields {
    const parsed = data as Record<string, unknown>;
    const isBasketTrial = Boolean(parsed.isBasketTrial);

    let cancerTypes: CancerType[] = Array.isArray(parsed.cancerTypes)
      ? (parsed.cancerTypes as CancerType[])
      : [];

    const valid: CancerType[] = [
      'PROSTATE','UROTHELIAL','RCC','TESTICULAR','BREAST','LUNG','COLORECTAL',
      'HEAD_AND_NECK','OVARIAN','UTERINE','CERVICAL','MELANOMA','MESOTHELIOMA',
      'GASTROESOPHAGEAL','NEUROENDOCRINE','PANCREATIC',
      'MATURE_B_CELL','MATURE_T_NK_CELL','MYELOID_NEOPLASM','PRECURSOR_LYMPHOID','PLASMA_CELL',
      'OTHER',
    ];
    cancerTypes = (cancerTypes as unknown as string[])
      .map((ct) => (ct === 'BLADDER' || ct === 'UPPER_TRACT_UROTHELIAL' || ct === 'URETHRAL_UROTHELIAL' ? 'UROTHELIAL' : ct) as CancerType)
      .filter((ct) => valid.includes(ct));
    cancerTypes = Array.from(new Set(cancerTypes));

    if (isBasketTrial) {
      const lineages = cancerTypes.filter((t) =>
        ['MATURE_B_CELL','MATURE_T_NK_CELL','MYELOID_NEOPLASM','PRECURSOR_LYMPHOID','PLASMA_CELL'].includes(t)
      );
      cancerTypes = Array.from(new Set([...SOLID_TUMOR_TYPES, ...lineages]));
    }

    if (cancerTypes.length === 0) cancerTypes = ['OTHER'];

    const num = (v: unknown): number | undefined => {
      if (v === null || v === undefined) return undefined;
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    };

    return {
      cancerTypes,
      acceptsAllSolidTumors: isBasketTrial,
      ecogMin: num(parsed.ecogMin),
      ecogMax: num(parsed.ecogMax),
      previouslyUntreated:
        parsed.previouslyUntreated === undefined || parsed.previouslyUntreated === null
          ? undefined
          : Boolean(parsed.previouslyUntreated),
    };
  }

  private applyCtGovNativeFields(
    fields: StructuredEligibilityFields,
    trial: ProcessedTrial,
  ): StructuredEligibilityFields {
    if (trial.ctGovSex) {
      const map: Record<string, TrialSex> = { Male: 'MALE', Female: 'FEMALE', All: 'ALL' };
      fields.allowedSex = map[trial.ctGovSex];
    }
    if (trial.ctGovMinAge) fields.minAge = parseAge(trial.ctGovMinAge);
    if (trial.ctGovMaxAge) fields.maxAge = parseAge(trial.ctGovMaxAge);
    return fields;
  }
}

function parseAge(s: string): number | undefined {
  const m = s.match(/^(\d+)\s*(Years?|Months?|Days?|Hours?|Minutes?)/i);
  if (!m) return undefined;
  const v = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  if (u.startsWith('year')) return v;
  if (u.startsWith('month')) return Math.round(v / 12);
  if (u.startsWith('day')) return Math.round(v / 365);
  return v;
}
