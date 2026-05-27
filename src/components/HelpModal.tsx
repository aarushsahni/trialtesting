'use client';

import { useEffect, useState } from 'react';

interface Props {
  storageKey: string; // localStorage key — auto-show once per browser per key
}

export function HelpModal({ storageKey }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(storageKey)) {
        setOpen(true);
        window.localStorage.setItem(storageKey, '1');
      }
    } catch {}
  }, [storageKey]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 w-10 h-10 rounded-full bg-white border border-slate-300 shadow-lg text-slate-600 hover:text-blue-700 hover:border-blue-400 transition text-base font-semibold"
        aria-label="Help"
        title="How to take this test"
      >
        ?
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 lg:p-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-slate-900 mb-1">How to take this test</h2>
            <p className="text-sm text-slate-500 mb-5">Quick reference — reopen via the ? button.</p>

            <ol className="space-y-3 text-sm text-slate-700">
              <Step n={1}>
                <strong>Label each trial blind.</strong> Read the trial text on the
                left. Fill in every field on the right from the eligibility text alone
                — don&apos;t infer from the drug name or sponsor.
              </Step>
              <Step n={2}>
                <strong>`null` means the trial doesn&apos;t constrain that field.</strong>
                It is <em>not</em> &quot;I don&apos;t know.&quot; If the trial mentions a field, set
                its value; if not, leave it blank/null.
              </Step>
              <Step n={3}>
                <strong>Multi-select chips — pick every value the trial accepts.</strong>
                If the trial enrolls both stage I and stage II, click both.
              </Step>
              <Step n={4}>
                <strong>Booleans:</strong>{' '}
                <em>Yes</em> = trial requires it present, <em>No</em> = trial requires it
                absent (explicit exclusion), <em>null</em> = trial doesn&apos;t mention it.
              </Step>
              <Step n={5}>
                <strong>Prior therapy widget:</strong> for each therapy, pick
                Unconstrained / Required / Excluded. Mutually exclusive — picking Required
                clears Excluded.
              </Step>
              <Step n={6}>
                <strong>Ambiguity?</strong> Don&apos;t guess. Write a note in the &quot;Notes &amp;
                flags&quot; box and pick your best single interpretation.
              </Step>
              <Step n={7}>
                <strong>Click &quot;Mark complete&quot; when done.</strong> All trials must be
                marked complete before you can submit the test. Edits auto-save.
              </Step>
            </ol>

            <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-900">
              📖 Full guide at <a href="/guide" target="_blank" rel="noopener" className="underline font-medium">/guide</a> —
              has detailed per-block annotation notes (BCG status, HRD vs BRCA, HER2-low banding, etc.).
            </div>

            <button
              onClick={() => setOpen(false)}
              className="mt-5 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
