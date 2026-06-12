import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, CorpusAdjudicationRow, CorpusTrialRow } from '@/lib/db';
import { BlockKey, TrialAnswers } from '@/lib/types';
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

export default async function CorpusAdjudicationPage({
  params,
}: { params: Promise<{ nctId: string }> }) {
  const { nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const [trials, reviews, adjudications] = await Promise.all([
    query<CorpusTrialRow>(`SELECT * FROM corpus_trials WHERE nct_id = $1`, [nctId]),
    query<ReviewWithName>(`
      SELECT cr.expert_id, u.name AS expert_name, cr.answers, cr.notes, cr.flags,
             cr.status, cr.submitted_at, cr.updated_at
      FROM corpus_reviews cr
      JOIN users u ON u.id = cr.expert_id
      WHERE cr.nct_id = $1
      ORDER BY cr.claimed_at
    `, [nctId]),
    query<CorpusAdjudicationRow>(
      `SELECT * FROM corpus_adjudications WHERE nct_id = $1`,
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
      blocks={trial.assigned_blocks as BlockKey[]}
      aiAnswers={(trial.ai_answers ?? {}) as TrialAnswers}
      reviews={reviews.map((r) => ({
        expertName: r.expert_name,
        answers: (r.answers ?? {}) as TrialAnswers,
        notes: r.notes,
        status: r.status,
        submittedAt: r.submitted_at,
        updatedAt: r.updated_at,
      }))}
      initialAdjudications={Object.fromEntries(
        adjudications.map((a) => [`${a.block_key}.${a.field_key}`, a.final_value.v]),
      )}
    />
  );
}
