import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

interface Row {
  expert_id: string;
  expert_name: string;
  created_at: string;
  total_assigned: number;
  total_test: number;
  test_submitted: number;
  test_reviewed: number;
  nontest_submitted: number;
}

export default async function ExpertsList() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const rows = await query<Row>(`
    SELECT
      u.id AS expert_id,
      u.name AS expert_name,
      u.created_at,
      COUNT(ta.*)::int AS total_assigned,
      COUNT(ta.*) FILTER (WHERE ta.is_test_trial)::int AS total_test,
      COUNT(a.*) FILTER (WHERE ta.is_test_trial AND a.status = 'submitted')::int AS test_submitted,
      COUNT(ta.*) FILTER (WHERE ta.is_test_trial AND ta.test_reviewed_at IS NOT NULL)::int AS test_reviewed,
      COUNT(a.*) FILTER (WHERE NOT ta.is_test_trial AND a.status = 'submitted')::int AS nontest_submitted
    FROM users u
    LEFT JOIN trial_assignments ta ON ta.expert_id = u.id
    LEFT JOIN annotations a ON a.expert_id = ta.expert_id AND a.nct_id = ta.nct_id
    WHERE u.role = 'expert'
    GROUP BY u.id, u.name, u.created_at
    ORDER BY u.name
  `);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Experts</h1>
          <p className="text-sm text-slate-600 mt-1">
            Per-expert test-trial progress. Pending review = expert has submitted a test trial that you haven&apos;t marked reviewed yet.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No experts have signed up yet.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {rows.map((r) => {
              const pendingReview = r.test_submitted - r.test_reviewed;
              const unlocked = r.total_test > 0 && r.test_reviewed === r.total_test;
              return (
                <Link
                  key={r.expert_id}
                  href={`/review/experts/${r.expert_id}`}
                  className="block p-4 hover:bg-blue-50 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900">{r.expert_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>{r.total_assigned} trials assigned</span>
                        <span>
                          · Tests: <strong className="text-slate-700">{r.test_submitted}</strong> submitted /{' '}
                          <strong className="text-slate-700">{r.test_reviewed}</strong> reviewed / {r.total_test} total
                        </span>
                        <span>· {r.nontest_submitted} main submissions</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                      {pendingReview > 0 && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-amber-100 text-amber-800">
                          {pendingReview} pending review
                        </span>
                      )}
                      {unlocked && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-emerald-100 text-emerald-800">
                          Unlocked
                        </span>
                      )}
                      {r.total_test === 0 && (
                        <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-slate-100 text-slate-600">
                          No test trials
                        </span>
                      )}
                    </div>
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
