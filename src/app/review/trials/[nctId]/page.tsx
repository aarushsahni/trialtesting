import { notFound, redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, ReferenceKeyRow, TrialRow } from '@/lib/db';
import { TrialAnswers, emptyTrialAnswers } from '@/lib/types';
import { ReferenceKeyEditor } from './ReferenceKeyEditor';
import { getCurrentGuide } from '@/lib/guide-store';
import { parseGuideHelpText } from '@/lib/guide-parser';
import { parseCtgovAgeYears } from '@/lib/ctgov';

export const dynamic = 'force-dynamic';

export default async function ReferenceKeyPage({
  params,
}: { params: Promise<{ nctId: string }> }) {
  const { nctId } = await params;
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const [trials, keys, orderedRows] = await Promise.all([
    query<TrialRow>(`SELECT * FROM trials WHERE nct_id = $1`, [nctId]),
    query<ReferenceKeyRow & { built_by_name: string | null }>(`
      SELECT rk.*, u.name AS built_by_name
      FROM reference_keys rk
      LEFT JOIN users u ON u.id = rk.built_by_reviewer_id
      WHERE rk.nct_id = $1
    `, [nctId]),
    query<{ nct_id: string }>(`SELECT nct_id FROM trials ORDER BY position, nct_id`),
  ]);

  const trial = trials[0];
  if (!trial) notFound();

  const orderedIds = orderedRows.map((r) => r.nct_id);
  const idx = orderedIds.indexOf(nctId);
  const prevNctId = idx > 0 ? orderedIds[idx - 1] : null;
  const nextNctId = idx >= 0 && idx < orderedIds.length - 1 ? orderedIds[idx + 1] : null;

  const savedKey = keys[0]?.key_data as unknown as TrialAnswers | undefined;
  // Don't seed cancerTypes from trials.assigned_cancer_types — the reviewer
  // labels them as part of building the reference key. Min age is the one
  // exception: CT.gov's value is a verbatim fact about the trial that the
  // reviewer would otherwise just retype.
  const initial: TrialAnswers = savedKey && Array.isArray(savedKey.cohorts)
    ? { ...emptyTrialAnswers(trial.nct_id), ...savedKey }
    : {
        ...emptyTrialAnswers(trial.nct_id),
        minAge: parseCtgovAgeYears(trial.ctgov_min_age),
      };
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
