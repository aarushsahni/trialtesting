'use client';

import { useState } from 'react';
import { GuideMarkdown } from './GuideMarkdown';
import { saveGuideAction } from '@/app/actions/review';

interface Props {
  initial: string;
  headingToId: Record<string, string>;
}

export function GuideEditor({ initial, headingToId }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [markdown, setMarkdown] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = markdown !== saved;

  async function onSave() {
    setPending(true);
    setErr(null);
    const r = await saveGuideAction(markdown);
    setPending(false);
    if (!r.ok) {
      setErr(r.error ?? 'Save failed');
      return;
    }
    setSaved(markdown);
    setSavedAt(Date.now());
  }

  return (
    <div>
      <div className="flex items-center justify-between mt-4 mb-4 gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          <button
            onClick={() => setMode('view')}
            className={
              'px-4 py-1.5 ' +
              (mode === 'view' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            View
          </button>
          <button
            onClick={() => setMode('edit')}
            className={
              'px-4 py-1.5 ' +
              (mode === 'edit' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            Edit
          </button>
        </div>
        {mode === 'edit' && (
          <div className="flex items-center gap-3">
            {pending ? (
              <span className="text-xs text-blue-600">Saving…</span>
            ) : err ? (
              <span className="text-xs text-red-600">⚠ {err}</span>
            ) : savedAt ? (
              <span className="text-xs text-emerald-700">Saved {new Date(savedAt).toLocaleTimeString()}</span>
            ) : dirty ? (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            ) : null}
            <button
              onClick={onSave}
              disabled={!dirty || pending}
              className="text-sm px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm shadow-emerald-200"
            >
              Save
            </button>
          </div>
        )}
      </div>

      {mode === 'view' ? (
        <GuideMarkdown source={markdown} headingToId={headingToId} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="w-full h-[70vh] p-4 border border-slate-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            spellCheck={false}
          />
          <div className="border border-slate-200 rounded-xl p-4 max-h-[70vh] overflow-y-auto">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              Live preview
            </div>
            <GuideMarkdown source={markdown} headingToId={headingToId} />
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500 mt-6 leading-relaxed border-t border-slate-200 pt-4">
        <strong>Note:</strong> changes save to the database immediately. The
        &quot;What it captures&quot; column for each field is also used as the
        hover-tooltip text on the trial annotation forms — edits here flow
        through to those tooltips after a save.
      </p>
    </div>
  );
}
