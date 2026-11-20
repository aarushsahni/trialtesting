'use server';

// Reviewer-side adjudication of disagreements on non-test annotations.

import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { COHORT_MAP_FIELD, CohortMap } from '@/lib/adjudication-rows';
import { CancerType, FieldValue, TRIAL_LEVEL_SENTINEL } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Trial-level / cohort-existence / etc. adjudications use the sentinel
// TRIAL_LEVEL_SENTINEL ('__TRIAL__' in src/lib/types.ts) for cohortKey and/or
// cancerType so the 4-column PK still applies.
export async function adjudicateFieldAction(opts: {
  nctId: string;
  cohortKey: string;
  cancerType: CancerType | string;
  fieldKey: string;
  value: FieldValue;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  await query(`
    INSERT INTO trial_adjudications (nct_id, cohort_key, cancer_type, field_key, final_value, decided_by, decided_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
    ON CONFLICT (nct_id, cohort_key, cancer_type, field_key) DO UPDATE
      SET final_value = EXCLUDED.final_value,
          decided_by = EXCLUDED.decided_by,
          decided_at = NOW()
  `, [opts.nctId, opts.cohortKey, opts.cancerType, opts.fieldKey, JSON.stringify({ v: opts.value }), session.userId]);
  return { ok: true };
}

export async function clearAdjudicationAction(opts: {
  nctId: string;
  cohortKey: string;
  cancerType: CancerType | string;
  fieldKey: string;
}): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  await query(`
    DELETE FROM trial_adjudications
    WHERE nct_id = $1 AND cohort_key = $2 AND cancer_type = $3 AND field_key = $4
  `, [opts.nctId, opts.cohortKey, opts.cancerType, opts.fieldKey]);
  return { ok: true };
}

// Several decisions in one round trip ("use annotator X for the rest of this cohort").
export async function adjudicateFieldsAction(opts: {
  nctId: string;
  items: { cohortKey: string; cancerType: string; fieldKey: string; value: FieldValue }[];
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }
  if (opts.items.length === 0) return { ok: true };

  await query(`
    INSERT INTO trial_adjudications (nct_id, cohort_key, cancer_type, field_key, final_value, decided_by, decided_at)
    SELECT $1::text, i.cohort_key, i.cancer_type, i.field_key, i.final_value, $2::uuid, NOW()
    FROM jsonb_to_recordset($3::jsonb) AS i(cohort_key text, cancer_type text, field_key text, final_value jsonb)
    ON CONFLICT (nct_id, cohort_key, cancer_type, field_key) DO UPDATE
      SET final_value = EXCLUDED.final_value,
          decided_by = EXCLUDED.decided_by,
          decided_at = NOW()
  `, [
    opts.nctId,
    session.userId,
    JSON.stringify(opts.items.map((it) => ({
      cohort_key: it.cohortKey, cancer_type: it.cancerType, field_key: it.fieldKey, final_value: { v: it.value },
    }))),
  ]);
  return { ok: true };
}

// Save the reviewer's cohort pairing (annotator-2 cohortKey → annotator-1
// cohortKey, '' = unpaired), or clear it with map = null to go back to the
// automatic pairing. Decisions in cohorts whose pairing changed are cleared,
// because they were made against a different pair of cohorts.
export async function setAdjudicationCohortMapAction(opts: {
  nctId: string;
  map: CohortMap | null;
  clearCohortKeys: string[];
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  if (opts.clearCohortKeys.length > 0) {
    await query(
      `DELETE FROM trial_adjudications WHERE nct_id = $1 AND cohort_key = ANY($2::text[])`,
      [opts.nctId, opts.clearCohortKeys],
    );
  }
  if (opts.map === null) {
    await query(
      `DELETE FROM trial_adjudications WHERE nct_id = $1 AND cohort_key = $2 AND cancer_type = $2 AND field_key = $3`,
      [opts.nctId, TRIAL_LEVEL_SENTINEL, COHORT_MAP_FIELD],
    );
    return { ok: true };
  }
  await query(`
    INSERT INTO trial_adjudications (nct_id, cohort_key, cancer_type, field_key, final_value, decided_by, decided_at)
    VALUES ($1, $2, $2, $3, $4::jsonb, $5, NOW())
    ON CONFLICT (nct_id, cohort_key, cancer_type, field_key) DO UPDATE
      SET final_value = EXCLUDED.final_value,
          decided_by = EXCLUDED.decided_by,
          decided_at = NOW()
  `, [opts.nctId, TRIAL_LEVEL_SENTINEL, COHORT_MAP_FIELD, JSON.stringify({ v: opts.map }), session.userId]);
  return { ok: true };
}
