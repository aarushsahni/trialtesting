'use client';

import { FieldEditor } from './FieldEditor';
import { Tooltip } from './Tooltip';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockAnswers, BlockKey, FieldDef, FieldValue } from '@/lib/types';

interface Props {
  blockKey: BlockKey;
  answers: BlockAnswers;
  onFieldChange: (fieldKey: string, value: FieldValue) => void;
  disabled?: boolean;
}

export function BlockSection({ blockKey, answers, onFieldChange, disabled }: Props) {
  const block = BLOCKS[blockKey];
  const fields = Object.entries(block.fields);

  // Pair priorTherapyRequired + priorTherapyExcluded into one compound widget.
  const required = fields.find(([k]) => k === 'priorTherapyRequired');
  const excluded = fields.find(([k]) => k === 'priorTherapyExcluded');
  const renderedAsPair = new Set<string>();
  if (required && excluded) {
    renderedAsPair.add('priorTherapyRequired');
    renderedAsPair.add('priorTherapyExcluded');
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <header className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-blue-600" />
        <h3 className="font-semibold text-slate-900">{block.label}</h3>
      </header>
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
