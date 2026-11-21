// Hungarian (Kuhn–Munkres) assignment: given an n×m cost matrix, find the
// assignment of rows to columns that minimizes total cost. Rectangular
// matrices are padded to square with zero-cost dummy rows/columns; the caller
// filters dummy assignments out. Used to pair the two annotators' cohorts
// during adjudication (maximizing similarity = minimizing 1 − s).
//
// Copied from tempo-optimization (src/lib/eval/hungarian.ts), which pairs
// model cohorts with expert cohorts the same way.

export function hungarian(cost: number[][]): number[] {
  const rows = cost.length;
  const cols = rows === 0 ? 0 : cost[0].length;
  const n = Math.max(rows, cols);
  if (n === 0) return [];

  // Square matrix, 1-indexed for the classic implementation.
  const a: number[][] = [];
  for (let i = 0; i <= n; i++) {
    a.push(new Array(n + 1).fill(0));
    for (let j = 1; j <= n; j++) {
      a[i][j] = i >= 1 && i <= rows && j <= cols ? cost[i - 1][j - 1] : 0;
    }
  }

  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[j] = row assigned to column j
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a[i0][j] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  // assignment[row] = column (0-indexed); -1 when assigned to a dummy column.
  const assignment = new Array(rows).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j];
    if (i >= 1 && i <= rows && j <= cols) assignment[i - 1] = j - 1;
  }
  return assignment;
}
