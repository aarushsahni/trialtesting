import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, MAX_CORPUS_REVIEWS } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface TrialProgressRow {
  nct_id: string;
  brief_title: string;
  assigned_blocks: string[];
  position: number;
  claim_count: number;
  submitted_count: number;
  reviewer_names: string[] | null;
  adjudicated_fields: number;
  last_adjudicated_at: string | null;
  last_review_update: string | null;
}

export default async function CorpusProgressPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const trials = await query<TrialProgressRow>(`
    SELECT ct.nct_id, ct.brief_title, ct.assigned_blocks, ct.position,
           COUNT(cr.id)::int AS claim_count,
           COUNT(cr.id) FILTER (WHERE cr.status = 'submitted')::int AS submitted_count,
           ARRAY_AGG(u.name ORDER BY cr.claimed_at) FILTER (WHERE u.name IS NOT NULL) AS reviewer_names,
           (SELECT COUNT(*)::int FROM corpus_adjudications ca WHERE ca.nct_id = ct.nct_id) AS adjudicated_fields,
           (SELECT MAX(ca.decided_at) FROM corpus_adjudications ca WHERE ca.nct_id = ct.nct_id) AS last_adjudicated_at,
           MAX(cr.updated_at) AS last_review_update
    FROM corpus_trials ct
    LEFT JOIN corpus_reviews cr ON cr.nct_id = ct.nct_id
    LEFT JOIN users u ON u.id = cr.expert_id
    GROUP BY ct.nct_id
    ORDER BY ct.position, ct.nct_id
  `);

  const total = trials.length;
  const done = trials.filter((t) => t.submitted_count >= MAX_CORPUS_REVIEWS).length;
  const inProgress = trials.filter((t) => t.claim_count > 0 && t.submitted_count < MAX_CORPUS_REVIEWS).length;
  const untouched = total - done - inProgress;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Trial corpus progress</h1>
          <p className="text-sm text-slate-600 mt-1">
            Every trial needs {MAX_CORPUS_REVIEWS} submitted expert reviews. Once both are in,
            open the trial to adjudicate field-level disagreements.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30 mb-8">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-slate-600">
              <strong className="text-slate-900">{done}</strong> / {total} trials fully reviewed
              {inProgress > 0 && <span className="text-amber-700"> · {inProgress} in progress</span>}
              {untouched > 0 && <span className="text-slate-400"> · {untouched} untouched</span>}
            </span>
            <span className="text-sm font-bold text-blue-700">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
          {trials.map((t) => {
            const blocks = (t.assigned_blocks as BlockKey[]).map((b) => BLOCKS[b]?.label ?? b);
            const isDone = t.submitted_count >= MAX_CORPUS_REVIEWS;
            const stale =
              t.adjudicated_fields > 0 &&
              t.last_adjudicated_at && t.last_review_update &&
              new Date(t.last_review_update) > new Date(t.last_adjudicated_at);
            const dot = isDone ? 'bg-emerald-500' : t.claim_count > 0 ? 'bg-amber-400' : 'bg-slate-300';
            return (
              <Link
                key={t.nct_id}
                href={`/review/corpus/${t.nct_id}`}
                className="block p-4 hover:bg-blue-50 transition"
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                      <span>{t.nct_id}</span>
                      {blocks.map((b) => (
                        <span key={b} className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-semibold">
                          {b}
                        </span>
                      ))}
                      {stale && (
                        <span className="text-[10px] uppercase tracking-wider text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-semibold">
                          ⚠ Reviews changed since adjudication
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>
                        {t.submitted_count}/{MAX_CORPUS_REVIEWS} reviews submitted
                        {t.claim_count > t.submitted_count && ` (${t.claim_count - t.submitted_count} in progress)`}
                      </span>
                      {t.reviewer_names && t.reviewer_names.length > 0 && (
                        <span>· {t.reviewer_names.join(', ')}</span>
                      )}
                      {t.adjudicated_fields > 0 && (
                        <span className="text-purple-700">· {t.adjudicated_fields} fields adjudicated</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
