'use client';

import { useEffect, useRef, useState } from 'react';

export interface TrialMetaValue {
  notes: string;
  flags: Record<string, boolean>;
}

interface Props {
  initial: TrialMetaValue;
  disabled?: boolean;
  // Called debounced — returns server result so we can surface errors.
  onSave: (next: TrialMetaValue) => Promise<{ ok: boolean; error?: string }>;
}

export function TrialMeta({ initial, disabled, onSave }: Props) {
  const [notes, setNotes] = useState(initial.notes ?? '');
  // Flags column is preserved in the schema for future use; we no longer
  // expose UI for it. Pass through whatever was already saved unchanged.
  const flags = initial.flags ?? {};
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Debounced save
  const valueRef = useRef({ notes, flags });
  useEffect(() => { valueRef.current = { notes, flags }; }, [notes, flags]);
  const skipFirst = useRef(true);
  useEffect(() => {
    if (disabled) return;
    if (skipFirst.current) { skipFirst.current = false; return; }
    const h = setTimeout(async () => {
      setPending(true);
      setErr(null);
      const r = await onSave(valueRef.current);
      setPending(false);
      if (!r.ok) setErr(r.error ?? 'Failed');
    }, 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Notes</h3>
        {pending && <span className="text-xs text-blue-600">Saving…</span>}
        {err && <span className="text-xs text-red-600">⚠ {err}</span>}
      </header>
      <div className="px-5 py-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="Optional. Note any ambiguity, your interpretation, or anything an adjudicator should know."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y disabled:bg-slate-50 disabled:cursor-not-allowed"
        />
      </div>
    </section>
  );
}
