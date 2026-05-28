// Score a qualification attempt against the set's reference keys.
//
// Primary metric per study plan §5.3 and §8a — field-detection F1:
//   For each field × each trial × each assigned block, classify:
//     TP  = both reference and attempt populated (non-null, non-empty)
//     FP  = attempt populated, reference null
//     FN  = reference populated, attempt null
//     TN  = both null
//
// Aggregate F1 = 2*TP / (2*TP + FP + FN). Pass bar:
//   overall F1 >= 0.75 AND hard-exclude F1 >= 0.80
//
// Hard-exclude classes: biomarker, prior_therapy, lab_cutoff, accepted_diseases.
//
// Secondary metric (informational only, not the pass gate):
//   On the subset where both are populated, value agreement —
//     multi: Jaccard on value sets
//     bool / number: exact match

import { query, QualificationAttemptRow, QualificationSetRow, ReferenceKeyRow } from './db';
import { BLOCKS } from './schema/field-schemas';
import { BlockAnswers, BlockKey, FieldClass, FieldDef, FieldValue, HARD_EXCLUDE_CLASSES, TrialAnswers } from './types';

export const PASS_OVERALL_F1 = 0.75;
export const PASS_HARD_F1 = 0.80;

interface Counters { tp: number; fp: number; fn: number; tn: number }

interface FieldDatum {
  nctId: string;
  block: BlockKey;
  fieldKey: string;
  fieldClass: FieldClass;
  outcome: 'TP' | 'FP' | 'FN' | 'TN';
  valueAgreement: number | null; // 0..1 for both-populated subset; null otherwise
}

export interface ScoreResult {
  overallF1: number;
  hardExcludeF1: number;
  passed: boolean;
  passOverallBar: number;
  passHardBar: number;
  total: Counters;
  hardExclude: Counters;
  byClass: Record<FieldClass, Counters & { f1: number }>;
  byBlock: Record<string, Counters & { f1: number }>;
  fields: FieldDatum[]; // per-field breakdown for the reviewer dashboard
}

function isPopulated(v: FieldValue): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function valueAgreement(def: FieldDef, ref: FieldValue, att: FieldValue): number {
  if (def.kind === 'multi') {
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
  if (def.kind === 'bool') {
    return ref === att ? 1 : 0;
  }
  if (def.kind === 'number') {
    return ref === att ? 1 : 0;
  }
  return 0;
}

function f1FromCounters(c: Counters): number {
  const denom = 2 * c.tp + c.fp + c.fn;
  return denom === 0 ? 0 : (2 * c.tp) / denom;
}

function emptyCounters(): Counters { return { tp: 0, fp: 0, fn: 0, tn: 0 }; }

export async function scoreAttempt(attemptId: string): Promise<ScoreResult> {
  // 1. Load attempt + set + reference keys + trial assignments
  const attempts = await query<QualificationAttemptRow>(
    `SELECT * FROM qualification_attempts WHERE id = $1`,
    [attemptId],
  );
  const attempt = attempts[0];
  if (!attempt) throw new Error('Attempt not found');

  const sets = await query<QualificationSetRow>(
    `SELECT * FROM qualification_sets WHERE id = $1`,
    [attempt.qualification_set_id],
  );
  const set = sets[0];
  if (!set) throw new Error('Set not found');

  const keys = await query<ReferenceKeyRow>(
    `SELECT * FROM reference_keys WHERE qualification_set_id = $1`,
    [set.id],
  );
  const keyByNct = new Map(keys.map(k => [k.nct_id, k.key_data as TrialAnswers]));

  const trialAssignments = await query<{ nct_id: string; assigned_blocks: string[] }>(
    `SELECT nct_id, assigned_blocks FROM qualification_trials WHERE nct_id = ANY($1::text[])`,
    [set.trial_nct_ids],
  );

  const attemptAnswers = (attempt.answers ?? {}) as Record<string, TrialAnswers>;

  // 2. Iterate fields
  const fields: FieldDatum[] = [];
  const total = emptyCounters();
  const hardExclude = emptyCounters();
  const byClass: Record<FieldClass, Counters & { f1: number }> = {
    biomarker: { ...emptyCounters(), f1: 0 },
    prior_therapy: { ...emptyCounters(), f1: 0 },
    lab_cutoff: { ...emptyCounters(), f1: 0 },
    accepted_diseases: { ...emptyCounters(), f1: 0 },
    other: { ...emptyCounters(), f1: 0 },
  };
  const byBlock: Record<string, Counters & { f1: number }> = {};

  for (const tr of trialAssignments) {
    const refTrial = keyByNct.get(tr.nct_id) ?? {};
    const attTrial = attemptAnswers[tr.nct_id] ?? {};

    for (const blockKey of tr.assigned_blocks as BlockKey[]) {
      const block = BLOCKS[blockKey];
      if (!block) continue;
      const refBlock: BlockAnswers = (refTrial[blockKey] ?? {}) as BlockAnswers;
      const attBlock: BlockAnswers = (attTrial[blockKey] ?? {}) as BlockAnswers;
      byBlock[blockKey] = byBlock[blockKey] ?? { ...emptyCounters(), f1: 0 };

      for (const [fieldKey, def] of Object.entries(block.fields)) {
        const ref = (refBlock[fieldKey] ?? null) as FieldValue;
        const att = (attBlock[fieldKey] ?? null) as FieldValue;
        const refPop = isPopulated(ref);
        const attPop = isPopulated(att);

        let outcome: FieldDatum['outcome'];
        if (refPop && attPop) outcome = 'TP';
        else if (!refPop && attPop) outcome = 'FP';
        else if (refPop && !attPop) outcome = 'FN';
        else outcome = 'TN';

        const va = (refPop && attPop) ? valueAgreement(def, ref, att) : null;

        // increment counters
        const incr = (c: Counters) => {
          if (outcome === 'TP') c.tp++;
          else if (outcome === 'FP') c.fp++;
          else if (outcome === 'FN') c.fn++;
          else c.tn++;
        };
        incr(total);
        incr(byClass[def.class]);
        incr(byBlock[blockKey]);
        if (HARD_EXCLUDE_CLASSES.includes(def.class)) incr(hardExclude);

        fields.push({
          nctId: tr.nct_id, block: blockKey, fieldKey, fieldClass: def.class,
          outcome, valueAgreement: va,
        });
      }
    }
  }

  // 3. Compute F1s
  const overallF1 = f1FromCounters(total);
  const hardExcludeF1 = f1FromCounters(hardExclude);
  for (const k of Object.keys(byClass) as FieldClass[]) {
    byClass[k].f1 = f1FromCounters(byClass[k]);
  }
  for (const k of Object.keys(byBlock)) {
    byBlock[k].f1 = f1FromCounters(byBlock[k]);
  }

  const passed = overallF1 >= PASS_OVERALL_F1 && hardExcludeF1 >= PASS_HARD_F1;

  return {
    overallF1, hardExcludeF1, passed,
    passOverallBar: PASS_OVERALL_F1, passHardBar: PASS_HARD_F1,
    total, hardExclude, byClass, byBlock, fields,
  };
}
