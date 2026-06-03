'use client';

// Inline, document-like editor for the annotation guide.
//   - Tables render as editable grids (click a cell to edit, add/delete rows).
//   - Prose renders as the normal markdown, click-to-edit per block.
// Emits serialized markdown up to the parent on every change. Untouched tables
// keep their original markdown verbatim (see guide-segments.ts), so the
// per-field tooltip parser keeps working.

import { useEffect, useRef, useState } from 'react';
import { GuideMarkdown } from './GuideMarkdown';
import {
  Segment,
  TableSegment,
  parseSegments,
  serializeSegments,
} from '@/lib/guide-segments';

interface Props {
  initialMarkdown: string;
  headingToId: Record<string, string>;
  onChange: (markdown: string) => void;
}

// Textarea that grows to fit its content.
function AutoTextarea({
  value,
  onChange,
  onCommit,
  className,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      spellCheck={false}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      onBlur={onCommit}
      className={className}
    />
  );
}

// One prose block: shows rendered markdown; click to edit as raw text.
function TextBlock({
  text,
  headingToId,
  onChange,
}: {
  text: string;
  headingToId: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const empty = text.trim().length === 0;

  if (editing) {
    return (
      <div className="relative group my-1">
        <AutoTextarea
          value={text}
          autoFocus
          onChange={onChange}
          onCommit={() => setEditing(false)}
          className="w-full p-3 border border-blue-300 rounded-lg text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-blue-50/30"
        />
        <div className="text-[11px] text-slate-400 mt-1">
          Editing text — click away to finish.
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative group rounded-lg hover:bg-blue-50/40 transition cursor-text"
      onClick={() => setEditing(true)}
      title="Click to edit this text"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="absolute right-1 top-1 z-10 opacity-0 group-hover:opacity-100 transition text-[11px] px-2 py-0.5 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-50 shadow-sm"
      >
        Edit text
      </button>
      {empty ? (
        <div className="text-xs text-slate-300 italic py-2 px-1">
          (empty — click to add text)
        </div>
      ) : (
        <GuideMarkdown source={text} headingToId={headingToId} />
      )}
    </div>
  );
}

// One editable table grid.
function TableBlock({
  table,
  onChange,
}: {
  table: TableSegment;
  onChange: (t: TableSegment) => void;
}) {
  const n = table.header.length;

  const setCell = (r: number, c: number, v: string) => {
    const rows = table.rows.map((row) => row.slice());
    rows[r][c] = v;
    onChange({ ...table, rows });
  };
  const addRow = () => {
    onChange({ ...table, rows: [...table.rows, Array(n).fill('')] });
  };
  const deleteRow = (r: number) => {
    onChange({ ...table, rows: table.rows.filter((_, i) => i !== r) });
  };

  return (
    <div className="my-5 overflow-x-auto">
      <table className="text-sm w-full border-collapse border border-slate-200 rounded-lg">
        <thead className="bg-slate-50 border-b-2 border-slate-200">
          <tr>
            {table.header.map((h, c) => (
              <th
                key={c}
                className="text-left py-2 px-3 font-semibold text-slate-800 text-xs border-r border-slate-200 last:border-r-0"
              >
                {h.replace(/`/g, '')}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-b border-slate-100 group/row align-top hover:bg-slate-50/60">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="px-1.5 py-1 border-r border-slate-100 last:border-r-0 align-top"
                >
                  <AutoTextarea
                    value={cell}
                    onChange={(v) => setCell(r, c, v)}
                    className="w-full px-1.5 py-1 text-sm text-slate-700 bg-transparent rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white leading-snug"
                  />
                </td>
              ))}
              <td className="align-middle text-center">
                <button
                  type="button"
                  onClick={() => deleteRow(r)}
                  title="Delete row"
                  className="opacity-0 group-hover/row:opacity-100 transition text-slate-400 hover:text-red-600 px-1"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 text-xs px-3 py-1 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition"
      >
        + Add row
      </button>
    </div>
  );
}

export function GuideStructuredEditor({ initialMarkdown, headingToId, onChange }: Props) {
  const [segments, setSegments] = useState<Segment[]>(() => parseSegments(initialMarkdown));
  // Tables that the user has edited — only these are re-serialized; others keep
  // their original raw markdown so untouched content never churns.
  const dirtyRef = useRef<Set<number>>(new Set());

  const update = (next: Segment[], dirtyIdx?: number) => {
    if (dirtyIdx !== undefined) dirtyRef.current.add(dirtyIdx);
    setSegments(next);
    onChange(serializeSegments(next, dirtyRef.current));
  };

  return (
    <div className="prose-styles">
      {segments.map((seg, idx) => {
        if (seg.kind === 'text') {
          return (
            <TextBlock
              key={idx}
              text={seg.text}
              headingToId={headingToId}
              onChange={(v) => {
                const next = segments.slice();
                next[idx] = { kind: 'text', text: v };
                update(next);
              }}
            />
          );
        }
        return (
          <TableBlock
            key={idx}
            table={seg}
            onChange={(t) => {
              const next = segments.slice();
              next[idx] = t;
              update(next, idx);
            }}
          />
        );
      })}
    </div>
  );
}
