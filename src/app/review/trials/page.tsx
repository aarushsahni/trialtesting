import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

interface Row {
  nct_id: string;
  brief_title: string;
  position: number;
  has_key: boolean;
  key_complete: boolean;
  test_assignments: number;
  nontest_assignments: number;
  submitted_annotations: number;
  built_by_name: string | null;
  built_at: string | null;
}

export default async function TrialsCatalog() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  // Only test trials need reference keys — they're the ground truth for
  // scoring. Non-test trials get resolved via reviewer adjudication of two
  // independent expert annotations.
  const rows = await query<Row>(`
    SELECT t.nct_id, t.brief_title, t.position,
           (rk.nct_id IS NOT NULL) AS has_key,
           COALESCE(rk.complete, FALSE) AS key_complete,
           (SELECT COUNT(*) FROM trial_assignments ta WHERE ta.nct_id = t.nct_id AND ta.is_test_trial)::int AS test_assignments,
           (SELECT COUNT(*) FROM trial_assignments ta WHERE ta.nct_id = t.nct_id AND NOT ta.is_test_trial)::int AS nontest_assignments,
           (SELECT COUNT(*) FROM annotations a WHERE a.nct_id = t.nct_id AND a.status = 'submitted')::int AS submitted_annotations,
           u.name AS built_by_name,
           rk.built_at
    FROM trials t
    LEFT JOIN reference_keys rk ON rk.nct_id = t.nct_id
    LEFT JOIN users u ON u.id = rk.built_by_reviewer_id
    WHERE t.is_test_trial = TRUE
    ORDER BY t.position, t.nct_id
  `);

  const completeCount = rows.filter((r) => r.key_complete).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Test trials</h1>
          <p className="text-sm text-slate-600 mt-1">
            <strong className="text-slate-900">{completeCount}</strong> / {rows.length} reference keys complete.
            Only test trials need a reference key — non-test trials get adjudicated on{' '}
            <Link href="/review/adjudicate" className="text-blue-600 hover:underline">/review/adjudicate</Link>.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            <p className="font-medium">No test trials assigned yet.</p>
            <p className="mt-1">
              Set <code className="bg-amber-100 px-1.5 py-0.5 rounded">is_test_trial = TRUE</code> on at least
              one trial assignment to start building reference keys.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {rows.map((t) => {
              const dot = t.key_complete ? 'bg-emerald-500' : t.has_key ? 'bg-amber-400' : 'bg-slate-300';
              return (
                <Link
                  key={t.nct_id}
                  href={`/review/trials/${t.nct_id}`}
                  className="block p-4 hover:bg-blue-50 transition"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                        <span>{t.nct_id}</span>
                        {t.test_assignments > 0 && (
                          <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-semibold">
                            Test · {t.test_assignments} assigned
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                        <span>
                          {t.key_complete ? 'Reference key complete' : t.has_key ? 'Reference key in progress' : 'No reference key'}
                        </span>
                        <span>· {t.nontest_assignments} non-test assignment{t.nontest_assignments === 1 ? '' : 's'}</span>
                        <span>· {t.submitted_annotations} submitted</span>
                        {t.built_by_name && t.built_at && (
                          <span>· last by <strong className="text-slate-700">{t.built_by_name}</strong> {new Date(t.built_at).toLocaleString()}</span>
                        )}
                      </div>
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
