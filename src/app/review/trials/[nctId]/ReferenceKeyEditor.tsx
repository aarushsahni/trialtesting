'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { markReferenceKeyCompleteAction, saveReferenceKeyAction, saveReferenceKeyMetaAction } from '@/app/actions/review';
import { RawTrialPanel } from '@/components/RawTrialPanel';
import { CohortsPanel } from '@/components/CohortsPanel';
import { TrialLevelFieldsPanel } from '@/components/TrialLevelFieldsPanel';
import { MarkCompleteToggle } from '@/components/MarkCompleteToggle';
import { TrialMeta, TrialMetaValue } from '@/components/TrialMeta';
import { Cohort, TrialAnswers } from '@/lib/types';
import { HelpTextMap } from '@/lib/guide-parser';

interface Props {
  session: { name: string; role: 'reviewer' };
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
  initial: TrialAnswers;
  initialComplete: boolean;
  initialMeta: TrialMetaValue;
  lastEditedBy: { name: string; at: string } | null;
  helpTextMap: HelpTextMap;
  prevNctId: string | null;
  nextNctId: string | null;
}

export function ReferenceKeyEditor({
  session, trial,
  initial, initialComplete, initialMeta,
  lastEditedBy, helpTextMap, prevNctId, nextNctId,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<TrialAnswers>(initial);
  const [complete, setComplete] = useState(initialComplete);
  const [saving, setSaving] = useState(false);
  // Always initialize savedAt to null on SSR so the rendered output matches
  // the client. After hydration, if the server-supplied lastEditedBy
  // timestamp exists, seed savedAt from it so the labeler sees the actual
  // last-saved time rather than "Not saved".
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (lastEditedBy?.at) setSavedAt(new Date(lastEditedBy.at).getTime());
  }, [lastEditedBy?.at]);

  const fieldsDisabled = complete;

  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const skipFirstRef = useRef(true);
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    const h = setTimeout(() => { void save(); }, 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  useEffect(() => {
    function flush() {
      try {
        const body = JSON.stringify({ nctId: trial.nctId, data: answersRef.current });
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
  }, [trial.nctId]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveReferenceKeyAction({ nctId: trial.nctId, data: answersRef.current });
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

  const setCohorts = (cohorts: Cohort[]) => setAnswers((prev) => ({ ...prev, cohorts }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={() => saveAndGo('/review/trials')} className="text-sm text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap">
            ← Trials
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              <span className="text-xs text-slate-400">· {session.name}</span>
            </div>
            <h1 className="text-sm font-medium text-slate-900 truncate">{trial.briefTitle}</h1>
            <div className="text-[11px] mt-0.5">
              {saveError ? (
                <span className="text-red-600 font-semibold">⚠ Save failed</span>
              ) : saving ? (
                <span className="text-blue-600">Saving…</span>
              ) : savedAt ? (
                <span className="text-slate-500">Saved {new Date(savedAt).toLocaleTimeString()}</span>
              ) : (
                <span className="text-slate-400">Not saved</span>
              )}
            </div>
          </div>
          <a href="/guide" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap">
            Guide ↗
          </a>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900 hover:underline">Sign out</button>
          </form>
          <div className="flex gap-2">
            {prevNctId && (
              <button onClick={() => saveAndGo(`/review/trials/${prevNctId}`)} className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-blue-400 transition">
                ← Prev
              </button>
            )}
            {nextNctId && (
              <button onClick={() => saveAndGo(`/review/trials/${nextNctId}`)} className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
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
        <div className="lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
          <RawTrialPanel trial={trial} />
        </div>

        <div className="space-y-6 mt-6 lg:mt-0">
          <TrialLevelFieldsPanel
            value={answers}
            onChange={setAnswers}
            disabled={fieldsDisabled}
          />
          <CohortsPanel
            cohorts={answers.cohorts ?? []}
            mode="reviewer"
            helpTextMap={helpTextMap}
            disabled={fieldsDisabled}
            trialLevel={{
              cancerTypes: answers.cancerTypes ?? [],
              minAge: answers.minAge,
              maxAge: answers.maxAge,
              ecogMin: answers.ecogMin,
              ecogMax: answers.ecogMax,
            }}
            onChange={setCohorts}
          />
          <TrialMeta
            initial={initialMeta}
            disabled={fieldsDisabled}
            onSave={(next) => saveReferenceKeyMetaAction({
              nctId: trial.nctId, notes: next.notes, flags: next.flags,
            })}
          />
          <MarkCompleteToggle
            complete={complete}
            helpText="When complete, fields lock so null values are confirmed as intentional. Click 'Unlock to edit' to make changes."
            onToggle={async (next) => {
              try { await save(); } catch {}
              setComplete(next);
              const r = await markReferenceKeyCompleteAction({ nctId: trial.nctId, complete: next });
              if (!r.ok) setComplete(!next);
              return r;
            }}
          />
        </div>
      </div>
    </div>
  );
}

