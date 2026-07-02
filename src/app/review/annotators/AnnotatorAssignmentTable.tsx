'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setExpertAnnotatorSlotAction } from '@/app/actions/review';

interface ExpertRow {
  expert_id: string;
  expert_name: string;
  annotator_slot: number | null;
  assigned_main_trials: number;
}

const ALL_SLOTS = [1, 2, 3, 4, 5] as const;

export function AnnotatorAssignmentTable({ experts }: { experts: ExpertRow[] }) {
  const router = useRouter();
  // Local slot state so the taken-map updates immediately after a save,
  // before the router refresh finishes.
  const [current, setCurrent] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(experts.map((e) => [e.expert_id, e.annotator_slot])),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slotHolders = useMemo(() => {
    const m = new Map<number, string>();
    for (const [expertId, slot] of Object.entries(current)) {
      if (slot !== null) m.set(slot, expertId);
    }
    return m;
  }, [current]);

  async function onChange(expertId: string, value: string) {
    if (pending) return;
    const slot = value === '' ? null : Number(value);
    setPending(expertId);
    setError(null);
    const r = await setExpertAnnotatorSlotAction({ expertId, slot });
    setPending(null);
    if (!r.ok) {
      setError(r.error ?? 'Failed to assign slot.');
      return;
    }
    setCurrent((prev) => ({ ...prev, [expertId]: slot }));
    router.refresh();
  }

  return (
    <div>
      {error && (
        <div className="mb-3 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        {experts.map((e) => {
          const currentSlot = current[e.expert_id];
          const isPending = pending === e.expert_id;
          return (
            <div key={e.expert_id} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900">{e.expert_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {e.assigned_main_trials} main trial{e.assigned_main_trials === 1 ? '' : 's'} in queue
                </div>
              </div>
              <div className="flex-shrink-0">
                <label className="text-xs text-slate-500 mr-2">Slot</label>
                <select
                  value={currentSlot ?? ''}
                  disabled={isPending}
                  onChange={(ev) => onChange(e.expert_id, ev.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white disabled:opacity-50"
                >
                  <option value="">— unassigned —</option>
                  {ALL_SLOTS.map((s) => {
                    const holder = slotHolders.get(s);
                    const takenByOther = holder && holder !== e.expert_id;
                    return (
                      <option key={s} value={s} disabled={!!takenByOther}>
                        {s}{takenByOther ? ' (taken)' : ''}
                      </option>
                    );
                  })}
                </select>
                {isPending && <span className="ml-2 text-xs text-slate-400">saving…</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Changing a slot immediately assigns the matching main trials to that expert.
        Clearing a slot vacates it but leaves any already-assigned trials in place
        (existing in-progress annotations are never removed).
      </p>
    </div>
  );
}
