'use server';

// Reviewer-side adjudication of disagreements on non-test annotations.

import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { CancerType, FieldValue } from '@/lib/types';

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
