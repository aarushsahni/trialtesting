import { NextResponse } from 'next/server';
import { listTrials } from '@/lib/trials';

export const runtime = 'nodejs';

export async function GET() {
  const trials = listTrials().map((t) => ({
    nctId: t.nctId,
    briefTitle: t.briefTitle,
    assignedCancerType: t.assignedCancerType,
  }));
  return NextResponse.json({ trials });
}
