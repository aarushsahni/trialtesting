'use client';

import { useState } from 'react';

interface Props {
  complete: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => Promise<{ ok: boolean; error?: string }>;
  helpText?: string;
}

export function MarkCompleteToggle({ complete, disabled, onToggle, helpText }: Props) {
  const [optimistic, setOptimistic] = useState(complete);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (disabled || pending) return;
    const next = !optimistic;
    setOptimistic(next);
    setPending(true);
    setErr(null);
    const r = await onToggle(next);
    setPending(false);
    if (!r.ok) {
      setOptimistic(!next); // rollback
      setErr(r.error ?? 'Failed');
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">
            {optimistic ? 'This trial is marked complete' : 'Mark this trial complete'}
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
            (optimistic
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200') +
            (disabled || pending ? ' opacity-50 cursor-not-allowed' : '')
          }
        >
          {pending ? '…' : optimistic ? '✓ Complete · undo' : 'Mark complete'}
        </button>
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}
