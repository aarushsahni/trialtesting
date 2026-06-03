import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, QualificationAttemptRow, QualificationSetRow, QualificationTrialRow } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockKey, TrialAnswers } from '@/lib/types';
import { SubmitTestButton } from './SubmitTestButton';
import { startOrResumeAttempt } from '@/app/actions/expert';

export const dynamic = 'force-dynamic';

export default async function TestSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/review');

  const sets = await query<QualificationSetRow>(
    `SELECT * FROM qualification_sets WHERE id = $1`,
    [setId],
  );
  const set = sets[0];
  if (!set) notFound();
  if (!set.locked_at) redirect('/expert');

  // Ensure attempt exists
  const start = await startOrResumeAttempt(setId);
  if (!start.ok || !start.attemptId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader name={session.name} role={session.role} />
        <main className="max-w-3xl mx-auto px-6 py-10 text-sm text-red-700">
          {start.error ?? 'Could not start attempt.'}
        </main>
      </div>
    );
  }

  const [trials, attempts] = await Promise.all([
    query<QualificationTrialRow>(`
      SELECT * FROM qualification_trials
      WHERE nct_id = ANY($1::text[])
      ORDER BY array_position($1::text[], nct_id)
    `, [set.trial_nct_ids]),
    query<QualificationAttemptRow>(
      `SELECT * FROM qualification_attempts WHERE id = $1`,
      [start.attemptId],
    ),
  ]);
  const attempt = attempts[0];
  const answers = (attempt?.answers ?? {}) as Record<string, TrialAnswers>;
  const completedSet = new Set(attempt?.completed_nct_ids ?? []);
  const submitted = attempt?.status !== 'in_progress';

  const trialsWithStatus = trials.map((t) => {
    const trialAnswers = answers[t.nct_id] ?? {};
    let populated = 0;
    for (const block of t.assigned_blocks as BlockKey[]) {
      const ba = trialAnswers[block] ?? {};
      for (const v of Object.values(ba)) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) populated++;
      }
    }
    return { ...t, populated, complete: completedSet.has(t.nct_id) };
  });
  const completeCount = trialsWithStatus.filter(t => t.complete).length;
  const inProgressCount = trialsWithStatus.filter(t => !t.complete && t.populated > 0).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/expert" className="text-sm text-blue-600 hover:underline">← Back</Link>
        <div className="mt-3 mb-8 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{set.name}</h1>
            <p className="text-sm text-slate-600 mt-1">
              <span className="font-bold text-slate-900">{completeCount}</span> / {trials.length} complete
              {inProgressCount > 0 && <span className="text-amber-700"> · {inProgressCount} in progress</span>}
              {submitted && (
                <span className="ml-3 text-emerald-700 font-semibold">· Submitted</span>
              )}
            </p>
          </div>
          {!submitted && (
            <SubmitTestButton attemptId={attempt!.id} disabled={completeCount < trials.length} />
          )}
        </div>

        {submitted && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-sm text-emerald-900">
            <strong>Your test has been submitted.</strong> Results are reviewed by
            the project lead — they&apos;ll be in touch.
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {trialsWithStatus.map((t) => {
            const started = t.populated > 0;
            const dotColor = t.complete ? 'bg-emerald-500' : started ? 'bg-amber-400' : 'bg-slate-300';
            const blocks = (t.assigned_blocks as BlockKey[]).map(b => BLOCKS[b]?.label ?? b);
            return (
              <Link
                key={t.nct_id}
                href={`/expert/${set.id}/${t.nct_id}`}
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
