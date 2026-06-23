'use client';

import { ALL_CANCER_TYPES, CancerType, FieldDef, TrialAnswers } from '@/lib/types';
import { FieldEditor } from './FieldEditor';

interface Props {
  value: TrialAnswers;
  onChange: (next: TrialAnswers) => void;
  disabled?: boolean;
}

// Virtual FieldDefs for the trial-level scalar / multi fields. Kept here
// (not in field-schemas.ts) because field-schemas.ts is the per-cancer-type
// descriptor catalog — these are universal trial-level fields.
const cancerTypesDef: FieldDef = {
  kind: 'multi',
  label: 'Cancer types',
  options: ALL_CANCER_TYPES,
  class: 'other',
  helpText: 'All cancer types the trial enrolls. Union of every cohort\'s applicableCancerTypes (the editor does not enforce this — it is informational at the trial level).',
};
const minAgeDef: FieldDef = { kind: 'number', label: 'Min age', class: 'other' };
const maxAgeDef: FieldDef = { kind: 'number', label: 'Max age', class: 'other' };
const ecogMinDef: FieldDef = { kind: 'number', label: 'ECOG min', class: 'other' };
const ecogMaxDef: FieldDef = { kind: 'number', label: 'ECOG max', class: 'other' };

export function TrialLevelFieldsPanel({ value, onChange, disabled }: Props) {
  const set = <K extends keyof TrialAnswers>(k: K, v: TrialAnswers[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <header className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <h3 className="font-semibold text-slate-900">Trial-level fields</h3>
        <span className="text-xs text-slate-500">applies across all cohorts</span>
      </header>
      <div className="px-5 py-3 divide-y divide-slate-100">
        <FieldEditor
          def={cancerTypesDef}
          value={value.cancerTypes ?? null}
          onChange={(v) => set('cancerTypes', ((v as string[] | null) ?? []) as CancerType[])}
          disabled={disabled}
        />
        <div className="grid grid-cols-2 gap-4 py-3">
          <div>
            <FieldEditor
              def={minAgeDef}
              value={value.minAge ?? null}
              onChange={(v) => set('minAge', (typeof v === 'number' ? v : null))}
              disabled={disabled}
            />
          </div>
          <div>
            <FieldEditor
              def={maxAgeDef}
              value={value.maxAge ?? null}
              onChange={(v) => set('maxAge', (typeof v === 'number' ? v : null))}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 py-3">
          <div>
            <FieldEditor
              def={ecogMinDef}
              value={value.ecogMin ?? null}
              onChange={(v) => set('ecogMin', (typeof v === 'number' ? v : null))}
              disabled={disabled}
            />
          </div>
          <div>
            <FieldEditor
              def={ecogMaxDef}
              value={value.ecogMax ?? null}
              onChange={(v) => set('ecogMax', (typeof v === 'number' ? v : null))}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
