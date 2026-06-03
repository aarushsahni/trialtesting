// Split the annotation-guide markdown into editable segments for the
// structured (inline-table) editor, and serialize them back to markdown.
//
// Goals:
//  - Tables become grid-editable (the painful part of raw markdown).
//  - Prose stays as plain text segments.
//  - UNTOUCHED segments round-trip byte-for-byte, so the tooltip parser
//    (guide-parser.ts), which keys off the exact `| Field | ... |` table
//    layout, keeps working after a save.
//
// A segment is either prose ('text') or a parsed GFM table ('table'). Each
// table keeps its original raw markdown; we only re-serialize a table when it
// has actually been edited (`dirty`), to avoid cosmetic churn in the doc.

export interface TextSegment {
  kind: 'text';
  text: string;
}

export interface TableSegment {
  kind: 'table';
  /** Original markdown for this table, used when not edited. */
  raw: string;
  header: string[];
  /** Raw separator cells, e.g. ['---', ':--', '--:'] — preserved on output. */
  align: string[];
  rows: string[][];
}

export type Segment = TextSegment | TableSegment;

// Split a single table row into cell strings. Respects backslash escapes and
// backtick code spans (a `|` inside `code` or after `\` is not a delimiter).
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);

  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      cur += ch + s[i + 1];
      i++;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes('-') || !t.startsWith('|')) return false;
  const cells = splitRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function isPipeRow(line: string): boolean {
  return line.trim().startsWith('|');
}

/** Parse markdown into ordered text/table segments. */
export function parseSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n');
  const segments: Segment[] = [];
  let textBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length > 0) {
      segments.push({ kind: 'text', text: textBuf.join('\n') });
      textBuf = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    // A table starts when this line is a pipe row and the next is a separator.
    if (isPipeRow(line) && next !== undefined && isSeparatorRow(next)) {
      // Collect the contiguous run of pipe rows.
      const tableLines: string[] = [line, next];
      let j = i + 2;
      while (j < lines.length && isPipeRow(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }

      const header = splitRow(tableLines[0]);
      const align = splitRow(tableLines[1]);
      const bodyLines = tableLines.slice(2);
      const rows = bodyLines.map(splitRow);

      // Only treat as a grid table if every row matches the column count.
      const n = header.length;
      const clean =
        align.length === n && rows.every((r) => r.length === n) && n > 0;

      if (clean) {
        flushText();
        segments.push({
          kind: 'table',
          raw: tableLines.join('\n'),
          header,
          align,
          rows,
        });
      } else {
        // Malformed for grid purposes — keep as raw text so it stays editable.
        textBuf.push(...tableLines);
      }
      i = j;
      continue;
    }

    textBuf.push(line);
    i++;
  }

  flushText();
  return segments;
}

/** Serialize one table segment to GFM markdown. */
export function serializeTable(t: TableSegment): string {
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [row(t.header), row(t.align), ...t.rows.map(row)].join('\n');
}

/**
 * Serialize segments back to a single markdown string. Pass `dirtyTables` (a
 * set of segment indices that were edited) so untouched tables emit their
 * original raw markdown verbatim.
 */
export function serializeSegments(
  segments: Segment[],
  dirtyTables?: Set<number>,
): string {
  return segments
    .map((seg, idx) => {
      if (seg.kind === 'text') return seg.text;
      if (dirtyTables && !dirtyTables.has(idx)) return seg.raw;
      return serializeTable(seg);
    })
    .join('\n');
}
