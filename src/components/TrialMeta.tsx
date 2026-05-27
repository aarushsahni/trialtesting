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

const FLAG_LIST: Array<{ key: string; label: string; help: string }> = [
  {
    key: 'setting_qualified_criterion',
    label: 'Setting-qualified criterion',
    help: 'A criterion was qualified by treatment setting (e.g. "prior platinum in the metastatic setting") that the schema cannot encode.',
  },
  {
    key: 'both_required_and_excluded',
    label: 'Same therapy required AND excluded',
    help: 'The trial criteria appear to both require and exclude the same therapy — flag rather than guess.',
  },
];

export function TrialMeta({ initial, disabled, onSave }: Props) {
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [flags, setFlags] = useState<Record<string, boolean>>(initial.flags ?? {});
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
  }, [notes, flags]);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30">
      <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Notes & flags</h3>
        {pending && <span className="text-xs text-blue-600">Saving…</span>}
        {err && <span className="text-xs text-red-600">⚠ {err}</span>}
      </header>
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
            Adjudication notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder="Optional. Note any ambiguity, your interpretation, or anything an adjudicator should know."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y disabled:bg-slate-50 disabled:cursor-not-allowed"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
            Flags
          </label>
          <div className="space-y-2">
            {FLAG_LIST.map((f) => (
              <label key={f.key} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!flags[f.key]}
                  disabled={disabled}
                  onChange={(e) => setFlags((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                  className="mt-1 w-4 h-4 accent-blue-600 disabled:opacity-50"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{f.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{f.help}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
