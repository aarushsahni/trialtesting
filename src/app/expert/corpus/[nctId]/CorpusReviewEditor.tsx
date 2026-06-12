'use client';

// Corpus review editor: like the qualification editor, but the answers start
// prefilled from the AI extraction and the expert corrects them. Blind: this
// component never receives the other expert's review.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import {
  abandonCorpusReviewAction,
  saveCorpusReviewAction,
  saveCorpusReviewMetaAction,
  setCorpusReviewStatusAction,
} from '@/app/actions/corpus';
import { EligibilityText } from '@/components/EligibilityText';
import { BlockSection } from '@/components/BlockSection';
import { MarkCompleteToggle } from '@/components/MarkCompleteToggle';
import { TrialMeta, TrialMetaValue } from '@/components/TrialMeta';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockAnswers, BlockKey, FieldValue, TrialAnswers } from '@/lib/types';
import { HelpTextMap } from '@/lib/guide-parser';

interface Props {
  session: { name: string };
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
  initialAnswers: TrialAnswers;
  initialSubmitted: boolean;
  initialMeta: TrialMetaValue;
  helpTextMap: HelpTextMap;
}

export function CorpusReviewEditor({
  session, trial, blocks, initialAnswers, initialSubmitted, initialMeta, helpTextMap,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<TrialAnswers>(initialAnswers);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [abandoning, setAbandoning] = useState(false);

  const fieldsDisabled = submitted;

  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  const submittedRef = useRef(submitted);
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);

  // Autosave on change (200ms debounce)
  const skipFirstRef = useRef(true);
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    if (submitted) return;
    const h = setTimeout(() => { void save(); }, 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // sendBeacon on tab close / refresh / browser back
  useEffect(() => {
    function flush() {
      if (submittedRef.current) return;
      try {
        const body = JSON.stringify({ nctId: trial.nctId, answers: answersRef.current });
        navigator.sendBeacon('/api/save-corpus-review', new Blob([body], { type: 'application/json' }));
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
      const r = await saveCorpusReviewAction({ nctId: trial.nctId, answers: answersRef.current });
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

  async function abandon() {
    if (!confirm('Abandon this review? Your edits on this trial are discarded and the slot opens up for another expert.')) return;
    setAbandoning(true);
    const r = await abandonCorpusReviewAction(trial.nctId);
    setAbandoning(false);
    if (r.ok) router.push('/expert/corpus');
    else setSaveError(r.error ?? 'Could not abandon.');
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
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <button onClick={() => saveAndGo('/expert/corpus')} className="text-sm text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap">
            ← Trial corpus
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              {blocks.map((b) => (
                <span key={b} className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-semibold">
                  {BLOCKS[b].label}
                </span>
              ))}
              <span className="text-[10px] uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded font-semibold">
                AI-prefilled
              </span>
              {submitted && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  Submitted
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
            ) : (
              <span className="text-slate-400">{submitted ? '—' : 'Not saved'}</span>
            )}
          </div>
          <a href="/guide" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-slate-900 hover:underline whitespace-nowrap">
            Guide ↗
          </a>
          {!submitted && (
            <button
              onClick={abandon}
              disabled={abandoning}
              className="text-xs text-red-600 hover:text-red-700 hover:underline whitespace-nowrap disabled:opacity-50"
            >
              {abandoning ? '…' : 'Abandon'}
            </button>
          )}
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
        <div className="bg-purple-50 border-t border-purple-200 px-6 py-2 text-sm text-purple-900">
          🤖 These fields were <strong>prefilled by the AI extraction</strong>. Review every field
          against the trial record and correct anything wrong — your submitted version is the
          human label.
        </div>
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
              {!trial.nctId.startsWith('TRIAL-') && (
                <a
                  href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline mt-3 inline-block"
                >
                  View on ClinicalTrials.gov →
                </a>
              )}
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
            onSave={(next) => saveCorpusReviewMetaAction({
              nctId: trial.nctId, notes: next.notes, flags: next.flags,
            })}
          />
          <MarkCompleteToggle
            complete={submitted}
            helpText={
              submitted
                ? 'Submitted. You can reopen to make corrections — the trial only counts as done while both expert reviews are submitted.'
                : 'Submitting locks your answers and fills one of the two review slots for this trial. You can reopen later if you need to correct something.'
            }
            onToggle={async (next) => {
              if (!next) {
                // Reopening — allowed anytime.
                const r = await setCorpusReviewStatusAction({ nctId: trial.nctId, submitted: false });
                if (r.ok) setSubmitted(false);
                return r;
              }
              try { await save(); } catch {}
              const r = await setCorpusReviewStatusAction({ nctId: trial.nctId, submitted: true });
              if (r.ok) setSubmitted(true);
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
