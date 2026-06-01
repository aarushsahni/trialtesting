import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, QualificationAttemptRow, QualificationSetRow } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

export default async function ReviewHome() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/review');

  // For now: show all locked sets. (A real production phase would
  // assign reviewers to specific sets, but qualification is one set.)
  const sets = await query<QualificationSetRow>(
    `SELECT * FROM qualification_sets WHERE locked_at IS NOT NULL ORDER BY locked_at DESC`,
  );
  const attempts = await query<QualificationAttemptRow>(
    `SELECT * FROM qualification_attempts WHERE expert_id = $1`,
    [session.userId],
  );
  const attemptBySet = new Map(attempts.map((a) => [a.qualification_set_id, a]));

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Qualification test</h1>
          <p className="text-sm text-slate-600 mt-1">
            Each test is a fixed set of trials. Label each one independently —
            your answers are scored against an expert reference key.
          </p>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-900">
            📖 Before you start, skim the <a href="/guide" className="underline font-medium">annotation guide</a> — especially
            the &quot;General annotation rules&quot; section. The ? button at the bottom-right of every trial page has a 7-point cheat sheet.
          </div>
        </div>

        {sets.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No qualification tests are available yet. Check back later.
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((s) => {
              const a = attemptBySet.get(s.id);
              return (
                <div
                  key={s.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="font-semibold text-slate-900">{s.name}</h3>
                    <span className="text-xs text-slate-500">{s.trial_nct_ids.length} trials</span>
                  </div>
                  {!a && (
                    <Link
                      href={`/expert/${s.id}`}
                      className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm shadow-blue-200"
                    >
                      Start test →
                    </Link>
                  )}
                  {a?.status === 'in_progress' && (
                    <Link
                      href={`/expert/${s.id}`}
                      className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition shadow-sm shadow-blue-200"
                    >
                      Continue test →
                    </Link>
                  )}
                  {(a?.status === 'submitted' || a?.status === 'passed' || a?.status === 'failed') && (
                    <div className="mt-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <strong>Submitted</strong> on{' '}
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : '—'}.
                      Results are reviewed by the project lead — they&apos;ll be in touch.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
