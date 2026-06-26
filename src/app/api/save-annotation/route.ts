// HTTP endpoint mirroring saveAnnotationAction — needed because
// navigator.sendBeacon (used on tab close / browser back) can't call
// Next.js server actions directly.

import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session || session.role !== 'expert') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { nctId?: string; answers?: unknown } | null;
  if (!body?.nctId) {
    return NextResponse.json({ error: 'nctId required' }, { status: 400 });
  }

  const rows = await query<{ id: string }>(`
    UPDATE annotations
    SET answers = $1::jsonb, updated_at = NOW()
    WHERE nct_id = $2 AND expert_id = $3 AND status = 'in_progress'
    RETURNING id
  `, [JSON.stringify(body.answers ?? {}), body.nctId, session.userId]);
  if (!rows[0]) return NextResponse.json({ error: 'no editable annotation' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
