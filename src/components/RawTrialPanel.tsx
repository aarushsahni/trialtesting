'use client';

// Render the raw CT.gov fields for one trial. Used by both the expert
// annotation editor (with highlight interactivity) and the reviewer
// reference-key editor (plain read-only).
//
// When `highlights` and `onChangeHighlights` are both provided and
// `disabled` is not set, the panel wires up text-selection tracking:
// selecting text in briefTitle / briefSummary / detailedDescription /
// eligibilityRaw pops a floating "Highlight" button; clicking an existing
// <mark> pops "Remove highlight". Ranges are stored as raw character
// offsets into each field's source string.

import { useEffect, useRef, useState } from 'react';
import { EligibilityText } from './EligibilityText';
import { HighlightableText } from './HighlightableText';
import { HighlightPopover } from './HighlightPopover';
import {
  Highlight,
  HighlightableField,
  TrialHighlights,
  mergeRange,
  subtractRange,
} from '@/lib/highlights';

export interface RawTrial {
  nctId: string;
  briefTitle: string;
  briefSummary: string | null;
  detailedDescription: string | null;
  eligibilityRaw: string | null;
  conditions: string[];
  interventions: string[];
  overallStatus: string | null;
  studyType: string | null;
  phases: string[] | null;
  ctgovSex: string | null;
  ctgovMinAge: string | null;
  ctgovMaxAge: string | null;
}

interface Props {
  trial: RawTrial;
  highlights?: TrialHighlights | null;
  onChangeHighlights?: (next: TrialHighlights) => void;
  disabled?: boolean;
}

interface Pending {
  mode: 'add' | 'remove';
  field: HighlightableField;
  range: Highlight;
  rect: DOMRect;
}

// Walk from a Selection endpoint to the piece span that owns it and compute
// the raw source offset. Piece spans always contain exactly one text node,
// so text-node offsets map to raw offsets by simple addition.
function resolveEndpoint(
  node: Node,
  offset: number,
): { field: HighlightableField; sourceOffset: number } | null {
  const el =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  if (!el) return null;
  const anchor = el.closest('[data-source-field]') as HTMLElement | null;
  if (!anchor) return null;
  const field = anchor.dataset.sourceField as HighlightableField;
  const start = Number(anchor.dataset.sourceStart || '0');
  if (node.nodeType === Node.TEXT_NODE) {
    return { field, sourceOffset: start + offset };
  }
  // Element-anchored selection — clamp to boundary of the piece's text.
  const text = anchor.textContent ?? '';
  return { field, sourceOffset: start + (offset >= 1 ? text.length : 0) };
}

export function RawTrialPanel({ trial, highlights, onChangeHighlights, disabled }: Props) {
  const interactive = !!(highlights && onChangeHighlights && !disabled);
  const rootRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const highlightsRef = useRef(highlights);
  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);

  useEffect(() => {
    if (!interactive) { setPending(null); return; }

    function onMouseUp(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-highlight-popover]')) return;

      // Let the browser finalize the selection state before reading it.
      setTimeout(() => {
        const root = rootRef.current;
        if (!root) return;
        const sel = window.getSelection();

        if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
          const range = sel.getRangeAt(0);
          if (
            root.contains(range.startContainer) &&
            root.contains(range.endContainer)
          ) {
            const startInfo = resolveEndpoint(range.startContainer, range.startOffset);
            const endInfo = resolveEndpoint(range.endContainer, range.endOffset);
            if (startInfo && endInfo && startInfo.field === endInfo.field) {
              const a = Math.min(startInfo.sourceOffset, endInfo.sourceOffset);
              const b = Math.max(startInfo.sourceOffset, endInfo.sourceOffset);
              if (b > a) {
                setPending({
                  mode: 'add',
                  field: startInfo.field,
                  range: { start: a, end: b },
                  rect: range.getBoundingClientRect(),
                });
                return;
              }
            }
          }
          setPending(null);
          return;
        }

        // No selection — was this a click on an existing highlight?
        const mark = target?.closest?.(
          '[data-highlight-piece="true"]',
        ) as HTMLElement | null;
        if (mark) {
          const field = mark.dataset.sourceField as HighlightableField;
          const anchor = Number(mark.dataset.sourceStart || '0');
          const list = (highlightsRef.current?.[field] ?? []) as Highlight[];
          const owning = list.find((r) => r.start <= anchor && r.end > anchor);
          if (owning) {
            setPending({
              mode: 'remove',
              field,
              range: owning,
              rect: mark.getBoundingClientRect(),
            });
            return;
          }
        }
        setPending(null);
      }, 0);
    }

    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [interactive]);

  useEffect(() => {
    if (!pending) return;
    function onScroll() { setPending(null); }
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [pending]);

  function apply() {
    if (!pending || !onChangeHighlights) return;
    const current = highlightsRef.current ?? {};
    const prev = (current[pending.field] ?? []) as Highlight[];
    const nextList =
      pending.mode === 'add'
        ? mergeRange(prev, pending.range)
        : subtractRange(prev, pending.range);
    const next: TrialHighlights = { ...current, [pending.field]: nextList };
    onChangeHighlights(next);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  const isPlaceholder = trial.nctId.startsWith('TRIAL-');
  const phaseStatusItems = [
    ...(trial.phases ?? []),
    ...(trial.overallStatus ? [trial.overallStatus] : []),
  ];

  // Show marks whenever highlights are provided (interactive or read-only).
  // Selection UI is separately gated on `interactive`.
  const briefTitleRanges = highlights?.briefTitle ?? [];
  const briefSummaryRanges = highlights?.briefSummary ?? [];
  const detailedRanges = highlights?.detailedDescription ?? [];
  const eligibilityRanges = highlights?.eligibilityRaw ?? [];

  return (
    <section
      ref={rootRef}
      className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 overflow-hidden"
    >
      <header className="px-6 py-3 border-b border-slate-100">
        <h2 className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
          Raw CT.gov data
        </h2>
      </header>
      <div className="px-6 py-5 space-y-5">
        <Block label="NCT">
          {isPlaceholder ? (
            <span className="font-mono text-sm text-slate-700">{trial.nctId}</span>
          ) : (
            <a
              href={`https://clinicaltrials.gov/study/${trial.nctId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm text-blue-600 hover:underline"
            >
              {trial.nctId}
            </a>
          )}
        </Block>

        <Block label="Brief title">
          <p className="text-sm text-slate-900 leading-relaxed">
            <HighlightableText
              source={trial.briefTitle}
              field="briefTitle"
              ranges={briefTitleRanges}
            />
          </p>
        </Block>

        {phaseStatusItems.length > 0 && (
          <Block label="Phase / status">
            <ChipRow items={phaseStatusItems} />
          </Block>
        )}

        {trial.conditions.length > 0 && (
          <Block label="Conditions">
            <ChipRow items={trial.conditions} />
          </Block>
        )}

        {trial.interventions.length > 0 && (
          <Block label="Interventions">
            <ChipRow items={trial.interventions} />
          </Block>
        )}

        {(trial.studyType || trial.ctgovSex || trial.ctgovMinAge || trial.ctgovMaxAge) && (
          <Block label="Study metadata">
            <dl className="text-xs text-slate-700 grid grid-cols-2 gap-x-4 gap-y-1.5">
              <Meta k="Study type" v={trial.studyType} />
              <Meta k="Sex" v={trial.ctgovSex} />
              <Meta k="Min age" v={trial.ctgovMinAge} />
              <Meta k="Max age" v={trial.ctgovMaxAge} />
            </dl>
          </Block>
        )}

        {trial.briefSummary && (
          <Block label="Brief summary">
            <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">
              <HighlightableText
                source={trial.briefSummary}
                field="briefSummary"
                ranges={briefSummaryRanges}
              />
            </p>
          </Block>
        )}

        {trial.detailedDescription && (
          <Block label="Detailed description">
            <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-line">
              <HighlightableText
                source={trial.detailedDescription}
                field="detailedDescription"
                ranges={detailedRanges}
              />
            </p>
          </Block>
        )}

        <Block label="Eligibility criteria (raw)">
          <EligibilityText raw={trial.eligibilityRaw || ''} ranges={eligibilityRanges} />
        </Block>
      </div>

      {pending && interactive && (
        <HighlightPopover rect={pending.rect} mode={pending.mode} onApply={apply} />
      )}
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-md font-medium border border-slate-200"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string | undefined | null }) {
  return (
    <>
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-slate-800">{v || '—'}</dd>
    </>
  );
}
