// Tiny CSV helpers — no deps, RFC4180-style quoting.

export function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'string' ? v : Array.isArray(v) ? v.join('|') : String(v);
  if (typeof v === 'object' && !Array.isArray(v)) s = JSON.stringify(v);
  // Always quote if it contains anything risky
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\n') + '\n';
}
