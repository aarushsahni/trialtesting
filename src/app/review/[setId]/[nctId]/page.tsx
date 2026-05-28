import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, QualificationAttemptRow, QualificationSetRow, QualificationTrialRow } from '@/lib/db';
import { BlockKey, TrialAnswers } from '@/lib/types';
import { AttemptEditor } from './AttemptEditor';
import { startOrResumeAttempt } from '@/app/actions/review';
import { getCurrentGuide } from '@/lib/guide-store';
import { parseGuideHelpText } from '@/lib/guide-parser';

export const dynamic = 'force-dynamic';

export default async function ReviewerTrialPage({
  params,
}: { params: Promise<{ setId: string; nctId: string }> }) {
  const { setId, nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/annotate');

  const sets = await query<QualificationSetRow>(
    `SELECT * FROM qualification_sets WHERE id = $1`,
    [setId],
  );
  const set = sets[0];
  if (!set) notFound();
  if (!set.locked_at) redirect('/review');

  const start = await startOrResumeAttempt(setId);
  if (!start.ok || !start.attemptId) {
    redirect('/review');
  }

  const [trials, attempts] = await Promise.all([
    query<QualificationTrialRow>(`SELECT * FROM qualification_trials WHERE nct_id = $1`, [nctId]),
    query<QualificationAttemptRow>(
      `SELECT * FROM qualification_attempts WHERE id = $1`,
      [start.attemptId],
    ),
  ]);
  const trial = trials[0];
  const attempt = attempts[0];
  if (!trial || !attempt) notFound();

  const allAnswers = (attempt.answers ?? {}) as Record<string, TrialAnswers>;
  const initial: TrialAnswers = allAnswers[nctId] ?? {};
  const initialMeta = (attempt.per_trial_meta ?? {})[nctId] ?? { notes: '', flags: {} };

  // Prev / next within the set — order matches the trial list page
  const orderedIdRows = await query<{ nct_id: string }>(`
    SELECT qt.nct_id FROM qualification_trials qt
    JOIN qualification_sets qs ON qt.nct_id = ANY(qs.trial_nct_ids)
    WHERE qs.id = $1
    ORDER BY qt.assigned_blocks[1], qt.nct_id
  `, [setId]);
  const orderedIds = orderedIdRows.map((r) => r.nct_id);
  const idx = orderedIds.indexOf(nctId);
  const prevNctId = idx > 0 ? orderedIds[idx - 1] : null;
  const nextNctId = idx < orderedIds.length - 1 ? orderedIds[idx + 1] : null;

  const guide = await getCurrentGuide();
  const helpTextMap = guide ? parseGuideHelpText(guide.markdown) : {};

  return (
    <AttemptEditor
      session={{ name: session.name, role: session.role }}
      setId={setId}
      setName={set.name}
      attemptId={attempt.id}
      submitted={attempt.status !== 'in_progress'}
      trial={{
        nctId: trial.nct_id,
        briefTitle: trial.brief_title,
        briefSummary: trial.brief_summary,
        detailedDescription: trial.detailed_description,
        eligibilityRaw: trial.eligibility_raw,
        conditions: trial.conditions,
        interventions: trial.interventions,
        overallStatus: trial.overall_status,
        studyType: trial.study_type,
        phases: trial.phases,
        ctgovSex: trial.ctgov_sex,
        ctgovMinAge: trial.ctgov_min_age,
        ctgovMaxAge: trial.ctgov_max_age,
      }}
      blocks={trial.assigned_blocks as BlockKey[]}
      allAnswers={allAnswers}
      initialForTrial={initial}
      initialComplete={(attempt.completed_nct_ids ?? []).includes(nctId)}
      initialMeta={initialMeta}
      helpTextMap={helpTextMap}
      prevNctId={prevNctId}
      nextNctId={nextNctId}
    />
  );
}
