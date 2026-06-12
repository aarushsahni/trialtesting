import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, CorpusReviewRow, CorpusTrialRow } from '@/lib/db';
import { BlockKey, TrialAnswers } from '@/lib/types';
import { claimOrResumeCorpusReview } from '@/app/actions/corpus';
import { getCurrentGuide } from '@/lib/guide-store';
import { parseGuideHelpText } from '@/lib/guide-parser';
import { CorpusReviewEditor } from './CorpusReviewEditor';

export const dynamic = 'force-dynamic';

export default async function CorpusTrialPage({
  params,
}: { params: Promise<{ nctId: string }> }) {
  const { nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/review');

  // Claim a slot (or resume the existing review). Fails if both slots are
  // taken by others or the expert isn't approved.
  const claim = await claimOrResumeCorpusReview(nctId);
  if (!claim.ok) redirect('/expert/corpus');

  const [trials, reviews] = await Promise.all([
    query<CorpusTrialRow>(`SELECT * FROM corpus_trials WHERE nct_id = $1`, [nctId]),
    query<CorpusReviewRow>(
      `SELECT * FROM corpus_reviews WHERE nct_id = $1 AND expert_id = $2`,
      [nctId, session.userId],
    ),
  ]);
  const trial = trials[0];
  const review = reviews[0];
  if (!trial || !review) notFound();

  const guide = await getCurrentGuide();
  const helpTextMap = guide ? parseGuideHelpText(guide.markdown) : {};

  return (
    <CorpusReviewEditor
      session={{ name: session.name }}
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
      initialAnswers={(review.answers ?? {}) as TrialAnswers}
      initialSubmitted={review.status === 'submitted'}
      initialMeta={{ notes: review.notes ?? '', flags: (review.flags ?? {}) as Record<string, boolean> }}
      helpTextMap={helpTextMap}
    />
  );
}
