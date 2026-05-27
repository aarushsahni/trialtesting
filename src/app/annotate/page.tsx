import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

interface SetSummary {
  id: string;
  name: string;
  trial_count: number;
  key_count: number;
  locked_at: string | null;
}

export default async function AnnotateHome() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'annotator') redirect('/review');

  const sets = await query<SetSummary>(`
    SELECT qs.id, qs.name, qs.locked_at,
           array_length(qs.trial_nct_ids, 1) AS trial_count,
           (SELECT COUNT(*) FROM reference_keys rk
              WHERE rk.qualification_set_id = qs.id)::int AS key_count
    FROM qualification_sets qs
    ORDER BY qs.created_at DESC
  `);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Qualification sets</h1>
          <p className="text-sm text-slate-600 mt-1">
            Build the reference key for each trial. When complete, lock the set so
            reviewers can take it.
          </p>
        </div>

        {sets.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            <p className="font-medium">No qualification sets yet.</p>
            <p className="mt-1">
              Run <code className="bg-amber-100 px-1.5 py-0.5 rounded">npm run seed-qualification</code> to fetch trials.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((s) => {
              const pct = s.trial_count ? Math.round((s.key_count / s.trial_count) * 100) : 0;
              return (
                <Link
                  key={s.id}
                  href={`/annotate/sets/${s.id}`}
                  className="block bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30 hover:border-blue-400 transition"
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{s.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s.trial_count} trials · {s.key_count} reference keys built
                      </p>
                    </div>
                    {s.locked_at ? (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
                        Locked
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-1 rounded">
                        In progress
                      </span>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
