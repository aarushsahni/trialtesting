import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { MarkReviewedButton } from './MarkReviewedButton';

export const dynamic = 'force-dynamic';

interface AssignmentRow {
  nct_id: string;
  brief_title: string;
  position: number;
  is_test_trial: boolean;
  test_reviewed_at: string | null;
  status: 'in_progress' | 'submitted' | null;
  scored_at: string | null;
  overall_f1: number | null;
}

export default async function ExpertDetail({
  params,
}: { params: Promise<{ expertId: string }> }) {
  const { expertId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const users = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 AND role = 'expert'`,
    [expertId],
  );
  if (!users[0]) notFound();

  const rows = await query<AssignmentRow>(`
    SELECT t.nct_id, t.brief_title, t.position,
           ta.is_test_trial, ta.test_reviewed_at,
           a.status, a.scored_at,
           (a.score_data->>'overallF1')::float AS overall_f1
    FROM trial_assignments ta
    JOIN trials t ON t.nct_id = ta.nct_id
    LEFT JOIN annotations a ON a.nct_id = ta.nct_id AND a.expert_id = ta.expert_id
    WHERE ta.expert_id = $1
    ORDER BY ta.is_test_trial DESC, t.position, t.nct_id
  `, [expertId]);

  const tests = rows.filter((r) => r.is_test_trial);
  const nonTests = rows.filter((r) => !r.is_test_trial);
  const pending = tests.filter((r) => r.status === 'submitted' && r.test_reviewed_at === null);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review/experts" className="text-sm text-blue-600 hover:underline">← Experts</Link>
        <div className="mt-3 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">{users[0].name}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {tests.length} test trials · {nonTests.length} non-test trials
            {pending.length > 0 && <span className="ml-2 text-amber-700">· {pending.length} pending review</span>}
          </p>
        </div>

        {tests.length > 0 && (
          <Section title={`Test trials (${tests.length})`}>
            {tests.map((t) => (
              <TestRow key={t.nct_id} expertId={expertId} t={t} />
            ))}
          </Section>
        )}

        <Section title={`Other trials (${nonTests.length})`}>
          {nonTests.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No non-test trials assigned.</div>
          ) : (
            nonTests.map((t) => <NonTestRow key={t.nct_id} t={t} />)
          )}
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">{title}</h2>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function TestRow({ expertId, t }: { expertId: string; t: AssignmentRow }) {
  const reviewed = t.test_reviewed_at !== null;
  const submitted = t.status === 'submitted';
  const dot = reviewed ? 'bg-emerald-500'
    : submitted ? 'bg-amber-400'
    : t.status === 'in_progress' ? 'bg-blue-300'
    : 'bg-slate-200';

  return (
    <div className="p-4 flex items-start gap-3">
      <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-mono">
          <Link href={`/review/experts/${expertId}/${t.nct_id}`} className="hover:underline text-blue-600">{t.nct_id}</Link>
        </div>
        <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
          <span>
            {t.status === null ? 'Not started'
              : t.status === 'in_progress' ? 'In progress'
              : 'Submitted'}
          </span>
          {t.overall_f1 != null && (
            <span>· F1 <strong className="text-slate-800">{t.overall_f1.toFixed(3)}</strong></span>
          )}
          {reviewed && (
            <span>· Reviewed {new Date(t.test_reviewed_at!).toLocaleString()}</span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 flex items-center gap-3">
        <Link
          href={`/review/experts/${expertId}/${t.nct_id}`}
          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
        >
          View →
        </Link>
        <MarkReviewedButton
          expertId={expertId}
          nctId={t.nct_id}
          initialReviewed={reviewed}
          canReview={submitted || reviewed}
        />
      </div>
    </div>
  );
}

function NonTestRow({ t }: { t: AssignmentRow }) {
  const dot = t.status === 'submitted' ? 'bg-emerald-500'
    : t.status === 'in_progress' ? 'bg-amber-400'
    : 'bg-slate-200';
  return (
    <div className="p-4 flex items-start gap-3">
      <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-mono">{t.nct_id}</div>
        <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {t.status === null ? 'Not started' : t.status === 'in_progress' ? 'In progress' : 'Submitted'}
        </div>
      </div>
    </div>
  );
}
