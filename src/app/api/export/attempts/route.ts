// CSV export: long-format per-field comparison.
// One row per (expert × trial × block × field) with reference value,
// attempt value, agreement outcome. Reviewer-only.

import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { rowsToCsv } from '@/lib/csv';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockAnswers, BlockKey, FieldValue, TrialAnswers } from '@/lib/types';

export const runtime = 'nodejs';

function isPopulated(v: FieldValue): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function outcome(ref: FieldValue, att: FieldValue): 'TP' | 'FP' | 'FN' | 'TN' {
  const r = isPopulated(ref), a = isPopulated(att);
  if (r && a) return 'TP';
  if (!r && a) return 'FP';
  if (r && !a) return 'FN';
  return 'TN';
}

function valueAsString(v: FieldValue): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join('|');
  return String(v);
}

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Pull attempts + reference keys + trials together
  const attempts = await query<{
    attempt_id: string;
    expert_name: string;
    set_id: string;
    set_name: string;
    answers: Record<string, TrialAnswers>;
    completed_nct_ids: string[];
    per_trial_meta: Record<string, { notes?: string; flags?: Record<string, boolean> }>;
    status: string;
  }>(`
    SELECT
      qa.id AS attempt_id,
      u.name AS expert_name,
      qs.id AS set_id,
      qs.name AS set_name,
      qa.answers,
      qa.completed_nct_ids,
      qa.per_trial_meta,
      qa.status
    FROM qualification_attempts qa
    JOIN users u ON u.id = qa.expert_id
    JOIN qualification_sets qs ON qs.id = qa.qualification_set_id
  `);

  if (attempts.length === 0) {
    return new NextResponse('', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="attempts.csv"',
      },
    });
  }

  const setIds = Array.from(new Set(attempts.map(a => a.set_id)));

  // Reference keys + trials, keyed by (set_id, nct_id)
  const refs = await query<{
    set_id: string; nct_id: string; key_data: TrialAnswers; notes: string; flags: Record<string, boolean>;
  }>(`
    SELECT qualification_set_id AS set_id, nct_id, key_data, notes, flags
    FROM reference_keys WHERE qualification_set_id = ANY($1::uuid[])
  `, [setIds]);
  const refMap = new Map(refs.map(r => [`${r.set_id}::${r.nct_id}`, r]));

  const trials = await query<{ nct_id: string; assigned_blocks: string[]; brief_title: string }>(`
    SELECT nct_id, assigned_blocks, brief_title FROM qualification_trials
    WHERE nct_id = ANY(
      SELECT unnest(trial_nct_ids) FROM qualification_sets WHERE id = ANY($1::uuid[])
    )
  `, [setIds]);
  const trialMap = new Map(trials.map(t => [t.nct_id, t]));

  const headers = [
    'expert', 'set', 'attempt_status', 'nct_id', 'trial_title',
    'trial_complete_by_expert',
    'block', 'field', 'field_class', 'field_kind',
    'reference_value', 'attempt_value', 'outcome',
    'reference_notes', 'reference_flags', 'expert_notes', 'expert_flags',
  ];
  const rows: unknown[][] = [];

  for (const att of attempts) {
    const completedSet = new Set(att.completed_nct_ids ?? []);
    for (const [nctId, refKey] of refMap.entries()) {
      const refNctId = refKey.nct_id;
      if (!nctId.startsWith(att.set_id + '::')) continue;
      const trial = trialMap.get(refNctId);
      if (!trial) continue;
      const attTrial = (att.answers ?? {})[refNctId] ?? {};
      const meta = (att.per_trial_meta ?? {})[refNctId] ?? {};
      for (const blockKey of trial.assigned_blocks as BlockKey[]) {
        const block = BLOCKS[blockKey];
        if (!block) continue;
        const refBlock: BlockAnswers = (refKey.key_data?.[blockKey] ?? {}) as BlockAnswers;
        const attBlock: BlockAnswers = (attTrial[blockKey] ?? {}) as BlockAnswers;
        for (const [fieldKey, def] of Object.entries(block.fields)) {
          const ref = (refBlock[fieldKey] ?? null) as FieldValue;
          const att2 = (attBlock[fieldKey] ?? null) as FieldValue;
          rows.push([
            att.expert_name, att.set_name, att.status,
            refNctId, trial.brief_title,
            completedSet.has(refNctId),
            blockKey, fieldKey, def.class, def.kind,
            valueAsString(ref), valueAsString(att2), outcome(ref, att2),
            refKey.notes ?? '', refKey.flags ?? {},
            meta.notes ?? '', meta.flags ?? {},
          ]);
        }
      }
    }
  }

  return new NextResponse(rowsToCsv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attempts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
