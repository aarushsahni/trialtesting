// Label export for the main (non-test) corpus.
//
// Each main trial is tagged with two annotator slots (trials.annotator_slot_1
// and _2). "Annotator 1" is the annotation by the expert holding slot_1, and
// "Annotator 2" the one holding slot_2. If an annotation can't be matched by
// slot (e.g. a slot was reassigned after the work was done), it fills the
// remaining position in started_at order.
//
// The adjudicated label is built by resolveRows (src/lib/adjudication-rows.ts).
// Each field's value is, in priority order:
//   adjudicated      — a reviewer decision exists in trial_adjudications
//   agreed           — both annotators gave the same value after normalization
//                      (blank rules, cohort bounds inherited from the trial)
//   single_annotator — only one submitted annotation exists
//   one_sided        — the field is in a cohort or cancer type only one
//                      annotator has; it takes that annotator's value
//   unresolved       — the annotators disagree and nobody has decided (value null)
//   derived          — trial-level fields, computed from the final cohorts

import { query } from './db';
import {
  ADJUDICATION_NOTE_FIELD, COHORT_MAP_FIELD, CohortMap, FieldSource, adjudicationKey, buildComparisonRows, resolveRows,
} from './adjudication-rows';
import { FieldValue, TRIAL_LEVEL_SENTINEL, TrialAnswers } from './types';

export type { FieldSource } from './adjudication-rows';
export type LabelSource = 'annotator1' | 'annotator2' | 'adjudicated';

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
  cohortMap: CohortMap | null;   // reviewer-saved cohort pairing, if any
  adjudicatorNote: string | null; // reviewer's explanation of their decisions
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

// [annotator 1, annotator 2] for one trial: the annotations by the experts
// holding the trial's slot_1 / slot_2, with any leftovers filling the empty
// positions in the given (started_at) order. The adjudication screen uses the
// same order, so its cohort pairing and keys match the export's.
export function orderBySlot<T extends { expert_slot: number | null }>(
  anns: T[], slot1: number | null, slot2: number | null,
): [T | null, T | null] {
  let first = anns.find((a) => a.expert_slot !== null && a.expert_slot === slot1) ?? null;
  let second = anns.find((a) => a !== first && a.expert_slot !== null && a.expert_slot === slot2) ?? null;
  const rest = anns.filter((a) => a !== first && a !== second);
  if (!first) first = rest.shift() ?? null;
  if (!second) second = rest.shift() ?? null;
  return [first, second];
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
  const mapByTrial = new Map<string, CohortMap>();
  const noteByTrial = new Map<string, string>();
  for (const d of adjudications) {
    if (d.field_key === COHORT_MAP_FIELD && d.cohort_key === TRIAL_LEVEL_SENTINEL) {
      mapByTrial.set(d.nct_id, (d.final_value?.v ?? {}) as unknown as CohortMap);
      continue;
    }
    if (d.field_key === ADJUDICATION_NOTE_FIELD && d.cohort_key === TRIAL_LEVEL_SENTINEL) {
      noteByTrial.set(d.nct_id, String(d.final_value?.v ?? ''));
      continue;
    }
    const m = adjByTrial.get(d.nct_id) ?? new Map();
    m.set(adjudicationKey(d.cohort_key, d.cancer_type, d.field_key), {
      value: d.final_value?.v ?? null, decidedBy: d.decided_by_name, decidedAt: d.decided_at,
    });
    adjByTrial.set(d.nct_id, m);
  }

  return trials.map((t) => {
    const [first, second] = orderBySlot(annByTrial.get(t.nct_id) ?? [], t.annotator_slot_1, t.annotator_slot_2);

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
      cohortMap: mapByTrial.get(t.nct_id) ?? null,
      adjudicatorNote: noteByTrial.get(t.nct_id) ?? null,
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
// flattens into exactly the same rows (and field order) as the adjudicated
// export, normalized the same way (blank rules, derived trial level).
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
  annotator1Value: FieldValue;   // as entered
  annotator2Value: FieldValue;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface MergedTrial {
  answers: TrialAnswers;
  rows: MergedRow[];
  unresolved: { cohortKey: string; cancerType: string; fieldKey: string }[];
  autoResolvedCount: number;
}

export function mergeAdjudicated(trial: CorpusTrial): MergedTrial | null {
  const a = trial.annotator1?.answers;
  const b = trial.annotator2?.answers;
  if (!a && !b) return null;

  const decided = (key: string) => trial.adjudications.get(key)?.value;
  const r = resolveRows(buildComparisonRows(a, b, trial.cohortMap), !!a, !!b, (key) =>
    trial.adjudications.has(key) ? (decided(key) ?? null) : undefined);

  const rows: MergedRow[] = r.rows.map((row) => {
    const adj = trial.adjudications.get(adjudicationKey(row.cohortKey, row.cancerType, row.fieldKey));
    return {
      scope: row.scope,
      cohortKey: row.cohortKey,
      cohortDisplayName: row.cohortDisplayName ?? '',
      cancerType: row.cancerType,
      fieldKey: row.fieldKey,
      fieldClass: row.def.class,
      fieldKind: row.def.kind,
      value: row.value,
      source: row.source,
      annotator1Value: row.rawA,
      annotator2Value: row.rawB,
      decidedBy: row.source === 'adjudicated' ? adj?.decidedBy ?? null : null,
      decidedAt: row.source === 'adjudicated' ? adj?.decidedAt ?? null : null,
    };
  });

  return {
    answers: {
      nctId: trial.nctId,
      expertId: null,
      ...r.trial,
      cohorts: r.cohorts,
    },
    rows,
    unresolved: r.unresolved.map((u) => ({ cohortKey: u.cohortKey, cancerType: u.cancerType, fieldKey: u.fieldKey })),
    autoResolvedCount: r.autoResolved.length,
  };
}

export type AdjudicationState = 'waiting' | 'open' | 'done';

export interface AdjudicationStatus {
  state: AdjudicationState;
  open: number;          // decisions still needed
  autoResolved: number;  // differences resolved without a decision
  decided: number;       // reviewer decisions on the current label
}

// Where a trial stands in adjudication. "waiting" until both annotations are submitted.
export function adjudicationStatus(trial: CorpusTrial): AdjudicationStatus {
  if (!trial.annotator1 || !trial.annotator2) return { state: 'waiting', open: 0, autoResolved: 0, decided: 0 };
  const merged = mergeAdjudicated(trial)!;
  const open = merged.unresolved.length;
  return {
    state: open > 0 ? 'open' : 'done',
    open,
    autoResolved: merged.autoResolvedCount,
    decided: merged.rows.filter((r) => r.source === 'adjudicated').length,
  };
}

export function valueToCell(v: FieldValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('|');
  return String(v);
}
