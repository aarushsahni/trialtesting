import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, QualificationSetRow, QualificationTrialRow, ReferenceKeyRow } from '@/lib/db';
import { BlockKey, TrialAnswers } from '@/lib/types';
import { ReferenceKeyEditor } from './ReferenceKeyEditor';
import { getCurrentGuide } from '@/lib/guide-store';
import { parseGuideHelpText } from '@/lib/guide-parser';

export const dynamic = 'force-dynamic';

export default async function ReferenceKeyPage({
  params,
}: { params: Promise<{ setId: string; nctId: string }> }) {
  const { setId, nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/expert');

  const [sets, trials, keys] = await Promise.all([
    query<QualificationSetRow>(`SELECT * FROM qualification_sets WHERE id = $1`, [setId]),
    query<QualificationTrialRow>(`SELECT * FROM qualification_trials WHERE nct_id = $1`, [nctId]),
    query<ReferenceKeyRow & { built_by_name: string | null }>(`
      SELECT rk.*, u.name AS built_by_name
      FROM reference_keys rk
      LEFT JOIN users u ON u.id = rk.built_by_annotator_id
      WHERE rk.qualification_set_id = $1 AND rk.nct_id = $2
    `, [setId, nctId]),
  ]);

  const set = sets[0];
  const trial = trials[0];
  if (!set || !trial) notFound();

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

  const initial = (keys[0]?.key_data ?? {}) as TrialAnswers;
  const initialComplete = keys[0]?.complete ?? false;
  const initialMeta = {
    notes: keys[0]?.notes ?? '',
    flags: keys[0]?.flags ?? {},
  };
  const lastEditedBy = keys[0] && keys[0].built_at
    ? { name: keys[0].built_by_name ?? 'someone', at: keys[0].built_at }
    : null;

  const guide = await getCurrentGuide();
  const helpTextMap = guide ? parseGuideHelpText(guide.markdown) : {};

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
      initialMeta={initialMeta}
      lastEditedBy={lastEditedBy}
      helpTextMap={helpTextMap}
      prevNctId={prevNctId}
      nextNctId={nextNctId}
    />
  );
}
