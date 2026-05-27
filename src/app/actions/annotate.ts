'use server';

import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { TrialAnswers } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Save (upsert) a reference key for a single trial. The annotator is the
// caller; the trial must belong to the named set; the set must not be locked.
export async function saveReferenceKeyAction(opts: {
  setId: string;
  nctId: string;
  data: TrialAnswers;
}): Promise<ActionResult> {
  let session;
  try {
    session = await requireSession('annotator');
  } catch {
    return { ok: false, error: 'Not signed in as annotator.' };
  }

  // Verify set exists and is not locked, and grab schema_version_id
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

// Lock a set so reviewers can take it. Requires every trial in the set to
// have a reference key with at least one populated field.
export async function lockSetAction(setId: string): Promise<ActionResult> {
  try {
    await requireSession('annotator');
  } catch {
    return { ok: false, error: 'Not signed in as annotator.' };
  }

  const sets = await query<{ trial_nct_ids: string[]; locked_at: string | null }>(
    `SELECT trial_nct_ids, locked_at FROM qualification_sets WHERE id = $1`,
    [setId],
  );
  const set = sets[0];
  if (!set) return { ok: false, error: 'Set not found.' };
  if (set.locked_at) return { ok: false, error: 'Already locked.' };

  const keys = await query<{ nct_id: string; key_data: Record<string, unknown> }>(
    `SELECT nct_id, key_data FROM reference_keys WHERE qualification_set_id = $1`,
    [setId],
  );
  const populatedCount = keys.filter((k) => {
    const blocks = (k.key_data ?? {}) as Record<string, Record<string, unknown>>;
    for (const blockAnswers of Object.values(blocks)) {
      for (const v of Object.values(blockAnswers ?? {})) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) return true;
      }
    }
    return false;
  }).length;

  if (populatedCount < set.trial_nct_ids.length) {
    return {
      ok: false,
      error: `Cannot lock: ${set.trial_nct_ids.length - populatedCount} trials still have no populated fields.`,
    };
  }

  await query(`UPDATE qualification_sets SET locked_at = NOW() WHERE id = $1`, [setId]);
  return { ok: true };
}
