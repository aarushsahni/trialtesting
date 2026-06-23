'use client';

import { useState } from 'react';
import { resetAnnotationAction } from '@/app/actions/review';

export function ResetAnnotationButton({
  expertId, nctId, expertName,
}: { expertId: string; nctId: string; expertName: string }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (!confirm(`Wipe ${expertName}'s annotation on this trial? They can restart it from scratch. This cannot be undone.`)) return;
    setPending(true);
    setErr(null);
    const r = await resetAnnotationAction({ expertId, nctId });
    setPending(false);
    if (!r.ok) setErr(r.error ?? 'Failed');
    else window.location.reload();
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={onClick}
        disabled={pending}
        className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 whitespace-nowrap"
      >
        {pending ? 'Resetting…' : 'Reset'}
      </button>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
    </div>
  );
}
