// Label export for the main (non-test) corpus.
//
// Each main trial is tagged with two annotator slots (trials.annotator_slot_1
// and _2). "Annotator 1" is the annotation by the expert holding slot_1, and
// "Annotator 2" the one holding slot_2. If an annotation can't be matched by
// slot (e.g. a slot was reassigned after the work was done), it fills the
// remaining position in started_at order.
//
// The adjudicated label for each field is, in priority order:
//   adjudicated      — a reviewer decision exists in trial_adjudications
//   agreed           — both annotators gave the same value
//   single_annotator — only one submitted annotation exists
//   unresolved       — the annotators disagree and nobody has decided (value null)

import { query } from './db';
import { buildComparisonRows, adjudicationKey } from './adjudication-rows';
import {
  BlockAnswers, CancerType, Cohort, FieldValue, TrialAnswers,
} from './types';

export type LabelSource = 'annotator1' | 'annotator2' | 'adjudicated';
export type FieldSource = 'adjudicated' | 'agreed' | 'single_annotator' | 'unresolved';

export interface CorpusAnnotation {
  expertName: string;
  status: 'in_progress' | 'submitted';
  submittedAt: string | null;
  notes: string;
  answers: TrialAnswers;
}

export interface CorpusTrial {
  nctId: string;
  briefTitle: string;
  position: number;
  annotator1: CorpusAnnotation | null;
  annotator2: CorpusAnnotation | null;
  adjudications: Map<string, { value: FieldValue; decidedBy: string | null; decidedAt: string }>;
}

interface TrialDbRow {
  nct_id: string;
  brief_title: string;
  position: number;
  annotator_slot_1: number | null;
  annotator_slot_2: number | null;
}

interface AnnotationDbRow {
  nct_id: string;
  expert_name: string;
  expert_slot: number | null;
  status: 'in_progress' | 'submitted';
  submitted_at: string | null;
  notes: string;
  answers: TrialAnswers;
}

interface AdjudicationDbRow {
  nct_id: string;
  cohort_key: string;
  cancer_type: string;
  field_key: string;
  final_value: { v: FieldValue };
  decided_by_name: string | null;
  decided_at: string;
}

function emptyAnswers(nctId: string): TrialAnswers {
  return { nctId, expertId: null, cancerTypes: [], minAge: null, maxAge: null, ecogMin: null, ecogMax: null, cohorts: [] };
}

// Only submitted annotations count — an in-progress annotation isn't a label yet.
export async function loadCorpus(): Promise<CorpusTrial[]> {
  const [trials, annotations, adjudications] = await Promise.all([
    query<TrialDbRow>(`
      SELECT nct_id, brief_title, position, annotator_slot_1, annotator_slot_2
      FROM trials WHERE is_test_trial = FALSE
      ORDER BY position, nct_id
    `),
    query<AnnotationDbRow>(`
      SELECT a.nct_id, u.name AS expert_name, u.annotator_slot AS expert_slot,
             a.status, a.submitted_at, a.notes, a.answers
      FROM annotations a
      JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
      JOIN users u ON u.id = a.expert_id
      WHERE ta.is_test_trial = FALSE AND a.status = 'submitted'
      ORDER BY a.started_at
    `),
    query<AdjudicationDbRow>(`
      SELECT td.nct_id, td.cohort_key, td.cancer_type, td.field_key, td.final_value,
             u.name AS decided_by_name, td.decided_at
      FROM trial_adjudications td
      LEFT JOIN users u ON u.id = td.decided_by
    `),
  ]);

  const annByTrial = new Map<string, AnnotationDbRow[]>();
  for (const a of annotations) {
    const list = annByTrial.get(a.nct_id) ?? [];
    list.push(a);
    annByTrial.set(a.nct_id, list);
  }
  const adjByTrial = new Map<string, CorpusTrial['adjudications']>();
  for (const d of adjudications) {
    const m = adjByTrial.get(d.nct_id) ?? new Map();
    m.set(adjudicationKey(d.cohort_key, d.cancer_type, d.field_key), {
      value: d.final_value?.v ?? null, decidedBy: d.decided_by_name, decidedAt: d.decided_at,
    });
    adjByTrial.set(d.nct_id, m);
  }

  return trials.map((t) => {
    const anns = annByTrial.get(t.nct_id) ?? [];
    let first = anns.find((a) => a.expert_slot !== null && a.expert_slot === t.annotator_slot_1) ?? null;
    let second = anns.find((a) => a !== first && a.expert_slot !== null && a.expert_slot === t.annotator_slot_2) ?? null;
    const rest = anns.filter((a) => a !== first && a !== second);
    if (!first) first = rest.shift() ?? null;
    if (!second) second = rest.shift() ?? null;

    const toCorpus = (a: AnnotationDbRow | null): CorpusAnnotation | null => a && {
      expertName: a.expert_name,
      status: a.status,
      submittedAt: a.submitted_at,
      notes: a.notes ?? '',
      answers: Array.isArray(a.answers?.cohorts) ? a.answers : emptyAnswers(t.nct_id),
    };

    return {
      nctId: t.nct_id,
      briefTitle: t.brief_title,
      position: t.position,
      annotator1: toCorpus(first),
      annotator2: toCorpus(second),
      adjudications: adjByTrial.get(t.nct_id) ?? new Map(),
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Flattening one annotation into field rows
// ──────────────────────────────────────────────────────────────────────────

export interface FieldRow {
  scope: 'trial' | 'cohort' | 'descriptor' | 'cohort_existence';
  cohortKey: string;
  cohortDisplayName: string;
  cancerType: string;
  fieldKey: string;
  fieldClass: string;
  fieldKind: string;
  value: FieldValue;
}

// Re-uses the comparison builder with a single side so a single annotation
// flattens into exactly the same rows (and field order) as the adjudicated export.
export function flattenAnnotation(answers: TrialAnswers): FieldRow[] {
  return buildComparisonRows(answers, undefined)
    .filter((r) => r.scope !== 'cohort_existence')
    .map((r) => ({
      scope: r.scope,
      cohortKey: r.cohortKey,
      cohortDisplayName: r.cohortDisplayName ?? '',
      cancerType: r.cancerType,
      fieldKey: r.fieldKey,
      fieldClass: r.def.class,
      fieldKind: r.def.kind,
      value: r.a,
    }));
}

// ──────────────────────────────────────────────────────────────────────────
// Adjudicated merge
// ──────────────────────────────────────────────────────────────────────────

export interface MergedRow extends FieldRow {
  source: FieldSource;
  annotator1Value: FieldValue;
  annotator2Value: FieldValue;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface MergedTrial {
  answers: TrialAnswers;
  rows: MergedRow[];
  unresolved: { cohortKey: string; cancerType: string; fieldKey: string }[];
}

export function mergeAdjudicated(trial: CorpusTrial): MergedTrial | null {
  const a = trial.annotator1?.answers;
  const b = trial.annotator2?.answers;
  if (!a && !b) return null;

  const comparison = buildComparisonRows(a, b);
  const rows: MergedRow[] = comparison.map((r) => {
    const adj = trial.adjudications.get(adjudicationKey(r.cohortKey, r.cancerType, r.fieldKey));
    let source: FieldSource;
    let value: FieldValue;
    if (adj) { source = 'adjudicated'; value = adj.value; }
    else if (!a || !b) { source = 'single_annotator'; value = a ? r.a : r.b; }
    else if (r.agree) { source = 'agreed'; value = r.a; }
    else { source = 'unresolved'; value = null; }
    return {
      scope: r.scope,
      cohortKey: r.cohortKey,
      cohortDisplayName: r.cohortDisplayName ?? '',
      cancerType: r.cancerType,
      fieldKey: r.fieldKey,
      fieldClass: r.def.class,
      fieldKind: r.def.kind,
      value,
      source,
      annotator1Value: r.a,
      annotator2Value: r.b,
      decidedBy: adj?.decidedBy ?? null,
      decidedAt: adj?.decidedAt ?? null,
    };
  });

  // A cohort is dropped only when its existence was explicitly decided false.
  // An unresolved existence keeps the cohort (it's flagged in `unresolved`).
  const dropped = new Set(
    rows.filter((r) => r.scope === 'cohort_existence' && r.source === 'adjudicated' && r.value === false)
      .map((r) => r.cohortKey),
  );
  const kept = rows.filter((r) => r.scope === 'trial' || r.scope === 'cohort_existence' || !dropped.has(r.cohortKey));

  const trialValue = (fk: string) =>
    kept.find((r) => r.scope === 'trial' && r.fieldKey === fk)?.value ?? null;

  const cohortsByKey = new Map<string, Cohort>();
  const sourceCohorts = new Map<string, Cohort>();
  for (const c of [...(a?.cohorts ?? []), ...(b?.cohorts ?? [])]) {
    if (!sourceCohorts.has(c.cohortKey)) sourceCohorts.set(c.cohortKey, c);
  }
  for (const r of kept) {
    if (r.scope === 'trial' || r.scope === 'cohort_existence') continue;
    let c = cohortsByKey.get(r.cohortKey);
    if (!c) {
      c = {
        cohortKey: r.cohortKey,
        displayName: r.cohortDisplayName,
        applicableCancerTypes: {},
        minAge: null, maxAge: null, ecogMin: null, ecogMax: null,
      };
      cohortsByKey.set(r.cohortKey, c);
    }
    if (r.scope === 'cohort') {
      (c as unknown as Record<string, FieldValue>)[r.fieldKey] = r.value;
    } else {
      const ct = r.cancerType as CancerType;
      const block: BlockAnswers = c.applicableCancerTypes[ct] ?? {};
      block[r.fieldKey] = r.value;
      c.applicableCancerTypes[ct] = block;
    }
  }
  // Cancer types with no descriptor fields (OTHER) never produce rows above —
  // carry them over from whichever annotator listed them.
  for (const [key, src] of sourceCohorts) {
    if (dropped.has(key)) continue;
    const c = cohortsByKey.get(key);
    if (!c) continue;
    for (const ct of Object.keys(src.applicableCancerTypes ?? {}) as CancerType[]) {
      if (!c.applicableCancerTypes[ct]) c.applicableCancerTypes[ct] = {};
    }
  }

  return {
    answers: {
      nctId: trial.nctId,
      expertId: null,
      cancerTypes: (trialValue('cancerTypes') as CancerType[] | null) ?? [],
      minAge: trialValue('minAge') as number | null,
      maxAge: trialValue('maxAge') as number | null,
      ecogMin: trialValue('ecogMin') as number | null,
      ecogMax: trialValue('ecogMax') as number | null,
      cohorts: [...cohortsByKey.values()],
    },
    rows: kept,
    unresolved: kept
      .filter((r) => r.source === 'unresolved')
      .map((r) => ({ cohortKey: r.cohortKey, cancerType: r.cancerType, fieldKey: r.fieldKey })),
  };
}

export function valueToCell(v: FieldValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('|');
  return String(v);
}

