'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { markReferenceKeyCompleteAction, saveReferenceKeyAction, saveReferenceKeyMetaAction } from '@/app/actions/review';
import { EligibilityText } from '@/components/EligibilityText';
import { BlockSection } from '@/components/BlockSection';
import { MarkCompleteToggle } from '@/components/MarkCompleteToggle';
import { TrialMeta, TrialMetaValue } from '@/components/TrialMeta';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockAnswers, BlockKey, FieldValue, TrialAnswers } from '@/lib/types';
import { HelpTextMap } from '@/lib/guide-parser';

interface Props {
  session: { name: string; role: 'expert' };
  setId: string;
  setName: string;
  setLocked: boolean;
  trial: {
    nctId: string;
    briefTitle: string;
    briefSummary: string | null;
    detailedDescription: string | null;
    eligibilityRaw: string | null;
    conditions: string[];
    interventions: string[];
    overallStatus: string | null;
    studyType: string | null;
    phases: string[] | null;
    ctgovSex: string | null;
    ctgovMinAge: string | null;
    ctgovMaxAge: string | null;
  };
  blocks: BlockKey[];
  initial: TrialAnswers;
  initialComplete: boolean;
  initialMeta: TrialMetaValue;
  lastEditedBy: { name: string; at: string } | null;
  helpTextMap: HelpTextMap;
  prevNctId: string | null;
  nextNctId: string | null;
}

export function ReferenceKeyEditor({
  session, setId, setName, setLocked: initialSetLocked, trial, blocks, initial, initialComplete, initialMeta,
  lastEditedBy, helpTextMap, prevNctId, nextNctId,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<TrialAnswers>(initial);
  const [complete, setComplete] = useState(initialComplete);
  const [setLocked, setSetLocked] = useState(initialSetLocked);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(Object.keys(initial).length > 0 ? Date.now() : null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fieldsDisabled = setLocked || complete;

  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Save on every change (200ms debounce)
  const skipFirstRef = useRef(true);
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    const h = setTimeout(() => { void save(); }, 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // sendBeacon on tab close / refresh / browser back
  useEffect(() => {
    function flush() {
      try {
        const body = JSON.stringify({ setId, nctId: trial.nctId, data: answersRef.current });
        navigator.sendBeacon('/api/save-reference-key', new Blob([body], { type: 'application/json' }));
      } catch {}
    }
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [setId, trial.nctId]);

  async function save() {
    if (setLocked) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveReferenceKeyAction({
        setId, nctId: trial.nctId, data: answersRef.current,
      });
      if (!r.ok) throw new Error(r.error ?? 'Save failed');
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndGo(href: string) {
    try { await save(); } finally { router.push(href); }
  }

  const setBlockField = (block: BlockKey, fieldKey: string, value: FieldValue) => {
    setAnswers((prev) => {
      const blockAnswers: BlockAnswers = { ...(prev[block] ?? {}) };
      blockAnswers[fieldKey] = value;
      return { ...prev, [block]: blockAnswers };
    });
  };

  const totalFields = useMemo(
    () => blocks.reduce((acc, b) => acc + Object.keys(BLOCKS[b].fields).length, 0),
    [blocks],
  );
  const populatedFields = useMemo(() => {
    let n = 0;
    for (const b of blocks) {
      const ba = answers[b] ?? {};
      for (const v of Object.values(ba)) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) n++;
      }
    }
    return n;
  }, [blocks, answers]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={() => saveAndGo(`/review/sets/${setId}`)} className="text-sm text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap">
            ← {setName}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              {blocks.map((b) => (
                <span key={b} className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-semibold">
                  {BLOCKS[b].label}
                </span>
              ))}
              {setLocked && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  Set locked
                </span>
              )}
              <span className="text-xs text-slate-400">· {session.name}</span>
            </div>
            <h1 className="text-sm font-medium text-slate-900 truncate">{trial.briefTitle}</h1>
            {lastEditedBy && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                Last saved by <span className="font-semibold text-slate-700">{lastEditedBy.name}</span>{' '}
                · {new Date(lastEditedBy.at).toLocaleString()}
              </div>
            )}
          </div>
          <div className="text-xs text-slate-500 whitespace-nowrap">
            <span className="font-bold text-slate-900">{populatedFields}</span> / {totalFields} fields
          </div>
          <div className="text-xs w-32 text-right">
            {saveError ? (
              <span className="text-red-600 font-semibold">⚠ Save failed</span>
            ) : saving ? (
              <span className="text-blue-600">Saving…</span>
            ) : savedAt ? (
              <span className="text-slate-400">Saved {new Date(savedAt).toLocaleTimeString()}</span>
            ) : setLocked ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span className="text-slate-400">Not saved</span>
            )}
          </div>
          <a href="/guide" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap">
            Guide ↗
          </a>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900 hover:underline">Sign out</button>
          </form>
          <div className="flex gap-2">
            {prevNctId && (
              <button onClick={() => saveAndGo(`/review/sets/${setId}/${prevNctId}`)} className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-blue-400 transition">
                ← Prev
              </button>
            )}
            {nextNctId && (
              <button onClick={() => saveAndGo(`/review/sets/${setId}/${nextNctId}`)} className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Next →
              </button>
            )}
          </div>
        </div>
        {saveError && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-2 flex items-center justify-between gap-4 text-sm">
            <span className="text-red-800">
              <strong>Couldn&apos;t save your last change</strong> ({saveError}).
            </span>
            <button onClick={() => save()} className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700">
              Retry
            </button>
          </div>
        )}
      </header>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-6">
        {/* Trial text */}
        <div className="lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 p-6 space-y-5">
            <SectionHeader>Conditions</SectionHeader>
            <p className="text-sm text-slate-900 -mt-3">{trial.conditions.join(', ') || '—'}</p>
            {trial.interventions.length > 0 && (
              <>
                <SectionHeader>Interventions</SectionHeader>
                <p className="text-sm text-slate-900 -mt-3">{trial.interventions.join(', ')}</p>
              </>
            )}
            {trial.briefSummary && (
              <>
                <SectionHeader>Brief summary</SectionHeader>
                <div className="-mt-3"><EligibilityText raw={trial.briefSummary} /></div>
              </>
            )}
            {trial.detailedDescription && (
              <>
                <SectionHeader>Detailed description</SectionHeader>
                <div className="-mt-3"><EligibilityText raw={trial.detailedDescription} /></div>
              </>
            )}
            <SectionHeader>Eligibility criteria</SectionHeader>
            <div className="-mt-3"><EligibilityText raw={trial.eligibilityRaw || ''} /></div>
            <SectionHeader>CT.gov metadata</SectionHeader>
            <div className="-mt-3">
              <dl className="text-xs text-slate-700 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Meta k="Status" v={trial.overallStatus} />
                <Meta k="Study type" v={trial.studyType} />
                <Meta k="Phases" v={trial.phases?.join(', ')} />
                <Meta k="Sex" v={trial.ctgovSex} />
                <Meta k="Min age" v={trial.ctgovMinAge} />
                <Meta k="Max age" v={trial.ctgovMaxAge} />
              </dl>
              <a
                href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-3 inline-block"
              >
                View on ClinicalTrials.gov →
              </a>
            </div>
          </div>
        </div>

        {/* Block sections */}
        <div className="space-y-6 mt-6 lg:mt-0">
          {blocks.map((b) => (
            <BlockSection
              key={b}
              blockKey={b}
              answers={answers[b] ?? {}}
              onFieldChange={(fieldKey, value) => setBlockField(b, fieldKey, value)}
              disabled={fieldsDisabled}
              helpTextByField={helpTextMap[b]}
            />
          ))}
          <TrialMeta
            initial={initialMeta}
            disabled={fieldsDisabled}
            onSave={(next) => saveReferenceKeyMetaAction({
              setId, nctId: trial.nctId, notes: next.notes, flags: next.flags,
            })}
          />
          <MarkCompleteToggle
            complete={complete}
            helpText={
              setLocked
                ? "The set is locked because all trials are complete. Unlocking this trial will unlock the whole set (experts won't be able to take it until you lock it again)."
                : "When complete, fields lock so null values are confirmed as intentional. Click 'Unlock to edit' to make changes."
            }
            onToggle={async (next) => {
              // If the set is locked and we're unlocking, confirm — this
              // cascades to unlocking the whole set for experts.
              if (setLocked && !next) {
                const ok = window.confirm(
                  'This will also unlock the entire qualification set. Experts will no longer be able to take it until you lock it again. Any expert attempts already submitted keep their scores (computed against the previous reference key). Continue?'
                );
                if (!ok) return { ok: false, error: 'Cancelled.' };
              }
              try { await save(); } catch {}
              // Optimistic UI updates
              const wasSetLocked = setLocked;
              setComplete(next);
              if (wasSetLocked && !next) setSetLocked(false);
              const r = await markReferenceKeyCompleteAction({ setId, nctId: trial.nctId, complete: next });
              if (!r.ok) {
                setComplete(!next);
                if (wasSetLocked && !next) setSetLocked(true);
              }
              return r;
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{children}</div>;
}

function Meta({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{v || '—'}</dd>
    </>
  );
}
