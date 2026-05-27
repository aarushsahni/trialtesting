'use client';

import { useState } from 'react';

interface Props {
  complete: boolean;                                  // controlled by parent
  disabled?: boolean;                                 // outer lock (e.g. set locked)
  onToggle: (next: boolean) => Promise<{ ok: boolean; error?: string }>;
  helpText?: string;
}

export function MarkCompleteToggle({ complete, disabled, onToggle, helpText }: Props) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (disabled || pending) return;
    setPending(true);
    setErr(null);
    const r = await onToggle(!complete);
    setPending(false);
    if (!r.ok) setErr(r.error ?? 'Failed');
  }

  return (
    <div
      className={
        'border rounded-2xl p-5 shadow-sm transition ' +
        (complete
          ? 'bg-emerald-50 border-emerald-200 shadow-emerald-100/40'
          : 'bg-white border-slate-200 shadow-blue-100/30')
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">
            {complete
              ? 'This trial is complete — fields are locked'
              : 'Mark this trial complete'}
          </h3>
          {helpText && (
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{helpText}</p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={disabled || pending}
          className={
            'flex-shrink-0 text-sm px-4 py-2 rounded-lg font-medium transition shadow-sm ' +
            (complete
              ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200') +
            (disabled || pending ? ' opacity-50 cursor-not-allowed' : '')
          }
        >
          {pending ? '…' : complete ? 'Unlock to edit' : 'Mark complete'}
        </button>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}
