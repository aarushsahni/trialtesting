'use client';

import { useState } from 'react';
import { FieldEditor } from './FieldEditor';
import { Tooltip } from './Tooltip';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockAnswers, CancerType, FieldDef, FieldValue } from '@/lib/types';

interface Props {
  cancerType: CancerType;
  answers: BlockAnswers;
  onFieldChange: (fieldKey: string, value: FieldValue) => void;
  disabled?: boolean;
  /** Per-field tooltip text, keyed by fieldKey. Comes from the annotation
   *  guide's "What it captures" column. Falls back to FieldDef.helpText. */
  helpTextByField?: Record<string, string>;
}

function countPopulated(answers: BlockAnswers, fieldKeys: string[]): number {
  let n = 0;
  for (const k of fieldKeys) {
    const v = answers[k];
    if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) n++;
  }
  return n;
}

export function BlockSection({ cancerType, answers, onFieldChange, disabled, helpTextByField }: Props) {
  const block = BLOCKS[cancerType];
  const fields = Object.entries(block.fields);
  const [collapsed, setCollapsed] = useState(false);

  // OTHER (basket catch-all) — no descriptor fields. Render a header + caption only.
  if (fields.length === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full px-5 py-3 border-b border-slate-100 flex items-center gap-3 hover:bg-slate-50 transition text-left"
        >
          <span className="text-slate-600 w-5 text-center text-base leading-none">{collapsed ? '▶' : '▼'}</span>
          <h3 className="font-semibold text-slate-900">{block.label}</h3>
        </button>
        {!collapsed && (
          <div className="px-5 py-3 text-xs text-slate-500 italic">
            Basket catch-all — no descriptor fields. Used when a cohort enrolls cancer types beyond the named blocks.
          </div>
        )}
      </section>
    );
  }

  // Pair priorTherapyRequired + priorTherapyExcluded into one compound widget.
  const required = fields.find(([k]) => k === 'priorTherapyRequired');
  const excluded = fields.find(([k]) => k === 'priorTherapyExcluded');
  const renderedAsPair = new Set<string>();
  if (required && excluded) {
    renderedAsPair.add('priorTherapyRequired');
    renderedAsPair.add('priorTherapyExcluded');
  }
  const populated = countPopulated(answers, fields.map(([k]) => k));

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={
          'w-full px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition text-left ' +
          (collapsed ? '' : 'border-b border-slate-100')
        }
      >
        <span className="text-slate-600 w-5 text-center text-base leading-none">{collapsed ? '▶' : '▼'}</span>
        <h3 className="font-semibold text-slate-900 flex-1">{block.label}</h3>
        <span className="text-xs text-slate-500">{populated} / {fields.length} fields</span>
      </button>
      {!collapsed && (
        <div className="px-5 py-3 divide-y divide-slate-100">
          {fields.map(([fieldKey, def]) => {
            if (renderedAsPair.has(fieldKey)) return null;
            return (
              <FieldEditor
                key={fieldKey}
                def={def}
                value={(answers[fieldKey] ?? null) as FieldValue}
                onChange={(v) => onFieldChange(fieldKey, v)}
                disabled={disabled}
                helpTextOverride={helpTextByField?.[fieldKey]}
              />
            );
          })}

          {required && excluded && (
            <PriorTherapyPair
              therapies={(required[1] as FieldDef).options ?? []}
              required={Array.isArray(answers.priorTherapyRequired) ? (answers.priorTherapyRequired as string[]) : []}
              excluded={Array.isArray(answers.priorTherapyExcluded) ? (answers.priorTherapyExcluded as string[]) : []}
              onChange={(r, e) => {
                onFieldChange('priorTherapyRequired', r.length === 0 ? null : r);
                onFieldChange('priorTherapyExcluded', e.length === 0 ? null : e);
              }}
              disabled={disabled}
            />
          )}
        </div>
      )}
    </section>
  );
}

type PriorTherapyState = 'unconstrained' | 'required' | 'excluded';

function PriorTherapyPair({
  therapies, required, excluded, onChange, disabled,
}: {
  therapies: string[];
  required: string[];
  excluded: string[];
  onChange: (required: string[], excluded: string[]) => void;
  disabled?: boolean;
}) {
  const stateOf = (t: string): PriorTherapyState =>
    required.includes(t) ? 'required'
    : excluded.includes(t) ? 'excluded'
    : 'unconstrained';

  const setState = (t: string, s: PriorTherapyState) => {
    if (disabled) return;
    const r = required.filter((x) => x !== t);
    const e = excluded.filter((x) => x !== t);
    if (s === 'required') r.push(t);
    if (s === 'excluded') e.push(t);
    onChange(r, e);
  };

  return (
    <div className="py-3">
      <div className="flex items-baseline gap-2 mb-2">
        <label className="text-sm font-medium text-slate-800">Prior therapy</label>
        <Tooltip text="For each therapy: 'Required' = trial requires patient to have received it; 'Excluded' = prior receipt disqualifies; 'Unconstrained' = trial doesn't mention it.">
          <span className="text-slate-400 text-xs cursor-help select-none hover:text-blue-600">ⓘ</span>
        </Tooltip>
      </div>
      <div className="space-y-1.5">
        {therapies.map((t) => {
          const s = stateOf(t);
          return (
            <div key={t} className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-700 font-mono">{t}</span>
              <div className="inline-flex rounded border border-slate-300 overflow-hidden text-xs">
                {[
                  { k: 'unconstrained' as const, label: 'Unconstrained' },
                  { k: 'required' as const, label: 'Required' },
                  { k: 'excluded' as const, label: 'Excluded' },
                ].map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    disabled={disabled}
                    onClick={() => setState(t, o.k)}
                    className={
                      'px-2.5 py-1 disabled:opacity-50 disabled:cursor-not-allowed ' +
                      (s === o.k
                        ? (o.k === 'required' ? 'bg-emerald-600 text-white'
                          : o.k === 'excluded' ? 'bg-red-600 text-white'
                          : 'bg-slate-200 text-slate-800')
                        : 'bg-white text-slate-700 hover:bg-slate-50')
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
