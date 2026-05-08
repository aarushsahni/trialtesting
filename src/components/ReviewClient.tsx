'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExtractedTrial } from '@/lib/types';
import { BASIC_FIELDS, SECTION_DEFS, SECTION_BY_KEY, SectionDef, FieldDef } from '@/lib/schema/field-schemas';
import { FieldEditor, FieldState } from './FieldEditor';

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

  // Debounced auto-save
  useEffect(() => {
    if (savedAt === null && !initialReview) return; // first render: skip if nothing to save
    const handle = setTimeout(() => {
      void save(false);
    }, 800);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function save(markCompleted: boolean) {
    setSaving(true);
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          nctId: trial.nctId,
          reviewedData: data,
          completed: markCompleted || completed,
        }),
      });
      setSavedAt(Date.now());
      if (markCompleted) setCompleted(true);
    } finally {
      setSaving(false);
    }
  }

  async function markDoneAndNext() {
    await save(true);
    if (nextNctId) router.push(`/review/${userId}/${nextNctId}`);
    else router.push(`/review/${userId}`);
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

  // Sections to render: any descriptor section we have data for
  const presentSections: SectionDef[] = SECTION_DEFS.filter((s) => data.descriptors[s.key]);

  return (
    <main className="min-h-screen">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
          <Link href={`/review/${userId}`} className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            ← All trials
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-gray-500">{trial.nctId}</span>
              <span className="text-xs uppercase tracking-wide text-gray-400">
                {trial.assignedCancerType.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-gray-400">· reviewing as {userName}</span>
            </div>
            <h1 className="text-base font-medium text-gray-900 truncate">{trial.briefTitle}</h1>
          </div>
          <div className="text-xs text-gray-500 whitespace-nowrap">
            {approvedFields} / {totalFields} approved
          </div>
          <div className="text-xs text-gray-400 w-32 text-right">
            {saving ? 'Saving…' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Not saved'}
          </div>
          <div className="flex gap-2">
            {prevNctId && (
              <Link
                href={`/review/${userId}/${prevNctId}`}
                className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
              >
                ← Prev
              </Link>
            )}
            <button
              onClick={markDoneAndNext}
              className="text-sm px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700"
            >
              {nextNctId ? 'Mark done & next →' : 'Mark done'}
            </button>
          </div>
        </div>
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: totalFields ? `${(approvedFields / totalFields) * 100}%` : '0%' }}
          />
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-6 p-6">
        {/* Left: free text */}
        <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)] lg:overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
            <Section title="Title">
              <p className="text-sm text-gray-900">{trial.briefTitle}</p>
            </Section>
            {trial.conditions.length > 0 && (
              <Section title="Conditions">
                <p className="text-sm text-gray-900">{trial.conditions.join(', ')}</p>
              </Section>
            )}
            {trial.interventions.length > 0 && (
              <Section title="Interventions">
                <p className="text-sm text-gray-900">{trial.interventions.join(', ')}</p>
              </Section>
            )}
            {trial.briefSummary && (
              <Section title="Brief summary">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{trial.briefSummary}</p>
              </Section>
            )}
            {trial.detailedDescription && (
              <Section title="Detailed description">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{trial.detailedDescription}</p>
              </Section>
            )}
            <Section title="Eligibility criteria">
              <pre className="text-xs text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                {trial.eligibilityRaw || '(none)'}
              </pre>
            </Section>
            <Section title="CT.gov metadata">
              <dl className="text-xs text-gray-700 grid grid-cols-2 gap-x-4 gap-y-1">
                <dt className="text-gray-500">Status</dt><dd>{trial.overallStatus ?? '—'}</dd>
                <dt className="text-gray-500">Study type</dt><dd>{trial.studyType ?? '—'}</dd>
                <dt className="text-gray-500">Phases</dt><dd>{trial.phases?.join(', ') ?? '—'}</dd>
                <dt className="text-gray-500">Sex (CT.gov)</dt><dd>{trial.ctGovSex ?? '—'}</dd>
                <dt className="text-gray-500">Min age</dt><dd>{trial.ctGovMinAge ?? '—'}</dd>
                <dt className="text-gray-500">Max age</dt><dd>{trial.ctGovMaxAge ?? '—'}</dd>
              </dl>
              <a
                href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline mt-2 inline-block"
              >
                View on ClinicalTrials.gov →
              </a>
            </Section>
          </div>
        </div>

        {/* Right: extracted variables */}
        <div className="space-y-4 mt-6 lg:mt-0">
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

          {presentSections.length === 0 && (
            <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-lg p-5">
              No cancer-specific descriptors extracted for this trial.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{title}</div>
      {children}
    </div>
  );
}

function FieldGroup({
  title, children, onApproveAll,
}: { title: string; children: React.ReactNode; onApproveAll: () => void }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <button
          onClick={onApproveAll}
          className="text-xs text-gray-600 hover:text-green-700 hover:underline"
        >
          Approve all
        </button>
      </header>
      <div className="px-5 py-3 divide-y divide-gray-100">{children}</div>
    </section>
  );
}
