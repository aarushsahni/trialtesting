'use server';

import { requireSession } from '@/lib/auth';
import { query, withTransaction } from '@/lib/db';
import { TrialAnswers } from '@/lib/types';
import { saveGuide } from '@/lib/guide-store';
import { scoreAnnotation } from '@/lib/scoring';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Ensure the trial exists and pull its schema_version_id (falling back to the
// most recent schema version if the trial row hasn't been stamped yet).
async function trialSchemaVersionId(nctId: string): Promise<string | null> {
  const rows = await query<{ schema_version_id: string | null }>(
    `SELECT schema_version_id FROM trials WHERE nct_id = $1`,
    [nctId],
  );
  if (rows.length === 0) return null;
  if (rows[0].schema_version_id) return rows[0].schema_version_id;
  const sv = await query<{ id: string }>(
    `SELECT id FROM schema_versions ORDER BY created_at DESC LIMIT 1`,
  );
  return sv[0]?.id ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Reference key (re-keyed on nct_id only)
// ──────────────────────────────────────────────────────────────────────────

export async function saveReferenceKeyAction(opts: {
  nctId: string;
  data: TrialAnswers;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const svId = await trialSchemaVersionId(opts.nctId);
  if (!svId) return { ok: false, error: 'Trial not found (or no schema version available).' };

  await query(`
    INSERT INTO reference_keys (nct_id, schema_version_id, key_data, built_by_reviewer_id, built_at)
    VALUES ($1, $2, $3::jsonb, $4, NOW())
    ON CONFLICT (nct_id) DO UPDATE
      SET key_data = EXCLUDED.key_data,
          built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
          built_at = NOW()
  `, [opts.nctId, svId, JSON.stringify(opts.data), session.userId]);
  return { ok: true };
}

export async function saveReferenceKeyMetaAction(opts: {
  nctId: string; notes: string; flags: Record<string, boolean>;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const svId = await trialSchemaVersionId(opts.nctId);
  if (!svId) return { ok: false, error: 'Trial not found.' };

  await query(`
    INSERT INTO reference_keys (nct_id, schema_version_id, key_data, notes, flags, built_by_reviewer_id, built_at)
    VALUES ($1, $2, '{}'::jsonb, $3, $4::jsonb, $5, NOW())
    ON CONFLICT (nct_id) DO UPDATE
      SET notes = EXCLUDED.notes,
          flags = EXCLUDED.flags,
          built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
          built_at = NOW()
  `, [opts.nctId, svId, opts.notes, JSON.stringify(opts.flags), session.userId]);
  return { ok: true };
}

export async function markReferenceKeyCompleteAction(opts: {
  nctId: string; complete: boolean;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const svId = await trialSchemaVersionId(opts.nctId);
  if (!svId) return { ok: false, error: 'Trial not found.' };

  await query(`
    INSERT INTO reference_keys (nct_id, schema_version_id, key_data, complete, built_by_reviewer_id, built_at)
    VALUES ($1, $2, '{}'::jsonb, $3, $4, NOW())
    ON CONFLICT (nct_id) DO UPDATE
      SET complete = EXCLUDED.complete,
          built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
          built_at = NOW()
  `, [opts.nctId, svId, opts.complete, session.userId]);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Cohort matching (test-trial scoring)
// ──────────────────────────────────────────────────────────────────────────

// Save the reviewer's cohort-mapping for one expert's test-trial annotation
// and recompute the score. Missing keys in the map mean "unmapped".
export async function setCohortMappingAction(opts: {
  expertId: string;
  nctId: string;
  mapping: Record<string, string>;
}): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const rows = await query<{ id: string; is_test_trial: boolean }>(`
    SELECT a.id, ta.is_test_trial
    FROM annotations a
    JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
    WHERE a.expert_id = $1 AND a.nct_id = $2
  `, [opts.expertId, opts.nctId]);
  const row = rows[0];
  if (!row) return { ok: false, error: 'Annotation not found.' };
  if (!row.is_test_trial) return { ok: false, error: 'Cohort matching only applies to test trials.' };

  await query(
    `UPDATE annotations SET cohort_map = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(opts.mapping ?? {}), row.id],
  );
  // Rescore against the new mapping. Score is only meaningful once both
  // a submission and a reference key exist; scoreAnnotation handles missing
  // refs gracefully (treats them as empty).
  const score = await scoreAnnotation(row.id);
  await query(
    `UPDATE annotations SET score_data = $1::jsonb, scored_at = NOW() WHERE id = $2`,
    [JSON.stringify(score), row.id],
  );
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Test-trial review gate
// ──────────────────────────────────────────────────────────────────────────

// Flip the test_reviewed_at flag on the (expert, trial) assignment. Sets
// session.userId as the reviewer when marking; clears both fields when
// un-reviewing.
export async function markTestTrialReviewedAction(opts: {
  expertId: string;
  nctId: string;
  reviewed: boolean;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const rows = await query<{ is_test_trial: boolean }>(
    `SELECT is_test_trial FROM trial_assignments WHERE expert_id = $1 AND nct_id = $2`,
    [opts.expertId, opts.nctId],
  );
  if (!rows[0]) return { ok: false, error: 'Assignment not found.' };
  if (!rows[0].is_test_trial) return { ok: false, error: 'Not a test trial.' };

  if (opts.reviewed) {
    await query(`
      UPDATE trial_assignments
      SET test_reviewed_at = NOW(), test_reviewed_by = $1
      WHERE expert_id = $2 AND nct_id = $3
    `, [session.userId, opts.expertId, opts.nctId]);
  } else {
    await query(`
      UPDATE trial_assignments
      SET test_reviewed_at = NULL, test_reviewed_by = NULL
      WHERE expert_id = $1 AND nct_id = $2
    `, [opts.expertId, opts.nctId]);
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Annotation reset (reviewer-only)
// ──────────────────────────────────────────────────────────────────────────

// Wipe one expert's annotation on one trial. They can restart from scratch.
// Also clears any test-review flag on the matching assignment so they're not
// stuck "reviewed" with no submitted answers.
export async function resetAnnotationAction(opts: {
  expertId: string;
  nctId: string;
}): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  await query(
    `DELETE FROM annotations WHERE expert_id = $1 AND nct_id = $2`,
    [opts.expertId, opts.nctId],
  );
  await query(`
    UPDATE trial_assignments
    SET test_reviewed_at = NULL, test_reviewed_by = NULL
    WHERE expert_id = $1 AND nct_id = $2 AND is_test_trial = TRUE
  `, [opts.expertId, opts.nctId]);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Annotation guide
// ──────────────────────────────────────────────────────────────────────────

export async function saveGuideAction(markdown: string): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Only reviewers can edit the guide.' }; }

  if (typeof markdown !== 'string') return { ok: false, error: 'Invalid markdown.' };
  if (markdown.length > 500_000) return { ok: false, error: 'Guide too large.' };

  await saveGuide(markdown, session.userId);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Annotator slot assignment
// ──────────────────────────────────────────────────────────────────────────
//
// Each main (non-test) trial carries annotator_slot_1 and annotator_slot_2
// (integers 1..5), pre-assigned in the sampling script for balanced load.
// Reviewers assign each expert a slot number, which triggers a bulk upsert
// into trial_assignments for every non-test trial matching either slot.
//
// Slot uniqueness: at most one expert may hold a given slot at a time
// (enforced by the users_annotator_slot_unique partial index). Setting slot
// to null vacates but does NOT retract any existing assignments — an
// in-flight annotation must never disappear on the expert.

export async function setExpertAnnotatorSlotAction(opts: {
  expertId: string;
  slot: number | null;
}): Promise<ActionResult & { assigned?: number }> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const { expertId, slot } = opts;
  if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > 5)) {
    return { ok: false, error: 'Slot must be 1..5 or null.' };
  }

  try {
    const assigned = await withTransaction(async (q) => {
      // Verify target is an expert.
      const u = await q<{ role: string }>(
        `SELECT role FROM users WHERE id = $1 FOR UPDATE`,
        [expertId],
      );
      if (u.length === 0) throw new Error('Expert not found.');
      if (u[0].role !== 'expert') throw new Error('Target user is not an expert.');

      if (slot !== null) {
        // Slot uniqueness: reject if a different expert already holds it.
        const conflict = await q<{ id: string }>(
          `SELECT id FROM users WHERE annotator_slot = $1 AND id <> $2`,
          [slot, expertId],
        );
        if (conflict.length > 0) {
          throw new Error(`Slot ${slot} is already assigned to another expert.`);
        }
      }

      await q(`UPDATE users SET annotator_slot = $1 WHERE id = $2`, [slot, expertId]);

      if (slot === null) return 0;

      // Upsert trial_assignments for every main trial tagged with this slot.
      // ON CONFLICT DO NOTHING preserves any in-flight annotation state.
      const ins = await q<{ nct_id: string }>(
        `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
           SELECT $1, t.nct_id, FALSE
             FROM trials t
            WHERE t.is_test_trial = FALSE
              AND (t.annotator_slot_1 = $2 OR t.annotator_slot_2 = $2)
         ON CONFLICT (expert_id, nct_id) DO NOTHING
         RETURNING nct_id`,
        [expertId, slot],
      );
      return ins.length;
    });
    return { ok: true, assigned };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
