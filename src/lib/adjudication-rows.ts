// Field-by-field comparison of two expert annotations of one trial. Shared by
// the adjudication screen and the label export so "agreed" vs "disagreed"
// means the same thing in both places. Pure — safe to import client-side.

import { BLOCKS } from './schema/field-schemas';
import {
  ALL_CANCER_TYPES, CANCER_TYPE_DEFINITIONS, CancerType, Cohort, FieldDef,
  FieldValue, TRIAL_LEVEL_SENTINEL, TrialAnswers,
} from './types';

export const TRIAL_LEVEL_DEFS: Record<string, FieldDef> = {
  cancerTypes: { kind: 'multi', label: 'Cancer types', options: ALL_CANCER_TYPES, optionHelp: CANCER_TYPE_DEFINITIONS, class: 'other' },
  minAge:      { kind: 'number', label: 'Min age',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max', class: 'other' },
};
export const COHORT_LEVEL_DEFS: Record<string, FieldDef> = {
  minAge:      { kind: 'number', label: 'Min age (cohort)',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age (cohort)',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min (cohort)', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max (cohort)', class: 'other' },
};
export const COHORT_EXISTS_FIELD = '__cohort_exists__';
const COHORT_EXISTS_DEF: FieldDef = { kind: 'bool', label: 'Cohort belongs on final label', class: 'other' };

export type ComparisonScope = 'trial' | 'cohort' | 'descriptor' | 'cohort_existence';

export interface ComparisonRow {
  cohortKey: string;
  cancerType: string;
  scope: ComparisonScope;
  cohortDisplayName?: string;
  fieldKey: string;
  def: FieldDef;
  a: FieldValue;
  b: FieldValue;
  agree: boolean;
}

// Canonical form for equality: null and [] are the same, arrays are order-insensitive.
export function normValue(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'null';
    return JSON.stringify([...v].sort());
  }
  return JSON.stringify(v);
}

export function adjudicationKey(cohortKey: string, cancerType: string, fieldKey: string): string {
  return `${cohortKey}|${cancerType}|${fieldKey}`;
}

function field(obj: unknown, fieldKey: string): FieldValue {
  if (!obj) return null;
  const v = (obj as Record<string, FieldValue>)[fieldKey];
  return v === undefined ? null : v;
}

function descriptor(c: Cohort | undefined, ct: CancerType, fieldKey: string): FieldValue {
  const block = c?.applicableCancerTypes?.[ct];
  return block ? field(block, fieldKey) : null;
}

// Cohorts are matched across the two annotations by cohortKey. When only one
// annotation is present, every row has agree=false and the missing side's
// value is null.
export function buildComparisonRows(a: TrialAnswers | undefined, b: TrialAnswers | undefined): ComparisonRow[] {
  const both = !!a && !!b;
  const out: ComparisonRow[] = [];

  for (const [fk, def] of Object.entries(TRIAL_LEVEL_DEFS)) {
    const av = field(a, fk);
    const bv = field(b, fk);
    out.push({
      cohortKey: TRIAL_LEVEL_SENTINEL, cancerType: TRIAL_LEVEL_SENTINEL,
      scope: 'trial', fieldKey: fk, def, a: av, b: bv,
      agree: both && normValue(av) === normValue(bv),
    });
  }

  const cohortMap = new Map<string, { a?: Cohort; b?: Cohort }>();
  for (const c of a?.cohorts ?? []) cohortMap.set(c.cohortKey, { ...cohortMap.get(c.cohortKey), a: c });
  for (const c of b?.cohorts ?? []) cohortMap.set(c.cohortKey, { ...cohortMap.get(c.cohortKey), b: c });

  for (const [cohortKey, sources] of cohortMap) {
    const cohortDisplayName = sources.a?.displayName ?? sources.b?.displayName ?? cohortKey;

    out.push({
      cohortKey, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort_existence',
      cohortDisplayName, fieldKey: COHORT_EXISTS_FIELD, def: COHORT_EXISTS_DEF,
      a: a ? !!sources.a : null,
      b: b ? !!sources.b : null,
      agree: both && !!sources.a === !!sources.b,
    });

    for (const [fk, def] of Object.entries(COHORT_LEVEL_DEFS)) {
      const av = field(sources.a, fk);
      const bv = field(sources.b, fk);
      out.push({
        cohortKey, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort',
        cohortDisplayName, fieldKey: fk, def, a: av, b: bv,
        agree: both && normValue(av) === normValue(bv),
      });
    }

    const ctSet = new Set<CancerType>([
      ...Object.keys(sources.a?.applicableCancerTypes ?? {}),
      ...Object.keys(sources.b?.applicableCancerTypes ?? {}),
    ] as CancerType[]);

    for (const ct of ctSet) {
      const block = BLOCKS[ct];
      if (!block) continue;
      for (const [fk, def] of Object.entries(block.fields)) {
        const av = descriptor(sources.a, ct, fk);
        const bv = descriptor(sources.b, ct, fk);
        out.push({
          cohortKey, cancerType: ct, scope: 'descriptor',
          cohortDisplayName, fieldKey: fk, def, a: av, b: bv,
          agree: both && normValue(av) === normValue(bv),
        });
      }
    }
  }
  return out;
}
