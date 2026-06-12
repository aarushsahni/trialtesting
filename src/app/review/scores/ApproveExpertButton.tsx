'use client';

import { useState } from 'react';
import { setCorpusApprovalAction } from '@/app/actions/corpus';

export function ApproveExpertButton({
  expertId, expertName, approvedAt,
}: { expertId: string; expertName: string; approvedAt: string | null }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const approved = !!approvedAt;

  async function onClick() {
    if (approved && !confirm(`Revoke ${expertName}'s corpus access? They will no longer see the trial corpus. Their existing reviews are kept.`)) return;
    setPending(true);
    setErr(null);
    const r = await setCorpusApprovalAction({ expertId, approved: !approved });
    setPending(false);
    if (!r.ok) setErr(r.error ?? 'Failed');
    else window.location.reload();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {approved ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded">
            Approved for corpus {new Date(approvedAt!).toLocaleDateString()}
          </span>
          <button
            onClick={onClick}
            disabled={pending}
            className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
          >
            {pending ? '…' : 'Revoke'}
          </button>
        </div>
      ) : (
        <button
          onClick={onClick}
          disabled={pending}
          className="text-xs px-3 py-1.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition shadow-sm shadow-emerald-200 disabled:opacity-50"
        >
          {pending ? 'Approving…' : 'Approve for corpus →'}
        </button>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
