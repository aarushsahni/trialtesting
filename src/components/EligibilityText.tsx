'use client';

// Render CT.gov eligibility free-text as readable HTML, overlaying the
// annotator's saved highlights as <mark> spans.
//
// Parser handles CT.gov conventions:
//   - ALL-CAPS lines ending with ":" → section headers
//   - "*" or "-" prefix → bullets (indentation preserved)
//   - blank lines → paragraph breaks
//
// Every text-carrying segment carries its raw source offset so a saved
// highlight range (in raw offsets into the original eligibility_raw string)
// can be split into contiguous pieces and each piece rendered inside a
// data-source-field/data-source-start-tagged element for round-tripping
// selections back to raw offsets.

import { Fragment } from 'react';
import { Highlight, splitSegment } from '@/lib/highlights';

type ESegment = { text: string; rawStart: number };
type EBlock =
  | { kind: 'header'; segment: ESegment }
  | { kind: 'para'; segments: ESegment[] }
  | { kind: 'list'; items: { segment: ESegment; indent: number }[] };

function parseLines(raw: string): { text: string; startInRaw: number }[] {
  const lines: { text: string; startInRaw: number }[] = [];
  let cursor = 0;
  while (cursor <= raw.length) {
    const nl = raw.indexOf('\n', cursor);
    const end = nl === -1 ? raw.length : nl;
    let text = raw.slice(cursor, end);
    if (text.endsWith('\r')) text = text.slice(0, -1);
    lines.push({ text, startInRaw: cursor });
    if (nl === -1) break;
    cursor = nl + 1;
  }
  return lines;
}

function parse(raw: string): EBlock[] {
  const blocks: EBlock[] = [];
  const lines = parseLines(raw);

  let paraSegments: ESegment[] = [];
  let listItems: { segment: ESegment; indent: number }[] = [];

  const flushPara = () => {
    if (paraSegments.length > 0) {
      blocks.push({ kind: 'para', segments: paraSegments });
      paraSegments = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ kind: 'list', items: listItems });
      listItems = [];
    }
  };

  for (const { text: rawLine, startInRaw } of lines) {
    const stripped = rawLine.replace(/\s+$/, '');
    if (stripped.trim() === '') {
      flushList();
      flushPara();
      continue;
    }
    const bulletMatch = stripped.match(/^(\s*)([\*\-•])(\s+)(.*)$/);
    if (bulletMatch) {
      flushPara();
      const [, leading, , spaces, body] = bulletMatch;
      const indent = Math.floor(leading.length / 2);
      const bodyStartInLine = leading.length + 1 + spaces.length;
      const leadingBodyWs = body.length - body.replace(/^\s+/, '').length;
      const trailingBodyWs = body.length - body.replace(/\s+$/, '').length;
      const trimmedBody = body.slice(leadingBodyWs, body.length - trailingBodyWs);
      if (trimmedBody.length > 0) {
        listItems.push({
          segment: { text: trimmedBody, rawStart: startInRaw + bodyStartInLine + leadingBodyWs },
          indent,
        });
      }
      continue;
    }
    const trimmed = stripped.trim();
    const leadingWs = stripped.length - stripped.replace(/^\s+/, '').length;
    if (
      trimmed.endsWith(':') &&
      trimmed.length <= 80 &&
      /^[A-Z][A-Z0-9 ()\/\-,&'.]*:$/.test(trimmed)
    ) {
      flushList();
      flushPara();
      const headerText = trimmed.slice(0, -1);
      blocks.push({
        kind: 'header',
        segment: { text: headerText, rawStart: startInRaw + leadingWs },
      });
      continue;
    }
    flushList();
    paraSegments.push({ text: trimmed, rawStart: startInRaw + leadingWs });
  }
  flushList();
  flushPara();
  return blocks;
}

// Between paragraph segments we emit a joining space so wrapped source lines
// render as continuous prose. Anchor the space to the newline position in raw
// so selections that end inside it round-trip; wrap in <mark> if the space
// falls inside a saved highlight range.
function JoinSpace({ rawPos, ranges }: { rawPos: number; ranges: Highlight[] }) {
  const highlighted = ranges.some((r) => r.start <= rawPos && r.end > rawPos);
  if (highlighted) {
    return (
      <mark
        data-source-field="eligibilityRaw"
        data-source-start={rawPos}
        data-highlight-piece="true"
        className="bg-yellow-200 text-inherit rounded-sm px-0.5"
      >
        {' '}
      </mark>
    );
  }
  return (
    <span data-source-field="eligibilityRaw" data-source-start={rawPos}>
      {' '}
    </span>
  );
}

function Segment({ segment, ranges }: { segment: ESegment; ranges: Highlight[] }) {
  const pieces = splitSegment(segment.rawStart, segment.text.length, ranges);
  return (
    <>
      {pieces.map((p, i) => {
        const relative = p.start - segment.rawStart;
        const chunk = segment.text.slice(relative, relative + p.len);
        if (p.highlighted) {
          return (
            <mark
              key={i}
              data-source-field="eligibilityRaw"
              data-source-start={p.start}
              data-highlight-piece="true"
              className="bg-yellow-200 text-inherit rounded-sm px-0.5"
            >
              {chunk}
            </mark>
          );
        }
        return (
          <Fragment key={i}>
            <span data-source-field="eligibilityRaw" data-source-start={p.start}>
              {chunk}
            </span>
          </Fragment>
        );
      })}
    </>
  );
}

export function EligibilityText({ raw, ranges }: { raw: string; ranges?: Highlight[] }) {
  if (!raw || !raw.trim()) {
    return <p className="text-sm text-slate-400 italic">No eligibility criteria provided.</p>;
  }
  const blocks = parse(raw);
  const rs = ranges ?? [];

  return (
    <div className="space-y-3 text-sm text-slate-800 leading-relaxed bg-blue-50/40 border border-blue-100 rounded-xl p-5">
      {blocks.map((b, i) => {
        if (b.kind === 'header') {
          return (
            <h4
              key={i}
              className="text-base font-bold text-blue-900 mt-6 first:mt-0 pb-2 border-b-2 border-blue-300"
            >
              <Segment segment={b.segment} ranges={rs} />
            </h4>
          );
        }
        if (b.kind === 'para') {
          return (
            <p key={i} className="text-slate-800">
              {b.segments.map((seg, j) => (
                <Fragment key={j}>
                  <Segment segment={seg} ranges={rs} />
                  {j < b.segments.length - 1 && (
                    <JoinSpace rawPos={seg.rawStart + seg.text.length} ranges={rs} />
                  )}
                </Fragment>
              ))}
            </p>
          );
        }
        return (
          <ul key={i} className="space-y-1.5">
            {b.items.map((it, j) => (
              <li
                key={j}
                className="flex gap-2"
                style={{ paddingLeft: `${it.indent * 1.25}rem` }}
              >
                <span className="text-blue-500 select-none flex-shrink-0">
                  {it.indent === 0 ? '•' : '◦'}
                </span>
                <span className="text-slate-800">
                  <Segment segment={it.segment} ranges={rs} />
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
