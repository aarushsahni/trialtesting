import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query, MAX_CORPUS_REVIEWS } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { BLOCKS } from '@/lib/schema/field-schemas';
import { BlockKey } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface TrialRow {
  nct_id: string;
  brief_title: string;
  assigned_blocks: string[];
  position: number;
  claim_count: number;
  submitted_count: number;
  my_status: 'in_progress' | 'submitted' | null;
}

export default async function CorpusDashboard() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'expert') redirect('/review');

  const me = await query<{ corpus_approved_at: string | null }>(
    `SELECT corpus_approved_at FROM users WHERE id = $1`,
    [session.userId],
  );
  if (!me[0]?.corpus_approved_at) redirect('/expert');

  const trials = await query<TrialRow>(`
    SELECT ct.nct_id, ct.brief_title, ct.assigned_blocks, ct.position,
           COUNT(cr.id)::int AS claim_count,
           COUNT(cr.id) FILTER (WHERE cr.status = 'submitted')::int AS submitted_count,
           MAX(CASE WHEN cr.expert_id = $1 THEN cr.status END) AS my_status
    FROM corpus_trials ct
    LEFT JOIN corpus_reviews cr ON cr.nct_id = ct.nct_id
    GROUP BY ct.nct_id
    ORDER BY ct.position, ct.nct_id
  `, [session.userId]);

  const mine = trials.filter((t) => t.my_status !== null);
  const mySubmitted = mine.filter((t) => t.my_status === 'submitted').length;
  const myInProgress = mine.length - mySubmitted;
  const fullyDone = trials.filter((t) => t.submitted_count >= MAX_CORPUS_REVIEWS).length;
  const available = trials.filter((t) => t.my_status === null && t.claim_count < MAX_CORPUS_REVIEWS);
  const takenByOthers = trials.filter((t) => t.my_status === null && t.claim_count >= MAX_CORPUS_REVIEWS);

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/expert" className="text-sm text-blue-600 hover:underline">← Qualification</Link>
        <div className="mt-3 mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Trial corpus</h1>
          <p className="text-sm text-slate-600 mt-1">
            Each trial starts prefilled with the AI&apos;s extraction — review it against the
            trial record and correct anything wrong. Every trial needs {MAX_CORPUS_REVIEWS} independent
            reviews. Picking a trial claims one of its {MAX_CORPUS_REVIEWS} slots.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Your submitted reviews" value={mySubmitted} accent="text-emerald-700" />
          <StatCard label="Your in-progress" value={myInProgress} accent="text-amber-700" />
          <StatCard label={`Trials fully done (${MAX_CORPUS_REVIEWS}/${MAX_CORPUS_REVIEWS} reviews)`} value={`${fullyDone} / ${trials.length}`} accent="text-blue-700" />
        </div>

        {mine.length > 0 && (
          <Section title="Your trials">
            {mine.map((t) => <TrialItem key={t.nct_id} t={t} clickable />)}
          </Section>
        )}

        <Section title={`Available trials (${available.length})`}>
          {available.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No open trials left — every remaining trial has both slots taken.</div>
          ) : (
            available.map((t) => <TrialItem key={t.nct_id} t={t} clickable />)
          )}
        </Section>

        {takenByOthers.length > 0 && (
          <details className="mt-6">
            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
              Fully claimed by others ({takenByOthers.length})
            </summary>
            <div className="mt-3 bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 opacity-60">
              {takenByOthers.map((t) => <TrialItem key={t.nct_id} t={t} clickable={false} />)}
            </div>
          </details>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shadow-blue-100/30">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">{title}</h2>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function TrialItem({ t, clickable }: { t: TrialRow; clickable: boolean }) {
  const blocks = (t.assigned_blocks as BlockKey[]).map((b) => BLOCKS[b]?.label ?? b);
  const dot =
    t.my_status === 'submitted' ? 'bg-emerald-500'
    : t.my_status === 'in_progress' ? 'bg-amber-400'
    : t.claim_count >= MAX_CORPUS_REVIEWS ? 'bg-slate-400'
    : 'bg-slate-200';
  const badge =
    t.my_status === 'submitted' ? <Badge cls="bg-emerald-100 text-emerald-800">Yours · submitted</Badge>
    : t.my_status === 'in_progress' ? <Badge cls="bg-amber-100 text-amber-800">Yours · in progress</Badge>
    : t.claim_count >= MAX_CORPUS_REVIEWS ? <Badge cls="bg-slate-100 text-slate-600">Full</Badge>
    : t.claim_count > 0 ? <Badge cls="bg-blue-100 text-blue-800">1 slot left</Badge>
    : <Badge cls="bg-slate-100 text-slate-600">Open</Badge>;

  const inner = (
    <div className="flex items-start gap-3 p-4">
      <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-mono flex items-center gap-2 flex-wrap">
          <span>{t.nct_id}</span>
          {blocks.map((b) => (
            <span key={b} className="text-[10px] uppercase tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-semibold">
              {b}
            </span>
          ))}
        </div>
        <div className="font-medium text-slate-900 mt-1 truncate">{t.brief_title}</div>
      </div>
      <div className="flex-shrink-0">{badge}</div>
    </div>
  );

  if (!clickable) return <div>{inner}</div>;
  return (
    <Link href={`/expert/corpus/${t.nct_id}`} className="block hover:bg-blue-50 transition">
      {inner}
    </Link>
  );
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}
