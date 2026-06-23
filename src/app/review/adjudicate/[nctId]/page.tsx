import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, TrialAdjudicationRow, TrialRow } from '@/lib/db';
import { TrialAnswers, emptyTrialAnswers } from '@/lib/types';
import { AdjudicationView } from './AdjudicationView';

export const dynamic = 'force-dynamic';

interface ReviewWithName {
  expert_id: string;
  expert_name: string;
  answers: Record<string, unknown>;
  notes: string;
  flags: Record<string, boolean>;
  status: 'in_progress' | 'submitted';
  submitted_at: string | null;
  updated_at: string;
}

export default async function AdjudicationPage({
  params,
}: { params: Promise<{ nctId: string }> }) {
  const { nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const [trials, reviews, adjudications] = await Promise.all([
    query<TrialRow>(`SELECT * FROM trials WHERE nct_id = $1`, [nctId]),
    query<ReviewWithName>(`
      SELECT a.expert_id, u.name AS expert_name, a.answers, a.notes, a.flags,
             a.status, a.submitted_at, a.updated_at
      FROM annotations a
      JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
      JOIN users u ON u.id = a.expert_id
      WHERE a.nct_id = $1 AND ta.is_test_trial = FALSE
      ORDER BY a.started_at
    `, [nctId]),
    query<TrialAdjudicationRow>(
      `SELECT * FROM trial_adjudications WHERE nct_id = $1`,
      [nctId],
    ),
  ]);

  const trial = trials[0];
  if (!trial) notFound();

  return (
    <AdjudicationView
      sessionName={session.name}
      trial={{
        nctId: trial.nct_id,
        briefTitle: trial.brief_title,
        briefSummary: trial.brief_summary,
        eligibilityRaw: trial.eligibility_raw,
        conditions: trial.conditions,
      }}
      reviews={reviews.map((r) => {
        const ans = (r.answers ?? {}) as unknown as TrialAnswers;
        return {
          expertName: r.expert_name,
          answers: Array.isArray(ans.cohorts) ? ans : emptyTrialAnswers(trial.nct_id),
          notes: r.notes,
          status: r.status,
          submittedAt: r.submitted_at,
          updatedAt: r.updated_at,
        };
      })}
      initialAdjudications={Object.fromEntries(
        adjudications.map((a) => [`${a.cohort_key}|${a.cancer_type}|${a.field_key}`, a.final_value.v]),
      )}
    />
  );
}
