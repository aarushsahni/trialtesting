import { NextRequest, NextResponse } from 'next/server';
import { query, ReviewRow } from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/reviews?userId=...&nctId=...
//   - if nctId: return single review
//   - else: return all reviews for user (for progress)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const nctId = url.searchParams.get('nctId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  if (nctId) {
    const rows = await query<ReviewRow>(
      `SELECT user_id, nct_id, reviewed_data, completed, updated_at
       FROM reviews WHERE user_id = $1 AND nct_id = $2`,
      [userId, nctId],
    );
    return NextResponse.json({ review: rows[0] ?? null });
  }

  const rows = await query<ReviewRow>(
    `SELECT user_id, nct_id, reviewed_data, completed, updated_at
     FROM reviews WHERE user_id = $1`,
    [userId],
  );
  return NextResponse.json({ reviews: rows });
}

// POST upsert
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, nctId, reviewedData, completed } = body ?? {};
  if (!userId || !nctId) {
    return NextResponse.json({ error: 'userId and nctId required' }, { status: 400 });
  }
  await query(
    `INSERT INTO reviews (user_id, nct_id, reviewed_data, completed, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW())
     ON CONFLICT (user_id, nct_id) DO UPDATE
     SET reviewed_data = EXCLUDED.reviewed_data,
         completed = EXCLUDED.completed,
         updated_at = NOW()`,
    [userId, nctId, JSON.stringify(reviewedData ?? {}), Boolean(completed)],
  );
  return NextResponse.json({ ok: true });
}
