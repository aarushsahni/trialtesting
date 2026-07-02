import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { CancerType, TrialAnswers } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PoolRow {
  nct_id: string;
  brief_title: string;
  position: number;
  is_test_trial: boolean;
  test_reviewed_at: string | null;
  status: 'in_progress' | 'submitted' | null;
  answers: Record<string, unknown> | null;
}

export default async function ExpertDashboard() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/review');

  const rows = await query<PoolRow>(`
    SELECT t.nct_id, t.brief_title, t.position,
           ta.is_test_trial, ta.test_reviewed_at,
           a.status, a.answers
    FROM trial_assignments ta
    JOIN trials t ON t.nct_id = ta.nct_id
    LEFT JOIN annotations a ON a.nct_id = ta.nct_id AND a.expert_id = ta.expert_id
    WHERE ta.expert_id = $1
    ORDER BY ta.is_test_trial DESC, t.position, t.nct_id
  `, [session.userId]);

  const tests = rows.filter((r) => r.is_test_trial);
  const nonTests = rows.filter((r) => !r.is_test_trial);
  const pendingTests = tests.filter((r) => r.test_reviewed_at === null);
  const allTestsReviewed = tests.length > 0 && pendingTests.length === 0;
  const noTests = tests.length === 0;
  const unlocked = noTests || allTestsReviewed;

  const submittedTests = tests.filter((r) => r.status === 'submitted').length;
  const reviewedTests = tests.filter((r) => r.test_reviewed_at !== null).length;
  const submittedNonTests = nonTests.filter((r) => r.status === 'submitted').length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Your trials</h1>
          <p className="text-sm text-slate-600 mt-1">
            Label each trial against the eligibility criteria.{' '}
            {tests.length > 0 && (
              <>The first {tests.length} are <strong>test trials</strong> — once you submit them and the reviewer signs off, the rest unlock.</>
            )}
          </p>
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-900">
            📖 Before you start, skim the <a href="/guide" className="underline font-medium">annotation guide</a> — especially
            the &quot;General annotation rules&quot; section.
          </div>
        </div>

        {tests.length > 0 && (
          <div className={`mb-8 rounded-2xl border p-5 ${unlocked ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-900">Test trial progress</h2>
              {unlocked && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
                  Unlocked
                </span>
              )}
            </div>
            <p className="text-sm text-slate-700 mt-1">
              <strong>{submittedTests}</strong> / {tests.length} submitted ·{' '}
              <strong>{reviewedTests}</strong> / {tests.length} reviewed
              {!unlocked && <span className="ml-2 text-amber-700">· Main trials lock until all test trials are reviewed</span>}
            </p>
          </div>
        )}

        {tests.length > 0 && (
          <Section title={`Test trials (${tests.length})`}>
            {tests.map((t) => (
              <TrialRow key={t.nct_id} t={t} clickable />
            ))}
          </Section>
        )}

        <Section title={
          tests.length > 0
            ? `Main trials (${nonTests.length}) · ${submittedNonTests} submitted`
            : `Trials (${nonTests.length}) · ${submittedNonTests} submitted`
        }>
          {nonTests.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No main trials assigned yet.</div>
          ) : (
            nonTests.map((t) => (
              <TrialRow key={t.nct_id} t={t} clickable={unlocked} />
            ))
          )}
        </Section>

        {rows.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No trials have been assigned to you yet. Check back later.
          </div>
        )}
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

function countPopulated(ta: TrialAnswers): number {
  let n = 0;
  if (ta.cancerTypes?.length) n++;
  if (ta.minAge != null) n++;
  if (ta.maxAge != null) n++;
  if (ta.ecogMin != null) n++;
  if (ta.ecogMax != null) n++;
  for (const cohort of ta.cohorts ?? []) {
    if (cohort.minAge != null) n++;
    if (cohort.maxAge != null) n++;
    if (cohort.ecogMin != null) n++;
    if (cohort.ecogMax != null) n++;
    for (const ct of Object.keys(cohort.applicableCancerTypes ?? {}) as CancerType[]) {
      const block = BLOCKS[ct];
      if (!block) continue;
      const answers = cohort.applicableCancerTypes[ct] ?? {};
      for (const v of Object.values(answers)) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) n++;
      }
    }
  }
  return n;
}

function TrialRow({ t, clickable }: { t: PoolRow; clickable: boolean }) {
  const ta = (t.answers ?? null) as unknown as TrialAnswers | null;
  const populated = ta && Array.isArray(ta.cohorts) ? countPopulated(ta) : 0;
  const started = populated > 0;

  let dot = 'bg-slate-300';
  let badge: React.ReactNode = null;
  if (t.is_test_trial) {
    if (t.test_reviewed_at) {
      dot = 'bg-emerald-500';
      badge = <Badge cls="bg-emerald-100 text-emerald-800">Test · reviewed</Badge>;
    } else if (t.status === 'submitted') {
      dot = 'bg-blue-400';
      badge = <Badge cls="bg-blue-100 text-blue-800">Test · awaiting review</Badge>;
    } else if (started) {
      dot = 'bg-amber-400';
      badge = <Badge cls="bg-amber-100 text-amber-800">Test · in progress</Badge>;
    } else {
      badge = <Badge cls="bg-amber-100 text-amber-800">Test trial</Badge>;
    }
  } else if (!clickable) {
    dot = 'bg-slate-200';
    badge = <Badge cls="bg-slate-100 text-slate-600">Locked</Badge>;
  } else if (t.status === 'submitted') {
    dot = 'bg-emerald-500';
    badge = <Badge cls="bg-emerald-100 text-emerald-800">Submitted</Badge>;
  } else if (started) {
    dot = 'bg-amber-400';
    badge = <Badge cls="bg-amber-100 text-amber-800">In progress</Badge>;
  } else {
    badge = <Badge cls="bg-slate-100 text-slate-600">Open</Badge>;
  }

  const inner = (
    <div className="flex items-start gap-3 p-4">
      <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-mono flex items-center gap-2 flex-wrap">
          <span>{t.nct_id}</span>
        </div>
        <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
      </div>
      <div className="flex-shrink-0">{badge}</div>
    </div>
  );

  if (!clickable) {
    return <div className="opacity-60 cursor-not-allowed">{inner}</div>;
  }
  return (
    <Link href={`/expert/${t.nct_id}`} className="block hover:bg-blue-50 transition">
      {inner}
    </Link>
  );
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}
