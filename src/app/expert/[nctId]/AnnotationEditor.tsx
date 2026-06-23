'use client';

// Unified per-trial labeling editor. The trial may be a test trial
// (locked once reviewer marks reviewed) or a non-test trial (reopenable
// until both annotations are submitted and the reviewer adjudicates).
// Annotation is fully manual — no AI prefill of any kind.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import {
  saveAnnotationAction,
  saveAnnotationMetaAction,
  submitAnnotationAction,
} from '@/app/actions/annotation';
import { RawTrialPanel } from '@/components/RawTrialPanel';
import { CohortsPanel } from '@/components/CohortsPanel';
import { TrialLevelFieldsPanel } from '@/components/TrialLevelFieldsPanel';
import { MarkCompleteToggle } from '@/components/MarkCompleteToggle';
import { TrialMeta, TrialMetaValue } from '@/components/TrialMeta';
import { HelpModal } from '@/components/HelpModal';
import { Cohort, TrialAnswers } from '@/lib/types';
import { HelpTextMap } from '@/lib/guide-parser';

interface Props {
  session: { name: string };
  isTestTrial: boolean;
  testReviewed: boolean;
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
  initialAnswers: TrialAnswers;
  initialSubmitted: boolean;
  initialMeta: TrialMetaValue;
  helpTextMap: HelpTextMap;
}

export function AnnotationEditor({
  session, isTestTrial, testReviewed, trial,
  initialAnswers, initialSubmitted, initialMeta, helpTextMap,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<TrialAnswers>(initialAnswers);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Test trials become permanently read-only once the reviewer has marked
  // them reviewed; non-test trials can be reopened after submission.
  const reopenable = !(isTestTrial && testReviewed);
  const fieldsDisabled = submitted;

  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  const submittedRef = useRef(submitted);
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);

  const skipFirstRef = useRef(true);
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    if (submittedRef.current) return;
    const h = setTimeout(() => { void save(); }, 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  useEffect(() => {
    function flush() {
      if (submittedRef.current) return;
      try {
        const body = JSON.stringify({ nctId: trial.nctId, answers: answersRef.current });
        navigator.sendBeacon('/api/save-annotation', new Blob([body], { type: 'application/json' }));
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
    if (submittedRef.current) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await saveAnnotationAction({ nctId: trial.nctId, answers: answersRef.current });
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
      {!submitted && <HelpModal storageKey="expert-help-v1" />}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={() => saveAndGo('/expert')} className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            ← Trials
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              {isTestTrial && (
                <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-semibold">
                  Test trial
                </span>
              )}
              {submitted && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  {isTestTrial && testReviewed ? 'Reviewed · read only' : 'Submitted'}
                </span>
              )}
              <span className="text-xs text-slate-400">· {session.name}</span>
            </div>
            <h1 className="text-sm font-medium text-slate-900 truncate">{trial.briefTitle}</h1>
          </div>
          <div className="text-xs w-32 text-right">
            {saveError ? (
              <span className="text-red-600 font-semibold">⚠ Save failed</span>
            ) : saving ? (
              <span className="text-blue-600">Saving…</span>
            ) : savedAt ? (
              <span className="text-slate-400">Saved {new Date(savedAt).toLocaleTimeString()}</span>
            ) : (
              <span className="text-slate-400">{submitted ? '—' : 'Not saved'}</span>
            )}
          </div>
          <a href="/guide" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap">
            Guide ↗
          </a>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900 hover:underline">Sign out</button>
          </form>
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
            mode="expert"
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
            onSave={(next) => saveAnnotationMetaAction({
              nctId: trial.nctId, notes: next.notes, flags: next.flags,
            })}
          />
          <MarkCompleteToggle
            complete={submitted}
            disabled={submitted && !reopenable}
            helpText={
              isTestTrial
                ? submitted
                  ? testReviewed
                    ? 'Submitted and reviewed — your answers are now locked. The rest of your trial pool is unlocked.'
                    : 'Submitted. The reviewer will sign off on it soon. You can still reopen and re-submit until they do.'
                  : 'Submitting locks your answers and signals to the reviewer to score and sign off. The rest of your trial pool unlocks once they do.'
                : submitted
                  ? 'Submitted. You can reopen to make corrections — the trial only counts as done while both annotations are submitted.'
                  : 'Submitting locks your answers and fills one of the two annotation slots for this trial. You can reopen later if you need to correct something.'
            }
            onToggle={async (next) => {
              if (!next) {
                const r = await submitAnnotationAction({ nctId: trial.nctId, submitted: false });
                if (r.ok) setSubmitted(false);
                return r;
              }
              try { await save(); } catch {}
              const r = await submitAnnotationAction({ nctId: trial.nctId, submitted: true });
              if (r.ok) setSubmitted(true);
              return r;
            }}
          />
        </div>
      </div>
    </div>
  );
}

