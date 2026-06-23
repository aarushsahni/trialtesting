import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { FieldClass } from '@/lib/types';
import { ResetAnnotationButton } from './ResetAnnotationButton';

export const dynamic = 'force-dynamic';

interface AnnotationSummary {
  annotation_id: string;
  expert_id: string;
  expert_name: string;
  nct_id: string;
  brief_title: string;
  status: 'in_progress' | 'submitted';
  submitted_at: string | null;
  test_reviewed_at: string | null;
  score_data: ScoreData | null;
}

interface ScoreData {
  overallF1: number;
  passed: boolean;
  passOverallBar: number;
  total: { tp: number; fp: number; fn: number; tn: number };
  byClass: Record<FieldClass, { tp: number; fp: number; fn: number; tn: number; f1: number }>;
  byCohort: Record<string, { tp: number; fp: number; fn: number; tn: number; f1: number }>;
  byCancerType: Record<string, { tp: number; fp: number; fn: number; tn: number; f1: number }>;
}

export default async function ScoresPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const rows = await query<AnnotationSummary>(`
    SELECT
      a.id AS annotation_id,
      u.id AS expert_id,
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

  // Group by expert
  const byExpert = new Map<string, { expertName: string; annotations: AnnotationSummary[] }>();
  for (const r of rows) {
    const g = byExpert.get(r.expert_id) ?? { expertName: r.expert_name, annotations: [] };
    g.annotations.push(r);
    byExpert.set(r.expert_id, g);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-8 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Expert scores</h1>
            <p className="text-sm text-slate-600 mt-1">
              Per-test-trial F1 against the reference key. Pass bar: overall F1 ≥ 0.75. Experts don&apos;t see their own scores.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/export/scores"
              className="text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg hover:border-blue-400 hover:text-blue-700 transition whitespace-nowrap"
            >
              Scores CSV
            </a>
            <a
              href="/api/export/attempts"
              className="text-sm px-3 py-2 bg-white border border-slate-300 rounded-lg hover:border-blue-400 hover:text-blue-700 transition whitespace-nowrap"
            >
              Long-format CSV
            </a>
          </div>
        </div>

        {byExpert.size === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No test-trial annotations yet.
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(byExpert.entries()).map(([expertId, group]) => {
              const submitted = group.annotations.filter((a) => a.status === 'submitted');
              const avgF1 = submitted.length > 0
                ? submitted.reduce((acc, r) => acc + (r.score_data?.overallF1 ?? 0), 0) / submitted.length
                : null;
              return (
                <div key={expertId} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30">
                  <div className="flex items-baseline justify-between mb-3 gap-4">
                    <h3 className="font-semibold text-slate-900">{group.expertName}</h3>
                    {avgF1 !== null && (
                      <span className="text-sm text-slate-600">
                        Avg F1: <strong className={`${avgF1 >= 0.75 ? 'text-emerald-700' : 'text-red-700'}`}>{avgF1.toFixed(3)}</strong> across {submitted.length} test{submitted.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-200">
                    {group.annotations.map((a) => (
                      <AnnotationRow key={a.annotation_id} a={a} expertName={group.expertName} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function AnnotationRow({ a, expertName }: { a: AnnotationSummary; expertName: string }) {
  const s = a.score_data;
  return (
    <div className="px-4 py-3 grid grid-cols-[2fr_1fr_1fr_auto] gap-3 items-center text-sm">
      <div className="min-w-0">
        <div className="text-xs text-slate-500 font-mono">{a.nct_id}</div>
        <div className="font-medium text-slate-800 truncate">{a.brief_title}</div>
      </div>
      <div className="text-xs text-slate-600">
        {s?.overallF1 != null ? (
          <>
            F1 <strong className={s.overallF1 >= 0.75 ? 'text-emerald-700' : 'text-red-700'}>
              {s.overallF1.toFixed(3)}
            </strong>
          </>
        ) : a.status === 'submitted' ? 'Score pending' : 'Not submitted'}
      </div>
      <div className="text-xs">
        {a.test_reviewed_at ? (
          <span className="text-emerald-700">Reviewed {new Date(a.test_reviewed_at).toLocaleDateString()}</span>
        ) : a.status === 'submitted' ? (
          <span className="text-amber-700">Awaiting review</span>
        ) : (
          <span className="text-slate-500">In progress</span>
        )}
      </div>
      <ResetAnnotationButton expertId={a.expert_id} nctId={a.nct_id} expertName={expertName} />
    </div>
  );
}
