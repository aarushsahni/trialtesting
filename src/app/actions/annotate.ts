'use server';

import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { TrialAnswers } from '@/lib/types';

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
  try { session = await requireSession('annotator'); }
  catch { return { ok: false, error: 'Not signed in as annotator.' }; }

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
    `INSERT INTO reference_keys (qualification_set_id, nct_id, schema_version_id, key_data, built_by_annotator_id, built_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     ON CONFLICT (qualification_set_id, nct_id) DO UPDATE
       SET key_data = EXCLUDED.key_data,
           built_by_annotator_id = EXCLUDED.built_by_annotator_id,
           built_at = NOW()`,
    [opts.setId, opts.nctId, set.schema_version_id, JSON.stringify(opts.data), session.userId],
  );
  return { ok: true };
}

// Mark a reference key as complete (or un-complete). Editing complete=true
// reference keys is still allowed until the set itself is locked.
export async function markReferenceKeyCompleteAction(opts: {
  setId: string; nctId: string; complete: boolean;
}): Promise<ActionResult> {
  try { await requireSession('annotator'); }
  catch { return { ok: false, error: 'Not signed in as annotator.' }; }

  const sets = await query<{ locked_at: string | null }>(
    `SELECT locked_at FROM qualification_sets WHERE id = $1`,
    [opts.setId],
  );
  if (!sets[0]) return { ok: false, error: 'Set not found.' };
  if (sets[0].locked_at) return { ok: false, error: 'Set is locked.' };

  const r = await query(
    `UPDATE reference_keys SET complete = $1
     WHERE qualification_set_id = $2 AND nct_id = $3`,
    [opts.complete, opts.setId, opts.nctId],
  );
  if (r.length === 0) {
    // Row doesn't exist — create an empty key marked complete
    const sv = await query<{ schema_version_id: string }>(
      `SELECT schema_version_id FROM qualification_sets WHERE id = $1`,
      [opts.setId],
    );
    if (!sv[0]) return { ok: false, error: 'Set not found.' };
    await query(
      `INSERT INTO reference_keys (qualification_set_id, nct_id, schema_version_id, key_data, complete)
       VALUES ($1, $2, $3, '{}'::jsonb, $4)`,
      [opts.setId, opts.nctId, sv[0].schema_version_id, opts.complete],
    );
  }
  return { ok: true };
}

// Lock a set so reviewers can take it. Requires EVERY trial to have a
// reference key marked complete.
export async function lockSetAction(setId: string): Promise<ActionResult> {
  try { await requireSession('annotator'); }
  catch { return { ok: false, error: 'Not signed in as annotator.' }; }

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
