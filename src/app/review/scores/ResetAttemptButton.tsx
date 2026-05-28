'use client';

import { useState } from 'react';
import { resetAttemptAction } from '@/app/actions/review';

export function ResetAttemptButton({
  attemptId, reviewerName,
}: { attemptId: string; reviewerName: string }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (!confirm(`Wipe ${reviewerName}'s attempt? They will start the test over from scratch. This cannot be undone.`)) return;
    setPending(true);
    setErr(null);
    const r = await resetAttemptAction(attemptId);
    setPending(false);
    if (!r.ok) setErr(r.error ?? 'Failed');
    else window.location.reload();
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={onClick}
        disabled={pending}
        className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
      >
        {pending ? 'Resetting…' : 'Reset attempt'}
      </button>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}
