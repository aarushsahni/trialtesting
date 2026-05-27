// HTTP endpoint mirroring saveReferenceKeyAction — needed because
// navigator.sendBeacon (used on tab close / browser back) can't call
// Next.js server actions directly. Same auth + upsert logic.

import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session || session.role !== 'annotator') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { setId?: string; nctId?: string; data?: unknown } | null;
  if (!body?.setId || !body?.nctId) {
    return NextResponse.json({ error: 'setId and nctId required' }, { status: 400 });
  }

  const sets = await query<{ schema_version_id: string; locked_at: string | null; trial_nct_ids: string[] }>(
    `SELECT schema_version_id, locked_at, trial_nct_ids FROM qualification_sets WHERE id = $1`,
    [body.setId],
  );
  const set = sets[0];
  if (!set) return NextResponse.json({ error: 'set not found' }, { status: 404 });
  if (set.locked_at) return NextResponse.json({ error: 'set locked' }, { status: 409 });
  if (!set.trial_nct_ids.includes(body.nctId)) {
    return NextResponse.json({ error: 'trial not in set' }, { status: 400 });
  }

  await query(
    `INSERT INTO reference_keys (qualification_set_id, nct_id, schema_version_id, key_data, built_by_annotator_id, built_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     ON CONFLICT (qualification_set_id, nct_id) DO UPDATE
       SET key_data = EXCLUDED.key_data,
           built_by_annotator_id = EXCLUDED.built_by_annotator_id,
           built_at = NOW()`,
    [body.setId, body.nctId, set.schema_version_id, JSON.stringify(body.data ?? {}), session.userId],
  );
  return NextResponse.json({ ok: true });
}
