'use client';

import { FieldDef, FieldValue } from '@/lib/types';
import { Tooltip } from './Tooltip';

interface Props {
  def: FieldDef;
  value: FieldValue;
  onChange: (next: FieldValue) => void;
  disabled?: boolean;
}

export function FieldEditor({ def, value, onChange, disabled }: Props) {
  return (
    <div className="py-3 first:pt-1 last:pb-1">
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-sm font-medium text-slate-800">{def.label}</label>
        {def.helpText && (
          <Tooltip text={def.helpText}>
            <span className="text-slate-400 text-xs cursor-help select-none hover:text-blue-600">
              ⓘ
            </span>
          </Tooltip>
        )}
      </div>
      {def.kind === 'multi' && (
        <MultiInput
          options={def.options!}
          value={Array.isArray(value) ? value : []}
          onChange={(v) => onChange(v.length === 0 ? null : v)}
          disabled={disabled}
        />
      )}
      {def.kind === 'bool' && (
        <BoolInput
          value={typeof value === 'boolean' ? value : null}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {def.kind === 'number' && (
        <NumberInput
          value={typeof value === 'number' ? value : null}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function MultiInput({
  options, value, onChange, disabled,
}: { options: string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const toggle = (o: string) => {
    if (disabled) return;
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o)}
            className={
              'text-xs px-2 py-1 rounded border transition disabled:opacity-50 disabled:cursor-not-allowed ' +
              (on
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400')
            }
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function BoolInput({
  value, onChange, disabled,
}: { value: boolean | null; onChange: (v: boolean | null) => void; disabled?: boolean }) {
  const current = value === null ? 'null' : value ? 'true' : 'false';
  const set = (k: string) => {
    if (disabled) return;
    onChange(k === 'null' ? null : k === 'true');
  };
  return (
    <div className="inline-flex rounded border border-slate-300 overflow-hidden text-xs">
      {[
        { k: 'true', label: 'Yes' },
        { k: 'false', label: 'No' },
        { k: 'null', label: 'null' },
      ].map((o) => (
        <button
          key={o.k}
          type="button"
          disabled={disabled}
          onClick={() => set(o.k)}
          className={
            'px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed ' +
            (current === o.k ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  value, onChange, disabled,
}: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  const v = value == null ? '' : String(value);
  return (
    <input
      type="number"
      value={v}
      disabled={disabled}
      onChange={(e) => {
        const s = e.target.value;
        if (s === '') return onChange(null);
        const n = Number(s);
        onChange(isNaN(n) ? null : n);
      }}
      className="w-32 px-2 py-1.5 text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    />
  );
}
