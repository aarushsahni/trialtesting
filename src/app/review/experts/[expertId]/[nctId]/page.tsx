import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, AnnotationRow, ReferenceKeyRow, TrialAssignmentRow, TrialRow } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { BLOCKS } from '@/lib/schema/field-schemas';
import {
  ALL_CANCER_TYPES, CancerType, Cohort, FieldDef, FieldValue, TrialAnswers,
} from '@/lib/types';
import { applyCohortMap } from '@/lib/scoring';
import { MarkReviewedButton } from '../MarkReviewedButton';
import { CohortMappingPanel } from './CohortMappingPanel';

export const dynamic = 'force-dynamic';

const TRIAL_LEVEL_DEFS: Record<string, FieldDef> = {
  cancerTypes: { kind: 'multi', label: 'Cancer types', options: ALL_CANCER_TYPES, class: 'other' },
  minAge:      { kind: 'number', label: 'Min age',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max', class: 'other' },
};
const COHORT_LEVEL_DEFS: Record<string, FieldDef> = {
  minAge:      { kind: 'number', label: 'Min age',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max', class: 'other' },
};

function norm(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'null';
    return JSON.stringify([...v].sort());
  }
  return JSON.stringify(v);
}

function getProp(obj: unknown, k: string): FieldValue {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, FieldValue>)[k];
  return v === undefined ? null : v;
}

export default async function TestAnnotationDiff({
  params,
}: { params: Promise<{ expertId: string; nctId: string }> }) {
  const { expertId, nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const [users, trials, assignments, annotations, refRows] = await Promise.all([
    query<{ name: string }>(`SELECT name FROM users WHERE id = $1 AND role = 'expert'`, [expertId]),
    query<TrialRow>(`SELECT * FROM trials WHERE nct_id = $1`, [nctId]),
    query<TrialAssignmentRow>(
      `SELECT * FROM trial_assignments WHERE expert_id = $1 AND nct_id = $2`,
      [expertId, nctId],
    ),
    query<AnnotationRow>(
      `SELECT * FROM annotations WHERE expert_id = $1 AND nct_id = $2`,
      [expertId, nctId],
    ),
    query<ReferenceKeyRow>(`SELECT * FROM reference_keys WHERE nct_id = $1`, [nctId]),
  ]);

  const expert = users[0];
  const trial = trials[0];
  const assignment = assignments[0];
  if (!expert || !trial || !assignment) notFound();

  const annotation = annotations[0];
  const refTa = (refRows[0]?.key_data ?? {}) as unknown as TrialAnswers;
  const attTaRaw = (annotation?.answers ?? {}) as unknown as TrialAnswers;
  const cohortMapping = (annotation?.cohort_map ?? {}) as Record<string, string>;
  // Apply the reviewer's cohort mapping before diffing so expert cohorts
  // line up with the reference cohorts the reviewer matched them to.
  const attTa = applyCohortMap(attTaRaw, cohortMapping);
  const scoreData = annotation?.score_data as
    | { overallF1?: number; total?: { tp: number; fp: number; fn: number; tn: number } }
    | null;

  const expertCohorts = (attTaRaw.cohorts ?? []).map((c) => ({
    cohortKey: c.cohortKey,
    displayName: c.displayName,
  }));
  const referenceCohorts = (refTa.cohorts ?? []).map((c) => ({
    cohortKey: c.cohortKey,
    displayName: c.displayName,
  }));

  // Build the diff rows
  interface Row {
    scope: 'trial' | 'cohort' | 'descriptor' | 'cohort_existence';
    cohortKey: string | null;
    cohortDisplayName?: string;
    cancerType: CancerType | null;
    fieldKey: string;
    label: string;
    ref: FieldValue;
    att: FieldValue;
    agree: boolean;
  }
  const rows: Row[] = [];

  for (const [fk, def] of Object.entries(TRIAL_LEVEL_DEFS)) {
    const ref = getProp(refTa, fk);
    const att = getProp(attTa, fk);
    rows.push({
      scope: 'trial', cohortKey: null, cancerType: null, fieldKey: fk,
      label: def.label, ref, att, agree: norm(ref) === norm(att),
    });
  }

  const cohortMap = new Map<string, { ref?: Cohort; att?: Cohort }>();
  for (const c of refTa.cohorts ?? []) cohortMap.set(c.cohortKey, { ...cohortMap.get(c.cohortKey), ref: c });
  for (const c of attTa.cohorts ?? []) cohortMap.set(c.cohortKey, { ...cohortMap.get(c.cohortKey), att: c });

  for (const [cohortKey, { ref: refC, att: attC }] of cohortMap.entries()) {
    const displayName = refC?.displayName ?? attC?.displayName ?? cohortKey;
    rows.push({
      scope: 'cohort_existence',
      cohortKey, cohortDisplayName: displayName,
      cancerType: null, fieldKey: '__cohort_exists__',
      label: 'Cohort exists',
      ref: refC ? true : false,
      att: attC ? true : false,
      agree: !!refC === !!attC,
    });
    for (const [fk, def] of Object.entries(COHORT_LEVEL_DEFS)) {
      const ref = getProp(refC, fk);
      const att = getProp(attC, fk);
      rows.push({
        scope: 'cohort', cohortKey, cohortDisplayName: displayName,
        cancerType: null, fieldKey: fk, label: def.label,
        ref, att, agree: norm(ref) === norm(att),
      });
    }
    const cts = new Set<CancerType>([
      ...Object.keys(refC?.applicableCancerTypes ?? {}),
      ...Object.keys(attC?.applicableCancerTypes ?? {}),
    ] as CancerType[]);
    for (const ct of cts) {
      const block = BLOCKS[ct];
      if (!block) continue;
      const refBlock = refC?.applicableCancerTypes?.[ct] ?? {};
      const attBlock = attC?.applicableCancerTypes?.[ct] ?? {};
      for (const [fk, def] of Object.entries(block.fields)) {
        const ref = (refBlock[fk] ?? null) as FieldValue;
        const att = (attBlock[fk] ?? null) as FieldValue;
        rows.push({
          scope: 'descriptor', cohortKey, cohortDisplayName: displayName,
          cancerType: ct, fieldKey: fk, label: def.label,
          ref, att, agree: norm(ref) === norm(att),
        });
      }
    }
  }

  const disagreements = rows.filter((r) => !r.agree);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href={`/review/experts/${expertId}`} className="text-sm text-blue-600 hover:underline">← {expert.name}</Link>
        <div className="mt-3 mb-6 flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {trial.brief_title}
              <span className="text-sm font-mono text-slate-500 ml-3">{trial.nct_id}</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">Test trial for {expert.name}</p>
          </div>
          <MarkReviewedButton
            expertId={expertId}
            nctId={nctId}
            initialReviewed={assignment.test_reviewed_at !== null}
            canReview={annotation?.status === 'submitted' || assignment.test_reviewed_at !== null}
          />
        </div>

        {scoreData?.overallF1 != null && (
          <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Overall F1</div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold text-slate-900">{scoreData.overallF1.toFixed(3)}</span>
              {scoreData.total && (
                <span className="text-xs text-slate-500">
                  TP {scoreData.total.tp} · FP {scoreData.total.fp} · FN {scoreData.total.fn} · TN {scoreData.total.tn}
                </span>
              )}
            </div>
          </div>
        )}

        {!annotation && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            The expert hasn&apos;t started this trial yet.
          </div>
        )}

        {annotation && (
          <Section title="Cohort matching">
            <div className="p-4">
              <p className="text-xs text-slate-500 mb-3">
                Match each expert cohort to a reference cohort. Saving a mapping recomputes the score.
              </p>
              <CohortMappingPanel
                expertId={expertId}
                nctId={nctId}
                expertCohorts={expertCohorts}
                referenceCohorts={referenceCohorts}
                initialMapping={cohortMapping}
              />
            </div>
          </Section>
        )}

        {disagreements.length > 0 && (
          <Section title={`Disagreements (${disagreements.length})`}>
            {disagreements.map((r, i) => <DiffRow key={`${r.cohortKey ?? '-'}|${r.cancerType ?? '-'}|${r.fieldKey}|${i}`} r={r} />)}
          </Section>
        )}

        <Section title={`Agreements (${rows.length - disagreements.length})`}>
          {rows.filter((r) => r.agree).map((r, i) => (
            <DiffRow key={`agree-${r.cohortKey ?? '-'}|${r.cancerType ?? '-'}|${r.fieldKey}|${i}`} r={r} />
          ))}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">{title}</h2>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function ValueChip({ value }: { value: FieldValue }) {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-slate-400 italic">null</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v) => (
          <span key={v} className="text-[11px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">{v}</span>
        ))}
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return <span className={`font-semibold ${value ? 'text-emerald-700' : 'text-red-700'}`}>{value ? 'Yes' : 'No'}</span>;
  }
  return <span className="font-semibold text-slate-900">{String(value)}</span>;
}

function DiffRow({ r }: { r: { scope: string; cohortKey: string | null; cohortDisplayName?: string; cancerType: CancerType | null; fieldKey: string; label: string; ref: FieldValue; att: FieldValue; agree: boolean } }) {
  const scopeLabel = r.scope === 'trial' ? 'trial'
    : r.scope === 'cohort' ? `${r.cohortKey} cohort`
    : r.scope === 'cohort_existence' ? `${r.cohortKey} exists?`
    : `${r.cohortKey} · ${r.cancerType}`;
  return (
    <div className={`p-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm ${r.agree ? '' : 'bg-red-50/40'}`}>
      <div className="min-w-0">
        <span className="font-medium text-slate-800">{r.label}</span>
        <span className="text-xs text-slate-400 ml-2 font-mono">{scopeLabel} · {r.fieldKey}</span>
      </div>
      <div className="text-xs"><span className="text-slate-500 mr-1">Ref:</span><ValueChip value={r.ref} /></div>
      <div className="text-xs"><span className="text-slate-500 mr-1">Expert:</span><ValueChip value={r.att} /></div>
    </div>
  );
}
