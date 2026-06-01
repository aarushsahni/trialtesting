'use server';

import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { TrialAnswers } from '@/lib/types';
import { saveGuide } from '@/lib/guide-store';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Save (upsert) a reference key for a single trial. Set must not be locked.
export async function saveReferenceKeyAction(opts: {
  setId: string;
  nctId: string;
  data: TrialAnswers;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const sets = await query<{ id: string; schema_version_id: string; locked_at: string | null; trial_nct_ids: string[] }>(
    `SELECT id, schema_version_id, locked_at, trial_nct_ids FROM qualification_sets WHERE id = $1`,
    [opts.setId],
  );
  const set = sets[0];
  if (!set) return { ok: false, error: 'Set not found.' };
  if (set.locked_at) return { ok: false, error: 'Set is locked. Reference key cannot be edited.' };
  if (!set.trial_nct_ids.includes(opts.nctId)) {
    return { ok: false, error: 'Trial does not belong to this set.' };
  }

  await query(
    `INSERT INTO reference_keys (qualification_set_id, nct_id, schema_version_id, key_data, built_by_reviewer_id, built_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     ON CONFLICT (qualification_set_id, nct_id) DO UPDATE
       SET key_data = EXCLUDED.key_data,
           built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
           built_at = NOW()`,
    [opts.setId, opts.nctId, set.schema_version_id, JSON.stringify(opts.data), session.userId],
  );
  return { ok: true };
}

// Save notes + flags for a reference key. Trial must belong to the set
// and set must not be locked.
export async function saveReferenceKeyMetaAction(opts: {
  setId: string; nctId: string; notes: string; flags: Record<string, boolean>;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const sets = await query<{ schema_version_id: string; locked_at: string | null }>(
    `SELECT schema_version_id, locked_at FROM qualification_sets WHERE id = $1`,
    [opts.setId],
  );
  if (!sets[0]) return { ok: false, error: 'Set not found.' };
  if (sets[0].locked_at) return { ok: false, error: 'Set is locked.' };

  // Upsert: if no reference key row exists yet, create an empty one with the meta
  await query(
    `INSERT INTO reference_keys (qualification_set_id, nct_id, schema_version_id, key_data, notes, flags, built_by_reviewer_id, built_at)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5::jsonb, $6, NOW())
     ON CONFLICT (qualification_set_id, nct_id) DO UPDATE
       SET notes = EXCLUDED.notes,
           flags = EXCLUDED.flags,
           built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
           built_at = NOW()`,
    [opts.setId, opts.nctId, sets[0].schema_version_id, opts.notes, JSON.stringify(opts.flags), session.userId],
  );
  return { ok: true };
}

// Mark a reference key as complete (or un-complete). Single upsert so it
// works whether or not a row exists yet, on every toggle.
// Mark a reference key complete/incomplete. If the set is currently locked
// AND the caller is unlocking the trial, also unlock the set (so experts
// can no longer take it until the reviewer re-locks). Refusing to flip a
// trial to "complete" on a locked set since that's redundant.
export async function markReferenceKeyCompleteAction(opts: {
  setId: string; nctId: string; complete: boolean;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const sets = await query<{ schema_version_id: string; locked_at: string | null }>(
    `SELECT schema_version_id, locked_at FROM qualification_sets WHERE id = $1`,
    [opts.setId],
  );
  const set = sets[0];
  if (!set) return { ok: false, error: 'Set not found.' };
  if (set.locked_at && opts.complete) {
    return { ok: false, error: 'Set is already locked.' };
  }

  // Cascade: unlocking a trial on a locked set also unlocks the set
  if (set.locked_at && !opts.complete) {
    await query(`UPDATE qualification_sets SET locked_at = NULL WHERE id = $1`, [opts.setId]);
  }

  await query(
    `INSERT INTO reference_keys (qualification_set_id, nct_id, schema_version_id, key_data, complete, built_by_reviewer_id, built_at)
     VALUES ($1, $2, $3, '{}'::jsonb, $4, $5, NOW())
     ON CONFLICT (qualification_set_id, nct_id) DO UPDATE
       SET complete = EXCLUDED.complete,
           built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
           built_at = NOW()`,
    [opts.setId, opts.nctId, set.schema_version_id, opts.complete, session.userId],
  );
  return { ok: true };
}

// Save the annotation guide markdown. Reviewer-only.
export async function saveGuideAction(markdown: string): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Only reviewers can edit the guide.' }; }

  if (typeof markdown !== 'string') return { ok: false, error: 'Invalid markdown.' };
  if (markdown.length > 500_000) return { ok: false, error: 'Guide too large.' };

  await saveGuide(markdown, session.userId);
  return { ok: true };
}

// Wipe a expert's attempt entirely. They can retake from scratch.
export async function resetAttemptAction(attemptId: string): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const r = await query<{ id: string }>(
    `DELETE FROM qualification_attempts WHERE id = $1 RETURNING id`,
    [attemptId],
  );
  if (r.length === 0) return { ok: false, error: 'Attempt not found.' };
  return { ok: true };
}

// Lock a set so experts can take it. Requires EVERY trial to have a
// reference key marked complete.
export async function lockSetAction(setId: string): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const sets = await query<{ trial_nct_ids: string[]; locked_at: string | null }>(
    `SELECT trial_nct_ids, locked_at FROM qualification_sets WHERE id = $1`,
    [setId],
  );
  const set = sets[0];
  if (!set) return { ok: false, error: 'Set not found.' };
  if (set.locked_at) return { ok: false, error: 'Already locked.' };

  const completes = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM reference_keys
     WHERE qualification_set_id = $1 AND complete = TRUE`,
    [setId],
  );
  const completeCount = completes[0]?.n ?? 0;
  if (completeCount < set.trial_nct_ids.length) {
    return {
      ok: false,
      error: `Cannot lock: ${set.trial_nct_ids.length - completeCount} trials are not yet marked complete.`,
    };
  }

  await query(`UPDATE qualification_sets SET locked_at = NOW() WHERE id = $1`, [setId]);
  return { ok: true };
}
