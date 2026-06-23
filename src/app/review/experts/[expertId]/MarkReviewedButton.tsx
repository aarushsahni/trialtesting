'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markTestTrialReviewedAction } from '@/app/actions/review';

export function MarkReviewedButton({
  expertId, nctId, initialReviewed, canReview,
}: {
  expertId: string;
  nctId: string;
  initialReviewed: boolean;
  canReview: boolean;
}) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(initialReviewed);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    const r = await markTestTrialReviewedAction({
      expertId, nctId, reviewed: !reviewed,
    });
    setPending(false);
    if (r.ok) {
      setReviewed(!reviewed);
      router.refresh();
    }
  }

  if (!canReview) {
    return (
      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-slate-100 text-slate-500 whitespace-nowrap">
        Not submitted
      </span>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className={
        'text-xs px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ' +
        (reviewed
          ? 'bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50'
          : 'bg-emerald-600 text-white hover:bg-emerald-700') +
        (pending ? ' opacity-50' : '')
      }
    >
      {pending ? '…' : reviewed ? 'Reviewed · undo' : 'Mark reviewed'}
    </button>
  );
}
