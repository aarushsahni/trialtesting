// Render CT.gov eligibility free-text as readable HTML.
// Handles their conventions:
//   - ALL-CAPS lines ending with ":" → section headers
//   - "*" or "-" prefix → bullets (indentation preserved)
//   - blank lines → paragraph breaks

type B =
  | { kind: 'header'; text: string }
  | { kind: 'list'; items: { text: string; indent: number }[] }
  | { kind: 'para'; text: string };

function parse(raw: string): B[] {
  const lines = raw.split(/\r?\n/);
  const blocks: B[] = [];
  let buffer: { text: string; indent: number }[] = [];
  let para: string[] = [];

  const flushList = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: 'list', items: buffer });
      buffer = [];
    }
  };
  const flushPara = () => {
    if (para.length > 0) {
      const text = para.join(' ').trim();
      if (text) blocks.push({ kind: 'para', text });
      para = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (line.trim() === '') {
      flushList();
      flushPara();
      continue;
    }

    // Bullet?
    const bulletMatch = line.match(/^(\s*)[\*\-•]\s+(.*)$/);
    if (bulletMatch) {
      flushPara();
      const indent = Math.floor((bulletMatch[1].length || 0) / 2); // 2 spaces per indent level
      buffer.push({ text: bulletMatch[2].trim(), indent });
      continue;
    }

    // Header — all-caps (allowing punctuation/spaces) ending in ":"
    const trimmed = line.trim();
    if (
      trimmed.endsWith(':') &&
      trimmed.length <= 80 &&
      /^[A-Z][A-Z0-9 ()\/\-,&'.]*:$/.test(trimmed)
    ) {
      flushList();
      flushPara();
      blocks.push({ kind: 'header', text: trimmed.replace(/:$/, '') });
      continue;
    }

    // Otherwise plain text — accumulate into a paragraph.
    flushList();
    para.push(line.trim());
  }
  flushList();
  flushPara();
  return blocks;
}

// Turn inline "[8 weeks]" / "[12 courses]" CT.gov annotations into subtle pills
// so they don't disrupt the prose.
function renderInline(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  const re = /\[([^\[\]]{1,40})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span
        key={i++}
        className="inline-block px-1.5 py-0.5 mx-0.5 bg-slate-100 text-slate-600 text-[11px] font-medium rounded align-baseline"
      >
        {m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}

export function EligibilityText({ raw }: { raw: string }) {
  if (!raw || !raw.trim()) {
    return <p className="text-sm text-slate-400 italic">No eligibility criteria provided.</p>;
  }
  const blocks = parse(raw);

  return (
    <div className="space-y-3 text-sm text-slate-800 leading-relaxed bg-blue-50/40 border border-blue-100 rounded-xl p-5">
      {blocks.map((b, i) => {
        if (b.kind === 'header') {
          return (
            <h4
              key={i}
              className="text-xs font-bold uppercase tracking-wider text-blue-800 mt-4 first:mt-0 pb-1 border-b border-blue-200/80"
            >
              {b.text}
            </h4>
          );
        }
        if (b.kind === 'para') {
          return (
            <p key={i} className="text-slate-800">
              {renderInline(b.text)}
            </p>
          );
        }
        // list — render with indentation as nested padding
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
                <span className="text-slate-800">{renderInline(it.text)}</span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
