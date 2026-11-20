// "Next trial →" on the adjudication screen: redirects to the next trial in
// queue order (after ?after=<nctId>, wrapping around) that still has open
// decisions, or back to the queue when none is left. Computed at click time so
// it reflects decisions just made.

import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { adjudicationStatus, loadCorpus } from '@/lib/labels-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') return NextResponse.redirect(new URL('/login', req.url));

  const after = req.nextUrl.searchParams.get('after');
  const trials = await loadCorpus();
  const i = trials.findIndex((t) => t.nctId === after);
  const order = [...trials.slice(i + 1), ...trials.slice(0, Math.max(i, 0))];
  const next = order.find((t) => t.nctId !== after && adjudicationStatus(t).state === 'open');
  return NextResponse.redirect(new URL(next ? `/review/adjudicate/${next.nctId}` : '/review/adjudicate?filter=open', req.url));
}
