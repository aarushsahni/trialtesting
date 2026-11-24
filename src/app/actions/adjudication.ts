'use server';

// Reviewer-side adjudication of disagreements on non-test annotations.

import { randomUUID } from 'crypto';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  ADDED_COHORT_FIELD, ADDED_COHORT_PREFIX, ADJUDICATION_NOTE_FIELD, AddedCohort, COHORT_BOUND_DEFS, COHORT_MAP_FIELD,
  CohortMap,
} from '@/lib/adjudication-rows';
import { ALL_CANCER_TYPES, CancerType, FieldValue, TRIAL_LEVEL_SENTINEL } from '@/lib/types';

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

// Save the adjudicator's explanation of their decisions on a trial (one note
// per trial, stored as a sentinel row). An empty note removes the row.
export async function setAdjudicationNoteAction(opts: { nctId: string; note: string }): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const note = opts.note.trim().slice(0, 5000);
  if (!note) {
    await query(
      `DELETE FROM trial_adjudications WHERE nct_id = $1 AND cohort_key = $2 AND cancer_type = $2 AND field_key = $3`,
      [opts.nctId, TRIAL_LEVEL_SENTINEL, ADJUDICATION_NOTE_FIELD],
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
  `, [opts.nctId, TRIAL_LEVEL_SENTINEL, ADJUDICATION_NOTE_FIELD, JSON.stringify({ v: note }), session.userId]);
  return { ok: true };
}

function cleanCohort(displayName: string, cancerTypes: CancerType[]) {
  const name = displayName.trim().slice(0, 200);
  const types = ALL_CANCER_TYPES.filter((ct) => cancerTypes.includes(ct));
  if (!name) return { error: 'Give the cohort a name.' };
  if (types.length === 0) return { error: 'Pick at least one cancer type.' };
  return { name, types };
}

// Add a cohort neither annotator drew. Its age / ECOG bounds are saved as
// ordinary decisions, so they can be changed or cleared like any other field.
export async function addCohortAction(opts: {
  nctId: string;
  displayName: string;
  cancerTypes: CancerType[];
  bounds: Record<string, FieldValue>;
}): Promise<ActionResult & { cohort?: AddedCohort }> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }
  const clean = cleanCohort(opts.displayName, opts.cancerTypes);
  if ('error' in clean) return { ok: false, error: clean.error };

  const cohort: AddedCohort = {
    cohortKey: `${ADDED_COHORT_PREFIX}${randomUUID().slice(0, 8)}`,
    displayName: clean.name,
    cancerTypes: clean.types,
    createdAt: new Date().toISOString(),
  };
  const { cohortKey, ...record } = cohort;
  const items: { field_key: string; final_value: { v: unknown } }[] = [
    { field_key: ADDED_COHORT_FIELD, final_value: { v: record } },
  ];
  for (const fk of Object.keys(COHORT_BOUND_DEFS)) {
    if (typeof opts.bounds[fk] === 'number') items.push({ field_key: fk, final_value: { v: opts.bounds[fk] } });
  }
  await query(`
    INSERT INTO trial_adjudications (nct_id, cohort_key, cancer_type, field_key, final_value, decided_by, decided_at)
    SELECT $1::text, $2::text, $3::text, i.field_key, i.final_value, $4::uuid, NOW()
    FROM jsonb_to_recordset($5::jsonb) AS i(field_key text, final_value jsonb)
  `, [opts.nctId, cohortKey, TRIAL_LEVEL_SENTINEL, session.userId, JSON.stringify(items)]);
  return { ok: true, cohort };
}

// Rename an added cohort or change its cancer types. Values already entered
// under a removed cancer type are kept in case it is added back.
export async function updateAddedCohortAction(opts: {
  nctId: string;
  cohortKey: string;
  displayName: string;
  cancerTypes: CancerType[];
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }
  const clean = cleanCohort(opts.displayName, opts.cancerTypes);
  if ('error' in clean) return { ok: false, error: clean.error };

  const updated = await query(`
    UPDATE trial_adjudications
    SET final_value = jsonb_set(final_value, '{v}', (final_value->'v') || $4::jsonb), decided_by = $5, decided_at = NOW()
    WHERE nct_id = $1 AND cohort_key = $2 AND field_key = $3
    RETURNING nct_id
  `, [
    opts.nctId, opts.cohortKey, ADDED_COHORT_FIELD,
    JSON.stringify({ displayName: clean.name, cancerTypes: clean.types }), session.userId,
  ]);
  return updated.length > 0 ? { ok: true } : { ok: false, error: 'This cohort no longer exists — reload the page.' };
}

// Remove an added cohort and everything entered in it. The prefix check keeps
// this from ever touching decisions on the annotators' own cohorts.
export async function removeAddedCohortAction(opts: { nctId: string; cohortKey: string }): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }
  if (!opts.cohortKey.startsWith(ADDED_COHORT_PREFIX)) return { ok: false, error: 'Only added cohorts can be removed.' };

  await query(
    `DELETE FROM trial_adjudications WHERE nct_id = $1 AND cohort_key = $2`,
    [opts.nctId, opts.cohortKey],
  );
  return { ok: true };
}
