'use client';

import { useState } from 'react';
import { submitAttemptAction } from '@/app/actions/expert';

export function SubmitTestButton({
  attemptId, disabled,
}: { attemptId: string; disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    if (disabled) return;
    if (!confirm('Submit your test? You will not be able to edit your answers after this.')) return;
    setPending(true);
    setErr(null);
    const r = await submitAttemptAction(attemptId);
    if (!r.ok) {
      setErr(r.error ?? 'Failed');
      setPending(false);
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={onClick}
        disabled={disabled || pending}
        className={
          'text-sm px-4 py-2 rounded-lg font-medium transition shadow-sm ' +
          (disabled
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200')
        }
      >
        {pending ? 'Submitting…' : 'Submit test'}
      </button>
      {disabled && !pending && (
        <p className="text-xs text-slate-500">Mark every trial complete first.</p>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
