// CSV export: long-format per-field comparison for every annotation.
// One row per (expert × trial × cohort × cancer_type × field), comparing
// against the reference_keys ground truth when present. Reviewer-only.
//
// "scope" column distinguishes trial-level, cohort-level scalar, and
// descriptor rows.

import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { rowsToCsv } from '@/lib/csv';
import { BLOCKS } from '@/lib/schema/field-schemas';
import {
  BlockAnswers, CancerType, Cohort, FieldValue, TrialAnswers, TRIAL_LEVEL_SENTINEL,
} from '@/lib/types';

export const runtime = 'nodejs';

function isPopulated(v: FieldValue): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function outcome(ref: FieldValue, att: FieldValue): 'TP' | 'FP' | 'FN' | 'TN' {
  const r = isPopulated(ref), a = isPopulated(att);
  if (r && a) return 'TP';
  if (!r && a) return 'FP';
  if (r && !a) return 'FN';
  return 'TN';
}

function valueAsString(v: FieldValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('|');
  return String(v);
}

function getScalar(obj: unknown, k: string): FieldValue {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, FieldValue>)[k];
  return v === undefined ? null : v;
}

const TRIAL_LEVEL_FIELDS: { key: string; kind: 'multi' | 'number' }[] = [
  { key: 'cancerTypes', kind: 'multi' },
  { key: 'minAge', kind: 'number' },
  { key: 'maxAge', kind: 'number' },
  { key: 'ecogMin', kind: 'number' },
  { key: 'ecogMax', kind: 'number' },
];
const COHORT_LEVEL_FIELDS: { key: string; kind: 'number' }[] = [
  { key: 'minAge', kind: 'number' },
  { key: 'maxAge', kind: 'number' },
  { key: 'ecogMin', kind: 'number' },
  { key: 'ecogMax', kind: 'number' },
];

interface AnnotationRow {
  annotation_id: string;
  expert_name: string;
  nct_id: string;
  brief_title: string;
  is_test_trial: boolean;
  test_reviewed_at: string | null;
  status: string;
  answers: TrialAnswers;
  notes: string;
  flags: Record<string, boolean>;
}

interface RefRow {
  nct_id: string;
  key_data: TrialAnswers;
  notes: string;
  flags: Record<string, boolean>;
}

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [annotations, refKeys] = await Promise.all([
    query<AnnotationRow>(`
      SELECT
        a.id AS annotation_id,
        u.name AS expert_name,
        t.nct_id,
        t.brief_title,
        ta.is_test_trial,
        ta.test_reviewed_at,
        a.status,
        a.answers,
        a.notes,
        a.flags
      FROM annotations a
      JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
      JOIN users u ON u.id = a.expert_id
      JOIN trials t ON t.nct_id = a.nct_id
      ORDER BY u.name, t.position, t.nct_id
    `),
    query<RefRow>(`SELECT nct_id, key_data, notes, flags FROM reference_keys`),
  ]);

  const refByNct = new Map(refKeys.map((r) => [r.nct_id, r]));

  if (annotations.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="annotations.csv"',
      },
    });
  }

  const headers = [
    'expert', 'nct_id', 'trial_title', 'is_test_trial', 'test_reviewed_at',
    'annotation_status',
    'scope', 'cohort_key', 'cohort_display_name', 'cancer_type',
    'field', 'field_class', 'field_kind',
    'reference_value', 'annotation_value', 'outcome',
    'reference_notes', 'reference_flags', 'expert_notes', 'expert_flags',
  ];
  const rows: unknown[][] = [];

  for (const ann of annotations) {
    const ref = refByNct.get(ann.nct_id);
    const refTa = (ref?.key_data ?? {}) as TrialAnswers;
    const attTa = (ann.answers ?? {}) as TrialAnswers;
    const base = [
      ann.expert_name, ann.nct_id, ann.brief_title,
      ann.is_test_trial, ann.test_reviewed_at ?? '',
      ann.status,
    ];
    const refNotes = ref?.notes ?? '';
    const refFlags = ref?.flags ?? {};
    const expNotes = ann.notes ?? '';
    const expFlags = ann.flags ?? {};

    // ── trial-level rows
    for (const { key, kind } of TRIAL_LEVEL_FIELDS) {
      const refV = getScalar(refTa, key);
      const attV = getScalar(attTa, key);
      rows.push([
        ...base,
        'trial', TRIAL_LEVEL_SENTINEL, '', TRIAL_LEVEL_SENTINEL,
        key, 'other', kind,
        valueAsString(refV), valueAsString(attV), outcome(refV, attV),
        refNotes, refFlags, expNotes, expFlags,
      ]);
    }

    const refCohortMap = new Map<string, Cohort>(
      (refTa.cohorts ?? []).map((c) => [c.cohortKey, c]),
    );
    const attCohortMap = new Map<string, Cohort>(
      (attTa.cohorts ?? []).map((c) => [c.cohortKey, c]),
    );
    const cohortKeys = new Set<string>([...refCohortMap.keys(), ...attCohortMap.keys()]);

    for (const cohortKey of cohortKeys) {
      const refC = refCohortMap.get(cohortKey);
      const attC = attCohortMap.get(cohortKey);
      const displayName = refC?.displayName ?? attC?.displayName ?? cohortKey;

      for (const { key, kind } of COHORT_LEVEL_FIELDS) {
        const refV = getScalar(refC, key);
        const attV = getScalar(attC, key);
        rows.push([
          ...base,
          'cohort', cohortKey, displayName, TRIAL_LEVEL_SENTINEL,
          key, 'other', kind,
          valueAsString(refV), valueAsString(attV), outcome(refV, attV),
          refNotes, refFlags, expNotes, expFlags,
        ]);
      }

      const cts = new Set<CancerType>([
        ...Object.keys(refC?.applicableCancerTypes ?? {}),
        ...Object.keys(attC?.applicableCancerTypes ?? {}),
      ] as CancerType[]);
      for (const ct of cts) {
        const block = BLOCKS[ct];
        if (!block) continue;
        const refBlock: BlockAnswers = refC?.applicableCancerTypes?.[ct] ?? {};
        const attBlock: BlockAnswers = attC?.applicableCancerTypes?.[ct] ?? {};
        for (const [fieldKey, def] of Object.entries(block.fields)) {
          const refV = (refBlock[fieldKey] ?? null) as FieldValue;
          const attV = (attBlock[fieldKey] ?? null) as FieldValue;
          rows.push([
            ...base,
            'descriptor', cohortKey, displayName, ct,
            fieldKey, def.class, def.kind,
            valueAsString(refV), valueAsString(attV), outcome(refV, attV),
            refNotes, refFlags, expNotes, expFlags,
          ]);
        }
      }
    }
  }

  return new NextResponse(rowsToCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="annotations-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
