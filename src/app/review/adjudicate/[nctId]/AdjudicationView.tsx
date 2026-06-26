'use client';

// Reviewer adjudication for the two-level annotation model. Three layers of
// comparison render top-to-bottom:
//   1. Trial-level fields (cancerTypes, age, ECOG) — keyed under TRIAL_LEVEL_SENTINEL
//   2. Per-cohort: cohort existence + cohort-level bounds + per-cancer descriptors
//   3. Agreements list (collapsed below disagreements)

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { adjudicateFieldAction, clearAdjudicationAction } from '@/app/actions/adjudication';
import { EligibilityText } from '@/components/EligibilityText';
import { FieldEditor } from '@/components/FieldEditor';
import { Tooltip } from '@/components/Tooltip';
import { BLOCKS } from '@/lib/schema/field-schemas';
import {
  ALL_CANCER_TYPES, CANCER_TYPE_DEFINITIONS, CancerType, Cohort, FieldDef,
  FieldValue, TRIAL_LEVEL_SENTINEL, TrialAnswers,
} from '@/lib/types';

interface ReviewSummary {
  expertName: string;
  answers: TrialAnswers;
  notes: string;
  status: 'in_progress' | 'submitted';
  submittedAt: string | null;
  updatedAt: string;
}

interface Props {
  sessionName: string;
  trial: {
    nctId: string;
    briefTitle: string;
    briefSummary: string | null;
    eligibilityRaw: string | null;
    conditions: string[];
  };
  reviews: ReviewSummary[];
  initialAdjudications: Record<string, unknown>;
}

const TRIAL_LEVEL_DEFS: Record<string, FieldDef> = {
  cancerTypes: { kind: 'multi', label: 'Cancer types', options: ALL_CANCER_TYPES, optionHelp: CANCER_TYPE_DEFINITIONS, class: 'other' },
  minAge:      { kind: 'number', label: 'Min age',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max', class: 'other' },
};
const COHORT_LEVEL_DEFS: Record<string, FieldDef> = {
  minAge:      { kind: 'number', label: 'Min age (cohort)',  class: 'other' },
  maxAge:      { kind: 'number', label: 'Max age (cohort)',  class: 'other' },
  ecogMin:     { kind: 'number', label: 'ECOG min (cohort)', class: 'other' },
  ecogMax:     { kind: 'number', label: 'ECOG max (cohort)', class: 'other' },
};
const COHORT_EXISTS_FIELD = '__cohort_exists__';

function norm(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'null';
    return JSON.stringify([...v].sort());
  }
  return JSON.stringify(v);
}

function makeKey(cohortKey: string, cancerType: string, fieldKey: string): string {
  return `${cohortKey}|${cancerType}|${fieldKey}`;
}

function getTrialLevel(ta: TrialAnswers | undefined, fieldKey: string): FieldValue {
  if (!ta) return null;
  const v = (ta as unknown as Record<string, FieldValue>)[fieldKey];
  return v === undefined ? null : v;
}
function getCohortLevel(c: Cohort | undefined, fieldKey: string): FieldValue {
  if (!c) return null;
  const v = (c as unknown as Record<string, FieldValue>)[fieldKey];
  return v === undefined ? null : v;
}
function getDescriptor(c: Cohort | undefined, ct: CancerType, fieldKey: string): FieldValue {
  if (!c) return null;
  const block = c.applicableCancerTypes?.[ct];
  if (!block) return null;
  const v = block[fieldKey];
  return v === undefined ? null : v;
}

function ValueChip({ value, optionHelp }: { value: FieldValue; optionHelp?: Record<string, string> }) {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-slate-400 italic">null</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1">
        {value.map((v) => {
          const chip = <span className="text-[11px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">{v}</span>;
          const help = optionHelp?.[v];
          return help ? <Tooltip key={v} text={help}>{chip}</Tooltip> : <span key={v}>{chip}</span>;
        })}
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return <span className={`font-semibold ${value ? 'text-emerald-700' : 'text-red-700'}`}>{value ? 'Yes' : 'No'}</span>;
  }
  return <span className="font-semibold text-slate-900">{String(value)}</span>;
}

interface Row {
  cohortKey: string;
  cancerType: string;
  scope: 'trial' | 'cohort' | 'descriptor' | 'cohort_existence';
  cohortDisplayName?: string;
  fieldKey: string;
  def: FieldDef;
  a: FieldValue;
  b: FieldValue;
  agree: boolean;
}

export function AdjudicationView({
  sessionName, trial, reviews, initialAdjudications,
}: Props) {
  const [finals, setFinals] = useState<Record<string, FieldValue>>(
    initialAdjudications as Record<string, FieldValue>,
  );
  const [err, setErr] = useState<string | null>(null);
  const bothSubmitted = reviews.length === 2 && reviews.every((r) => r.status === 'submitted');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const a = reviews[0];
    const b = reviews[1];

    for (const [fk, def] of Object.entries(TRIAL_LEVEL_DEFS)) {
      const av = getTrialLevel(a?.answers, fk);
      const bv = getTrialLevel(b?.answers, fk);
      const agree = reviews.length === 2 ? norm(av) === norm(bv) : false;
      out.push({
        cohortKey: TRIAL_LEVEL_SENTINEL, cancerType: TRIAL_LEVEL_SENTINEL,
        scope: 'trial', fieldKey: fk, def, a: av, b: bv, agree,
      });
    }

    const cohortMap = new Map<string, { a?: Cohort; b?: Cohort }>();
    for (const c of a?.answers.cohorts ?? []) {
      cohortMap.set(c.cohortKey, { ...cohortMap.get(c.cohortKey), a: c });
    }
    for (const c of b?.answers.cohorts ?? []) {
      cohortMap.set(c.cohortKey, { ...cohortMap.get(c.cohortKey), b: c });
    }

    for (const [cohortKey, sources] of cohortMap) {
      const cohortDisplayName =
        sources.a?.displayName ?? sources.b?.displayName ?? cohortKey;

      const existDef: FieldDef = { kind: 'bool', label: 'Cohort belongs on final label', class: 'other' };
      out.push({
        cohortKey, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort_existence',
        cohortDisplayName, fieldKey: COHORT_EXISTS_FIELD, def: existDef,
        a: a ? (sources.a ? true : false) : null,
        b: b ? (sources.b ? true : false) : null,
        agree: reviews.length === 2 ? (!!sources.a === !!sources.b) : false,
      });

      for (const [fk, def] of Object.entries(COHORT_LEVEL_DEFS)) {
        const av = getCohortLevel(sources.a, fk);
        const bv = getCohortLevel(sources.b, fk);
        out.push({
          cohortKey, cancerType: TRIAL_LEVEL_SENTINEL, scope: 'cohort',
          cohortDisplayName, fieldKey: fk, def,
          a: av, b: bv,
          agree: reviews.length === 2 ? norm(av) === norm(bv) : false,
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
          const av = getDescriptor(sources.a, ct, fk);
          const bv = getDescriptor(sources.b, ct, fk);
          out.push({
            cohortKey, cancerType: ct, scope: 'descriptor',
            cohortDisplayName, fieldKey: fk, def,
            a: av, b: bv,
            agree: reviews.length === 2 ? norm(av) === norm(bv) : false,
          });
        }
      }
    }
    return out;
  }, [reviews]);

  const disagreements = rows.filter((r) => reviews.length === 2 && !r.agree);
  const resolved = disagreements.filter((r) => makeKey(r.cohortKey, r.cancerType, r.fieldKey) in finals).length;

  const disagreementsByCohort = useMemo(() => {
    const grouped = new Map<string, { displayName: string; rows: Row[] }>();
    for (const r of disagreements) {
      const k = r.cohortKey;
      const g = grouped.get(k) ?? { displayName: r.cohortDisplayName ?? k, rows: [] };
      g.rows.push(r);
      grouped.set(k, g);
    }
    return grouped;
  }, [disagreements]);

  async function setFinal(r: Row, value: FieldValue) {
    setErr(null);
    const key = makeKey(r.cohortKey, r.cancerType, r.fieldKey);
    const prev = finals;
    setFinals({ ...finals, [key]: value });
    const result = await adjudicateFieldAction({
      nctId: trial.nctId, cohortKey: r.cohortKey, cancerType: r.cancerType,
      fieldKey: r.fieldKey, value,
    });
    if (!result.ok) { setFinals(prev); setErr(result.error ?? 'Failed to save'); }
  }

  async function clearFinal(r: Row) {
    setErr(null);
    const key = makeKey(r.cohortKey, r.cancerType, r.fieldKey);
    const prev = finals;
    const next = { ...finals };
    delete next[key];
    setFinals(next);
    const result = await clearAdjudicationAction({
      nctId: trial.nctId, cohortKey: r.cohortKey, cancerType: r.cancerType, fieldKey: r.fieldKey,
    });
    if (!result.ok) { setFinals(prev); setErr(result.error ?? 'Failed to clear'); }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/review/adjudicate" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            ← Adjudication
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              <span className="text-xs text-slate-400">· Adjudicating as {sessionName}</span>
            </div>
            <h1 className="text-sm font-medium text-slate-900 truncate">{trial.briefTitle}</h1>
          </div>
          {reviews.length === 2 && (
            <div className="text-xs text-slate-600 whitespace-nowrap">
              <strong className={resolved === disagreements.length ? 'text-emerald-700' : 'text-amber-700'}>
                {resolved}
              </strong> / {disagreements.length} disagreements resolved
            </div>
          )}
        </div>
        {err && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-2 text-sm text-red-800">⚠ {err}</div>
        )}
      </header>

      <main className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 p-6">
        <div className="lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 p-6 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Reviews</div>
              <div className="mt-2 space-y-2">
                {reviews.length === 0 && <p className="text-sm text-slate-500">No expert has annotated this trial yet.</p>}
                {reviews.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`inline-block w-2 h-2 rounded-full ${r.status === 'submitted' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="font-medium text-slate-900">{r.expertName}</span>
                    <span className="text-xs text-slate-500">
                      {r.status === 'submitted'
                        ? `submitted ${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}`
                        : 'in progress'}
                    </span>
                  </div>
                ))}
              </div>
              {!bothSubmitted && reviews.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                  Adjudication is meant for after both reviews are submitted — the values below may still change.
                </p>
              )}
              {reviews.some((r) => r.notes?.trim()) && (
                <div className="mt-3 space-y-2">
                  {reviews.filter((r) => r.notes?.trim()).map((r, i) => (
                    <div key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <strong className="text-slate-700">{r.expertName}:</strong>{' '}
                      <span className="text-slate-600">{r.notes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Conditions</div>
              <p className="text-sm text-slate-900 mt-1">{trial.conditions.join(', ') || '—'}</p>
            </div>
            {trial.briefSummary && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Brief summary</div>
                <EligibilityText raw={trial.briefSummary} />
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Eligibility criteria</div>
              <EligibilityText raw={trial.eligibilityRaw || ''} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {reviews.length < 2 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
              This trial has {reviews.length} of 2 reviews — adjudication opens once both
              experts have submitted. You can still inspect current values below.
            </div>
          ) : null}

          {Array.from(disagreementsByCohort.entries()).map(([cohortKey, group]) => (
            <section key={cohortKey}>
              <h2 className="text-xs uppercase tracking-wider text-red-600 font-semibold mb-3">
                {cohortKey === TRIAL_LEVEL_SENTINEL
                  ? `Trial-level disagreements (${group.rows.length})`
                  : `Cohort ${cohortKey} — ${group.displayName} (${group.rows.length})`}
              </h2>
              <div className="space-y-4">
                {group.rows.map((row) => {
                  const k = makeKey(row.cohortKey, row.cancerType, row.fieldKey);
                  return (
                    <DisagreementCard
                      key={k}
                      row={row}
                      expertNames={[reviews[0]?.expertName ?? 'Expert A', reviews[1]?.expertName ?? 'Expert B']}
                      final={finals[k]}
                      isAdjudicated={k in finals}
                      onPick={(v) => setFinal(row, v)}
                      onClear={() => clearFinal(row)}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              {reviews.length === 2 ? `Agreements (${rows.length - disagreements.length})` : 'Current values'}
            </h2>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {rows.filter((r) => reviews.length < 2 || r.agree).map((row) => {
                const k = makeKey(row.cohortKey, row.cancerType, row.fieldKey);
                const scopeLabel = row.scope === 'trial' ? 'trial'
                  : row.scope === 'cohort' ? `cohort ${row.cohortKey}`
                  : row.scope === 'cohort_existence' ? `cohort ${row.cohortKey} exists?`
                  : `cohort ${row.cohortKey} · ${row.cancerType}`;
                return (
                  <div key={k} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800">{row.def.label}</span>
                      <span className="text-xs text-slate-400 ml-2 font-mono">{scopeLabel} · {row.fieldKey}</span>
                    </div>
                    {reviews[0] && <div className="text-xs text-slate-500">{reviews[0].expertName.split(' ')[0]}: <ValueChip value={row.a} optionHelp={row.def.optionHelp} /></div>}
                    {reviews[1] && <div className="text-xs text-slate-500">{reviews[1].expertName.split(' ')[0]}: <ValueChip value={row.b} optionHelp={row.def.optionHelp} /></div>}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function DisagreementCard({
  row, expertNames, final: finalValue, isAdjudicated, onPick, onClear,
}: {
  row: Row;
  expertNames: [string, string];
  final: FieldValue | undefined;
  isAdjudicated: boolean;
  onPick: (v: FieldValue) => void;
  onClear: () => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<FieldValue>(finalValue ?? null);

  const scopeChip = row.scope === 'trial' ? 'trial-level'
    : row.scope === 'cohort' ? 'cohort scalar'
    : row.scope === 'cohort_existence' ? 'cohort existence'
    : `${row.cancerType} descriptor`;

  return (
    <div className={`border rounded-2xl p-5 shadow-sm ${isAdjudicated ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-red-200'}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <span className="font-semibold text-slate-900">{row.def.label}</span>
          <span className="text-xs text-slate-400 ml-2 font-mono">{scopeChip} · {row.fieldKey}</span>
        </div>
        {isAdjudicated ? (
          <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-1 rounded font-semibold">Resolved</span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-red-700 bg-red-100 px-2 py-1 rounded font-semibold">Needs adjudication</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <PickCard label={expertNames[0]} value={row.a} optionHelp={row.def.optionHelp} onPick={() => onPick(row.a)} />
        <PickCard label={expertNames[1]} value={row.b} optionHelp={row.def.optionHelp} onPick={() => onPick(row.b)} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="text-xs text-slate-500 mr-2">Final value:</span>
          {isAdjudicated ? <ValueChip value={finalValue as FieldValue} optionHelp={row.def.optionHelp} /> : <span className="text-slate-400 italic">not set</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCustom((s) => !s)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showCustom ? 'Hide custom value' : 'Set custom value…'}
          </button>
          {isAdjudicated && (
            <button onClick={onClear} className="text-xs text-red-600 hover:underline">
              Clear
            </button>
          )}
        </div>
      </div>

      {showCustom && (
        <div className="mt-3 border-t border-slate-200 pt-2 flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <FieldEditor
              def={row.def}
              value={customValue}
              onChange={setCustomValue}
            />
          </div>
          <button
            onClick={() => { onPick(customValue); setShowCustom(false); }}
            className="text-xs px-3 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition mb-2"
          >
            Use as final
          </button>
        </div>
      )}
    </div>
  );
}

function PickCard({ label, value, optionHelp, onPick }: { label: string; value: FieldValue; optionHelp?: Record<string, string>; onPick: () => void }) {
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 truncate">{label}</div>
      <div className="text-sm mb-2 min-h-[20px]"><ValueChip value={value} optionHelp={optionHelp} /></div>
      <button
        onClick={onPick}
        className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition"
      >
        Use this →
      </button>
    </div>
  );
}
