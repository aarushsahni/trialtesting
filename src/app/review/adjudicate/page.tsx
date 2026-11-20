import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, MAX_ANNOTATIONS_PER_TRIAL } from '@/lib/db';
import { AdjudicationState, AdjudicationStatus, adjudicationStatus, loadCorpus } from '@/lib/labels-export';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

interface Row {
  nct_id: string;
  brief_title: string;
  position: number;
  claim_count: number;
  submitted_count: number;
  last_adjudicated_at: string | null;
  last_review_update: string | null;
}

type Filter = 'all' | AdjudicationState;
type Sort = 'position' | 'open';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Adjudicated' },
  { id: 'waiting', label: 'Waiting for annotations' },
];

export default async function AdjudicateList({
  searchParams,
}: { searchParams: Promise<{ filter?: string; sort?: string }> }) {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const sp = await searchParams;
  const filter: Filter = FILTERS.some((f) => f.id === sp.filter) ? (sp.filter as Filter) : 'all';
  const sort: Sort = sp.sort === 'open' ? 'open' : 'position';

  // Only trials that have non-test annotations show up here. We exclude test
  // assignments from the counts so an expert's test annotation doesn't leak
  // into the adjudication queue.
  const [trials, corpus] = await Promise.all([
    query<Row>(`
      SELECT t.nct_id, t.brief_title, t.position,
             COUNT(a.*)::int AS claim_count,
             COUNT(a.*) FILTER (WHERE a.status = 'submitted')::int AS submitted_count,
             (SELECT MAX(td.decided_at) FROM trial_adjudications td WHERE td.nct_id = t.nct_id) AS last_adjudicated_at,
             MAX(a.updated_at) AS last_review_update
      FROM trials t
      LEFT JOIN annotations a ON a.nct_id = t.nct_id
      LEFT JOIN trial_assignments ta ON ta.expert_id = a.expert_id AND ta.nct_id = a.nct_id AND ta.is_test_trial = FALSE
      WHERE a.id IS NULL OR ta.expert_id IS NOT NULL
      GROUP BY t.nct_id
      HAVING COUNT(a.*) > 0
      ORDER BY t.position, t.nct_id
    `),
    loadCorpus(),
  ]);

  // Open / auto-resolved counts come from the same merge as the label export.
  const statusById = new Map<string, AdjudicationStatus>(corpus.map((t) => [t.nctId, adjudicationStatus(t)]));
  const statusOf = (id: string): AdjudicationStatus =>
    statusById.get(id) ?? { state: 'waiting', open: 0, autoResolved: 0, decided: 0 };

  const ready = trials.filter((t) => statusOf(t.nct_id).state !== 'waiting');
  const done = ready.filter((t) => statusOf(t.nct_id).state === 'done').length;
  const openTotal = ready.reduce((n, t) => n + statusOf(t.nct_id).open, 0);
  const pct = ready.length ? Math.round((done / ready.length) * 100) : 0;
  const counts: Record<Filter, number> = {
    all: trials.length,
    open: ready.length - done,
    done,
    waiting: trials.length - ready.length,
  };

  const shown = trials
    .filter((t) => filter === 'all' || statusOf(t.nct_id).state === filter)
    .sort((x, y) => (sort === 'open' ? statusOf(x.nct_id).open - statusOf(y.nct_id).open : 0) || x.position - y.position);

  const href = (f: Filter, s: Sort) => `/review/adjudicate?filter=${f}&sort=${s}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Adjudication</h1>
          <p className="text-sm text-slate-600 mt-1">
            Once both of a trial&apos;s {MAX_ANNOTATIONS_PER_TRIAL} expert annotations are submitted, open it to decide
            the remaining differences. Differences that mean the same thing (blank rules, trial-level values derived
            from the cohorts, fields in a cohort only one annotator drew) are resolved automatically.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm shadow-blue-100/30 mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-slate-600">
              <strong className="text-slate-900">{done}</strong> / {ready.length} trials adjudicated
              {openTotal > 0 && <span className="text-amber-700"> · {openTotal} decisions open</span>}
              {counts.waiting > 0 && <span className="text-slate-400"> · {counts.waiting} waiting for annotations</span>}
            </span>
            <span className="text-sm font-bold text-blue-700">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={href(f.id, sort)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                  filter === f.id ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-300'
                }`}
              >
                {f.label} ({counts[f.id]})
              </Link>
            ))}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            Sort:
            <Link href={href(filter, 'position')} className={sort === 'position' ? 'font-semibold text-slate-900' : 'text-blue-600 hover:underline'}>Queue order</Link>
            <Link href={href(filter, 'open')} className={sort === 'open' ? 'font-semibold text-slate-900' : 'text-blue-600 hover:underline'}>Fewest open first</Link>
          </div>
        </div>

        {trials.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No expert annotations on non-test trials yet.
          </div>
        ) : shown.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm text-slate-500">No trials in this view.</div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
            {shown.map((t) => {
              const st = statusOf(t.nct_id);
              const stale =
                st.decided > 0 &&
                t.last_adjudicated_at && t.last_review_update &&
                new Date(t.last_review_update) > new Date(t.last_adjudicated_at);
              const dot = st.state === 'done' ? 'bg-emerald-500' : st.state === 'open' ? 'bg-amber-400' : 'bg-slate-300';
              return (
                <Link
                  key={t.nct_id}
                  href={`/review/adjudicate/${t.nct_id}`}
                  className="block p-4 hover:bg-blue-50 transition"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                        <span>{t.nct_id}</span>
                        {stale && (
                          <span className="text-[10px] uppercase tracking-wider text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-semibold">
                            ⚠ Reviews changed since adjudication
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                        {st.state === 'waiting' ? (
                          <span>
                            {t.submitted_count}/{MAX_ANNOTATIONS_PER_TRIAL} reviews submitted
                            {t.claim_count > t.submitted_count && ` (${t.claim_count - t.submitted_count} in progress)`}
                          </span>
                        ) : st.state === 'open' ? (
                          <span className="text-amber-700 font-medium">{st.open} open</span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Adjudicated</span>
                        )}
                        {st.decided > 0 && <span className="text-purple-700">· {st.decided} decided</span>}
                        {st.autoResolved > 0 && <span>· {st.autoResolved} auto-resolved</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
