import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, AnnotationRow, TrialAssignmentRow, TrialRow } from '@/lib/db';
import { TrialAnswers, emptyTrialAnswers } from '@/lib/types';
import { TrialHighlights } from '@/lib/highlights';
import { startOrResumeAnnotation } from '@/app/actions/annotation';
import { getCurrentGuide } from '@/lib/guide-store';
import { parseGuideHelpText } from '@/lib/guide-parser';
import { parseCtgovAgeYears } from '@/lib/ctgov';
import { AnnotationEditor } from './AnnotationEditor';

export const dynamic = 'force-dynamic';

export default async function ExpertTrialPage({
  params,
}: { params: Promise<{ nctId: string }> }) {
  const { nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/review');

  const start = await startOrResumeAnnotation(nctId);
  if (!start.ok || !start.annotationId) {
    redirect('/expert');
  }

  const [trials, assignments, annotations] = await Promise.all([
    query<TrialRow>(`SELECT * FROM trials WHERE nct_id = $1`, [nctId]),
    query<TrialAssignmentRow>(
      `SELECT * FROM trial_assignments WHERE expert_id = $1 AND nct_id = $2`,
      [session.userId, nctId],
    ),
    query<AnnotationRow>(`SELECT * FROM annotations WHERE id = $1`, [start.annotationId]),
  ]);
  const trial = trials[0];
  const assignment = assignments[0];
  const annotation = annotations[0];
  if (!trial || !assignment || !annotation) notFound();

  // Resolve initial answers for the editor:
  //   1. Any saved answers in the annotation row → use them as-is.
  //   2. Otherwise → empty TrialAnswers seeded only with the CT.gov min age.
  // Annotation is fully manual — no AI prefill, no cohort scaffolding.
  const saved = annotation.answers as unknown as TrialAnswers | undefined;
  const hasSavedShape = !!saved && Array.isArray(saved.cohorts);

  const initial: TrialAnswers = hasSavedShape
    ? saved!
    : {
        ...emptyTrialAnswers(trial.nct_id, session.userId),
        minAge: parseCtgovAgeYears(trial.ctgov_min_age),
      };

  const guide = await getCurrentGuide();
  const helpTextMap = guide ? parseGuideHelpText(guide.markdown) : {};

  const initialHighlights: TrialHighlights = (annotation.highlights ?? {}) as TrialHighlights;

  return (
    <AnnotationEditor
      session={{ name: session.name }}
      isTestTrial={assignment.is_test_trial}
      testReviewed={!!assignment.test_reviewed_at}
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
      initialAnswers={initial}
      initialSubmitted={annotation.status === 'submitted'}
      initialMeta={{
        notes: annotation.notes ?? '',
        flags: (annotation.flags ?? {}) as Record<string, boolean>,
      }}
      initialHighlights={initialHighlights}
      helpTextMap={helpTextMap}
    />
  );
}
