'use server';

// Expert-side actions for the trial-centric model. Replaces both the old
// qualification "attempt" actions and the corpus "review" actions.

import { requireSession } from '@/lib/auth';
import {
  query,
  withTransaction,
  AnnotationRow,
  TrialAssignmentRow,
  TrialRow,
  MAX_ANNOTATIONS_PER_TRIAL,
} from '@/lib/db';
import { TrialAnswers } from '@/lib/types';
import { TrialHighlights } from '@/lib/highlights';
import { scoreAnnotation } from '@/lib/scoring';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

// True when the expert has no pending (assigned + un-reviewed) test trial.
// Used to gate access to non-test trials.
async function allTestsReviewed(expertId: string): Promise<boolean> {
  const rows = await query<{ pending: number }>(`
    SELECT COUNT(*)::int AS pending
    FROM trial_assignments
    WHERE expert_id = $1 AND is_test_trial = TRUE AND test_reviewed_at IS NULL
  `, [expertId]);
  return (rows[0]?.pending ?? 0) === 0;
}

// ──────────────────────────────────────────────────────────────────────────
// Start or resume an annotation for the expert × trial
// ──────────────────────────────────────────────────────────────────────────

// Returns the annotation id. Enforces:
//   - assignment exists
//   - if non-test, all of the expert's test trials are reviewed
//   - non-test trial cap: at most MAX_ANNOTATIONS_PER_TRIAL annotations across
//     all experts before a third can claim
export async function startOrResumeAnnotation(
  nctId: string,
): Promise<ActionResult & { annotationId?: string }> {
  let session;
  try { session = await requireSession('expert'); }
  catch { return { ok: false, error: 'Not signed in as expert.' }; }

  const assignments = await query<TrialAssignmentRow>(
    `SELECT * FROM trial_assignments WHERE expert_id = $1 AND nct_id = $2`,
    [session.userId, nctId],
  );
  const assignment = assignments[0];
  if (!assignment) return { ok: false, error: 'This trial is not assigned to you.' };

  if (!assignment.is_test_trial && !(await allTestsReviewed(session.userId))) {
    return { ok: false, error: 'Complete and have your test trials reviewed first.' };
  }

  const existing = await query<AnnotationRow>(
    `SELECT * FROM annotations WHERE nct_id = $1 AND expert_id = $2`,
    [nctId, session.userId],
  );
  if (existing[0]) return { ok: true, annotationId: existing[0].id };

  try {
    return await withTransaction(async (q) => {
      const trials = await q<TrialRow>(
        `SELECT * FROM trials WHERE nct_id = $1 FOR UPDATE`,
        [nctId],
      );
      const trial = trials[0];
      if (!trial) return { ok: false, error: 'Trial not found.' };

      // Cap on non-test annotations per trial. Test trials are not capped
      // (every assigned expert annotates the same test trial).
      if (!assignment.is_test_trial) {
        const counts = await q<{ n: number }>(`
          SELECT COUNT(*)::int AS n
          FROM annotations a
          JOIN trial_assignments ta
            ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
          WHERE a.nct_id = $1 AND ta.is_test_trial = FALSE
        `, [nctId]);
        if ((counts[0]?.n ?? 0) >= MAX_ANNOTATIONS_PER_TRIAL) {
          return { ok: false, error: 'This trial already has both annotation slots taken.' };
        }
      }

      // Annotation starts blank; labeling is fully manual.
      const inserted = await q<{ id: string }>(`
        INSERT INTO annotations (nct_id, expert_id, schema_version_id, answers)
        VALUES ($1, $2, $3, '{}'::jsonb)
        RETURNING id
      `, [nctId, session.userId, trial.schema_version_id]);
      return { ok: true, annotationId: inserted[0].id };
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Save answers (autosave path)
// ──────────────────────────────────────────────────────────────────────────

export async function saveAnnotationAction(opts: {
  nctId: string;
  answers: TrialAnswers;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('expert'); }
  catch { return { ok: false, error: 'Not signed in as expert.' }; }

  const rows = await query<{ id: string }>(`
    UPDATE annotations
    SET answers = $1::jsonb, updated_at = NOW()
    WHERE nct_id = $2 AND expert_id = $3 AND status = 'in_progress'
    RETURNING id
  `, [JSON.stringify(opts.answers ?? {}), opts.nctId, session.userId]);
  if (!rows[0]) return { ok: false, error: 'No editable annotation found.' };
  return { ok: true };
}

export async function saveAnnotationMetaAction(opts: {
  nctId: string;
  notes: string;
  flags: Record<string, boolean>;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('expert'); }
  catch { return { ok: false, error: 'Not signed in as expert.' }; }

  const rows = await query<{ id: string }>(`
    UPDATE annotations
    SET notes = $1, flags = $2::jsonb, updated_at = NOW()
    WHERE nct_id = $3 AND expert_id = $4 AND status = 'in_progress'
    RETURNING id
  `, [opts.notes, JSON.stringify(opts.flags ?? {}), opts.nctId, session.userId]);
  if (!rows[0]) return { ok: false, error: 'No editable annotation found.' };
  return { ok: true };
}

export async function saveHighlightsAction(opts: {
  nctId: string;
  highlights: TrialHighlights;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('expert'); }
  catch { return { ok: false, error: 'Not signed in as expert.' }; }

  const rows = await query<{ id: string }>(`
    UPDATE annotations
    SET highlights = $1::jsonb, updated_at = NOW()
    WHERE nct_id = $2 AND expert_id = $3 AND status = 'in_progress'
    RETURNING id
  `, [JSON.stringify(opts.highlights ?? {}), opts.nctId, session.userId]);
  if (!rows[0]) return { ok: false, error: 'No editable annotation found.' };
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Submit / reopen
// ──────────────────────────────────────────────────────────────────────────

// Submit (locks fields) or reopen. For test trials, reopening is refused
// once a reviewer has marked the submission reviewed — otherwise the unlock
// gate is meaningless. Submitting a test trial also runs scoring.
export async function submitAnnotationAction(opts: {
  nctId: string;
  submitted: boolean;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('expert'); }
  catch { return { ok: false, error: 'Not signed in as expert.' }; }

  const rows = await query<{ id: string; is_test_trial: boolean; test_reviewed_at: string | null; status: string }>(`
    SELECT a.id, ta.is_test_trial, ta.test_reviewed_at, a.status
    FROM annotations a
    JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
    WHERE a.nct_id = $1 AND a.expert_id = $2
  `, [opts.nctId, session.userId]);
  const row = rows[0];
  if (!row) return { ok: false, error: 'Annotation not found.' };

  if (!opts.submitted && row.is_test_trial && row.test_reviewed_at) {
    return { ok: false, error: 'Cannot reopen — this test trial has already been reviewed.' };
  }

  if (opts.submitted) {
    await query(`
      UPDATE annotations
      SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [row.id]);

    if (row.is_test_trial) {
      const score = await scoreAnnotation(row.id);
      await query(
        `UPDATE annotations SET score_data = $1::jsonb, scored_at = NOW() WHERE id = $2`,
        [JSON.stringify(score), row.id],
      );
    }
  } else {
    await query(`
      UPDATE annotations
      SET status = 'in_progress', updated_at = NOW()
      WHERE id = $1
    `, [row.id]);
  }

  return { ok: true };
}
