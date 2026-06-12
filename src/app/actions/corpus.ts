'use server';

// Server actions for the production corpus phase: reviewer approval of
// experts, claim-on-start blind double review, and reviewer adjudication.

import { requireSession } from '@/lib/auth';
import { query, withTransaction, CorpusReviewRow, MAX_CORPUS_REVIEWS } from '@/lib/db';
import { TrialAnswers, FieldValue } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Reviewer: approve / revoke an expert for corpus work
// ──────────────────────────────────────────────────────────────────────────

export async function setCorpusApprovalAction(opts: {
  expertId: string;
  approved: boolean;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  const users = await query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE id = $1`,
    [opts.expertId],
  );
  if (!users[0]) return { ok: false, error: 'User not found.' };
  if (users[0].role !== 'expert') return { ok: false, error: 'Only experts can be approved.' };

  if (opts.approved) {
    await query(
      `UPDATE users SET corpus_approved_at = NOW(), corpus_approved_by = $1 WHERE id = $2`,
      [session.userId, opts.expertId],
    );
  } else {
    await query(
      `UPDATE users SET corpus_approved_at = NULL, corpus_approved_by = NULL WHERE id = $1`,
      [opts.expertId],
    );
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Expert: approval gate helper
// ──────────────────────────────────────────────────────────────────────────

async function requireApprovedExpert(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  let session;
  try { session = await requireSession('expert'); }
  catch { return { ok: false, error: 'Not signed in as expert.' }; }

  const rows = await query<{ corpus_approved_at: string | null }>(
    `SELECT corpus_approved_at FROM users WHERE id = $1`,
    [session.userId],
  );
  if (!rows[0]?.corpus_approved_at) {
    return { ok: false, error: 'You are not approved for corpus annotation yet.' };
  }
  return { ok: true, userId: session.userId };
}

// ──────────────────────────────────────────────────────────────────────────
// Expert: claim a trial (or resume an existing claim)
// ──────────────────────────────────────────────────────────────────────────

// Claiming inserts the expert's corpus_reviews row, prefilled with the
// trial's AI answers. A transaction with a row lock on the trial serializes
// concurrent claims so a trial can never get more than MAX_CORPUS_REVIEWS.
export async function claimOrResumeCorpusReview(
  nctId: string,
): Promise<ActionResult & { reviewId?: string }> {
  const gate = await requireApprovedExpert();
  if (!gate.ok) return gate;

  const existing = await query<CorpusReviewRow>(
    `SELECT * FROM corpus_reviews WHERE nct_id = $1 AND expert_id = $2`,
    [nctId, gate.userId],
  );
  if (existing[0]) return { ok: true, reviewId: existing[0].id };

  // New claim — transactional. The row lock on the trial serializes
  // concurrent claims so a trial can never exceed MAX_CORPUS_REVIEWS.
  try {
    return await withTransaction(async (q) => {
      const trial = await q<{ nct_id: string; ai_answers: unknown }>(
        `SELECT nct_id, ai_answers FROM corpus_trials WHERE nct_id = $1 FOR UPDATE`,
        [nctId],
      );
      if (!trial[0]) return { ok: false, error: 'Trial not found.' };

      const claims = await q<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM corpus_reviews WHERE nct_id = $1`,
        [nctId],
      );
      if (claims[0].n >= MAX_CORPUS_REVIEWS) {
        return { ok: false, error: 'This trial already has both review slots taken.' };
      }

      const inserted = await q<{ id: string }>(
        `INSERT INTO corpus_reviews (nct_id, expert_id, answers)
         VALUES ($1, $2, $3::jsonb)
         RETURNING id`,
        [nctId, gate.userId, JSON.stringify(trial[0].ai_answers ?? {})],
      );
      return { ok: true, reviewId: inserted[0].id };
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Release an unsubmitted claim so the slot opens up again.
export async function abandonCorpusReviewAction(nctId: string): Promise<ActionResult> {
  const gate = await requireApprovedExpert();
  if (!gate.ok) return gate;

  const rows = await query<{ id: string }>(
    `DELETE FROM corpus_reviews
     WHERE nct_id = $1 AND expert_id = $2 AND status = 'in_progress'
     RETURNING id`,
    [nctId, gate.userId],
  );
  if (!rows[0]) return { ok: false, error: 'No in-progress review of yours to abandon.' };
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Expert: save / submit / reopen own review
// ──────────────────────────────────────────────────────────────────────────

export async function saveCorpusReviewAction(opts: {
  nctId: string;
  answers: TrialAnswers;
}): Promise<ActionResult> {
  const gate = await requireApprovedExpert();
  if (!gate.ok) return gate;

  const rows = await query<{ id: string }>(
    `UPDATE corpus_reviews
     SET answers = $1::jsonb, updated_at = NOW()
     WHERE nct_id = $2 AND expert_id = $3 AND status = 'in_progress'
     RETURNING id`,
    [JSON.stringify(opts.answers ?? {}), opts.nctId, gate.userId],
  );
  if (!rows[0]) return { ok: false, error: 'No editable review found (submit it again after reopening).' };
  return { ok: true };
}

export async function saveCorpusReviewMetaAction(opts: {
  nctId: string;
  notes: string;
  flags: Record<string, boolean>;
}): Promise<ActionResult> {
  const gate = await requireApprovedExpert();
  if (!gate.ok) return gate;

  const rows = await query<{ id: string }>(
    `UPDATE corpus_reviews
     SET notes = $1, flags = $2::jsonb, updated_at = NOW()
     WHERE nct_id = $3 AND expert_id = $4 AND status = 'in_progress'
     RETURNING id`,
    [opts.notes, JSON.stringify(opts.flags ?? {}), opts.nctId, gate.userId],
  );
  if (!rows[0]) return { ok: false, error: 'No editable review found.' };
  return { ok: true };
}

// Submit (locks fields) or reopen (unlocks — allowed anytime, even after the
// trial reached two submitted reviews; "done" simply becomes un-done).
export async function setCorpusReviewStatusAction(opts: {
  nctId: string;
  submitted: boolean;
}): Promise<ActionResult> {
  const gate = await requireApprovedExpert();
  if (!gate.ok) return gate;

  const rows = await query<{ id: string }>(
    `UPDATE corpus_reviews
     SET status = $1,
         submitted_at = CASE WHEN $1 = 'submitted' THEN NOW() ELSE submitted_at END,
         updated_at = NOW()
     WHERE nct_id = $2 AND expert_id = $3
     RETURNING id`,
    [opts.submitted ? 'submitted' : 'in_progress', opts.nctId, gate.userId],
  );
  if (!rows[0]) return { ok: false, error: 'Review not found.' };
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Reviewer: adjudication
// ──────────────────────────────────────────────────────────────────────────

export async function adjudicateFieldAction(opts: {
  nctId: string;
  blockKey: string;
  fieldKey: string;
  value: FieldValue;
}): Promise<ActionResult> {
  let session;
  try { session = await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  await query(
    `INSERT INTO corpus_adjudications (nct_id, block_key, field_key, final_value, decided_by, decided_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     ON CONFLICT (nct_id, block_key, field_key) DO UPDATE
       SET final_value = EXCLUDED.final_value,
           decided_by = EXCLUDED.decided_by,
           decided_at = NOW()`,
    [opts.nctId, opts.blockKey, opts.fieldKey, JSON.stringify({ v: opts.value }), session.userId],
  );
  return { ok: true };
}

export async function clearAdjudicationAction(opts: {
  nctId: string;
  blockKey: string;
  fieldKey: string;
}): Promise<ActionResult> {
  try { await requireSession('reviewer'); }
  catch { return { ok: false, error: 'Not signed in as reviewer.' }; }

  await query(
    `DELETE FROM corpus_adjudications WHERE nct_id = $1 AND block_key = $2 AND field_key = $3`,
    [opts.nctId, opts.blockKey, opts.fieldKey],
  );
  return { ok: true };
}
