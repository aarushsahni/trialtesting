'use client';

// CSS-only hover tooltip. Works regardless of whether neighbouring inputs
// are disabled — the trigger is just a span, no native title attribute needed.

interface Props {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: Props) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className="invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-100 absolute z-30 top-full left-0 mt-1.5 w-72 max-w-[80vw] p-2.5 bg-slate-900 text-white text-xs leading-relaxed rounded-lg shadow-lg pointer-events-none whitespace-normal"
      >
        {text}
      </span>
    </span>
  );
}
