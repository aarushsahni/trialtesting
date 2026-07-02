'use client';

// Renders one raw source string with the annotator's saved highlights
// overlaid as <mark> spans. Used for briefTitle, briefSummary, and
// detailedDescription. Whitespace CSS is controlled by the parent element.

import { Highlight, HighlightableField, splitSegment } from '@/lib/highlights';

interface Props {
  source: string;
  field: HighlightableField;
  ranges: Highlight[];
}

export function HighlightableText({ source, field, ranges }: Props) {
  const pieces = splitSegment(0, source.length, ranges);
  return (
    <>
      {pieces.map((p, i) => {
        const chunk = source.slice(p.start, p.start + p.len);
        if (p.highlighted) {
          return (
            <mark
              key={i}
              data-source-field={field}
              data-source-start={p.start}
              data-highlight-piece="true"
              className="bg-yellow-200 text-inherit rounded-sm px-0.5"
            >
              {chunk}
            </mark>
          );
        }
        return (
          <span
            key={i}
            data-source-field={field}
            data-source-start={p.start}
          >
            {chunk}
          </span>
        );
      })}
    </>
  );
}
