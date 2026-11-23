'use client';

// Reviewer adjudication of one trial. Top to bottom:
//   1. A comparison table: Field | Annotator A | Annotator B | Final label.
//      Sections: the derived trial level, then each cohort pair (re-pairable
//      from its header row) with its structural rows (keep the cohort, its
//      cancer types), its bounds, and its fields grouped by cancer type. Open
//      rows show quick picks; any other row can be clicked to change it.
//      Cohorts the adjudicator added come last, every field filled in by hand.
//   2. The adjudicator's note explaining their reasoning for the trial.
//   3. Collapsed: each annotator's full annotation, cohorts side by side.
//
// What counts as a decision, and the final label, come from
// buildComparisonRows / resolveRows (src/lib/adjudication-rows.ts) — the same
// code the label export uses.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  addCohortAction, adjudicateFieldAction, adjudicateFieldsAction, clearAdjudicationAction, removeAddedCohortAction,
  setAdjudicationCohortMapAction, setAdjudicationNoteAction, updateAddedCohortAction,
} from '@/app/actions/adjudication';
import { EligibilityText } from '@/components/EligibilityText';
import { FieldEditor } from '@/components/FieldEditor';
import { Tooltip } from '@/components/Tooltip';
import {
  AddedCohort, COHORT_EXISTS_FIELD, COHORT_LEVEL_DEFS, COHORT_TYPES_DEF, COHORT_TYPES_FIELD, CohortMap, CohortPair,
  ComparisonRow, ResolvedRow, TrialLevel, adjudicationKey, buildComparisonRows, cohortMapOf, normValue,
  normalizeFieldValue, pairsFor, resolveRows,
} from '@/lib/adjudication-rows';
import { BLOCKS } from '@/lib/schema/field-schemas';
import {
  ALL_CANCER_TYPES, CANCER_TYPE_LABELS, CANCER_TYPE_DEFINITIONS, CancerType, Cohort, FieldValue, TRIAL_LEVEL_SENTINEL,
  TrialAnswers,
} from '@/lib/types';

interface ReviewSummary {
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
  initialAddedCohorts: AddedCohort[];
  initialNote: string;
  initialNoteSavedAt: string | null;
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

function quickPicks(row: ComparisonRow, names: Names): QuickPick[] {
  if (row.added) return []; // nothing to pick from — set with the field editor
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

const STATUS_TONES = {
  open: 'bg-red-100 text-red-700',
  decided: 'bg-emerald-100 text-emerald-700',
  agreed: 'bg-slate-100 text-slate-600',
  auto: 'bg-blue-100 text-blue-700',
  muted: 'bg-slate-100 text-slate-400',
} as const;

// The badge in the Final column: where the final value comes from.
function statusOf(res: ResolvedRow | undefined, names: Names): { label: string; tone: keyof typeof STATUS_TONES } {
  if (!res) return { label: 'Not on label', tone: 'muted' };
  switch (res.source) {
    case 'unresolved': return { label: 'Open', tone: 'open' };
    case 'adjudicated': return { label: 'Decided', tone: 'decided' };
    case 'added': return res.fieldKey === COHORT_TYPES_FIELD ? { label: 'Added', tone: 'auto' } : { label: 'Not set', tone: 'muted' };
    case 'derived': return { label: 'Derived', tone: 'auto' };
    case 'single_annotator': return { label: 'Single annotator', tone: 'agreed' };
    case 'one_sided': return { label: `Only ${res.oneSided === 'a' ? names[0] : names[1]}`, tone: 'auto' };
    default:
      if (res.autoReason === 'blank_rule') return { label: 'Same after blank rule', tone: 'auto' };
      if (res.autoReason === 'inherited') return { label: 'Same with trial value', tone: 'auto' };
      return { label: 'Agreed', tone: 'agreed' };
  }
}

function Badge({ label, tone }: { label: string; tone: keyof typeof STATUS_TONES }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${STATUS_TONES[tone]}`}>
      {label}
    </span>
  );
}

const cohortLabel = (c?: { displayName: string; cohortKey: string }) => c ? (c.displayName?.trim() || c.cohortKey) : '';
const cohortTypes = (c?: Cohort) => sortedTypes(Object.keys(c?.applicableCancerTypes ?? {}));

// ──────────────────────────────────────────────────────────────────────────
// Main view
// ──────────────────────────────────────────────────────────────────────────

export function AdjudicationView({
  sessionName, trial, reviews, initialAdjudications, initialCohortMap, initialAddedCohorts, initialNote,
  initialNoteSavedAt,
}: Props) {
  const [finals, setFinals] = useState<Record<string, FieldValue>>(initialAdjudications as Record<string, FieldValue>);
  const [cohortMap, setCohortMap] = useState<CohortMap | null>(initialCohortMap);
  const [addedCohorts, setAddedCohorts] = useState<AddedCohort[]>(initialAddedCohorts);
  const [addingCohort, setAddingCohort] = useState(false);
  const [editingCohort, setEditingCohort] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hideBlank, setHideBlank] = useState(true);
  const [hideAgreed, setHideAgreed] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const A = reviews[0]?.answers;
  const B = reviews[1]?.answers;
  const hasBoth = reviews.length === 2;
  const bothSubmitted = hasBoth && reviews.every((r) => r.status === 'submitted');
  // Blinded: annotators are shown only as A / B (see page.tsx).
  const names: Names = ['Annotator A', 'Annotator B'];
  const short: Names = ['A', 'B'];

  const pairs = useMemo(() => pairsFor(A, B, cohortMap), [A, B, cohortMap]);
  const rows = useMemo(() => buildComparisonRows(A, B, cohortMap, addedCohorts), [A, B, cohortMap, addedCohorts]);
  const resolved = useMemo(
    () => resolveRows(rows, !!A, !!B, (k) => (k in finals ? finals[k] : undefined), addedCohorts),
    [rows, A, B, finals, addedCohorts],
  );
  const resolvedByKey = useMemo(() => new Map(resolved.rows.map((r) => [keyOf(r), r])), [resolved]);

  // Decisions in table order (each cohort's structural rows come first).
  const decisionRows = useMemo(() => resolved.rows.filter((r) => r.needsDecision), [resolved]);
  const openCount = resolved.unresolved.length;
  const decidedCount = decisionRows.length - openCount;
  const autoCount = resolved.autoResolved.length;

  const trialRows = rows.filter((r) => r.scope === 'trial');
  const rowsByPair = useMemo(() => {
    const m = new Map<string, ComparisonRow[]>();
    for (const r of rows) if (r.scope !== 'trial') m.set(r.cohortKey, [...(m.get(r.cohortKey) ?? []), r]);
    return m;
  }, [rows]);

  // Start on the first open decision.
  useEffect(() => {
    if (activeKey === null && resolved.unresolved.length) setActiveKey(keyOf(resolved.unresolved[0]));
  }, [activeKey, resolved]);

  useEffect(() => {
    if (activeKey) rowRefs.current.get(activeKey)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeKey]);

  function nextOpenAfter(key: string, skip: Set<string>): string | null {
    const i = decisionRows.findIndex((r) => keyOf(r) === key);
    const order = [...decisionRows.slice(i + 1), ...decisionRows.slice(0, Math.max(i, 0))];
    const next = order.find((r) => r.source === 'unresolved' && !skip.has(keyOf(r)));
    return next ? keyOf(next) : null;
  }

  async function decide(items: { row: ComparisonRow; value: FieldValue }[], advanceFrom?: string) {
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

  async function clear(row: ComparisonRow) {
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

  async function addCohort(form: CohortFormValue): Promise<string | null> {
    const result = await addCohortAction({ nctId: trial.nctId, ...form });
    if (!result.ok || !result.cohort) return result.error ?? 'Could not add the cohort.';
    const cohort = result.cohort;
    const saved: Record<string, FieldValue> = {};
    for (const [fk, v] of Object.entries(form.bounds)) {
      if (!isBlank(v)) saved[adjudicationKey(cohort.cohortKey, TRIAL_LEVEL_SENTINEL, fk)] = v;
    }
    setAddedCohorts((cs) => [...cs, cohort]);
    setFinals((f) => ({ ...f, ...saved }));
    setAddingCohort(false);
    // Start on the new cohort's first field.
    const ct = cohort.cancerTypes.find((t) => Object.keys(BLOCKS[t]?.fields ?? {}).length > 0);
    if (ct) setActiveKey(adjudicationKey(cohort.cohortKey, ct, Object.keys(BLOCKS[ct].fields)[0]));
    return null;
  }

  async function updateCohort(cohortKey: string, form: CohortFormValue): Promise<string | null> {
    const { displayName, cancerTypes } = form;
    const result = await updateAddedCohortAction({ nctId: trial.nctId, cohortKey, displayName, cancerTypes });
    if (!result.ok) return result.error ?? 'Could not save the cohort.';
    setAddedCohorts((cs) => cs.map((c) => c.cohortKey === cohortKey ? { ...c, displayName, cancerTypes } : c));
    setEditingCohort(null);
    return null;
  }

  async function removeCohort(c: AddedCohort) {
    const prefix = `${c.cohortKey}|`;
    const n = Object.keys(finals).filter((k) => k.startsWith(prefix)).length;
    const values = n > 0 ? ` and the ${n} value${n === 1 ? '' : 's'} saved in it` : '';
    if (!window.confirm(`Remove the cohort "${c.displayName}"${values}? This can't be undone.`)) return;
    setErr(null);
    const result = await removeAddedCohortAction({ nctId: trial.nctId, cohortKey: c.cohortKey });
    if (!result.ok) { setErr(result.error ?? 'Failed to remove the cohort'); return; }
    setAddedCohorts((cs) => cs.filter((x) => x.cohortKey !== c.cohortKey));
    setFinals((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith(prefix))));
    if (activeKey?.startsWith(prefix)) setActiveKey(null);
  }

  // A row can be decided when both annotations exist and the row is on the
  // final label (not trial level, not in a dropped cohort or excluded type).
  // An added cohort's cancer types are changed with its Edit button instead.
  const canDecide = (r: ComparisonRow) =>
    hasBoth && r.scope !== 'trial' && !(r.added && r.fieldKey === COHORT_TYPES_FIELD) && resolvedByKey.has(keyOf(r));

  // Keyboard: J/K move between decisions; 1/2/U/O/0 pick on the active row.
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
      const row = activeKey ? resolvedByKey.get(activeKey) : undefined;
      if (!row || !canDecide(row)) return;
      const pick = quickPicks(row, short).find((p) => p.shortcut === k);
      if (!pick) return;
      e.preventDefault();
      void decide([{ row, value: pick.value }], keyOf(row));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Toggles never hide an open decision, the row being worked on or an added cohort.
  const isVisible = (r: ComparisonRow) => {
    if (r.added) return true;
    const k = keyOf(r);
    const res = resolvedByKey.get(k);
    if (res?.source === 'unresolved' || k === activeKey || k in finals) return true;
    if (hideBlank && [r.a, r.b, r.rawA, r.rawB].every(isBlank)) return false;
    if (hideAgreed && res?.source === 'agreed') return false;
    return true;
  };

  const renderRow = (r: ComparisonRow, label?: string) => {
    const k = keyOf(r);
    return (
      <CompareRow
        key={k}
        row={r}
        res={resolvedByKey.get(k)}
        label={label ?? r.def.label}
        names={short}
        active={activeKey === k}
        isDecided={k in finals}
        canDecide={canDecide(r)}
        onActivate={() => setActiveKey(k)}
        onPick={(v) => decide([{ row: r, value: v }], r.added ? undefined : k)}
        onClear={() => clear(r)}
        rowRef={(el) => { if (el) rowRefs.current.set(k, el); else rowRefs.current.delete(k); }}
      />
    );
  };

  const hdrCell = 'px-3 py-2 align-top border-t-2 border-slate-300 bg-slate-100';
  const subCell = 'px-3 py-1.5 align-top border-t border-slate-200 bg-slate-50 text-xs';

  const renderPair = (p: CohortPair, idx: number) => {
    const pairRows = rowsByPair.get(p.key) ?? [];
    const existsRow = pairRows.find((r) => r.fieldKey === COHORT_EXISTS_FIELD);
    const typesRow = pairRows.find((r) => r.fieldKey === COHORT_TYPES_FIELD);
    const boundRows = pairRows.filter((r) => r.scope === 'cohort' && r.fieldKey !== COHORT_TYPES_FIELD);
    const dropped = existsRow ? resolvedByKey.get(keyOf(existsRow))?.value === false : false;
    const open = pairRows.map((r) => resolvedByKey.get(keyOf(r))).filter((r): r is ResolvedRow => r?.source === 'unresolved');
    const openFields = open.filter((r) => !isStructural(r));

    // Final cancer types of this cohort; null while the membership decision is open.
    const typesRes = typesRow ? resolvedByKey.get(keyOf(typesRow)) : undefined;
    const finalTypes = typesRes && typesRes.source !== 'unresolved' ? new Set((typesRes.value as string[] | null) ?? []) : null;

    const byType = new Map<string, ComparisonRow[]>();
    for (const r of pairRows) if (r.scope === 'descriptor') byType.set(r.cancerType, [...(byType.get(r.cancerType) ?? []), r]);

    return (
      <Fragment key={p.key}>
        <tr>
          <td className={hdrCell}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cohort {idx + 1}</div>
            {p.a && p.b && p.score !== null && <div className="text-[11px] text-slate-500">{Math.round(p.score * 100)}% match</div>}
          </td>
          <td className={`${hdrCell} border-l border-l-slate-200`}>
            {p.a ? <span className="font-semibold text-slate-900">{cohortLabel(p.a)}</span> : <span className="text-slate-400 italic">no matching cohort</span>}
          </td>
          <td className={`${hdrCell} border-l border-l-slate-200`}>
            {p.a && hasBoth ? (
              <select
                value={p.b?.cohortKey ?? ''}
                onChange={(e) => repair(p.a!.cohortKey, e.target.value)}
                title="Re-pair: choose which of Annotator B's cohorts this one is compared with"
                className="w-full text-sm font-semibold text-slate-900 border border-slate-300 rounded-lg px-2 py-1 bg-white"
              >
                <option value="">— no matching cohort —</option>
                {(B?.cohorts ?? []).map((c) => (
                  <option key={c.cohortKey} value={c.cohortKey}>{cohortLabel(c)} ({cohortTypes(c).join(', ') || 'no types'})</option>
                ))}
              </select>
            ) : p.b ? <span className="font-semibold text-slate-900">{cohortLabel(p.b)}</span> : <span className="text-slate-400 italic">no matching cohort</span>}
          </td>
          <td className={`${hdrCell} border-l border-l-slate-200 text-xs`}>
            {dropped ? <Badge label="Dropped from label" tone="muted" /> : (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={open.length ? 'text-red-700 font-medium' : 'text-emerald-700 font-medium'}>
                  {open.length ? `${open.length} open` : 'Nothing open'}
                </span>
                {openFields.length > 1 && [0, 1].map((side) => (
                  <button
                    key={side}
                    onClick={() => decide(openFields.map((row) => ({ row, value: side === 0 ? row.a : row.b })))}
                    title={`Use ${names[side]}'s values for the ${openFields.length} open fields in this cohort`}
                    className="px-2 py-0.5 border border-slate-300 bg-white rounded text-slate-700 hover:border-blue-400 hover:text-blue-700 transition"
                  >
                    All {short[side]}
                  </button>
                ))}
              </div>
            )}
          </td>
        </tr>
        {existsRow && renderRow(existsRow, 'Cohort on final label')}
        {!dropped && (
          <>
            {typesRow && isVisible(typesRow) && renderRow(typesRow, 'Cancer types')}
            {boundRows.filter(isVisible).map((r) => renderRow(r))}
            {[...byType.entries()].map(([ct, typeRows]) => {
              const inA = !!p.a?.applicableCancerTypes?.[ct as keyof Cohort['applicableCancerTypes']];
              const inB = !!p.b?.applicableCancerTypes?.[ct as keyof Cohort['applicableCancerTypes']];
              const excluded = finalTypes !== null && !finalTypes.has(ct);
              const shown = excluded ? [] : typeRows.filter(isVisible);
              const hidden = excluded ? 0 : typeRows.length - shown.length;
              return (
                <Fragment key={ct}>
                  <tr>
                    <td className={`${subCell} font-semibold text-slate-800`}>
                      {CANCER_TYPE_LABELS[ct as keyof typeof CANCER_TYPE_LABELS] ?? ct}
                      {hidden > 0 && <span className="font-normal text-slate-400"> · {hidden} hidden</span>}
                    </td>
                    {[inA, inB].map((has, side) => (
                      <td key={side} className={`${subCell} border-l border-l-slate-200 ${has ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                        {has ? 'included' : 'not in cohort'}
                      </td>
                    ))}
                    <td className={`${subCell} border-l border-l-slate-200`}>
                      {excluded ? <Badge label="Excluded from label" tone="muted" />
                        : finalTypes === null ? <span className="text-amber-700">Pending the cancer-type decision</span>
                        : <span className="text-slate-600">On label</span>}
                    </td>
                  </tr>
                  {shown.map((r) => renderRow(r))}
                </Fragment>
              );
            })}
          </>
        )}
      </Fragment>
    );
  };

  const renderAdded = (c: AddedCohort, idx: number) => {
    const cohortRows = rowsByPair.get(c.cohortKey) ?? [];
    const linkCls = 'text-[11px] hover:underline';
    return (
      <Fragment key={c.cohortKey}>
        <tr>
          <td className={hdrCell}>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Cohort {pairs.length + idx + 1}</div>
            <div className="text-[11px] text-slate-500">added by adjudicator</div>
          </td>
          <td colSpan={2} className={`${hdrCell} border-l border-l-slate-200`}>
            <span className="font-semibold text-slate-900">{c.displayName}</span>
          </td>
          <td className={`${hdrCell} border-l border-l-slate-200 text-xs`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEditingCohort(editingCohort === c.cohortKey ? null : c.cohortKey)}
                className={`${linkCls} text-blue-600`}
              >
                Edit name / cancer types
              </button>
              <button onClick={() => removeCohort(c)} className={`${linkCls} text-red-600`}>Remove</button>
            </div>
          </td>
        </tr>
        {editingCohort === c.cohortKey && (
          <tr>
            <td colSpan={4} className="px-3 py-3 border-t border-slate-200 bg-blue-50/40">
              <CohortForm
                initial={c}
                submitLabel="Save cohort"
                onSubmit={(form) => updateCohort(c.cohortKey, form)}
                onCancel={() => setEditingCohort(null)}
              />
            </td>
          </tr>
        )}
        {cohortRows.filter((r) => r.scope === 'cohort')
          .map((r) => renderRow(r, r.fieldKey === COHORT_TYPES_FIELD ? 'Cancer types' : undefined))}
        {c.cancerTypes.map((ct) => (
          <Fragment key={ct}>
            <tr>
              <td className={`${subCell} font-semibold text-slate-800`}>{CANCER_TYPE_LABELS[ct] ?? ct}</td>
              <td colSpan={2} className={`${subCell} border-l border-l-slate-200 text-slate-400 italic`}>not in either annotation</td>
              <td className={`${subCell} border-l border-l-slate-200 text-slate-600`}>On label</td>
            </tr>
            {cohortRows.filter((r) => r.scope === 'descriptor' && r.cancerType === ct).map((r) => renderRow(r))}
          </Fragment>
        ))}
      </Fragment>
    );
  };

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
              {autoCount > 0 && <span className="text-slate-400"> · {autoCount} auto-resolved</span>}
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
                    <span className="font-medium text-slate-900">{names[i]}</span>
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
                  {reviews.map((r, i) => r.notes?.trim() && (
                    <div key={i} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <strong className="text-slate-700">{names[i]}:</strong>{' '}
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

        <div className="space-y-6 min-w-0">
          {reviews.length < 2 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
              This trial has {reviews.length} of 2 reviews — adjudication opens once both
              experts have submitted. The values below are what the label would contain now.
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="text-slate-600 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={hideBlank} onChange={(e) => setHideBlank(e.target.checked)} />
                  Hide fields blank for both annotators
                </label>
                <label className="text-slate-600 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={hideAgreed} onChange={(e) => setHideAgreed(e.target.checked)} />
                  Hide fields the annotators agree on
                </label>
              </div>
              {cohortMap !== null && (
                <button onClick={() => savePairing(null)} className="text-blue-600 hover:underline">Reset to automatic cohort pairing</button>
              )}
            </div>
            {hasBoth && decisionRows.length > 0 && (
              <p className="text-xs text-slate-500">
                Keys: <Kbd>J</Kbd>/<Kbd>K</Kbd> next / previous decision · <Kbd>1</Kbd> {short[0]} · <Kbd>2</Kbd> {short[1]} ·
                {' '}<Kbd>U</Kbd> union · <Kbd>O</Kbd> overlap · <Kbd>0</Kbd> blank. Click any row to change its final value.
                Re-pairing a cohort clears decisions already made in the cohorts involved.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-clip">
            <table className="w-full table-fixed text-sm border-separate border-spacing-0">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[24%]" />
                <col className="w-[24%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead>
                <tr>
                  {['Field', names[0], names[1], 'Final label'].map((h, i) => (
                    <th
                      key={h}
                      className={`sticky top-[61px] z-10 bg-white px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-slate-200 ${
                        i === 1 ? 'text-violet-700 border-l border-l-slate-100' : i === 2 ? 'text-amber-800 border-l border-l-slate-100' : i === 3 ? 'text-slate-700 border-l border-l-slate-100' : 'text-slate-500'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={hdrCell}>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Trial level</div>
                  </td>
                  <td colSpan={3} className={`${hdrCell} border-l border-l-slate-200 text-xs text-slate-500`}>
                    Derived from the final cohorts: cancer types are their union, bounds the widest range.
                  </td>
                </tr>
                {trialRows.map((r) => renderRow(r))}
                {pairs.map(renderPair)}
                {addedCohorts.map(renderAdded)}
              </tbody>
            </table>
          </div>

          {hasBoth && (addingCohort ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">Add a cohort</div>
              <p className="text-xs text-slate-500 mb-3">
                For a cohort neither annotator drew. Age and ECOG start from the trial level; every other field starts
                blank and is filled in on the table above.
              </p>
              <CohortForm
                trialLevel={resolved.trial}
                submitLabel="Add cohort"
                onSubmit={addCohort}
                onCancel={() => setAddingCohort(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingCohort(true)}
              className="w-full px-4 py-2.5 border border-dashed border-slate-300 rounded-2xl text-sm text-slate-600 bg-white hover:border-blue-400 hover:text-blue-700 transition"
            >
              + Add cohort
            </button>
          ))}

          {hasBoth && openCount === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-900 flex items-center justify-between gap-3">
              <span>Nothing open on this trial — the adjudicated label is complete.</span>
              <Link href={`/review/adjudicate/next?after=${encodeURIComponent(trial.nctId)}`} className="font-medium text-emerald-800 hover:underline">
                Next trial →
              </Link>
            </div>
          )}

          {hasBoth && <NoteBox nctId={trial.nctId} initialNote={initialNote} initialSavedAt={initialNoteSavedAt} />}

          {reviews.map((r, i) => (
            <AnnotationTable key={i} label={names[i]} tone={i === 0 ? 'a' : 'b'} review={r} />
          ))}
        </div>
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// One comparison row: field | Annotator A | Annotator B | final label
// ──────────────────────────────────────────────────────────────────────────

// An annotator's value. Multi-selects colour the options the other annotator
// didn't pick; "entered as" shows the raw value when normalization changed it.
function SideValue({ row, side }: { row: ComparisonRow; side: 0 | 1 }) {
  const v = side === 0 ? row.a : row.b;
  const raw = side === 0 ? row.rawA : row.rawB;
  const other = side === 0 ? row.b : row.a;
  const help = row.def.optionHelp;
  if (row.added) return <span className="text-slate-300" title="Not in either annotation">—</span>;
  if (row.fieldKey === COHORT_EXISTS_FIELD) {
    return v ? <span className="text-slate-800">Drew this cohort</span> : <span className="text-slate-400 italic">No such cohort</span>;
  }
  if (row.oneSided && row.oneSided !== (side === 0 ? 'a' : 'b')) {
    return <span className="text-slate-300" title="Not in this annotator's cohort">—</span>;
  }
  let shown: React.ReactNode;
  if (Array.isArray(v) && v.length > 0) {
    const otherVals = Array.isArray(other) ? other : [];
    const compare = !row.oneSided;
    shown = (
      <span className="inline-flex flex-wrap gap-1">
        {v.map((x) => (
          <Chip key={x} label={x} help={help?.[x]} tone={!compare || otherVals.includes(x) ? 'shared' : side === 0 ? 'a' : 'b'} />
        ))}
      </span>
    );
  } else {
    shown = <ValueChip value={v} optionHelp={help} />;
  }
  return (
    <div>
      {shown}
      {normValue(raw) !== normValue(v) && (
        <div className="text-[10px] text-slate-400 mt-0.5">
          entered as {isBlank(raw) ? 'blank' : Array.isArray(raw) ? `${raw.length} options (all)` : String(raw)}
        </div>
      )}
    </div>
  );
}

function CompareRow({
  row, res, label, names, active, isDecided, canDecide, onActivate, onPick, onClear, rowRef,
}: {
  row: ComparisonRow;
  res: ResolvedRow | undefined;
  label: string;
  names: Names;
  active: boolean;
  isDecided: boolean;
  canDecide: boolean;
  onActivate: () => void;
  onPick: (v: FieldValue) => void;
  onClear: () => void;
  rowRef: (el: HTMLTableRowElement | null) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<FieldValue>(res?.value ?? null);
  const open = res?.source === 'unresolved';
  const isExists = row.fieldKey === COHORT_EXISTS_FIELD;
  const status = statusOf(res, names);
  const picks = canDecide && (open || active) ? quickPicks(row, names) : [];
  const td = 'px-3 py-2 align-top border-t border-slate-100';
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  // An added cohort's fields have no picks: the editor is open while the row is
  // active, and stays open while it holds a value that hasn't been saved.
  const unsaved = !!row.added && canDecide && normValue(customValue) !== normValue(res?.value ?? null);
  const editorOpen = row.added ? canDecide && (active || unsaved) : showCustom;

  const finalValue = !res || open ? null
    : isExists ? <span className="font-medium text-slate-800">{res.value ? 'Kept' : 'Dropped'}</span>
    : <ValueChip value={res.value} optionHelp={row.def.optionHelp} />;

  return (
    <tr
      ref={rowRef}
      onClick={canDecide ? onActivate : undefined}
      className={`${canDecide ? 'cursor-pointer' : ''} ${active ? 'bg-blue-50' : open ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-slate-50'}`}
    >
      <td className={`${td} text-slate-700 ${active ? 'shadow-[inset_3px_0_0_#3b82f6]' : ''}`}>
        <div className="font-medium break-words">{label}</div>
      </td>
      <td className={`${td} border-l border-l-slate-100 break-words`}><SideValue row={row} side={0} /></td>
      <td className={`${td} border-l border-l-slate-100 break-words`}><SideValue row={row} side={1} /></td>
      <td className={`${td} border-l border-l-slate-100 bg-slate-50/50`}>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge {...status} />
            {finalValue}
            {isDecided && canDecide && (
              <button onClick={(e) => { stop(e); onClear(); if (row.added) setCustomValue(null); }} className="text-[11px] text-red-600 hover:underline ml-auto">Clear</button>
            )}
          </div>
          {picks.length > 0 && (
            <div className="flex flex-wrap gap-1" onClick={stop}>
              {picks.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPick(p.value)}
                  className="text-[11px] px-2 py-0.5 border border-slate-300 bg-white rounded text-slate-700 hover:border-blue-400 hover:text-blue-700 transition"
                >
                  {p.label}<Kbd>{p.shortcut.toUpperCase()}</Kbd>
                </button>
              ))}
              {!isExists && (
                <button onClick={() => setShowCustom((s) => !s)} className="text-[11px] text-blue-600 hover:underline px-1">
                  {showCustom ? 'Hide custom' : 'Custom…'}
                </button>
              )}
            </div>
          )}
          {editorOpen && (
            <div className="border-t border-slate-200 pt-1" onClick={stop}>
              <FieldEditor def={row.def} value={customValue} onChange={setCustomValue} />
              <button
                onClick={() => {
                  const v = row.added ? normalizeFieldValue(row.cancerType, row.fieldKey, customValue) : customValue;
                  setCustomValue(v);
                  onPick(v);
                  setShowCustom(false);
                }}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Use as final
              </button>
              {unsaved && <span className="ml-2 text-[11px] text-amber-700">Unsaved</span>}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Adding / editing a cohort
// ──────────────────────────────────────────────────────────────────────────

interface CohortFormValue { displayName: string; cancerTypes: CancerType[]; bounds: Record<string, FieldValue> }

// With `trialLevel` (adding), also asks for the cohort's age / ECOG bounds.
function CohortForm({
  initial, trialLevel, submitLabel, onSubmit, onCancel,
}: {
  initial?: AddedCohort;
  trialLevel?: TrialLevel;
  submitLabel: string;
  onSubmit: (form: CohortFormValue) => Promise<string | null>; // error message, or null when saved
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.displayName ?? '');
  const [types, setTypes] = useState<CancerType[]>(
    initial?.cancerTypes ?? (trialLevel?.cancerTypes.length === 1 ? trialLevel.cancerTypes : []),
  );
  const [bounds, setBounds] = useState<Record<string, FieldValue>>(trialLevel
    ? { minAge: trialLevel.minAge, maxAge: trialLevel.maxAge, ecogMin: trialLevel.ecogMin, ecogMax: trialLevel.ecogMax }
    : {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim() !== '' && types.length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setError(await onSubmit({ displayName: name.trim(), cancerTypes: types, bounds }));
    } catch {
      setError('Could not save the cohort.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="block text-sm font-medium text-slate-800">
        Cohort name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          autoFocus
          className="mt-1.5 block w-full font-normal text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        />
      </label>
      <div className="mt-2">
        <FieldEditor def={COHORT_TYPES_DEF} value={types} onChange={(v) => setTypes((v as CancerType[] | null) ?? [])} />
      </div>
      {trialLevel && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4">
          {Object.entries(COHORT_LEVEL_DEFS).map(([fk, def]) => (
            <div key={fk}>
              <FieldEditor def={def} value={bounds[fk] ?? null} onChange={(v) => setBounds((b) => ({ ...b, [fk]: v }))} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={!ready || busy}
          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 transition"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-slate-600 hover:underline">Cancel</button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Adjudicator's note
// ──────────────────────────────────────────────────────────────────────────

function NoteBox({ nctId, initialNote, initialSavedAt }: { nctId: string; initialNote: string; initialSavedAt: string | null }) {
  const [text, setText] = useState(initialNote);
  const [saved, setSaved] = useState(initialNote);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== saved.trim();

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    const res = await setAdjudicationNoteAction({ nctId, note: text });
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not save the note.'); return; }
    setSaved(text.trim());
    setText(text.trim());
    setSavedAt(text.trim() ? new Date().toISOString() : null);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <label htmlFor="adjudication-note" className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
        Adjudication reasoning
      </label>
      <p className="text-xs text-slate-500 mt-1">
        Briefly explain the reasoning behind your decisions on this trial (e.g. which criterion settled a disagreement).
      </p>
      <textarea
        id="adjudication-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); } }}
        rows={3}
        maxLength={5000}
        placeholder="e.g. Kept cohort B: the protocol enrolls a separate expansion arm for HER2-low disease."
        className="mt-2 w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
      />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className={error ? 'text-red-700' : dirty ? 'text-amber-700' : 'text-slate-400'}>
          {error ?? (dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleString()}` : 'No note yet')}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          className="px-3 py-1.5 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 transition"
        >
          {busy ? 'Saving…' : 'Save note'}<Kbd>⌘↵</Kbd>
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Full annotation, as entered: one table per annotator, cohorts side by side.
// Rows are the cohort bounds, then every field of every cancer type that any
// of the annotator's cohorts covers, grouped under a cancer-type heading.
// ──────────────────────────────────────────────────────────────────────────

function sortedTypes(types: string[]): string[] {
  const order = (t: string) => { const i = ALL_CANCER_TYPES.indexOf(t as never); return i < 0 ? 999 : i; };
  return [...types].sort((x, y) => order(x) - order(y));
}

const TONE_TEXT = { a: 'text-violet-700', b: 'text-amber-800' } as const;
const TONE_DOT = { a: 'bg-violet-500', b: 'bg-amber-500' } as const;

const COHORT_BOUNDS: { key: 'minAge' | 'maxAge' | 'ecogMin' | 'ecogMax'; label: string }[] = [
  { key: 'minAge', label: 'Min age' },
  { key: 'maxAge', label: 'Max age' },
  { key: 'ecogMin', label: 'ECOG min' },
  { key: 'ecogMax', label: 'ECOG max' },
];

const NOT_IN_COHORT = Symbol('not in cohort');

function AnnotationTable({ label, tone, review }: { label: string; tone: 'a' | 'b'; review: ReviewSummary }) {
  const [hideEmpty, setHideEmpty] = useState(false);
  const [hideSame, setHideSame] = useState(false);
  const ans = review.answers;
  const cohorts = ans.cohorts ?? [];
  const typesOf = (c: Cohort) => sortedTypes(Object.keys(c.applicableCancerTypes ?? {}));
  const usedTypes = sortedTypes([...new Set(cohorts.flatMap(typesOf))]);

  // Value of one descriptor field in one cohort, or NOT_IN_COHORT when the
  // cohort doesn't cover that cancer type.
  const cell = (c: Cohort, ct: string, fk: string): FieldValue | typeof NOT_IN_COHORT => {
    const block = c.applicableCancerTypes?.[ct as keyof Cohort['applicableCancerTypes']];
    return block === undefined ? NOT_IN_COHORT : (block[fk] ?? null);
  };

  // A row is "the same in every cohort" when every cohort has a value for it
  // (a cohort without the cancer type counts as different) and the values
  // match. Only meaningful with two or more cohorts.
  const canCompare = cohorts.length > 1;
  const allSame = (vals: (FieldValue | typeof NOT_IN_COHORT)[]) =>
    canCompare && vals.every((v) => v !== NOT_IN_COHORT) && new Set(vals.map(normValue)).size === 1;
  const showRow = (vals: (FieldValue | typeof NOT_IN_COHORT)[]) =>
    (!hideEmpty || vals.some((v) => v !== NOT_IN_COHORT && !isBlank(v))) && !(hideSame && allSame(vals));

  const typesRowShown = showRow(cohorts.map(typesOf));
  const boundRows = COHORT_BOUNDS.filter((b) => showRow(cohorts.map((c) => c[b.key])));
  const sections = usedTypes.map((ct) => {
    const fields = Object.entries(BLOCKS[ct as keyof typeof BLOCKS]?.fields ?? {});
    const rows = fields.filter(([fk]) => showRow(cohorts.map((c) => cell(c, ct, fk))));
    return { ct, total: fields.length, rows };
  });

  const stickyCol = 'sticky left-0 z-[1] bg-white border-r border-slate-200';
  const td = 'px-3 py-1.5 align-top border-t border-slate-100';

  return (
    <details className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <summary className="px-4 py-3 text-xs uppercase tracking-wider text-slate-500 font-semibold cursor-pointer">
        <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${TONE_DOT[tone]}`} />
        <span className={TONE_TEXT[tone]}>{label}</span> — full annotation
        <span className="normal-case tracking-normal font-normal text-slate-400">
          {' '}· {cohorts.length} cohort{cohorts.length === 1 ? '' : 's'}{review.status !== 'submitted' && ' · in progress'}
        </span>
      </summary>
      <div className="border-t border-slate-100">
        <div className="px-4 py-2.5 flex flex-wrap justify-between items-center gap-3 text-xs">
          <span className="text-slate-600">
            <strong className="text-slate-800">Trial level:</strong>{' '}
            <ValueChip value={sortedTypes(ans.cancerTypes ?? [])} optionHelp={CANCER_TYPE_DEFINITIONS} />
            {' '}· Age {ans.minAge ?? '–'} to {ans.maxAge ?? '–'} · ECOG {ans.ecogMin ?? '–'} to {ans.ecogMax ?? '–'}
            <span className="text-slate-400"> · as entered, before blank rules or derivation</span>
          </span>
          <div className="flex items-center gap-4">
            <label className="text-slate-600 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
              Hide fields blank in every cohort
            </label>
            <label
              className={`flex items-center gap-1.5 whitespace-nowrap ${canCompare ? 'text-slate-600 cursor-pointer' : 'text-slate-300 cursor-not-allowed'}`}
              title={canCompare ? undefined : 'Only one cohort'}
            >
              <input type="checkbox" disabled={!canCompare} checked={hideSame && canCompare} onChange={(e) => setHideSame(e.target.checked)} />
              Hide fields the same in every cohort
            </label>
          </div>
        </div>
        {cohorts.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-slate-400 italic">No cohorts</div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="text-sm border-separate border-spacing-0 min-w-full">
              <thead>
                <tr>
                  <th className={`${stickyCol} px-3 py-2 text-left text-[10px] uppercase tracking-wider text-slate-500 font-semibold min-w-[12rem]`}>
                    Field
                  </th>
                  {cohorts.map((c) => (
                    <th key={c.cohortKey} className="px-3 py-2 text-left font-semibold text-slate-900 min-w-[11rem] border-l border-slate-100 bg-slate-50">
                      {c.displayName || c.cohortKey}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {typesRowShown && (
                  <tr>
                    <td className={`${stickyCol} ${td} text-slate-600`}>Cancer types</td>
                    {cohorts.map((c) => (
                      <td key={c.cohortKey} className={`${td} border-l`}>
                        <ValueChip value={typesOf(c)} optionHelp={CANCER_TYPE_DEFINITIONS} />
                      </td>
                    ))}
                  </tr>
                )}
                {boundRows.map((b) => (
                  <tr key={b.key}>
                    <td className={`${stickyCol} ${td} text-slate-600`}>{b.label}</td>
                    {cohorts.map((c) => (
                      <td key={c.cohortKey} className={`${td} border-l`}><ValueChip value={c[b.key]} /></td>
                    ))}
                  </tr>
                ))}
                {sections.map(({ ct, total, rows }) => (
                  <Fragment key={ct}>
                    <tr>
                      <td className="sticky left-0 z-[1] bg-slate-100 px-3 py-1.5 border-t border-slate-200 text-xs font-semibold text-slate-800 whitespace-nowrap">
                        {CANCER_TYPE_LABELS[ct as keyof typeof CANCER_TYPE_LABELS] ?? ct}
                        <span className="font-normal text-slate-500"> · {total} field{total === 1 ? '' : 's'}</span>
                      </td>
                      {cohorts.map((c) => (
                        <td key={c.cohortKey} className="bg-slate-100 border-t border-slate-200 border-l border-l-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                          {c.applicableCancerTypes?.[ct as keyof Cohort['applicableCancerTypes']] ? 'included' : 'not in cohort'}
                        </td>
                      ))}
                    </tr>
                    {rows.length === 0 && (
                      <tr>
                        <td className={`${stickyCol} ${td} text-slate-400 italic`}>
                          {!total ? 'No fields' : hideSame && canCompare ? 'No fields shown (blank or the same everywhere)' : 'All fields blank'}
                        </td>
                        {cohorts.map((c) => <td key={c.cohortKey} className={`${td} border-l`} />)}
                      </tr>
                    )}
                    {rows.map(([fk, def]) => (
                      <tr key={fk} className="hover:bg-blue-50/40">
                        <td className={`${stickyCol} ${td} text-slate-600`}>{def.label}</td>
                        {cohorts.map((c) => {
                          const v = cell(c, ct, fk);
                          return v === NOT_IN_COHORT ? (
                            <td key={c.cohortKey} className={`${td} border-l bg-slate-50 text-slate-300 text-center`}>—</td>
                          ) : (
                            <td key={c.cohortKey} className={`${td} border-l`}><ValueChip value={v} optionHelp={def.optionHelp} /></td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
