'use client';

import { useState } from 'react';
import {
  ALL_CANCER_TYPES, BlockAnswers, CancerType, CANCER_TYPE_LABELS, Cohort,
  FieldDef, FieldValue,
} from '@/lib/types';
import { BlockSection } from './BlockSection';
import { FieldEditor } from './FieldEditor';
import { HelpTextMap } from '@/lib/guide-parser';

interface Props {
  cohort: Cohort;
  /** Position in the parent list, used for the prefix label only. */
  index: number;
  mode: 'reviewer' | 'expert';
  helpTextMap: HelpTextMap;
  disabled?: boolean;
  onChange: (next: Cohort) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const minAgeDef: FieldDef = { kind: 'number', label: 'Min age (cohort override)', class: 'other' };
const maxAgeDef: FieldDef = { kind: 'number', label: 'Max age (cohort override)', class: 'other' };
const ecogMinDef: FieldDef = { kind: 'number', label: 'ECOG min (cohort override)', class: 'other' };
const ecogMaxDef: FieldDef = { kind: 'number', label: 'ECOG max (cohort override)', class: 'other' };

export function CohortCard({
  cohort, index, mode, helpTextMap, disabled,
  onChange, onDelete, onDuplicate,
}: Props) {
  // The labeler always has full control over their cohorts: rename the
  // description, delete, duplicate. The `mode` prop is kept for future use
  // (reviewer vs expert behavior in nested components).
  void mode;
  const canEdit = !disabled;
  const [collapsed, setCollapsed] = useState(false);

  const setApplicable = (ct: CancerType, on: boolean) => {
    const next = { ...cohort.applicableCancerTypes };
    if (on) {
      if (!(ct in next)) next[ct] = {};
    } else {
      const hasData = Object.values(next[ct] ?? {}).some((v) =>
        v !== null && !(Array.isArray(v) && v.length === 0),
      );
      if (hasData) {
        const ok = window.confirm(`Remove ${CANCER_TYPE_LABELS[ct]} from this cohort? Its descriptor values will be discarded.`);
        if (!ok) return;
      }
      delete next[ct];
    }
    onChange({ ...cohort, applicableCancerTypes: next });
  };

  const setDescriptor = (ct: CancerType, fieldKey: string, v: FieldValue) => {
    const block: BlockAnswers = { ...(cohort.applicableCancerTypes[ct] ?? {}) };
    block[fieldKey] = v;
    onChange({
      ...cohort,
      applicableCancerTypes: { ...cohort.applicableCancerTypes, [ct]: block },
    });
  };

  const setBound = <K extends 'minAge' | 'maxAge' | 'ecogMin' | 'ecogMax'>(k: K, v: number | null) =>
    onChange({ ...cohort, [k]: v });

  const selectedCts = Object.keys(cohort.applicableCancerTypes) as CancerType[];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <header className={
        'px-5 py-3 flex items-start gap-3 flex-wrap ' +
        (collapsed ? '' : 'border-b border-slate-100')
      }>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 text-slate-600 hover:text-slate-900 w-5 text-center text-base leading-none"
          aria-label={collapsed ? 'Expand cohort' : 'Collapse cohort'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold whitespace-nowrap">Cohort {index + 1}</span>
        </div>
        <input
          value={cohort.displayName}
          disabled={disabled}
          onChange={(e) => onChange({ ...cohort, displayName: e.target.value })}
          placeholder="Cohort description"
          className="text-sm px-2 py-1 border border-slate-300 rounded w-full sm:w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <div className="flex items-center gap-2 ml-auto">
          {canEdit && (
            <button
              type="button"
              onClick={onDuplicate}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Duplicate
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(`Delete this cohort? Any descriptor data inside will be discarded.`);
                if (ok) onDelete();
              }}
              className="text-xs text-red-600 hover:text-red-800 hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </header>

      {!collapsed && (
      <div className="px-5 py-3 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Applicable cancer types
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CANCER_TYPES.map((ct) => {
              const on = ct in cohort.applicableCancerTypes;
              return (
                <button
                  key={ct}
                  type="button"
                  disabled={disabled}
                  onClick={() => setApplicable(ct, !on)}
                  className={
                    'text-xs px-2 py-1 rounded border transition disabled:opacity-50 disabled:cursor-not-allowed ' +
                    (on
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-purple-400')
                  }
                >
                  {CANCER_TYPE_LABELS[ct]}
                </button>
              );
            })}
          </div>
          {selectedCts.length === 0 && (
            <div className="text-xs text-amber-700 mt-2">
              Pick at least one cancer type for this cohort.
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FieldEditor
            def={minAgeDef}
            value={cohort.minAge ?? null}
            onChange={(v) => setBound('minAge', typeof v === 'number' ? v : null)}
            disabled={disabled}
          />
          <FieldEditor
            def={maxAgeDef}
            value={cohort.maxAge ?? null}
            onChange={(v) => setBound('maxAge', typeof v === 'number' ? v : null)}
            disabled={disabled}
          />
          <FieldEditor
            def={ecogMinDef}
            value={cohort.ecogMin ?? null}
            onChange={(v) => setBound('ecogMin', typeof v === 'number' ? v : null)}
            disabled={disabled}
          />
          <FieldEditor
            def={ecogMaxDef}
            value={cohort.ecogMax ?? null}
            onChange={(v) => setBound('ecogMax', typeof v === 'number' ? v : null)}
            disabled={disabled}
          />
        </div>

        <div className="space-y-3">
          {selectedCts.map((ct) => (
            <BlockSection
              key={ct}
              cancerType={ct}
              answers={cohort.applicableCancerTypes[ct] ?? {}}
              onFieldChange={(fieldKey, v) => setDescriptor(ct, fieldKey, v)}
              disabled={disabled}
              helpTextByField={helpTextMap[ct]}
            />
          ))}
        </div>
      </div>
      )}
    </section>
  );
}
