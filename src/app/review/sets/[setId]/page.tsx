import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, QualificationSetRow, QualificationTrialRow, ReferenceKeyRow } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockKey } from '@/lib/types';
import { LockSetButton } from './LockSetButton';

export const dynamic = 'force-dynamic';

interface TrialWithStatus extends QualificationTrialRow {
  has_key: boolean;
  populated_field_count: number;
  complete: boolean;
  built_by_name: string | null;
  built_at: string | null;
}

export default async function SetDetail({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/expert');

  const [sets, trials, keys] = await Promise.all([
    query<QualificationSetRow>(`SELECT * FROM qualification_sets WHERE id = $1`, [setId]),
    query<QualificationTrialRow>(`
      SELECT qt.* FROM qualification_trials qt
      JOIN qualification_sets qs ON qt.nct_id = ANY(qs.trial_nct_ids)
      WHERE qs.id = $1
      ORDER BY qt.assigned_blocks[1], qt.nct_id
    `, [setId]),
    query<ReferenceKeyRow & { built_by_name: string | null }>(`
      SELECT rk.*, u.name AS built_by_name
      FROM reference_keys rk
      LEFT JOIN users u ON u.id = rk.built_by_annotator_id
      WHERE rk.qualification_set_id = $1
    `, [setId]),
  ]);

  const set = sets[0];
  if (!set) notFound();

  const keyByNct = new Map(keys.map(k => [k.nct_id, k]));
  const trialsWithStatus: TrialWithStatus[] = trials.map((t) => {
    const k = keyByNct.get(t.nct_id);
    const data = (k?.key_data ?? {}) as Record<string, Record<string, unknown>>;
    let populated = 0;
    for (const blockKey of t.assigned_blocks as BlockKey[]) {
      const blockAnswers = data[blockKey] ?? {};
      for (const v of Object.values(blockAnswers)) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) populated++;
      }
    }
    return {
      ...t,
      has_key: !!k,
      populated_field_count: populated,
      complete: !!k?.complete,
      built_by_name: (k as (typeof keys)[number] | undefined)?.built_by_name ?? null,
      built_at: k?.built_at ?? null,
    };
  });

  const completeCount = trialsWithStatus.filter(t => t.complete).length;
  const inProgressCount = trialsWithStatus.filter(t => !t.complete && (t.has_key && t.populated_field_count > 0)).length;
  const lockable = !set.locked_at && completeCount === trials.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">
          ← All sets
        </Link>
        <div className="mt-3 mb-8 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{set.name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              <span className="font-bold text-slate-900">{completeCount}</span> / {trials.length} complete
              {inProgressCount > 0 && <span className="text-amber-700"> · {inProgressCount} in progress</span>}
              {set.locked_at && (
                <span className="ml-3 text-emerald-700 font-semibold">
                  · Locked {new Date(set.locked_at).toLocaleString()}
                </span>
              )}
            </p>
          </div>
          {!set.locked_at && (
            <LockSetButton setId={set.id} disabled={!lockable} />
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {trialsWithStatus.map((t) => {
            const blocks = (t.assigned_blocks as BlockKey[]).map(b => BLOCKS[b]?.label ?? b);
            const started = t.has_key && t.populated_field_count > 0;
            const dotColor = t.complete ? 'bg-emerald-500' : started ? 'bg-amber-400' : 'bg-slate-300';
            return (
              <Link
                key={t.nct_id}
                href={`/review/sets/${set.id}/${t.nct_id}`}
                className="block p-4 hover:bg-blue-50 transition"
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-3 flex-wrap">
                      <span>{t.nct_id}</span>
                      {blocks.map(b => (
                        <span key={b} className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-semibold">
                          {b}
                        </span>
                      ))}
                    </div>
                    <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{t.populated_field_count} fields populated</span>
                      {t.built_by_name && t.built_at && (
                        <span>
                          · Last saved by <strong className="text-slate-700">{t.built_by_name}</strong>{' '}
                          {new Date(t.built_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
