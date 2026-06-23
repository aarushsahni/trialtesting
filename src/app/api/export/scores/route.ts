// CSV export: per-(expert, test trial) score summary. Reviewer-only.

import { NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { rowsToCsv } from '@/lib/csv';

export const runtime = 'nodejs';

interface Row {
  expert_name: string;
  nct_id: string;
  brief_title: string;
  status: string;
  submitted_at: string | null;
  test_reviewed_at: string | null;
  score_data: any | null;
}

export async function GET() {
  const session = await readSession();
  if (!session || session.role !== 'reviewer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const rows = await query<Row>(`
    SELECT
      u.name AS expert_name,
      t.nct_id,
      t.brief_title,
      a.status,
      a.submitted_at,
      ta.test_reviewed_at,
      a.score_data
    FROM annotations a
    JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id
    JOIN users u ON u.id = a.expert_id
    JOIN trials t ON t.nct_id = a.nct_id
    WHERE ta.is_test_trial = TRUE
    ORDER BY u.name, a.submitted_at DESC NULLS LAST, a.started_at DESC
  `);

  const headers = [
    'expert', 'nct_id', 'trial_title', 'status', 'submitted_at', 'test_reviewed_at',
    'overall_f1', 'passed',
    'tp', 'fp', 'fn', 'tn',
    'biomarker_f1', 'prior_therapy_f1', 'lab_cutoff_f1', 'accepted_diseases_f1', 'other_f1',
    'worst_cohort_f1', 'worst_cohort_key',
  ];
  const csvRows = rows.map((r) => {
    const s = r.score_data ?? {};
    const c = s.byClass ?? {};
    const cohorts = s.byCohort ?? {};
    let worstKey = '', worstF1: number | '' = '';
    for (const [k, v] of Object.entries(cohorts) as [string, { f1?: number }][]) {
      const f1 = v?.f1;
      if (typeof f1 === 'number' && (worstF1 === '' || f1 < worstF1)) {
        worstKey = k; worstF1 = f1;
      }
    }
    return [
      r.expert_name, r.nct_id, r.brief_title, r.status,
      r.submitted_at ?? '', r.test_reviewed_at ?? '',
      s.overallF1 ?? '', s.passed ?? '',
      s.total?.tp ?? '', s.total?.fp ?? '', s.total?.fn ?? '', s.total?.tn ?? '',
      c.biomarker?.f1 ?? '', c.prior_therapy?.f1 ?? '', c.lab_cutoff?.f1 ?? '',
      c.accepted_diseases?.f1 ?? '', c.other?.f1 ?? '',
      worstF1, worstKey,
    ];
  });

  return new NextResponse(rowsToCsv(headers, csvRows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expert-scores-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
