'use client';

// Reviewer adjudication: field-level diff of the two expert reviews (plus the
// AI's original answer), with the reviewer recording a final value for each
// disagreeing field.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { adjudicateFieldAction, clearAdjudicationAction } from '@/app/actions/corpus';
import { EligibilityText } from '@/components/EligibilityText';
import { FieldEditor } from '@/components/FieldEditor';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockKey, FieldDef, FieldValue, TrialAnswers } from '@/lib/types';

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
  blocks: BlockKey[];
  aiAnswers: TrialAnswers;
  reviews: ReviewSummary[];
  initialAdjudications: Record<string, unknown>; // "block.field" -> FieldValue
}

// Normalize for comparison: undefined -> null, multi-select arrays compared
// as sets (order-insensitive), empty array == null.
function norm(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'null';
    return JSON.stringify([...v].sort());
  }
  return JSON.stringify(v);
}

function getValue(answers: TrialAnswers, block: BlockKey, fieldKey: string): FieldValue {
  const v = (answers[block] ?? {})[fieldKey];
  return v === undefined ? null : (v as FieldValue);
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

export function AdjudicationView({
  sessionName, trial, blocks, aiAnswers, reviews, initialAdjudications,
}: Props) {
  const [finals, setFinals] = useState<Record<string, FieldValue>>(
    initialAdjudications as Record<string, FieldValue>,
  );
  const [err, setErr] = useState<string | null>(null);
  const bothSubmitted = reviews.length === 2 && reviews.every((r) => r.status === 'submitted');

  // Build the field-by-field comparison
  const rows = useMemo(() => {
    const out: {
      block: BlockKey;
      fieldKey: string;
      def: FieldDef;
      ai: FieldValue;
      a: FieldValue | undefined;
      b: FieldValue | undefined;
      agree: boolean;
    }[] = [];
    for (const block of blocks) {
      for (const [fieldKey, def] of Object.entries(BLOCKS[block].fields)) {
        const ai = getValue(aiAnswers, block, fieldKey);
        const a = reviews[0] ? getValue(reviews[0].answers, block, fieldKey) : undefined;
        const b = reviews[1] ? getValue(reviews[1].answers, block, fieldKey) : undefined;
        const agree = reviews.length === 2 ? norm(a) === norm(b) : false;
        out.push({ block, fieldKey, def, ai, a, b, agree });
      }
    }
    return out;
  }, [blocks, aiAnswers, reviews]);

  const disagreements = rows.filter((r) => reviews.length === 2 && !r.agree);
  const resolved = disagreements.filter((r) => `${r.block}.${r.fieldKey}` in finals).length;

  async function setFinal(block: BlockKey, fieldKey: string, value: FieldValue) {
    setErr(null);
    const key = `${block}.${fieldKey}`;
    const prev = finals;
    setFinals({ ...finals, [key]: value });
    const r = await adjudicateFieldAction({ nctId: trial.nctId, blockKey: block, fieldKey, value });
    if (!r.ok) { setFinals(prev); setErr(r.error ?? 'Failed to save'); }
  }

  async function clearFinal(block: BlockKey, fieldKey: string) {
    setErr(null);
    const key = `${block}.${fieldKey}`;
    const prev = finals;
    const next = { ...finals };
    delete next[key];
    setFinals(next);
    const r = await clearAdjudicationAction({ nctId: trial.nctId, blockKey: block, fieldKey });
    if (!r.ok) { setFinals(prev); setErr(r.error ?? 'Failed to clear'); }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/review/corpus" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            ← Corpus progress
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              {blocks.map((bk) => (
                <span key={bk} className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-semibold">
                  {BLOCKS[bk].label}
                </span>
              ))}
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
        {/* Trial text */}
        <div className="lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 p-6 space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Reviews</div>
              <div className="mt-2 space-y-2">
                {reviews.length === 0 && <p className="text-sm text-slate-500">No expert has claimed this trial yet.</p>}
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

        {/* Field comparison */}
        <div className="space-y-6">
          {reviews.length < 2 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-900">
              This trial has {reviews.length} of 2 reviews claimed — adjudication opens once both
              experts have submitted. You can still inspect current values below.
            </div>
          ) : null}

          {disagreements.length > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-wider text-red-600 font-semibold mb-3">
                Disagreements ({disagreements.length})
              </h2>
              <div className="space-y-4">
                {disagreements.map((row) => (
                  <DisagreementCard
                    key={`${row.block}.${row.fieldKey}`}
                    row={row}
                    expertNames={[reviews[0]?.expertName ?? 'Expert A', reviews[1]?.expertName ?? 'Expert B']}
                    final={finals[`${row.block}.${row.fieldKey}`]}
                    isAdjudicated={`${row.block}.${row.fieldKey}` in finals}
                    onPick={(v) => setFinal(row.block, row.fieldKey, v)}
                    onClear={() => clearFinal(row.block, row.fieldKey)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              {reviews.length === 2 ? `Agreements (${rows.length - disagreements.length})` : 'Current values'}
            </h2>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
              {rows.filter((r) => reviews.length < 2 || r.agree).map((row) => (
                <div key={`${row.block}.${row.fieldKey}`} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-slate-800">{row.def.label}</span>
                    <span className="text-xs text-slate-400 ml-2 font-mono">{row.fieldKey}</span>
                  </div>
                  <div className="text-xs text-slate-500">AI: <ValueChip value={row.ai} /></div>
                  {reviews[0] && <div className="text-xs text-slate-500">{reviews[0].expertName.split(' ')[0]}: <ValueChip value={row.a as FieldValue} /></div>}
                  {reviews[1] && <div className="text-xs text-slate-500">{reviews[1].expertName.split(' ')[0]}: <ValueChip value={row.b as FieldValue} /></div>}
                </div>
              ))}
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
  row: { block: BlockKey; fieldKey: string; def: FieldDef; ai: FieldValue; a: FieldValue | undefined; b: FieldValue | undefined };
  expertNames: [string, string];
  final: FieldValue | undefined;
  isAdjudicated: boolean;
  onPick: (v: FieldValue) => void;
  onClear: () => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState<FieldValue>(finalValue ?? null);

  return (
    <div className={`border rounded-2xl p-5 shadow-sm ${isAdjudicated ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-red-200'}`}>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <span className="font-semibold text-slate-900">{row.def.label}</span>
          <span className="text-xs text-slate-400 ml-2 font-mono">{row.block}.{row.fieldKey}</span>
        </div>
        {isAdjudicated ? (
          <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-1 rounded font-semibold">Resolved</span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-red-700 bg-red-100 px-2 py-1 rounded font-semibold">Needs adjudication</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <PickCard label="AI extraction" value={row.ai} onPick={() => onPick(row.ai)} />
        <PickCard label={expertNames[0]} value={(row.a ?? null) as FieldValue} onPick={() => onPick((row.a ?? null) as FieldValue)} />
        <PickCard label={expertNames[1]} value={(row.b ?? null) as FieldValue} onPick={() => onPick((row.b ?? null) as FieldValue)} />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <span className="text-xs text-slate-500 mr-2">Final value:</span>
          {isAdjudicated ? <ValueChip value={finalValue as FieldValue} /> : <span className="text-slate-400 italic">not set</span>}
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

function PickCard({ label, value, onPick }: { label: string; value: FieldValue; onPick: () => void }) {
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5 truncate">{label}</div>
      <div className="text-sm mb-2 min-h-[20px]"><ValueChip value={value} /></div>
      <button
        onClick={onPick}
        className="text-xs px-2.5 py-1 border border-slate-300 rounded-lg text-slate-700 hover:border-blue-400 hover:text-blue-700 transition"
      >
        Use this →
      </button>
    </div>
  );
}
