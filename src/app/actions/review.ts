'use server';

import { requireSession } from '@/lib/auth';
import { query, QualificationAttemptRow, QualificationSetRow } from '@/lib/db';
import { TrialAnswers } from '@/lib/types';
import { scoreAttempt } from '@/lib/scoring';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Get or create the reviewer's in-progress attempt for a set.
export async function startOrResumeAttempt(setId: string): Promise<ActionResult & { attemptId?: string }> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const sets = await query<QualificationSetRow>(
    `SELECT * FROM qualification_sets WHERE id = $1`,
    [setId],
  );
  const set = sets[0];
  if (!set) return { ok: false, error: 'Set not found.' };
  if (!set.locked_at) return { ok: false, error: 'Set is not locked yet — no test available.' };

  const existing = await query<QualificationAttemptRow>(
    `SELECT * FROM qualification_attempts WHERE reviewer_id = $1 AND qualification_set_id = $2`,
    [session.userId, setId],
  );
  if (existing[0]) {
    return { ok: true, attemptId: existing[0].id };
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO qualification_attempts (reviewer_id, qualification_set_id, schema_version_id, answers, status)
     VALUES ($1, $2, $3, '{}'::jsonb, 'in_progress')
     RETURNING id`,
    [session.userId, setId, set.schema_version_id],
  );
  return { ok: true, attemptId: inserted[0].id };
}

// Mark a single trial in the attempt as complete (or un-complete).
export async function markTrialCompleteAction(opts: {
  attemptId: string; nctId: string; complete: boolean;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const rows = await query<QualificationAttemptRow>(
    `SELECT * FROM qualification_attempts WHERE id = $1`,
    [opts.attemptId],
  );
  const a = rows[0];
  if (!a) return { ok: false, error: 'Attempt not found.' };
  if (a.reviewer_id !== session.userId) return { ok: false, error: 'Not your attempt.' };
  if (a.status !== 'in_progress') return { ok: false, error: 'Attempt is locked.' };

  const current = new Set(a.completed_nct_ids ?? []);
  if (opts.complete) current.add(opts.nctId);
  else current.delete(opts.nctId);

  await query(
    `UPDATE qualification_attempts SET completed_nct_ids = $1 WHERE id = $2`,
    [Array.from(current), opts.attemptId],
  );
  return { ok: true };
}

// Save attempt answers (called from auto-save). Only allowed while attempt is in_progress.
export async function saveAttemptAction(opts: {
  attemptId: string;
  answers: Record<string, TrialAnswers>; // keyed by nct_id
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const rows = await query<QualificationAttemptRow>(
    `SELECT * FROM qualification_attempts WHERE id = $1`,
    [opts.attemptId],
  );
  const attempt = rows[0];
  if (!attempt) return { ok: false, error: 'Attempt not found.' };
  if (attempt.reviewer_id !== session.userId) return { ok: false, error: 'Not your attempt.' };
  if (attempt.status !== 'in_progress') return { ok: false, error: 'Attempt is locked.' };

  await query(
    `UPDATE qualification_attempts SET answers = $1::jsonb WHERE id = $2`,
    [JSON.stringify(opts.answers), opts.attemptId],
  );
  return { ok: true };
}

// Final submission. Locks the attempt, runs scoring, sets pass/fail.
export async function submitAttemptAction(attemptId: string): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const rows = await query<QualificationAttemptRow>(
    `SELECT * FROM qualification_attempts WHERE id = $1`,
    [attemptId],
  );
  const attempt = rows[0];
  if (!attempt) return { ok: false, error: 'Attempt not found.' };
  if (attempt.reviewer_id !== session.userId) return { ok: false, error: 'Not your attempt.' };
  if (attempt.status !== 'in_progress') return { ok: false, error: 'Already submitted.' };

  // Submit gate: every trial in the set must be in completed_nct_ids
  const sets = await query<{ trial_nct_ids: string[] }>(
    `SELECT trial_nct_ids FROM qualification_sets WHERE id = $1`,
    [attempt.qualification_set_id],
  );
  const set = sets[0];
  if (!set) return { ok: false, error: 'Set not found.' };
  const completed = new Set(attempt.completed_nct_ids ?? []);
  const missing = set.trial_nct_ids.filter((id) => !completed.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `Mark all ${set.trial_nct_ids.length} trials complete before submitting (${missing.length} still pending).` };
  }

  const score = await scoreAttempt(attempt.id);
  const status = score.passed ? 'passed' : 'failed';

  await query(
    `UPDATE qualification_attempts
     SET status = $1, score_data = $2::jsonb, submitted_at = NOW()
     WHERE id = $3`,
    [status, JSON.stringify(score), attemptId],
  );
  return { ok: true };
}
