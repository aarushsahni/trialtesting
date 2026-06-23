'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setCohortMappingAction } from '@/app/actions/review';

const UNMAPPED = '__UNMAPPED__';

interface RefCohort { cohortKey: string; displayName: string }

interface Props {
  expertId: string;
  nctId: string;
  expertCohorts: RefCohort[];
  referenceCohorts: RefCohort[];
  initialMapping: Record<string, string>;
}

export function CohortMappingPanel({
  expertId, nctId, expertCohorts, referenceCohorts, initialMapping,
}: Props) {
  const router = useRouter();
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (expertCohorts.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic">
        The expert hasn&apos;t added any cohorts yet.
      </div>
    );
  }
  if (referenceCohorts.length === 0) {
    return (
      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Build at least one cohort in the reference key before mapping. Until then every expert cohort
        scores as unmatched (FP).
      </div>
    );
  }

  async function update(expertKey: string, value: string) {
    const next = { ...mapping };
    if (value === UNMAPPED) delete next[expertKey];
    else next[expertKey] = value;
    setMapping(next);
    setPending(true);
    setErr(null);
    const r = await setCohortMappingAction({ expertId, nctId, mapping: next });
    setPending(false);
    if (!r.ok) {
      setErr(r.error ?? 'Failed');
      // Revert local state
      setMapping(mapping);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      {expertCohorts.map((ec, i) => {
        const current = mapping[ec.cohortKey] ?? UNMAPPED;
        return (
          <div key={ec.cohortKey} className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center text-sm">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                Expert cohort {i + 1}
              </div>
              <div className="text-slate-800 truncate">{ec.displayName || <span className="italic text-slate-400">(no description)</span>}</div>
            </div>
            <span className="text-slate-400 text-lg">→</span>
            <select
              value={current}
              onChange={(e) => update(ec.cohortKey, e.target.value)}
              disabled={pending}
              className="px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value={UNMAPPED}>Unmapped</option>
              {referenceCohorts.map((rc, j) => (
                <option key={rc.cohortKey} value={rc.cohortKey}>
                  Reference cohort {j + 1}{rc.displayName ? ` — ${rc.displayName}` : ''}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {err && <p className="text-xs text-red-600">⚠ {err}</p>}
    </div>
  );
}
