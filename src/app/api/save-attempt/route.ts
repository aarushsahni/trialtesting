// HTTP endpoint mirroring saveAttemptAction — needed for navigator.sendBeacon
// which can't call server actions directly.

import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => null) as { attemptId?: string; answers?: unknown } | null;
  if (!body?.attemptId) {
    return NextResponse.json({ error: 'attemptId required' }, { status: 400 });
  }

  const rows = await query<{ reviewer_id: string; status: string }>(
    `SELECT reviewer_id, status FROM qualification_attempts WHERE id = $1`,
    [body.attemptId],
  );
  const attempt = rows[0];
  if (!attempt) return NextResponse.json({ error: 'attempt not found' }, { status: 404 });
  if (attempt.reviewer_id !== session.userId) {
    return NextResponse.json({ error: 'not your attempt' }, { status: 403 });
  }
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'attempt locked' }, { status: 409 });
  }

  await query(
    `UPDATE qualification_attempts SET answers = $1::jsonb WHERE id = $2`,
    [JSON.stringify(body.answers ?? {}), body.attemptId],
  );
  return NextResponse.json({ ok: true });
}
