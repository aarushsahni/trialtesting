// HTTP endpoint mirroring saveReferenceKeyAction — needed for
// navigator.sendBeacon (which can't call server actions).

import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { nctId?: string; data?: unknown } | null;
  if (!body?.nctId) {
    return NextResponse.json({ error: 'nctId required' }, { status: 400 });
  }

  const trials = await query<{ schema_version_id: string | null }>(
    `SELECT schema_version_id FROM trials WHERE nct_id = $1`,
    [body.nctId],
  );
  const trial = trials[0];
  if (!trial) return NextResponse.json({ error: 'trial not found' }, { status: 404 });

  let svId = trial.schema_version_id;
  if (!svId) {
    const sv = await query<{ id: string }>(
      `SELECT id FROM schema_versions ORDER BY created_at DESC LIMIT 1`,
    );
    svId = sv[0]?.id ?? null;
  }
  if (!svId) return NextResponse.json({ error: 'no schema version' }, { status: 500 });

  await query(`
    INSERT INTO reference_keys (nct_id, schema_version_id, key_data, built_by_reviewer_id, built_at)
    VALUES ($1, $2, $3::jsonb, $4, NOW())
    ON CONFLICT (nct_id) DO UPDATE
      SET key_data = EXCLUDED.key_data,
          built_by_reviewer_id = EXCLUDED.built_by_reviewer_id,
          built_at = NOW()
  `, [body.nctId, svId, JSON.stringify(body.data ?? {}), session.userId]);
  return NextResponse.json({ ok: true });
}
