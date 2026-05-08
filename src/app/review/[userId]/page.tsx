import Link from 'next/link';
import { listTrials } from '@/lib/trials';
import { query, ReviewRow, UserRow } from '@/lib/db';
import { CancerType } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

  // Group by cancer type
  const groups = new Map<CancerType, typeof trials>();
  for (const t of trials) {
    if (!groups.has(t.assignedCancerType)) groups.set(t.assignedCancerType, []);
    groups.get(t.assignedCancerType)!.push(t);
  }

  return (
    <main className="min-h-screen p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Switch reviewer</Link>
          <h1 className="text-2xl font-semibold mt-1">
            {user ? `Reviewing as ${user.name}` : 'Reviewer not found'}
          </h1>
          {trials.length === 0 && (
            <p className="text-sm text-amber-700 mt-2">
              No trials found. Run <code className="bg-amber-100 px-1 rounded">npm run fetch</code> first.
            </p>
          )}
        </div>
      </div>

      {trials.length > 0 && (
        <div className="mb-8 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-sm font-medium text-gray-700">Progress</div>
            <div className="text-sm text-gray-500">
              {completedCount} / {trials.length} reviewed
            </div>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${(completedCount / trials.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-6">
        {Array.from(groups.entries()).map(([cancerType, group]) => (
          <section key={cancerType}>
            <h2 className="text-sm uppercase tracking-wide text-gray-500 mb-2">
              {cancerType.replace(/_/g, ' ')}
            </h2>
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              {group.map((t) => {
                const r = reviewByNct.get(t.nctId);
                const status = r?.completed ? 'done' : r ? 'in-progress' : 'pending';
                return (
                  <Link
                    key={t.nctId}
                    href={`/review/${userId}/${t.nctId}`}
                    className="flex items-start gap-4 p-4 hover:bg-blue-50 transition"
                  >
                    <span
                      className={
                        'mt-1 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ' +
                        (status === 'done' ? 'bg-green-500' : status === 'in-progress' ? 'bg-amber-400' : 'bg-gray-300')
                      }
                      aria-label={status}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-500 font-mono">{t.nctId}</div>
                      <div className="font-medium text-gray-900 truncate">{t.briefTitle}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
