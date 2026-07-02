'use client';

// Floating action button anchored to a viewport rect. Rendered by
// RawTrialPanel while the annotator has a text selection ready to become a
// highlight, or a click target that hits an existing highlight to remove.

interface Props {
  rect: DOMRect;
  mode: 'add' | 'remove';
  onApply: () => void;
}

export function HighlightPopover({ rect, mode, onApply }: Props) {
  const top = Math.max(8, rect.top - 36);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 180));
  return (
    <div
      data-highlight-popover="true"
      className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-lg"
      style={{ top, left }}
    >
      <button
        type="button"
        onClick={onApply}
        className={
          'text-xs font-medium px-2.5 py-1.5 rounded-md ' +
          (mode === 'add'
            ? 'bg-yellow-200 hover:bg-yellow-300 text-slate-900'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700')
        }
      >
        {mode === 'add' ? 'Highlight' : 'Remove highlight'}
      </button>
    </div>
  );
}
