// Label export for the main corpus. Reviewer-only.
//   GET /api/export/labels?source=annotator1|annotator2|adjudicated&format=csv|json
// See src/lib/labels-export.ts for how annotators are ordered and how the
// adjudicated value is chosen.

import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { rowsToCsv } from '@/lib/csv';
import { COHORT_EXISTS_FIELD, COHORT_TYPES_FIELD, normalizeAnswers } from '@/lib/adjudication-rows';
import {
  CorpusTrial, FieldRow, LabelSource, flattenAnnotation, loadCorpus, mergeAdjudicated, valueToCell,
} from '@/lib/labels-export';
import { TRIAL_LEVEL_SENTINEL } from '@/lib/types';

export const runtime = 'nodejs';

const SOURCES: LabelSource[] = ['annotator1', 'annotator2', 'adjudicated'];

// Sentinels are internal bookkeeping — show blanks / readable names in the CSV.
function locationCells(r: FieldRow): string[] {
  return [
    r.scope,
    r.cohortKey === TRIAL_LEVEL_SENTINEL ? '' : r.cohortKey,
    r.cohortKey === TRIAL_LEVEL_SENTINEL ? '' : r.cohortDisplayName,
    r.cancerType === TRIAL_LEVEL_SENTINEL ? '' : r.cancerType,
    r.fieldKey === COHORT_EXISTS_FIELD ? 'cohort_exists' : r.fieldKey === COHORT_TYPES_FIELD ? 'cancer_types' : r.fieldKey,
    r.fieldClass,
    r.fieldKind,
  ];
}

function annotatorExport(trials: CorpusTrial[], source: 'annotator1' | 'annotator2', format: string) {
  const pick = (t: CorpusTrial) => (source === 'annotator1' ? t.annotator1 : t.annotator2);

  if (format === 'json') {
    return {
      trials: trials.map((t) => {
        const ann = pick(t);
        return {
          nctId: t.nctId,
          briefTitle: t.briefTitle,
          expertName: ann?.expertName ?? null,
          submittedAt: ann?.submittedAt ?? null,
          notes: ann?.notes ?? null,
          // Same normalization as the adjudicated label: blank rules applied,
          // trial-level fields derived from the cohorts.
          labels: ann ? normalizeAnswers(ann.answers) : null,
        };
      }),
    };
  }

  const headers = [
    'nct_id', 'trial_title', 'annotator', 'expert_name', 'submitted_at',
    'scope', 'cohort_key', 'cohort_display_name', 'cancer_type',
    'field', 'field_class', 'field_kind', 'value',
  ];
  const rows: unknown[][] = [];
  for (const t of trials) {
    const ann = pick(t);
    if (!ann) continue;
    for (const r of flattenAnnotation(ann.answers)) {
      rows.push([
        t.nctId, t.briefTitle, source === 'annotator1' ? 1 : 2, ann.expertName, ann.submittedAt ?? '',
        ...locationCells(r), valueToCell(r.value),
      ]);
    }
  }
  return rowsToCsv(headers, rows);
}

function adjudicatedExport(trials: CorpusTrial[], format: string) {
  if (format === 'json') {
    return {
      trials: trials.map((t) => {
        const merged = mergeAdjudicated(t);
        const status = !t.annotator1 || !t.annotator2
          ? (merged ? 'missing_annotation' : 'no_annotations')
          : merged && merged.unresolved.length > 0 ? 'has_unresolved' : 'complete';
        return {
          nctId: t.nctId,
          briefTitle: t.briefTitle,
          annotator1: t.annotator1?.expertName ?? null,
          annotator2: t.annotator2?.expertName ?? null,
          status,
          unresolved: merged?.unresolved ?? [],
          adjudicatorNote: t.adjudicatorNote,
          labels: merged?.answers ?? null,
        };
      }),
    };
  }

  const headers = [
    'nct_id', 'trial_title',
    'scope', 'cohort_key', 'cohort_display_name', 'cancer_type',
    'field', 'field_class', 'field_kind',
    'final_value', 'source',
    'annotator_1', 'annotator_1_value', 'annotator_2', 'annotator_2_value',
    'decided_by', 'decided_at',
  ];
  const rows: unknown[][] = [];
  for (const t of trials) {
    const merged = mergeAdjudicated(t);
    if (!merged) continue;
    for (const r of merged.rows) {
      rows.push([
        t.nctId, t.briefTitle,
        ...locationCells(r),
        valueToCell(r.value), r.source,
        t.annotator1?.expertName ?? '', valueToCell(r.annotator1Value),
        t.annotator2?.expertName ?? '', valueToCell(r.annotator2Value),
        r.decidedBy ?? '', r.decidedAt ?? '',
      ]);
    }
  }
  return rowsToCsv(headers, rows);
}

export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const source = params.get('source') as LabelSource;
  const format = params.get('format') === 'json' ? 'json' : 'csv';
  if (!SOURCES.includes(source)) {
    return NextResponse.json({ error: `source must be one of ${SOURCES.join(', ')}` }, { status: 400 });
  }

  const trials = await loadCorpus();
  const body = source === 'adjudicated'
    ? adjudicatedExport(trials, format)
    : annotatorExport(trials, source, format);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `labels-${source}-${stamp}.${format}`;
  const payload = format === 'json'
    ? JSON.stringify({
        exportedAt: new Date().toISOString(),
        corpus: 'main',
        source,
        trialCount: trials.length,
        ...(body as object),
      }, null, 2)
    : (body as string);

  return new NextResponse(payload, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
