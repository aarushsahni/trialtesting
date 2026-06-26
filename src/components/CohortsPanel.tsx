'use client';

import { CancerType, Cohort } from '@/lib/types';
import { CohortCard } from './CohortCard';
import { HelpTextMap } from '@/lib/guide-parser';

interface Props {
  cohorts: Cohort[];
  mode: 'reviewer' | 'expert';
  helpTextMap: HelpTextMap;
  disabled?: boolean;
  /** Trial-level fields used to seed a freshly-added cohort. The new cohort
   *  inherits the trial's cancer types and age/ECOG bounds so the labeler
   *  doesn't have to retype them. */
  trialLevel: {
    cancerTypes: CancerType[];
    minAge: number | null;
    maxAge: number | null;
    ecogMin: number | null;
    ecogMax: number | null;
  };
  onChange: (next: Cohort[]) => void;
}

function newCohortKey(existing: string[]): string {
  for (let i = 1; i < 1000; i++) {
    const k = `COHORT_${i}`;
    if (!existing.includes(k)) return k;
  }
  return `COHORT_${Date.now()}`;
}

export function CohortsPanel({
  cohorts, mode, helpTextMap, disabled, trialLevel, onChange,
}: Props) {
  const updateAt = (idx: number, next: Cohort) => {
    const copy = cohorts.slice();
    copy[idx] = next;
    onChange(copy);
  };

  const deleteAt = (idx: number) => {
    onChange(cohorts.filter((_, i) => i !== idx));
  };

  const add = () => {
    const key = newCohortKey(cohorts.map(c => c.cohortKey));
    // Seed applicableCancerTypes from the trial-level cancer types (empty
    // descriptor block per type) and inherit the trial's age/ECOG bounds.
    const seededCts: Partial<Record<CancerType, Record<string, never>>> = {};
    for (const ct of trialLevel.cancerTypes) seededCts[ct] = {};
    onChange([
      ...cohorts,
      {
        cohortKey: key,
        displayName: '',
        applicableCancerTypes: seededCts,
        minAge: trialLevel.minAge,
        maxAge: trialLevel.maxAge,
        ecogMin: trialLevel.ecogMin,
        ecogMax: trialLevel.ecogMax,
      },
    ]);
  };

  // Deep-clone the source so the duplicate's descriptor edits don't bleed
  // back into the original. JSON round-trip is safe here — every field in
  // Cohort serializes to JSON-compatible primitives.
  const duplicateAt = (idx: number) => {
    const src = cohorts[idx];
    if (!src) return;
    const key = newCohortKey(cohorts.map((c) => c.cohortKey));
    const clone: Cohort = JSON.parse(JSON.stringify(src));
    clone.cohortKey = key;
    clone.displayName = src.displayName ? `${src.displayName} (copy)` : '';
    const next = cohorts.slice();
    next.splice(idx + 1, 0, clone);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          Cohorts <span className="text-slate-500 font-normal">({cohorts.length})</span>
        </h2>
        {!disabled && (
          <button
            type="button"
            onClick={add}
            className="text-sm px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
          >
            + Add cohort
          </button>
        )}
      </div>
      {cohorts.length === 0 && (
        <div className="text-sm text-slate-500 italic px-4 py-6 border border-dashed border-slate-300 rounded-2xl text-center">
          No cohorts yet. Add one to start labeling cancer-type descriptors.
        </div>
      )}
      {cohorts.map((c, i) => (
        <CohortCard
          key={`${c.cohortKey}-${i}`}
          cohort={c}
          index={i}
          mode={mode}
          helpTextMap={helpTextMap}
          disabled={disabled}
          onChange={(next) => updateAt(i, next)}
          onDelete={() => deleteAt(i)}
          onDuplicate={() => duplicateAt(i)}
        />
      ))}
    </div>
  );
}
