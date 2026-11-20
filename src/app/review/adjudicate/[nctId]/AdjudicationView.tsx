'use client';

// Reviewer adjudication of one trial. Top to bottom:
//   1. Cohorts — how the two annotators' cohorts are paired (re-pairable), and
//      the structural decisions: keep a cohort only one annotator drew, and
//      which cancer types each cohort covers.
//   2. Open fields — the field-level decisions, grouped by cohort and cancer
//      type, with quick picks, keyboard shortcuts and per-cohort bulk picks.
//   3. Collapsed: differences resolved automatically (with the reason and an
//      override), populated agreements, and the derived trial-level values.
//
// What counts as a decision, and the final label, come from
// buildComparisonRows / resolveRows (src/lib/adjudication-rows.ts) — the same
// code the label export uses.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  adjudicateFieldAction, adjudicateFieldsAction, clearAdjudicationAction, setAdjudicationCohortMapAction,
} from '@/app/actions/adjudication';
import { EligibilityText } from '@/components/EligibilityText';
import { FieldEditor } from '@/components/FieldEditor';
import { Tooltip } from '@/components/Tooltip';
import {
  COHORT_EXISTS_FIELD, COHORT_TYPES_FIELD, CohortMap, CohortPair, ResolvedRow,
  adjudicationKey, buildComparisonRows, cohortMapOf, pairsFor, resolveRows,
} from '@/lib/adjudication-rows';
import { FieldValue, TrialAnswers } from '@/lib/types';

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
  initialCohortMap: CohortMap | null;
}

type Names = [string, string];

const keyOf = (r: { cohortKey: string; cancerType: string; fieldKey: string }) =>
  adjudicationKey(r.cohortKey, r.cancerType, r.fieldKey);

const isStructural = (r: ResolvedRow) => r.fieldKey === COHORT_EXISTS_FIELD || r.fieldKey === COHORT_TYPES_FIELD;

function isBlank(v: FieldValue | undefined) {
  return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
}

// ──────────────────────────────────────────────────────────────────────────
// Quick picks: the one-key choices offered on a decision card
// ──────────────────────────────────────────────────────────────────────────

interface QuickPick { id: string; label: string; shortcut: string; value: FieldValue }

function quickPicks(row: ResolvedRow, names: Names): QuickPick[] {
  if (row.fieldKey === COHORT_EXISTS_FIELD) {
    const keepLabel = row.a ? `Keep (${names[0]})` : `Keep (${names[1]})`;
    return [
      { id: 'a', label: row.a ? keepLabel : `Drop (${names[0]})`, shortcut: '1', value: row.a },
      { id: 'b', label: row.b ? keepLabel : `Drop (${names[1]})`, shortcut: '2', value: row.b },
    ];
  }
  const picks: QuickPick[] = [
    { id: 'a', label: `Use ${names[0]}`, shortcut: '1', value: row.a },
    { id: 'b', label: `Use ${names[1]}`, shortcut: '2', value: row.b },
  ];
  if (row.def.kind === 'multi') {
    const A = (row.a as string[] | null) ?? [];
    const B = (row.b as string[] | null) ?? [];
    const opts = row.def.options ?? [...new Set([...A, ...B])];
    const union = opts.filter((o) => A.includes(o) || B.includes(o));
    const overlap = opts.filter((o) => A.includes(o) && B.includes(o));
    picks.push({ id: 'union', label: 'Union', shortcut: 'u', value: union.length ? union : null });
    if (A.length && B.length) picks.push({ id: 'overlap', label: 'Overlap', shortcut: 'o', value: overlap.length ? overlap : null });
  }
  if (row.fieldKey !== COHORT_TYPES_FIELD) picks.push({ id: 'blank', label: 'Blank', shortcut: '0', value: null });
  return picks;
}

// ──────────────────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────────────────

function ValueChip({ value, optionHelp }: { value: FieldValue; optionHelp?: Record<string, string> }) {
  if (isBlank(value)) return <span className="text-slate-400 italic">blank</span>;
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {value.map((v) => <Chip key={v} label={v} help={optionHelp?.[v]} />)}
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return <span className={`font-semibold ${value ? 'text-emerald-700' : 'text-red-700'}`}>{value ? 'Yes' : 'No'}</span>;
  }
  return <span className="font-semibold text-slate-900">{String(value)}</span>;
}

const CHIP_TONES = {
  blue: 'bg-blue-100 text-blue-800',
  shared: 'bg-slate-200 text-slate-800',
  a: 'bg-violet-100 text-violet-800',
  b: 'bg-amber-100 text-amber-900',
};

function Chip({ label, help, tone = 'blue' }: { label: string; help?: string; tone?: keyof typeof CHIP_TONES }) {
  const chip = <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${CHIP_TONES[tone]}`}>{label}</span>;
  return help ? <Tooltip text={help}>{chip}</Tooltip> : chip;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1.5 text-[10px] font-mono px-1 rounded border border-slate-300 bg-slate-50 text-slate-500">{children}</kbd>;
}

function scopeLabel(r: ResolvedRow) {
  if (r.scope === 'trial') return 'trial level';
  if (r.scope === 'cohort_existence') return 'cohort';
  if (r.scope === 'cohort') return r.fieldKey === COHORT_TYPES_FIELD ? 'cohort' : 'cohort bound';
  return r.cancerType;
}

function autoReasonLabel(r: ResolvedRow, names: Names): string {
  if (r.autoReason === 'blank_rule') return 'Blank rule';
  if (r.autoReason === 'inherited') return 'Inherited from trial level';
  if (r.oneSided) {
    const who = r.oneSided === 'a' ? names[0] : names[1];
    return r.scope === 'descriptor' && r.fieldKey !== COHORT_TYPES_FIELD ? `Only ${who} has this cancer type here` : `Only ${who} has this cohort`;
  }
  return '';
}

// ──────────────────────────────────────────────────────────────────────────
// Main view
// ──────────────────────────────────────────────────────────────────────────

export function AdjudicationView({
  sessionName, trial, reviews, initialAdjudications, initialCohortMap,
}: Props) {
  const [finals, setFinals] = useState<Record<string, FieldValue>>(initialAdjudications as Record<string, FieldValue>);
  const [cohortMap, setCohortMap] = useState<CohortMap | null>(initialCohortMap);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const A = reviews[0]?.answers;
  const B = reviews[1]?.answers;
  const hasBoth = reviews.length === 2;
  const bothSubmitted = hasBoth && reviews.every((r) => r.status === 'submitted');
  const names: Names = [reviews[0]?.expertName ?? 'Annotator 1', reviews[1]?.expertName ?? 'Annotator 2'];
  const short: Names = [names[0].split(' ')[0], names[1].split(' ')[0]];

  const pairs = useMemo(() => pairsFor(A, B, cohortMap), [A, B, cohortMap]);
  const rows = useMemo(() => buildComparisonRows(A, B, cohortMap), [A, B, cohortMap]);
  const resolved = useMemo(
    () => resolveRows(rows, !!A, !!B, (k) => (k in finals ? finals[k] : undefined)),
    [rows, A, B, finals],
  );

  // Decision rows in keyboard order: structural decisions first, then fields.
  const decisionRows = useMemo(() => {
    const live = resolved.rows.filter((r) => r.needsDecision);
    return [...live.filter(isStructural), ...live.filter((r) => !isStructural(r))];
  }, [resolved]);
  const openCount = resolved.unresolved.length;
  const decidedCount = decisionRows.length - openCount;

  const autoRows = useMemo(() => resolved.rows.filter((r) =>
    (r.agree && (r.autoReason === 'blank_rule' || r.autoReason === 'inherited')) ||
    (r.oneSided && (!isBlank(r.a) || !isBlank(r.b)) && !isStructural(r)),
  ), [resolved]);
  const agreements = useMemo(() => resolved.rows.filter((r) =>
    r.scope !== 'trial' && r.agree && !r.autoReason && !isBlank(r.a),
  ), [resolved]);
  const trialRows = resolved.rows.filter((r) => r.scope === 'trial');

  // Start on the first open decision.
  useEffect(() => {
    if (activeKey === null && resolved.unresolved.length) setActiveKey(keyOf(resolved.unresolved[0]));
  }, [activeKey, resolved]);

  useEffect(() => {
    if (activeKey) cardRefs.current.get(activeKey)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeKey]);

  function nextOpenAfter(key: string, skip: Set<string>): string | null {
    const i = decisionRows.findIndex((r) => keyOf(r) === key);
    const order = [...decisionRows.slice(i + 1), ...decisionRows.slice(0, Math.max(i, 0))];
    const next = order.find((r) => r.source === 'unresolved' && !skip.has(keyOf(r)));
    return next ? keyOf(next) : null;
  }

  async function decide(items: { row: ResolvedRow; value: FieldValue }[], advanceFrom?: string) {
    setErr(null);
    const prev = finals;
    const next = { ...finals };
    for (const it of items) next[keyOf(it.row)] = it.value;
    setFinals(next);
    if (advanceFrom) {
      const following = nextOpenAfter(advanceFrom, new Set(items.map((it) => keyOf(it.row))));
      if (following) setActiveKey(following);
    }
    const payload = items.map((it) => ({
      cohortKey: it.row.cohortKey, cancerType: it.row.cancerType, fieldKey: it.row.fieldKey, value: it.value,
    }));
    const result = payload.length === 1
      ? await adjudicateFieldAction({ nctId: trial.nctId, ...payload[0] })
      : await adjudicateFieldsAction({ nctId: trial.nctId, items: payload });
    if (!result.ok) { setFinals(prev); setErr(result.error ?? 'Failed to save'); }
  }

  async function clear(row: ResolvedRow) {
    setErr(null);
    const key = keyOf(row);
    const prev = finals;
    const next = { ...finals };
    delete next[key];
    setFinals(next);
    const result = await clearAdjudicationAction({
      nctId: trial.nctId, cohortKey: row.cohortKey, cancerType: row.cancerType, fieldKey: row.fieldKey,
    });
    if (!result.ok) { setFinals(prev); setErr(result.error ?? 'Failed to clear'); }
  }

  // Re-pairing changes which two cohorts a cohort key compares, so decisions
  // made in the cohorts whose pairing changed are cleared.
  async function savePairing(nextMap: CohortMap | null) {
    setErr(null);
    const sig = (ps: CohortPair[]) => new Map(ps.map((p) => [p.key, `${p.a?.cohortKey ?? ''}~${p.b?.cohortKey ?? ''}`]));
    const before = sig(pairs);
    const after = sig(pairsFor(A, B, nextMap));
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k));
    const prevMap = cohortMap;
    const prevFinals = finals;
    setCohortMap(nextMap);
    setFinals(Object.fromEntries(Object.entries(finals).filter(([k]) => !changed.includes(k.split('|')[0]))));
    const result = await setAdjudicationCohortMapAction({ nctId: trial.nctId, map: nextMap, clearCohortKeys: changed });
    if (!result.ok) { setCohortMap(prevMap); setFinals(prevFinals); setErr(result.error ?? 'Failed to save pairing'); }
  }

  function repair(aKey: string, bKey: string) {
    const map = cohortMapOf(pairs);
    for (const k of Object.keys(map)) if (map[k] === aKey) map[k] = '';
    if (bKey) map[bKey] = aKey;
    void savePairing(map);
  }

  // Keyboard: J/K move between decisions; 1/2/U/O/0 pick on the active card.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'k') {
        if (!decisionRows.length) return;
        e.preventDefault();
        const i = decisionRows.findIndex((r) => keyOf(r) === activeKey);
        const n = decisionRows.length;
        const j = i < 0 ? 0 : (i + (k === 'j' ? 1 : -1) + n) % n;
        setActiveKey(keyOf(decisionRows[j]));
        return;
      }
      const row = decisionRows.find((r) => keyOf(r) === activeKey);
      if (!row) return;
      const pick = quickPicks(row, short).find((p) => p.shortcut === k);
      if (!pick) return;
      e.preventDefault();
      void decide([{ row, value: pick.value }], keyOf(row));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cardProps = (row: ResolvedRow): CardProps => {
    const k = keyOf(row);
    return {
      row,
      names: short,
      final: finals[k],
      isDecided: k in finals,
      active: activeKey === k,
      onActivate: () => setActiveKey(k),
      onPick: (v: FieldValue) => decide([{ row, value: v }], k),
      onClear: () => clear(row),
      cardRef: (el: HTMLDivElement | null) => { if (el) cardRefs.current.set(k, el); else cardRefs.current.delete(k); },
    };
  };

  // Field decisions grouped by cohort, then cancer type.
  const fieldGroups = useMemo(() => {
    const groups = new Map<string, { name: string; rows: ResolvedRow[] }>();
    for (const r of decisionRows) {
      if (isStructural(r)) continue;
      const g = groups.get(r.cohortKey) ?? { name: r.cohortDisplayName ?? r.cohortKey, rows: [] };
      g.rows.push(r);
      groups.set(r.cohortKey, g);
    }
    return groups;
  }, [decisionRows]);

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
          {hasBoth && (
            <div className="text-xs text-slate-600 whitespace-nowrap">
              <strong className={openCount === 0 ? 'text-emerald-700' : 'text-amber-700'}>{decidedCount}</strong>
              {' '}/ {decisionRows.length} decisions made
              {autoRows.length > 0 && <span className="text-slate-400"> · {autoRows.length} auto-resolved</span>}
            </div>
          )}
          <Link
            href={`/review/adjudicate/next?after=${encodeURIComponent(trial.nctId)}`}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition ${
              openCount === 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-slate-300 text-slate-700 hover:border-blue-400'
            }`}
          >
            Next trial →
          </Link>
        </div>
        {err && <div className="bg-red-50 border-t border-red-200 px-6 py-2 text-sm text-red-800">⚠ {err}</div>}
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
                    <Chip label={i === 0 ? 'A' : 'B'} tone={i === 0 ? 'a' : 'b'} />
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
          {reviews.length < 2 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
              This trial has {reviews.length} of 2 reviews — adjudication opens once both
              experts have submitted. The values below are what the label would contain now.
            </div>
          )}

          {hasBoth && decisionRows.length > 0 && (
            <p className="text-xs text-slate-500">
              Keys: <Kbd>J</Kbd>/<Kbd>K</Kbd> next / previous · <Kbd>1</Kbd> {short[0]} · <Kbd>2</Kbd> {short[1]} ·
              {' '}<Kbd>U</Kbd> union · <Kbd>O</Kbd> overlap · <Kbd>0</Kbd> blank. Picking moves to the next open decision.
            </p>
          )}

          {hasBoth && (
            <CohortsSection
              pairs={pairs}
              bCohorts={B?.cohorts ?? []}
              names={short}
              structural={decisionRows.filter(isStructural)}
              cardProps={cardProps}
              isCustomPairing={cohortMap !== null}
              onRepair={repair}
              onReset={() => savePairing(null)}
            />
          )}

          {[...fieldGroups.entries()].map(([cohortKey, group]) => {
            const open = group.rows.filter((r) => r.source === 'unresolved');
            const byType = new Map<string, ResolvedRow[]>();
            for (const r of group.rows) {
              const t = r.scope === 'descriptor' ? r.cancerType : 'Cohort bounds';
              byType.set(t, [...(byType.get(t) ?? []), r]);
            }
            return (
              <section key={cohortKey}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <h2 className="text-xs uppercase tracking-wider text-red-600 font-semibold">
                    {group.name} · {open.length} open of {group.rows.length}
                  </h2>
                  {open.length > 1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">For the {open.length} open fields:</span>
                      {[0, 1].map((side) => (
                        <button
                          key={side}
                          onClick={() => decide(open.map((row) => ({ row, value: side === 0 ? row.a : row.b })))}
                          className="px-2.5 py-1 border border-slate-300 rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition"
                        >
                          Use {short[side]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-5">
                  {[...byType.entries()].map(([type, typeRows]) => (
                    <div key={type}>
                      <div className="text-[11px] font-semibold text-slate-500 mb-2">{type}</div>
                      <div className="space-y-3">
                        {typeRows.map((row) => <DecisionCard key={keyOf(row)} {...cardProps(row)} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {hasBoth && openCount === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-900 flex items-center justify-between gap-3">
              <span>Nothing open on this trial — the adjudicated label is complete.</span>
              <Link href={`/review/adjudicate/next?after=${encodeURIComponent(trial.nctId)}`} className="font-medium text-emerald-800 hover:underline">
                Next trial →
              </Link>
            </div>
          )}

          {autoRows.length > 0 && (
            <details className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <summary className="px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-semibold cursor-pointer">
                Auto-resolved ({autoRows.length})
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {autoRows.map((row) => <AutoRow key={keyOf(row)} {...cardProps(row)} reason={autoReasonLabel(row, short)} />)}
              </div>
            </details>
          )}

          {agreements.length > 0 && (
            <details className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <summary className="px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-semibold cursor-pointer">
                {hasBoth ? `Agreements (${agreements.length} filled in)` : `Current values (${agreements.length})`}
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {agreements.map((row) => (
                  <div key={keyOf(row)} className="px-4 py-2.5 grid grid-cols-[1fr_auto] gap-4 items-center text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-800">{row.def.label}</span>
                      <span className="text-xs text-slate-400 ml-2 font-mono">{row.cohortDisplayName} · {scopeLabel(row)}</span>
                    </div>
                    <ValueChip value={row.a} optionHelp={row.def.optionHelp} />
                  </div>
                ))}
              </div>
            </details>
          )}

          <details className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <summary className="px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-semibold cursor-pointer">
              Trial level (derived from the cohorts)
            </summary>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {trialRows.map((row) => (
                <div key={keyOf(row)} className="px-4 py-2.5 grid grid-cols-[10rem_1fr] gap-4 items-start text-sm">
                  <span className="font-medium text-slate-800">{row.def.label}</span>
                  <div className="space-y-1 text-xs text-slate-500">
                    <div>Final: <ValueChip value={row.value} optionHelp={row.def.optionHelp} /></div>
                    {reviews.map((r, i) => (
                      <div key={i}>{short[i]} entered: <ValueChip value={i === 0 ? row.rawA : row.rawB} optionHelp={row.def.optionHelp} /></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Cohort pairing and structural decisions
// ──────────────────────────────────────────────────────────────────────────

interface CardProps {
  row: ResolvedRow;
  names: Names;
  final: FieldValue | undefined;
  isDecided: boolean;
  active: boolean;
  onActivate: () => void;
  onPick: (v: FieldValue) => void;
  onClear: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}

function CohortsSection({
  pairs, bCohorts, names, structural, cardProps, isCustomPairing, onRepair, onReset,
}: {
  pairs: CohortPair[];
  bCohorts: TrialAnswers['cohorts'];
  names: Names;
  structural: ResolvedRow[];
  cardProps: (row: ResolvedRow) => CardProps;
  isCustomPairing: boolean;
  onRepair: (aKey: string, bKey: string) => void;
  onReset: () => void;
}) {
  const typesOf = (c?: TrialAnswers['cohorts'][number]) => Object.keys(c?.applicableCancerTypes ?? {});
  const cohortLabel = (c?: { displayName: string; cohortKey: string }) => c ? (c.displayName?.trim() || c.cohortKey) : '';
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Cohorts ({pairs.length}) · {isCustomPairing ? 'paired by reviewer' : 'paired automatically by content'}
        </h2>
        {isCustomPairing && (
          <button onClick={onReset} className="text-xs text-blue-600 hover:underline">Reset to automatic pairing</button>
        )}
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {pairs.map((p) => {
          const rowsHere = structural.filter((r) => r.cohortKey === p.key);
          return (
            <div key={p.key} className="p-4 space-y-3">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start text-sm">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-violet-700 font-semibold">{names[0]}</div>
                  {p.a ? (
                    <>
                      <div className="font-medium text-slate-900 truncate">{cohortLabel(p.a)}</div>
                      <div className="flex flex-wrap gap-1 mt-1">{typesOf(p.a).map((t) => <Chip key={t} label={t} tone="a" />)}</div>
                    </>
                  ) : <div className="text-slate-400 italic">no matching cohort</div>}
                </div>
                <div className="text-slate-400 pt-4 text-center">
                  ⇄
                  {p.score !== null && <div className="text-[10px] text-slate-400 mt-1">{Math.round(p.score * 100)}% match</div>}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold">{names[1]}</div>
                  {p.a ? (
                    <select
                      value={p.b?.cohortKey ?? ''}
                      onChange={(e) => onRepair(p.a!.cohortKey, e.target.value)}
                      className="mt-0.5 w-full text-sm border border-slate-300 rounded-lg px-2 py-1 bg-white"
                    >
                      <option value="">— no matching cohort —</option>
                      {bCohorts.map((c) => (
                        <option key={c.cohortKey} value={c.cohortKey}>
                          {cohortLabel(c)} ({typesOf(c).join(', ') || 'no types'})
                        </option>
                      ))}
                    </select>
                  ) : <div className="font-medium text-slate-900 truncate">{cohortLabel(p.b)}</div>}
                  {p.b && <div className="flex flex-wrap gap-1 mt-1">{typesOf(p.b).map((t) => <Chip key={t} label={t} tone="b" />)}</div>}
                </div>
              </div>
              {rowsHere.map((row) => <DecisionCard key={keyOf(row)} {...cardProps(row)} />)}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        Changing a pairing clears decisions already made in the cohorts involved.
      </p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Decision card
// ──────────────────────────────────────────────────────────────────────────

function DecisionCard({
  row, names, final: finalValue, isDecided, active, onActivate, onPick, onClear, cardRef,
}: CardProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<FieldValue>(finalValue ?? null);
  const picks = quickPicks(row, names);
  const isMulti = row.def.kind === 'multi';
  const A = isMulti ? ((row.a as string[] | null) ?? []) : [];
  const B = isMulti ? ((row.b as string[] | null) ?? []) : [];
  const shared = A.filter((x) => B.includes(x));
  const onlyA = A.filter((x) => !B.includes(x));
  const onlyB = B.filter((x) => !A.includes(x));
  const help = row.def.optionHelp;
  const title = row.fieldKey === COHORT_EXISTS_FIELD
    ? `Keep this cohort? (only ${row.a ? names[0] : names[1]} drew it)`
    : row.def.label;

  return (
    <div
      ref={cardRef}
      onClick={onActivate}
      className={`border rounded-2xl p-4 shadow-sm transition ${
        isDecided ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-red-200'
      } ${active ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <span className="font-semibold text-slate-900">{title}</span>
          <span className="text-xs text-slate-400 ml-2 font-mono">{scopeLabel(row)} · {row.fieldKey}</span>
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded font-semibold whitespace-nowrap ${
          isDecided ? 'text-emerald-700 bg-emerald-100' : 'text-red-700 bg-red-100'
        }`}>{isDecided ? 'Decided' : 'Open'}</span>
      </div>

      {isMulti ? (
        <div className="space-y-1.5 text-xs mb-3">
          {shared.length > 0 && (
            <div className="flex gap-2 items-start"><span className="w-20 shrink-0 text-slate-500">Both</span>
              <span className="flex flex-wrap gap-1">{shared.map((v) => <Chip key={v} label={v} help={help?.[v]} tone="shared" />)}</span></div>
          )}
          <div className="flex gap-2 items-start"><span className="w-20 shrink-0 text-violet-700">Only {names[0]}</span>
            <span className="flex flex-wrap gap-1">{onlyA.length ? onlyA.map((v) => <Chip key={v} label={v} help={help?.[v]} tone="a" />) : <span className="text-slate-400 italic">{A.length ? 'nothing extra' : 'blank'}</span>}</span></div>
          <div className="flex gap-2 items-start"><span className="w-20 shrink-0 text-amber-800">Only {names[1]}</span>
            <span className="flex flex-wrap gap-1">{onlyB.length ? onlyB.map((v) => <Chip key={v} label={v} help={help?.[v]} tone="b" />) : <span className="text-slate-400 italic">{B.length ? 'nothing extra' : 'blank'}</span>}</span></div>
        </div>
      ) : row.fieldKey !== COHORT_EXISTS_FIELD && (
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          {[0, 1].map((side) => {
            const v = side === 0 ? row.a : row.b;
            const raw = side === 0 ? row.rawA : row.rawB;
            return (
              <div key={side} className="border border-slate-200 rounded-xl px-3 py-2 bg-white">
                <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${side === 0 ? 'text-violet-700' : 'text-amber-800'}`}>{names[side]}</div>
                <ValueChip value={v} optionHelp={help} />
                {String(raw ?? '') !== String(v ?? '') && (
                  <div className="text-[10px] text-slate-400 mt-0.5">entered as {isBlank(raw) ? 'blank' : String(raw)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {picks.map((p) => (
          <button
            key={p.id}
            onClick={(e) => { e.stopPropagation(); onPick(p.value); }}
            className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition"
          >
            {p.label}<Kbd>{p.shortcut.toUpperCase()}</Kbd>
          </button>
        ))}
        {row.fieldKey !== COHORT_EXISTS_FIELD && (
          <button onClick={(e) => { e.stopPropagation(); setShowCustom((s) => !s); }} className="text-xs text-blue-600 hover:underline ml-1">
            {showCustom ? 'Hide custom' : 'Custom…'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-slate-500">Final:</span>
          {isDecided ? <ValueChip value={finalValue as FieldValue} optionHelp={help} /> : <span className="text-slate-400 italic">not set</span>}
          {isDecided && (
            <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="text-red-600 hover:underline">Clear</button>
          )}
        </div>
      </div>

      {showCustom && (
        <div className="mt-3 border-t border-slate-200 pt-2 flex items-end gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex-1 min-w-[260px]">
            <FieldEditor def={row.def} value={customValue} onChange={setCustomValue} />
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

// A difference resolved without a decision, with the reason and an override.
function AutoRow(props: CardProps & { reason: string }) {
  const { row, names, isDecided, final: finalValue, reason } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 py-2.5 text-sm">
      <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="min-w-0">
          <span className="font-medium text-slate-800">{row.def.label}</span>
          <span className="text-xs text-slate-400 ml-2 font-mono">{row.cohortDisplayName} · {scopeLabel(row)}</span>
          <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">{reason}</span>
          {isDecided && <span className="ml-1 text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-semibold">Overridden</span>}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-blue-600 hover:underline">{open ? 'Close' : 'Override'}</button>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span>{names[0]}: <ValueChip value={row.rawA} optionHelp={row.def.optionHelp} /></span>
        <span>{names[1]}: <ValueChip value={row.rawB} optionHelp={row.def.optionHelp} /></span>
        <span>Final: <ValueChip value={isDecided ? (finalValue as FieldValue) : (row.oneSided === 'b' ? row.b : row.a)} optionHelp={row.def.optionHelp} /></span>
      </div>
      {open && <div className="mt-2"><DecisionCard {...props} active={false} /></div>}
    </div>
  );
}
