// Annotator text-highlight scratch pad. Ranges are [start, end) half-open
// character offsets into the raw source string of a trial prose field, kept
// sorted by start and non-overlapping (touching ranges are coalesced).

export interface Highlight {
  start: number;
  end: number;
}

export type HighlightableField =
  | 'briefTitle'
  | 'briefSummary'
  | 'detailedDescription'
  | 'eligibilityRaw';

export const HIGHLIGHTABLE_FIELDS: HighlightableField[] = [
  'briefTitle',
  'briefSummary',
  'detailedDescription',
  'eligibilityRaw',
];

export type TrialHighlights = Partial<Record<HighlightableField, Highlight[]>>;

// Insert a new range into a sorted, non-overlapping list, coalescing any
// existing ranges the new one touches or overlaps.
export function mergeRange(ranges: Highlight[], add: Highlight): Highlight[] {
  if (add.end <= add.start) return ranges.slice();
  const out: Highlight[] = [];
  let mergedStart = add.start;
  let mergedEnd = add.end;
  let placed = false;
  for (const r of ranges) {
    if (r.end < mergedStart) {
      out.push(r);
    } else if (r.start > mergedEnd) {
      if (!placed) {
        out.push({ start: mergedStart, end: mergedEnd });
        placed = true;
      }
      out.push(r);
    } else {
      mergedStart = Math.min(mergedStart, r.start);
      mergedEnd = Math.max(mergedEnd, r.end);
    }
  }
  if (!placed) out.push({ start: mergedStart, end: mergedEnd });
  return out;
}

// Subtract a range from a sorted, non-overlapping list. Ranges that partially
// overlap the subtracted range are trimmed; fully-covered ranges are dropped.
export function subtractRange(ranges: Highlight[], sub: Highlight): Highlight[] {
  if (sub.end <= sub.start) return ranges.slice();
  const out: Highlight[] = [];
  for (const r of ranges) {
    if (r.end <= sub.start || r.start >= sub.end) {
      out.push(r);
      continue;
    }
    if (r.start < sub.start) out.push({ start: r.start, end: sub.start });
    if (r.end > sub.end) out.push({ start: sub.end, end: r.end });
  }
  return out;
}

// Given a segment covering [segStart, segStart+segLen) of raw offsets, split
// into contiguous pieces marking which chars fall inside a highlight range.
// Assumes ranges are sorted and non-overlapping.
export interface SegmentPiece {
  start: number;    // raw offset of the piece's first character
  len: number;      // number of characters
  highlighted: boolean;
}
export function splitSegment(
  segStart: number,
  segLen: number,
  ranges: Highlight[],
): SegmentPiece[] {
  const segEnd = segStart + segLen;
  const pieces: SegmentPiece[] = [];
  let cursor = segStart;
  for (const r of ranges) {
    if (r.end <= cursor) continue;
    if (r.start >= segEnd) break;
    const clipStart = Math.max(r.start, cursor);
    const clipEnd = Math.min(r.end, segEnd);
    if (clipStart > cursor) {
      pieces.push({ start: cursor, len: clipStart - cursor, highlighted: false });
    }
    pieces.push({ start: clipStart, len: clipEnd - clipStart, highlighted: true });
    cursor = clipEnd;
  }
  if (cursor < segEnd) {
    pieces.push({ start: cursor, len: segEnd - cursor, highlighted: false });
  }
  return pieces;
}

// Empty-highlight guard so callers can trim writes for autosave dedup.
export function isEmptyHighlights(h: TrialHighlights | null | undefined): boolean {
  if (!h) return true;
  for (const f of HIGHLIGHTABLE_FIELDS) {
    const list = h[f];
    if (list && list.length > 0) return false;
  }
  return true;
}
