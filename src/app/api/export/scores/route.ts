// CSV export: per-expert score summary.
// Expert-only.

import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { rowsToCsv } from '@/lib/csv';

export const runtime = 'nodejs';

interface Row {
  reviewer_name: string;
  set_name: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score_data: any | null;
}

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== 'expert') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const rows = await query<Row>(`
    SELECT
      u.name AS reviewer_name,
      qs.name AS set_name,
      qa.status,
      qa.started_at,
      qa.submitted_at,
      qa.score_data
    FROM qualification_attempts qa
    JOIN users u ON u.id = qa.reviewer_id
    JOIN qualification_sets qs ON qs.id = qa.qualification_set_id
    ORDER BY qa.submitted_at DESC NULLS LAST, qa.started_at DESC
  `);

  const headers = [
    'expert', 'set', 'status', 'started_at', 'submitted_at',
    'overall_f1', 'hard_exclude_f1', 'passed',
    'tp', 'fp', 'fn', 'tn',
    'biomarker_f1', 'prior_therapy_f1', 'lab_cutoff_f1', 'accepted_diseases_f1', 'other_f1',
  ];
  const csvRows = rows.map((r) => {
    const s = r.score_data ?? {};
    const c = s.byClass ?? {};
    return [
      r.reviewer_name, r.set_name, r.status,
      r.started_at, r.submitted_at ?? '',
      s.overallF1 ?? '', s.hardExcludeF1 ?? '', s.passed ?? '',
      s.total?.tp ?? '', s.total?.fp ?? '', s.total?.fn ?? '', s.total?.tn ?? '',
      c.biomarker?.f1 ?? '', c.prior_therapy?.f1 ?? '', c.lab_cutoff?.f1 ?? '',
      c.accepted_diseases?.f1 ?? '', c.other?.f1 ?? '',
    ];
  });

  return new NextResponse(rowsToCsv(headers, csvRows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expert-scores-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
