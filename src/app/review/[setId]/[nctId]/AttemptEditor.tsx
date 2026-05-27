'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { saveAttemptAction } from '@/app/actions/review';
import { EligibilityText } from '@/components/EligibilityText';
import { BlockSection } from '@/components/BlockSection';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockAnswers, BlockKey, FieldValue, TrialAnswers } from '@/lib/types';

interface Props {
  session: { name: string; role: 'reviewer' };
  setId: string;
  setName: string;
  attemptId: string;
  submitted: boolean;
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
  allAnswers: Record<string, TrialAnswers>;
  initialForTrial: TrialAnswers;
  prevNctId: string | null;
  nextNctId: string | null;
}

export function AttemptEditor({
  session, setId, setName, attemptId, submitted, trial, blocks,
  allAnswers: initialAllAnswers, prevNctId, nextNctId,
}: Props) {
  const router = useRouter();
  // Whole-attempt state lives client-side. Per-trial edits go through this map.
  const [allAnswers, setAllAnswers] = useState<Record<string, TrialAnswers>>(initialAllAnswers);
  const trialAnswers: TrialAnswers = allAnswers[trial.nctId] ?? {};

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(
    Object.keys(initialAllAnswers[trial.nctId] ?? {}).length > 0 ? Date.now() : null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const allAnswersRef = useRef(allAnswers);
  useEffect(() => { allAnswersRef.current = allAnswers; }, [allAnswers]);

  const skipFirstRef = useRef(true);
  useEffect(() => {
    if (submitted) return;
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    const h = setTimeout(() => { void save(); }, 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAnswers]);

  useEffect(() => {
    function flush() {
      try {
        const body = JSON.stringify({ attemptId, answers: allAnswersRef.current });
        navigator.sendBeacon('/api/save-attempt', new Blob([body], { type: 'application/json' }));
      } catch {}
    }
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [attemptId]);

  async function save() {
    if (submitted) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveAttemptAction({ attemptId, answers: allAnswersRef.current });
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
    setAllAnswers((prev) => {
      const trialAns: TrialAnswers = { ...(prev[trial.nctId] ?? {}) };
      const blockAns: BlockAnswers = { ...(trialAns[block] ?? {}) };
      blockAns[fieldKey] = value;
      trialAns[block] = blockAns;
      return { ...prev, [trial.nctId]: trialAns };
    });
  };

  const totalFields = useMemo(
    () => blocks.reduce((acc, b) => acc + Object.keys(BLOCKS[b].fields).length, 0),
    [blocks],
  );
  const populatedFields = useMemo(() => {
    let n = 0;
    for (const b of blocks) {
      const ba = trialAnswers[b] ?? {};
      for (const v of Object.values(ba)) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) n++;
      }
    }
    return n;
  }, [blocks, trialAnswers]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={() => saveAndGo(`/review/${setId}`)} className="text-sm text-blue-600 hover:underline whitespace-nowrap">
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
              {submitted && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  Submitted · read only
                </span>
              )}
              <span className="text-xs text-slate-400">· {session.name}</span>
            </div>
            <h1 className="text-sm font-medium text-slate-900 truncate">{trial.briefTitle}</h1>
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
            ) : submitted ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span className="text-slate-400">Not saved</span>
            )}
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900 hover:underline">Sign out</button>
          </form>
          <div className="flex gap-2">
            {prevNctId && (
              <button onClick={() => saveAndGo(`/review/${setId}/${prevNctId}`)} className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-blue-400 transition">
                ← Prev
              </button>
            )}
            {nextNctId && (
              <button onClick={() => saveAndGo(`/review/${setId}/${nextNctId}`)} className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Next →
              </button>
            )}
          </div>
        </div>
        {saveError && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-2 flex items-center justify-between gap-4 text-sm">
            <span className="text-red-800"><strong>Couldn&apos;t save your last change</strong> ({saveError}).</span>
            <button onClick={() => save()} className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700">Retry</button>
          </div>
        )}
      </header>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-6">
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

        <div className="space-y-6 mt-6 lg:mt-0">
          {blocks.map((b) => (
            <BlockSection
              key={b}
              blockKey={b}
              answers={trialAnswers[b] ?? {}}
              onFieldChange={(fieldKey, value) => setBlockField(b, fieldKey, value)}
              disabled={submitted}
            />
          ))}
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
