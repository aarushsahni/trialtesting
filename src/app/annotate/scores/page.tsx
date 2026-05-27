import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { FieldClass } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface AttemptSummary {
  attempt_id: string;
  reviewer_name: string;
  set_name: string;
  status: string;
  submitted_at: string | null;
  score_data: ScoreData | null;
}

interface ScoreData {
  overallF1: number;
  hardExcludeF1: number;
  passed: boolean;
  passOverallBar: number;
  passHardBar: number;
  total: { tp: number; fp: number; fn: number; tn: number };
  hardExclude: { tp: number; fp: number; fn: number; tn: number };
  byClass: Record<FieldClass, { tp: number; fp: number; fn: number; tn: number; f1: number }>;
  byBlock: Record<string, { tp: number; fp: number; fn: number; tn: number; f1: number }>;
}

export default async function ScoresPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'annotator') redirect('/review');

  const rows = await query<AttemptSummary>(`
    SELECT
      qa.id AS attempt_id,
      u.name AS reviewer_name,
      qs.name AS set_name,
      qa.status,
      qa.submitted_at,
      qa.score_data
    FROM qualification_attempts qa
    JOIN users u ON u.id = qa.reviewer_id
    JOIN qualification_sets qs ON qs.id = qa.qualification_set_id
    ORDER BY qa.submitted_at DESC NULLS LAST, qa.started_at DESC
  `);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <Link href="/annotate" className="text-sm text-blue-600 hover:underline">← Annotator dashboard</Link>
        <div className="mt-3 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Reviewer scores</h1>
          <p className="text-sm text-slate-600 mt-1">
            Pass bar: overall F1 ≥ 0.75 <span className="text-slate-400">·</span> hard-exclude F1 ≥ 0.80.
            Reviewers don&apos;t see their own scores — only you do.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No reviewer attempts yet.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <AttemptCard key={r.attempt_id} row={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function AttemptCard({ row }: { row: AttemptSummary }) {
  const s = row.score_data;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold text-slate-900">{row.reviewer_name}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{row.set_name}</p>
        </div>
        <StatusPill status={row.status} />
      </div>

      {row.status === 'in_progress' && (
        <p className="text-sm text-slate-500">Has started; not yet submitted.</p>
      )}

      {(row.status === 'passed' || row.status === 'failed' || row.status === 'submitted') && s && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <MetricBlock
              label="Overall F1"
              value={s.overallF1}
              bar={s.passOverallBar}
              counters={s.total}
            />
            <MetricBlock
              label="Hard-exclude F1"
              value={s.hardExcludeF1}
              bar={s.passHardBar}
              counters={s.hardExclude}
            />
          </div>
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
              Per-class breakdown
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="text-xs w-full">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1 pr-3">Class</th>
                    <th className="text-right py-1 px-2">F1</th>
                    <th className="text-right py-1 px-2">TP</th>
                    <th className="text-right py-1 px-2">FP</th>
                    <th className="text-right py-1 px-2">FN</th>
                    <th className="text-right py-1 px-2">TN</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(s.byClass).map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-3 font-medium text-slate-700">{k}</td>
                      <td className="text-right py-1 px-2">{v.f1.toFixed(3)}</td>
                      <td className="text-right py-1 px-2">{v.tp}</td>
                      <td className="text-right py-1 px-2">{v.fp}</td>
                      <td className="text-right py-1 px-2">{v.fn}</td>
                      <td className="text-right py-1 px-2">{v.tn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {row.submitted_at && (
        <p className="text-xs text-slate-400 mt-3">
          Submitted {new Date(row.submitted_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: 'bg-blue-100 text-blue-700',
    submitted: 'bg-slate-100 text-slate-700',
    passed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
  };
  return (
    <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded ${styles[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function MetricBlock({
  label, value, bar, counters,
}: { label: string; value: number; bar: number; counters: { tp: number; fp: number; fn: number; tn: number } }) {
  const passed = value >= bar;
  return (
    <div className={`rounded-xl border p-3 ${passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-2xl font-bold ${passed ? 'text-emerald-700' : 'text-red-700'}`}>
          {value.toFixed(3)}
        </span>
        <span className="text-xs text-slate-500">bar ≥ {bar.toFixed(2)}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-1.5">
        TP {counters.tp} · FP {counters.fp} · FN {counters.fn} · TN {counters.tn}
      </div>
    </div>
  );
}
