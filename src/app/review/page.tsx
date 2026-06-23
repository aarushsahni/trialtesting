import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, MAX_ANNOTATIONS_PER_TRIAL } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

interface Stats {
  trial_count: number;
  refkeys_total: number;
  refkeys_complete: number;
  expert_count: number;
  pending_test_reviews: number;
  trials_ready_to_adjudicate: number;
}

export default async function ReviewHub() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const rows = await query<Stats>(`
    SELECT
      (SELECT COUNT(DISTINCT nct_id) FROM trial_assignments WHERE is_test_trial = TRUE)::int AS trial_count,
      (SELECT COUNT(*) FROM reference_keys rk
         WHERE EXISTS (
           SELECT 1 FROM trial_assignments ta
           WHERE ta.nct_id = rk.nct_id AND ta.is_test_trial = TRUE
         ))::int AS refkeys_total,
      (SELECT COUNT(*) FROM reference_keys rk
         WHERE complete = TRUE AND EXISTS (
           SELECT 1 FROM trial_assignments ta
           WHERE ta.nct_id = rk.nct_id AND ta.is_test_trial = TRUE
         ))::int AS refkeys_complete,
      (SELECT COUNT(*) FROM users WHERE role = 'expert')::int AS expert_count,
      (SELECT COUNT(*) FROM annotations a
         JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
         WHERE ta.is_test_trial = TRUE
           AND ta.test_reviewed_at IS NULL
           AND a.status = 'submitted')::int AS pending_test_reviews,
      (SELECT COUNT(*) FROM (
        SELECT a.nct_id
        FROM annotations a
        JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
        WHERE a.status = 'submitted' AND ta.is_test_trial = FALSE
        GROUP BY a.nct_id
        HAVING COUNT(*) >= ${MAX_ANNOTATIONS_PER_TRIAL}
      ) d)::int AS trials_ready_to_adjudicate
  `);
  const s = rows[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Reviewer dashboard</h1>
          <p className="text-sm text-slate-600 mt-1">
            Build reference keys, review experts&apos; test trials, and adjudicate disagreements on the rest.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            href="/review/trials"
            title="Test trials"
            description="Build reference keys for the trials that gate expert qualification."
            stat={`${s.refkeys_complete} / ${s.trial_count} reference keys complete`}
            accent="text-blue-700"
          />
          <Card
            href="/review/experts"
            title="Experts"
            description="Per-expert test-trial progress and reviews."
            stat={
              s.pending_test_reviews > 0
                ? `${s.pending_test_reviews} pending test review${s.pending_test_reviews === 1 ? '' : 's'}`
                : `${s.expert_count} expert${s.expert_count === 1 ? '' : 's'}`
            }
            accent={s.pending_test_reviews > 0 ? 'text-amber-700' : 'text-slate-700'}
          />
          <Card
            href="/review/adjudicate"
            title="Adjudicate"
            description={`Resolve disagreements on trials with ${MAX_ANNOTATIONS_PER_TRIAL} submitted annotations.`}
            stat={
              s.trials_ready_to_adjudicate > 0
                ? `${s.trials_ready_to_adjudicate} trial${s.trials_ready_to_adjudicate === 1 ? '' : 's'} ready to adjudicate`
                : 'No trials ready yet'
            }
            accent={s.trials_ready_to_adjudicate > 0 ? 'text-purple-700' : 'text-slate-700'}
          />
          <Card
            href="/review/scores"
            title="Scores"
            description="Per-expert F1 across their test trials."
            stat=""
            accent="text-slate-700"
          />
        </div>
      </main>
    </div>
  );
}

function Card({
  href, title, description, stat, accent,
}: { href: string; title: string; description: string; stat: string; accent: string }) {
  return (
    <Link
      href={href}
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30 hover:border-blue-400 transition"
    >
      <div className="text-lg font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-600 mt-1">{description}</div>
      {stat && <div className={`text-xs mt-3 font-semibold ${accent}`}>{stat}</div>}
    </Link>
  );
}
