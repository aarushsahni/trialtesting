// Score a single annotation against the trial's reference key.
//
// The data model is two-level (TrialAnswers):
//   trial-level     : cancerTypes[], minAge, maxAge, ecogMin, ecogMax
//   cohorts[]       : each with own age/ECOG bounds + applicableCancerTypes
//                     keyed by CancerType → BlockAnswers (descriptor fields)
//
// Scoring iterates four levels: trial → cohort → cancerType → field.
//
// For every scorable atomic field we classify on populated-ness:
//   TP  = both reference and attempt populated (non-null, non-empty)
//   FP  = attempt populated, reference null
//   FN  = reference populated, attempt null
//   TN  = both null
//
// Aggregate F1 = 2*TP / (2*TP + FP + FN). Pass bar:
//   overall F1 ≥ 0.75 (single bar — no hard-exclude class threshold)
//
// Secondary metric (informational only, not the pass gate):
//   On the subset where both are populated, value agreement —
//     multi  : Jaccard on value sets
//     bool   : exact match
//     number : exact match
//
// Cohorts match by cohortKey string (case-sensitive). A cohort key that exists
// on only one side counts every populated descriptor on that side as FP / FN.
// OTHER as a key under applicableCancerTypes is allowed but its BlockDef has
// no fields, so its inner loop yields zero counters automatically.

import {
  query,
  AnnotationRow,
  ReferenceKeyRow,
} from './db';
import { BLOCKS } from './schema/field-schemas';
import {
  BlockAnswers, CancerType, Cohort, FieldClass, FieldDef, FieldValue,
  TrialAnswers, emptyTrialAnswers,
} from './types';

export const PASS_OVERALL_F1 = 0.75;

interface Counters { tp: number; fp: number; fn: number; tn: number }

export type FieldScope = 'trial' | 'cohort' | 'descriptor';

interface FieldDatum {
  nctId: string;
  scope: FieldScope;
  cohortKey: string | null;
  cancerType: CancerType | null;
  fieldKey: string;
  fieldClass: FieldClass;
  outcome: 'TP' | 'FP' | 'FN' | 'TN';
  valueAgreement: number | null;
}

export interface ScoreResult {
  overallF1: number;
  passed: boolean;
  passOverallBar: number;
  total: Counters;
  byClass: Record<FieldClass, Counters & { f1: number }>;
  byCohort: Record<string, Counters & { f1: number }>;
  byCancerType: Record<string, Counters & { f1: number }>;
  fields: FieldDatum[];
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function isPopulated(v: FieldValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function valueAgreement(
  kind: 'multi' | 'bool' | 'number',
  ref: FieldValue,
  att: FieldValue,
): number {
  if (kind === 'multi') {
    const r = new Set(Array.isArray(ref) ? ref : []);
    const a = new Set(Array.isArray(att) ? att : []);
    if (r.size === 0 && a.size === 0) return 1;
    let inter = 0, uni = 0;
    const all = new Set([...r, ...a]);
    for (const x of all) {
      const inR = r.has(x), inA = a.has(x);
      if (inR && inA) inter++;
      if (inR || inA) uni++;
    }
    return uni === 0 ? 1 : inter / uni;
  }
  return ref === att ? 1 : 0;
}

function f1FromCounters(c: Counters): number {
  const denom = 2 * c.tp + c.fp + c.fn;
  return denom === 0 ? 0 : (2 * c.tp) / denom;
}

function emptyCounters(): Counters { return { tp: 0, fp: 0, fn: 0, tn: 0 }; }
function withF1(c: Counters): Counters & { f1: number } { return { ...c, f1: f1FromCounters(c) }; }

function bumpCounter(c: Counters, outcome: FieldDatum['outcome']) {
  if (outcome === 'TP') c.tp++;
  else if (outcome === 'FP') c.fp++;
  else if (outcome === 'FN') c.fn++;
  else c.tn++;
}

function classify(refPop: boolean, attPop: boolean): FieldDatum['outcome'] {
  if (refPop && attPop) return 'TP';
  if (!refPop && attPop) return 'FP';
  if (refPop && !attPop) return 'FN';
  return 'TN';
}

const trialLevelDefs: Record<string, FieldDef> = {
  cancerTypes: { kind: 'multi', label: 'Cancer types', class: 'other' },
  minAge: { kind: 'number', label: 'Min age', class: 'other' },
  maxAge: { kind: 'number', label: 'Max age', class: 'other' },
  ecogMin: { kind: 'number', label: 'ECOG min', class: 'other' },
  ecogMax: { kind: 'number', label: 'ECOG max', class: 'other' },
};
const cohortLevelDefs: Record<string, FieldDef> = {
  minAge: trialLevelDefs.minAge,
  maxAge: trialLevelDefs.maxAge,
  ecogMin: trialLevelDefs.ecogMin,
  ecogMax: trialLevelDefs.ecogMax,
};

// ──────────────────────────────────────────────────────────────────────────
// Score one annotation against its reference key.
// ──────────────────────────────────────────────────────────────────────────

export async function scoreAnnotation(annotationId: string): Promise<ScoreResult> {
  const rows = await query<AnnotationRow>(
    `SELECT * FROM annotations WHERE id = $1`,
    [annotationId],
  );
  const annotation = rows[0];
  if (!annotation) throw new Error('Annotation not found');

  const keys = await query<ReferenceKeyRow>(
    `SELECT * FROM reference_keys WHERE nct_id = $1`,
    [annotation.nct_id],
  );
  const refTrial = (keys[0]?.key_data as unknown as TrialAnswers | undefined)
    ?? emptyTrialAnswers(annotation.nct_id);
  const attTrialRaw = (annotation.answers as unknown as TrialAnswers | undefined)
    ?? emptyTrialAnswers(annotation.nct_id);
  const attTrial = applyCohortMap(attTrialRaw, annotation.cohort_map ?? {});

  return scoreTrialAnswers(annotation.nct_id, refTrial, attTrial);
}

// Apply a reviewer-supplied { expertCohortKey → referenceCohortKey } map to
// an expert's TrialAnswers. Expert cohorts with a mapping get their cohortKey
// rewritten to the matched reference key so the existing cohortKey-matching
// scorer compares the right pairs. Unmapped expert cohorts keep their
// original key — they won't match any reference cohort and every populated
// descriptor inside them counts as FP.
export function applyCohortMap(
  att: TrialAnswers,
  map: Record<string, string>,
): TrialAnswers {
  if (!map || Object.keys(map).length === 0) return att;
  return {
    ...att,
    cohorts: (att.cohorts ?? []).map((c) => {
      const mapped = map[c.cohortKey];
      return mapped ? { ...c, cohortKey: mapped } : c;
    }),
  };
}

// Pure scoring of one trial's reference vs. attempt. Exported so aggregation
// or test-trial-comparison views can score in-memory without touching the DB.
export function scoreTrialAnswers(
  nctId: string,
  refTrial: TrialAnswers,
  attTrial: TrialAnswers,
): ScoreResult {
  const fields: FieldDatum[] = [];
  const total = emptyCounters();
  const byClass: Record<FieldClass, Counters> = {
    biomarker: emptyCounters(),
    prior_therapy: emptyCounters(),
    lab_cutoff: emptyCounters(),
    accepted_diseases: emptyCounters(),
    other: emptyCounters(),
  };
  const byCohort: Record<string, Counters> = {};
  const byCancerType: Record<string, Counters> = {};

  // ── trial-level scalars / multi ──
  for (const [fieldKey, def] of Object.entries(trialLevelDefs)) {
    const ref = (refTrial as unknown as Record<string, FieldValue>)[fieldKey] ?? null;
    const att = (attTrial as unknown as Record<string, FieldValue>)[fieldKey] ?? null;
    const refPop = isPopulated(ref);
    const attPop = isPopulated(att);
    const outcome = classify(refPop, attPop);
    const va = (refPop && attPop) ? valueAgreement(def.kind, ref, att) : null;
    bumpCounter(total, outcome);
    bumpCounter(byClass[def.class], outcome);
    fields.push({
      nctId, scope: 'trial', cohortKey: null, cancerType: null,
      fieldKey, fieldClass: def.class, outcome, valueAgreement: va,
    });
  }

  // ── cohorts ──
  const refCohortMap = new Map<string, Cohort>(
    (refTrial.cohorts ?? []).map(c => [c.cohortKey, c]),
  );
  const attCohortMap = new Map<string, Cohort>(
    (attTrial.cohorts ?? []).map(c => [c.cohortKey, c]),
  );
  const cohortKeys = new Set<string>([
    ...refCohortMap.keys(),
    ...attCohortMap.keys(),
  ]);

  for (const cohortKey of cohortKeys) {
    const refC = refCohortMap.get(cohortKey);
    const attC = attCohortMap.get(cohortKey);
    byCohort[cohortKey] = byCohort[cohortKey] ?? emptyCounters();

    for (const [fieldKey, def] of Object.entries(cohortLevelDefs)) {
      const ref = (refC ? (refC as unknown as Record<string, FieldValue>)[fieldKey] : null) ?? null;
      const att = (attC ? (attC as unknown as Record<string, FieldValue>)[fieldKey] : null) ?? null;
      const refPop = isPopulated(ref);
      const attPop = isPopulated(att);
      const outcome = classify(refPop, attPop);
      const va = (refPop && attPop) ? valueAgreement(def.kind, ref, att) : null;
      bumpCounter(total, outcome);
      bumpCounter(byClass[def.class], outcome);
      bumpCounter(byCohort[cohortKey], outcome);
      fields.push({
        nctId, scope: 'cohort', cohortKey, cancerType: null,
        fieldKey, fieldClass: def.class, outcome, valueAgreement: va,
      });
    }

    const refCts = Object.keys(refC?.applicableCancerTypes ?? {}) as CancerType[];
    const attCts = Object.keys(attC?.applicableCancerTypes ?? {}) as CancerType[];
    const ctUnion = new Set<CancerType>([...refCts, ...attCts]);

    for (const ct of ctUnion) {
      const block = BLOCKS[ct];
      if (!block) continue;
      byCancerType[ct] = byCancerType[ct] ?? emptyCounters();

      const refBlock: BlockAnswers = refC?.applicableCancerTypes?.[ct] ?? {};
      const attBlock: BlockAnswers = attC?.applicableCancerTypes?.[ct] ?? {};

      for (const [fieldKey, def] of Object.entries(block.fields)) {
        const ref = (refBlock[fieldKey] ?? null) as FieldValue;
        const att = (attBlock[fieldKey] ?? null) as FieldValue;
        const refPop = isPopulated(ref);
        const attPop = isPopulated(att);
        const outcome = classify(refPop, attPop);
        const va = (refPop && attPop) ? valueAgreement(def.kind, ref, att) : null;
        bumpCounter(total, outcome);
        bumpCounter(byClass[def.class], outcome);
        bumpCounter(byCohort[cohortKey], outcome);
        bumpCounter(byCancerType[ct], outcome);
        fields.push({
          nctId, scope: 'descriptor', cohortKey, cancerType: ct,
          fieldKey, fieldClass: def.class, outcome, valueAgreement: va,
        });
      }
    }
  }

  const overallF1 = f1FromCounters(total);
  const passed = overallF1 >= PASS_OVERALL_F1;

  const byClassWithF1: Record<FieldClass, Counters & { f1: number }> = {
    biomarker: withF1(byClass.biomarker),
    prior_therapy: withF1(byClass.prior_therapy),
    lab_cutoff: withF1(byClass.lab_cutoff),
    accepted_diseases: withF1(byClass.accepted_diseases),
    other: withF1(byClass.other),
  };
  const byCohortWithF1: Record<string, Counters & { f1: number }> = {};
  for (const k of Object.keys(byCohort)) byCohortWithF1[k] = withF1(byCohort[k]);
  const byCancerTypeWithF1: Record<string, Counters & { f1: number }> = {};
  for (const k of Object.keys(byCancerType)) byCancerTypeWithF1[k] = withF1(byCancerType[k]);

  return {
    overallF1, passed,
    passOverallBar: PASS_OVERALL_F1,
    total,
    byClass: byClassWithF1,
    byCohort: byCohortWithF1,
    byCancerType: byCancerTypeWithF1,
    fields,
  };
}

// Aggregate multiple per-trial score results into one rollup. Used to show
// an expert's overall test-trial performance across their assigned tests.
export function aggregateScoreResults(results: ScoreResult[]): ScoreResult {
  const total = emptyCounters();
  const byClass: Record<FieldClass, Counters> = {
    biomarker: emptyCounters(),
    prior_therapy: emptyCounters(),
    lab_cutoff: emptyCounters(),
    accepted_diseases: emptyCounters(),
    other: emptyCounters(),
  };
  const byCohort: Record<string, Counters> = {};
  const byCancerType: Record<string, Counters> = {};
  const fields: FieldDatum[] = [];

  for (const r of results) {
    sum(total, r.total);
    for (const k of Object.keys(r.byClass) as FieldClass[]) sum(byClass[k], r.byClass[k]);
    for (const k of Object.keys(r.byCohort)) {
      byCohort[k] = byCohort[k] ?? emptyCounters();
      sum(byCohort[k], r.byCohort[k]);
    }
    for (const k of Object.keys(r.byCancerType)) {
      byCancerType[k] = byCancerType[k] ?? emptyCounters();
      sum(byCancerType[k], r.byCancerType[k]);
    }
    fields.push(...r.fields);
  }

  const overallF1 = f1FromCounters(total);
  return {
    overallF1,
    passed: overallF1 >= PASS_OVERALL_F1,
    passOverallBar: PASS_OVERALL_F1,
    total,
    byClass: Object.fromEntries(
      (Object.keys(byClass) as FieldClass[]).map((k) => [k, withF1(byClass[k])]),
    ) as Record<FieldClass, Counters & { f1: number }>,
    byCohort: Object.fromEntries(Object.keys(byCohort).map((k) => [k, withF1(byCohort[k])])),
    byCancerType: Object.fromEntries(Object.keys(byCancerType).map((k) => [k, withF1(byCancerType[k])])),
    fields,
  };
}

function sum(into: Counters, from: Counters) {
  into.tp += from.tp;
  into.fp += from.fp;
  into.fn += from.fn;
  into.tn += from.tn;
}
