'use client';

import { FieldDef } from '@/lib/schema/field-schemas';

export interface FieldState {
  value: unknown;     // null | undefined for "unset"
  approved: boolean;  // user has reviewed and approved
  edited: boolean;    // user changed the value from original
}

interface Props {
  def: FieldDef;
  state: FieldState;
  original: unknown;
  onChange: (next: FieldState) => void;
}

export function FieldEditor({ def, state, original, onChange }: Props) {
  const setValue = (v: unknown) => {
    const edited = JSON.stringify(v ?? null) !== JSON.stringify(original ?? null);
    // Editing a value implies approval — the user is explicitly endorsing the new value.
    onChange({ ...state, value: v, edited, approved: true });
  };
  const toggleApproved = () => onChange({ ...state, approved: !state.approved });

  return (
    <div className={'flex items-start gap-3 py-2 ' + (state.approved ? 'opacity-90' : '')}>
      <input
        type="checkbox"
        checked={state.approved}
        onChange={toggleApproved}
        className="mt-2 w-4 h-4 accent-green-600 flex-shrink-0"
        title="Approve"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium text-gray-800">{def.label}</label>
          {state.edited && (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">edited</span>
          )}
        </div>
        <div className="mt-1">
          {def.kind === 'enum' && (
            <EnumInput options={def.options!} value={state.value} onChange={setValue} />
          )}
          {def.kind === 'multi' && (
            <MultiInput options={def.options!} value={state.value} onChange={setValue} />
          )}
          {def.kind === 'bool' && (
            <BoolInput value={state.value} onChange={setValue} />
          )}
          {def.kind === 'number' && (
            <NumberInput value={state.value} onChange={setValue} />
          )}
        </div>
      </div>
    </div>
  );
}

function EnumInput({ options, value, onChange }: { options: string[]; value: unknown; onChange: (v: unknown) => void }) {
  const v = value == null ? '' : String(value);
  return (
    <select
      value={v}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">— null —</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function MultiInput({ options, value, onChange }: { options: string[]; value: unknown; onChange: (v: unknown) => void }) {
  const arr = Array.isArray(value) ? (value as string[]) : [];
  const toggle = (o: string) => {
    const next = arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o];
    onChange(next.length === 0 ? null : next);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = arr.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={
              'text-xs px-2 py-1 rounded border transition ' +
              (on
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400')
            }
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function BoolInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = value == null ? 'null' : value === true ? 'true' : 'false';
  const set = (next: string) => onChange(next === 'null' ? null : next === 'true');
  return (
    <div className="inline-flex rounded border border-gray-300 overflow-hidden text-xs">
      {[
        { k: 'true', label: 'Yes' },
        { k: 'false', label: 'No' },
        { k: 'null', label: 'null' },
      ].map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => set(o.k)}
          className={
            'px-3 py-1.5 ' +
            (v === o.k ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const v = value == null ? '' : String(value);
  return (
    <input
      type="number"
      value={v}
      onChange={(e) => {
        const s = e.target.value;
        if (s === '') return onChange(null);
        const n = Number(s);
        onChange(isNaN(n) ? null : n);
      }}
      className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}
