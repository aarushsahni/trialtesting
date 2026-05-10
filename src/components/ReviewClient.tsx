'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExtractedTrial } from '@/lib/types';
import { BASIC_FIELDS, SECTION_DEFS, SectionDef, FieldDef } from '@/lib/schema/field-schemas';
import { FieldEditor, FieldState } from './FieldEditor';
import { EligibilityText } from './EligibilityText';

interface Props {
  userId: string;
  userName: string;
  trial: ExtractedTrial;
  prevNctId: string | null;
  nextNctId: string | null;
  initialReview: { reviewed_data: Record<string, unknown>; completed: boolean } | null;
}

type ReviewedData = {
  basic: Record<string, FieldState>;
  descriptors: Record<string, Record<string, FieldState>>;
};

function makeFieldState(value: unknown, savedState?: FieldState): FieldState {
  if (savedState) return savedState;
  return { value: value === undefined ? null : value, approved: false, edited: false };
}

function buildInitialReviewed(trial: ExtractedTrial, saved: Record<string, unknown> | null): ReviewedData {
  const savedTyped = (saved ?? {}) as ReviewedData;

  const basic: Record<string, FieldState> = {};
  for (const k of Object.keys(BASIC_FIELDS)) {
    const orig = (trial.basicFields as any)?.[k];
    basic[k] = makeFieldState(orig, savedTyped.basic?.[k]);
  }

  const descriptors: Record<string, Record<string, FieldState>> = {};
  for (const section of SECTION_DEFS) {
    const original = (trial.descriptors ?? {})[section.key];
    if (!original) continue;
    const sectionState: Record<string, FieldState> = {};
    for (const fieldKey of Object.keys(section.fields)) {
      const orig = (original as Record<string, unknown>)[fieldKey];
      sectionState[fieldKey] = makeFieldState(orig, savedTyped.descriptors?.[section.key]?.[fieldKey]);
    }
    descriptors[section.key] = sectionState;
  }

  return { basic, descriptors };
}

export default function ReviewClient({
  userId, userName, trial, prevNctId, nextNctId, initialReview,
}: Props) {
  const router = useRouter();
  const [data, setData] = useState<ReviewedData>(() =>
    buildInitialReviewed(trial, (initialReview?.reviewed_data ?? null) as Record<string, unknown> | null),
  );
  const [completed, setCompleted] = useState<boolean>(initialReview?.completed ?? false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(initialReview ? Date.now() : null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Show help on first visit (per browser)
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem('seen-review-help');
      if (!seen) {
        setShowHelp(true);
        window.localStorage.setItem('seen-review-help', '1');
      }
    } catch {}
  }, []);

  // Total / approved counters for the header progress
  const { totalFields, approvedFields } = useMemo(() => {
    let total = 0, approved = 0;
    for (const fs of Object.values(data.basic)) {
      total++; if (fs.approved) approved++;
    }
    for (const section of Object.values(data.descriptors)) {
      for (const fs of Object.values(section)) {
        total++; if (fs.approved) approved++;
      }
    }
    return { totalFields: total, approvedFields: approved };
  }, [data]);

  // Refs so save() always sees latest data (avoids stale closures)
  const dataRef = useRef(data);
  const completedRef = useRef(completed);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { completedRef.current = completed; }, [completed]);

  // Skip the very first effect run (mount) — without skipping every save on a brand-new trial.
  const skipNextSaveRef = useRef(true);

  // Save on every data change, with a small debounce (200ms) so multi-keystroke
  // edits in number inputs coalesce into one POST.
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const handle = setTimeout(() => { void save(false); }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Safety net for cases we can't intercept: browser back/forward, tab close,
  // refresh, navigate to external URL. sendBeacon fires a non-blocking POST
  // that the browser delivers even as the page is being torn down.
  useEffect(() => {
    function flushBeacon() {
      try {
        const body = JSON.stringify({
          userId,
          nctId: trial.nctId,
          reviewedData: dataRef.current,
          completed: completedRef.current,
        });
        navigator.sendBeacon('/api/reviews', new Blob([body], { type: 'application/json' }));
      } catch {}
    }
    window.addEventListener('beforeunload', flushBeacon);
    window.addEventListener('pagehide', flushBeacon);
    return () => {
      window.removeEventListener('beforeunload', flushBeacon);
      window.removeEventListener('pagehide', flushBeacon);
      // Also fire on React unmount (covers Next.js client-side route changes
      // including the browser back arrow when popstate triggers a re-render).
      flushBeacon();
    };
  }, [userId, trial.nctId]);

  async function save(markCompleted: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          nctId: trial.nctId,
          reviewedData: dataRef.current,
          completed: markCompleted || completedRef.current,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
      setSaveError(null);
      if (markCompleted) setCompleted(true);
    } catch (e) {
      setSaveError((e as Error).message || 'Save failed');
      throw e; // let saveAndGo / markDoneAndNext know not to navigate
    } finally {
      setSaving(false);
    }
  }

  // Save before navigating away — used by Prev / Next / "All trials" links.
  // If the save fails we do NOT navigate so the user can retry without losing edits.
  async function saveAndGo(href: string) {
    try {
      await save(false);
      router.push(href);
    } catch {
      // saveError state is already set by save(); banner will appear
    }
  }

  async function markDoneAndNext() {
    try {
      await save(true);
      if (nextNctId) router.push(`/review/${userId}/${nextNctId}`);
      else router.push(`/review/${userId}`);
    } catch {
      // saveError state is already set; do not navigate
    }
  }

  function approveAllInSection(sectionKey: string | 'basic') {
    setData((d) => {
      if (sectionKey === 'basic') {
        const next: Record<string, FieldState> = {};
        for (const [k, fs] of Object.entries(d.basic)) next[k] = { ...fs, approved: true };
        return { ...d, basic: next };
      }
      const sec = d.descriptors[sectionKey] ?? {};
      const next: Record<string, FieldState> = {};
      for (const [k, fs] of Object.entries(sec)) next[k] = { ...fs, approved: true };
      return { ...d, descriptors: { ...d.descriptors, [sectionKey]: next } };
    });
  }

  const presentSections: SectionDef[] = SECTION_DEFS.filter((s) => data.descriptors[s.key]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => saveAndGo(`/review/${userId}`)}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline whitespace-nowrap flex items-center gap-1"
          >
            <span>←</span> All trials
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{trial.nctId}</span>
              <span className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-semibold">
                {trial.assignedCancerType.replace(/_/g, ' ')}
              </span>
              {completed && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  Done
                </span>
              )}
              <span className="text-xs text-slate-400">· {userName}</span>
            </div>
            <h1 className="text-sm font-medium text-slate-900 truncate">{trial.briefTitle}</h1>
          </div>
          <div className="text-xs text-slate-500 whitespace-nowrap">
            <span className="font-bold text-slate-900">{approvedFields}</span> / {totalFields} approved
          </div>
          <div className="text-xs w-32 text-right">
            {saveError ? (
              <span className="text-red-600 font-semibold">⚠ Save failed</span>
            ) : saving ? (
              <span className="text-blue-600">Saving…</span>
            ) : savedAt ? (
              <span className="text-slate-400">Saved {new Date(savedAt).toLocaleTimeString()}</span>
            ) : (
              <span className="text-slate-400">Not saved</span>
            )}
          </div>
          <button
            onClick={() => setShowHelp(true)}
            className="w-7 h-7 rounded-full border border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition text-sm font-semibold"
            aria-label="How to review"
            title="How to review"
          >
            ?
          </button>
          <div className="flex gap-2">
            {prevNctId && (
              <button
                onClick={() => saveAndGo(`/review/${userId}/${prevNctId}`)}
                className="text-sm px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-blue-400 transition"
              >
                ← Prev
              </button>
            )}
            <button
              onClick={markDoneAndNext}
              className="text-sm px-4 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition font-medium shadow-sm shadow-blue-200"
            >
              {nextNctId ? 'Mark done & next →' : 'Mark done'}
            </button>
          </div>
        </div>
        <div className="h-1 bg-slate-100">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
            style={{ width: totalFields ? `${(approvedFields / totalFields) * 100}%` : '0%' }}
          />
        </div>
        {saveError && (
          <div className="bg-red-50 border-t border-red-200 px-6 py-2 flex items-center justify-between gap-4 text-sm">
            <span className="text-red-800">
              <strong>Couldn&apos;t save your last change</strong> ({saveError}). Your edits are
              still in memory — click retry, or check your connection.
            </span>
            <button
              onClick={() => { void save(false); }}
              className="px-3 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry save
            </button>
          </div>
        )}
      </header>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-6">
        {/* Left: free text */}
        <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 p-6 space-y-5">
            <SectionHeader>Title</SectionHeader>
            <p className="text-sm text-slate-900 -mt-3">{trial.briefTitle}</p>
            {trial.conditions.length > 0 && (
              <>
                <SectionHeader>Conditions</SectionHeader>
                <p className="text-sm text-slate-900 -mt-3">{trial.conditions.join(', ')}</p>
              </>
            )}
            {trial.interventions.length > 0 && (
              <>
                <SectionHeader>Interventions</SectionHeader>
                <p className="text-sm text-slate-900 -mt-3">{trial.interventions.join(', ')}</p>
              </>
            )}
            {trial.briefSummary && (
              <>
                <SectionHeader>Brief summary</SectionHeader>
                <div className="-mt-3">
                  <EligibilityText raw={trial.briefSummary} />
                </div>
              </>
            )}
            {trial.detailedDescription && (
              <>
                <SectionHeader>Detailed description</SectionHeader>
                <div className="-mt-3">
                  <EligibilityText raw={trial.detailedDescription} />
                </div>
              </>
            )}
            <SectionHeader>Eligibility criteria</SectionHeader>
            <div className="-mt-3">
              <EligibilityText raw={trial.eligibilityRaw || ''} />
            </div>
            <SectionHeader>CT.gov metadata</SectionHeader>
            <div className="-mt-3">
              <dl className="text-xs text-slate-700 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <Meta k="Status" v={trial.overallStatus} />
                <Meta k="Study type" v={trial.studyType} />
                <Meta k="Phases" v={trial.phases?.join(', ')} />
                <Meta k="Sex (CT.gov)" v={trial.ctGovSex} />
                <Meta k="Min age" v={trial.ctGovMinAge} />
                <Meta k="Max age" v={trial.ctGovMaxAge} />
              </dl>
              <a
                href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline mt-3 inline-block"
              >
                View on ClinicalTrials.gov →
              </a>
            </div>
          </div>
        </div>

        {/* Right: extracted variables */}
        <div className="space-y-8 mt-6 lg:mt-0">
          {/* Section 1: Top-level eligibility */}
          <div>
            <SectionDivider
              n={1}
              title="Top-level eligibility"
              subtitle="Cancer types accepted, age, sex, ECOG, prior treatment"
            />
            <FieldGroup
              title="Basic eligibility"
              onApproveAll={() => approveAllInSection('basic')}
            >
              {Object.entries(BASIC_FIELDS).map(([key, def]) => {
                const original = (trial.basicFields as any)?.[key] ?? null;
                const state = data.basic[key] ?? makeFieldState(original);
                return (
                  <FieldEditor
                    key={key}
                    def={def as FieldDef}
                    state={state}
                    original={original}
                    onChange={(next) =>
                      setData((d) => ({ ...d, basic: { ...d.basic, [key]: next } }))
                    }
                  />
                );
              })}
            </FieldGroup>
          </div>

          {/* Section 2: Cancer-specific descriptors */}
          <div>
            <SectionDivider
              n={2}
              title="Cancer-specific descriptors"
              subtitle="Histology, biomarkers, staging, and prior-therapy detail per cancer type"
            />
            {presentSections.length === 0 ? (
              <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6">
                No cancer-specific descriptors extracted for this trial.
              </div>
            ) : (
              <div className="space-y-4">
                {presentSections.map((section) => (
                  <FieldGroup
                    key={section.key}
                    title={section.label}
                    onApproveAll={() => approveAllInSection(section.key)}
                  >
                    {Object.entries(section.fields).map(([fieldKey, def]) => {
                      const original = ((trial.descriptors ?? {})[section.key] as any)?.[fieldKey] ?? null;
                      const state = data.descriptors[section.key]?.[fieldKey] ?? makeFieldState(original);
                      return (
                        <FieldEditor
                          key={fieldKey}
                          def={def}
                          state={state}
                          original={original}
                          onChange={(next) =>
                            setData((d) => ({
                              ...d,
                              descriptors: {
                                ...d.descriptors,
                                [section.key]: { ...d.descriptors[section.key], [fieldKey]: next },
                              },
                            }))
                          }
                        />
                      );
                    })}
                  </FieldGroup>
                ))}
              </div>
            )}
          </div>

          {/* Bottom action bar — duplicate of header for ergonomics */}
          <div className="flex justify-end gap-2 pt-2">
            {prevNctId && (
              <button
                onClick={() => saveAndGo(`/review/${userId}/${prevNctId}`)}
                className="text-sm px-4 py-2 border border-slate-300 rounded-lg hover:bg-white hover:border-blue-400 transition bg-white/50"
              >
                ← Prev
              </button>
            )}
            <button
              onClick={markDoneAndNext}
              className="text-sm px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition font-medium shadow-sm shadow-blue-200"
            >
              {nextNctId ? 'Mark done & next →' : 'Mark done'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{children}</div>;
}

function SectionDivider({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 px-1">
      <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-xs font-bold shadow-sm shadow-blue-200">
        {n}
      </div>
      <div className="flex-1">
        <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="text-xs text-slate-500 leading-tight mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{v || '—'}</dd>
    </>
  );
}

function FieldGroup({
  title, subtitle, children, onApproveAll,
}: { title: string; subtitle?: string; children: React.ReactNode; onApproveAll: () => void }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onApproveAll}
          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium whitespace-nowrap"
        >
          Approve all ✓
        </button>
      </header>
      <div className="px-5 py-2 divide-y divide-slate-100">{children}</div>
    </section>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 lg:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900 mb-1">How to review a trial</h2>
        <p className="text-sm text-slate-500 mb-5">Quick reference — you can reopen this with the ? button.</p>

        <ol className="space-y-3 text-sm text-slate-700">
          <Tip n={1}>
            <strong>Read the trial text on the left.</strong> Focus on the eligibility criteria — that&apos;s
            what the LLM extracted from.
          </Tip>
          <Tip n={2}>
            <strong>For each field on the right:</strong> if the LLM&apos;s value matches the eligibility text,
            click the green checkbox to approve it.
          </Tip>
          <Tip n={3}>
            <strong>If the value is wrong:</strong> change it inline (dropdown, multi-select chips, yes/no, or number).
            An <span className="text-amber-600 font-semibold">EDITED</span> badge will appear.
          </Tip>
          <Tip n={4}>
            <strong>Use &quot;Approve all&quot;</strong> on a section header when the LLM nailed everything.
          </Tip>
          <Tip n={5}>
            <strong>Click &quot;Mark done &amp; next →&quot;</strong> to advance. Edits auto-save every ~1s.
          </Tip>
        </ol>

        <button
          onClick={onClose}
          className="mt-6 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function Tip({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
