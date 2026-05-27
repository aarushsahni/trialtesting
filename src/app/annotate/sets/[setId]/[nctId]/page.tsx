import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, QualificationSetRow, QualificationTrialRow, ReferenceKeyRow } from '@/lib/db';
import { BlockKey, TrialAnswers } from '@/lib/types';
import { ReferenceKeyEditor } from './ReferenceKeyEditor';

export const dynamic = 'force-dynamic';

export default async function ReferenceKeyPage({
  params,
}: { params: Promise<{ setId: string; nctId: string }> }) {
  const { setId, nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'annotator') redirect('/review');

  const [sets, trials, keys] = await Promise.all([
    query<QualificationSetRow>(`SELECT * FROM qualification_sets WHERE id = $1`, [setId]),
    query<QualificationTrialRow>(`SELECT * FROM qualification_trials WHERE nct_id = $1`, [nctId]),
    query<ReferenceKeyRow>(
      `SELECT * FROM reference_keys WHERE qualification_set_id = $1 AND nct_id = $2`,
      [setId, nctId],
    ),
  ]);

  const set = sets[0];
  const trial = trials[0];
  if (!set || !trial) notFound();

  // Prev / next within the set
  const allIds = set.trial_nct_ids;
  const idx = allIds.indexOf(nctId);
  const prevNctId = idx > 0 ? allIds[idx - 1] : null;
  const nextNctId = idx < allIds.length - 1 ? allIds[idx + 1] : null;

  const initial = (keys[0]?.key_data ?? {}) as TrialAnswers;
  const initialComplete = keys[0]?.complete ?? false;

  return (
    <ReferenceKeyEditor
      session={{ name: session.name, role: session.role }}
      setId={setId}
      setName={set.name}
      setLocked={!!set.locked_at}
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
      initial={initial}
      initialComplete={initialComplete}
      prevNctId={prevNctId}
      nextNctId={nextNctId}
    />
  );
}
