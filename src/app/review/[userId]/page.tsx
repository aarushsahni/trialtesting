import Link from 'next/link';
import { listTrials } from '@/lib/trials';
import { query, ReviewRow, UserRow } from '@/lib/db';
import { CancerType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CANCER_TYPE_LABELS: Partial<Record<CancerType, string>> = {
  PROSTATE: 'Prostate',
  UROTHELIAL: 'Urothelial',
  RCC: 'Renal cell carcinoma',
  TESTICULAR: 'Testicular',
  BREAST: 'Breast',
  LUNG: 'Lung',
  COLORECTAL: 'Colorectal',
  HEAD_AND_NECK: 'Head and neck',
  OVARIAN: 'Ovarian',
  UTERINE: 'Uterine',
  CERVICAL: 'Cervical',
  MELANOMA: 'Melanoma',
  MESOTHELIOMA: 'Mesothelioma',
  GASTROESOPHAGEAL: 'Gastroesophageal',
  NEUROENDOCRINE: 'Neuroendocrine',
  PANCREATIC: 'Pancreatic',
  MATURE_B_CELL: 'Mature B-cell',
  MATURE_T_NK_CELL: 'Mature T/NK',
  MYELOID_NEOPLASM: 'Myeloid',
  PRECURSOR_LYMPHOID: 'Precursor lymphoid',
  PLASMA_CELL: 'Plasma cell',
};

export default async function TrialListPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const [users, reviews] = await Promise.all([
    query<UserRow>(`SELECT id, name FROM users WHERE id = $1`, [userId]),
    query<ReviewRow>(
      `SELECT user_id, nct_id, reviewed_data, completed, updated_at FROM reviews WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const user = users[0];
  const trials = listTrials();
  const reviewByNct = new Map(reviews.map((r) => [r.nct_id, r]));
  const completedCount = reviews.filter((r) => r.completed).length;
  const inProgressCount = reviews.filter((r) => !r.completed).length;

  // Group by cancer type
  const groups = new Map<CancerType, typeof trials>();
  for (const t of trials) {
    if (!groups.has(t.assignedCancerType)) groups.set(t.assignedCancerType, []);
    groups.get(t.assignedCancerType)!.push(t);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50">
      {/* Header */}
      <header className="border-b border-blue-100 bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
            <span>←</span> Switch reviewer
          </Link>
          <div className="text-xs text-slate-500">
            Reviewing as <span className="font-semibold text-slate-900">{user?.name ?? '—'}</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Pick a trial to review
          </h1>
          <p className="text-slate-600">
            Trials are grouped by cancer type — 5 per type, 105 total.
          </p>
        </div>

        {trials.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-amber-900">
            <p className="font-medium mb-1">No trials loaded yet.</p>
            <p className="text-sm">
              Run <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">npm run fetch</code> locally,
              then commit <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">data/trials.json</code> and redeploy.
            </p>
          </div>
        ) : (
          <>
            {/* Progress card */}
            <div className="mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/40 p-6">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-semibold text-slate-700">Your progress</div>
                <div className="text-sm text-slate-500">
                  <span className="font-bold text-slate-900">{completedCount}</span> / {trials.length} reviewed
                  {inProgressCount > 0 && (
                    <span className="ml-2 text-amber-700">· {inProgressCount} in progress</span>
                  )}
                </div>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                  style={{ width: `${(completedCount / trials.length) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-5 mt-4 text-xs text-slate-500">
                <Legend color="bg-emerald-500" label="Done" />
                <Legend color="bg-amber-400" label="In progress" />
                <Legend color="bg-slate-300" label="Not started" />
              </div>
            </div>

            {/* Cancer-type groups */}
            <div className="space-y-6">
              {Array.from(groups.entries()).map(([cancerType, group]) => {
                const groupCompleted = group.filter((t) => reviewByNct.get(t.nctId)?.completed).length;
                return (
                  <section key={cancerType}>
                    <div className="flex items-baseline justify-between mb-2">
                      <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                        {CANCER_TYPE_LABELS[cancerType] ?? cancerType.replace(/_/g, ' ')}
                      </h2>
                      <span className="text-xs text-slate-500">
                        {groupCompleted} / {group.length}
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/30 divide-y divide-slate-100 overflow-hidden">
                      {group.map((t) => {
                        const r = reviewByNct.get(t.nctId);
                        const status = r?.completed ? 'done' : r ? 'in-progress' : 'pending';
                        return (
                          <Link
                            key={t.nctId}
                            href={`/review/${userId}/${t.nctId}`}
                            className="group flex items-start gap-4 p-4 hover:bg-blue-50 transition"
                          >
                            <span
                              className={
                                'mt-1.5 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ' +
                                (status === 'done'
                                  ? 'bg-emerald-500'
                                  : status === 'in-progress'
                                    ? 'bg-amber-400'
                                    : 'bg-slate-300')
                              }
                              aria-label={status}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-slate-500 font-mono">{t.nctId}</div>
                              <div className="font-medium text-slate-900 truncate">{t.briefTitle}</div>
                            </div>
                            <span className="text-blue-500 opacity-0 group-hover:opacity-100 transition text-sm self-center">
                              →
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
