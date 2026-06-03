'use client';

import { useState } from 'react';
import { GuideMarkdown } from './GuideMarkdown';
import { GuideStructuredEditor } from './GuideStructuredEditor';
import { saveGuideAction } from '@/app/actions/review';

interface Props {
  initial: string;
  headingToId: Record<string, string>;
}

type Mode = 'view' | 'edit' | 'raw';

export function GuideEditor({ initial, headingToId }: Props) {
  const [mode, setMode] = useState<Mode>('view');
  // Bumped whenever we enter structured-edit mode, so it re-parses the latest
  // markdown (e.g. after raw edits) by remounting.
  const [editKey, setEditKey] = useState(0);
  const [markdown, setMarkdown] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = markdown !== saved;

  function go(next: Mode) {
    if (next === 'edit') setEditKey((k) => k + 1);
    setMode(next);
  }

  const editing = mode === 'edit' || mode === 'raw';

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
          {([
            ['view', 'View'],
            ['edit', 'Edit'],
            ['raw', 'Raw markdown'],
          ] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => go(m)}
              className={
                'px-4 py-1.5 border-l border-slate-300 first:border-l-0 ' +
                (mode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50')
              }
            >
              {label}
            </button>
          ))}
        </div>
        {editing && (
          <div className="flex items-center gap-3">
            {pending ? (
              <span className="text-xs text-blue-600">Saving…</span>
            ) : err ? (
              <span className="text-xs text-red-600">⚠ {err}</span>
            ) : dirty ? (
              <span className="text-xs text-amber-600">Unsaved changes</span>
            ) : savedAt ? (
              <span className="text-xs text-emerald-700">Saved {new Date(savedAt).toLocaleTimeString()}</span>
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

      {mode === 'view' && (
        <GuideMarkdown source={markdown} headingToId={headingToId} />
      )}

      {mode === 'edit' && (
        <>
          <p className="text-xs text-slate-500 mb-3">
            Click any table cell or paragraph to edit it. Use{' '}
            <strong>+ Add row</strong> / <strong>✕</strong> to manage table rows.
            For bulk edits, switch to <strong>Raw markdown</strong>.
          </p>
          <GuideStructuredEditor
            key={editKey}
            initialMarkdown={markdown}
            headingToId={headingToId}
            onChange={setMarkdown}
          />
        </>
      )}

      {mode === 'raw' && (
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
        <strong>Note:</strong> click <strong>Save</strong> to write changes to
        the database. The &quot;What it captures&quot; column for each field is
        also used as the hover-tooltip text on the trial annotation forms —
        edits here flow through to those tooltips after a save.
      </p>
    </div>
  );
}
