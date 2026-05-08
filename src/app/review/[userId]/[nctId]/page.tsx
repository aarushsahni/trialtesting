import { notFound } from 'next/navigation';
import { listTrials, getTrial } from '@/lib/trials';
import { query, ReviewRow, UserRow } from '@/lib/db';
import ReviewClient from '@/components/ReviewClient';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({
  params,
}: { params: Promise<{ userId: string; nctId: string }> }) {
  const { userId, nctId } = await params;
  const trial = getTrial(nctId);
  if (!trial) notFound();

  const [users, reviews] = await Promise.all([
    query<UserRow>(`SELECT id, name FROM users WHERE id = $1`, [userId]),
    query<ReviewRow>(
      `SELECT user_id, nct_id, reviewed_data, completed FROM reviews WHERE user_id = $1 AND nct_id = $2`,
      [userId, nctId],
    ),
  ]);

  const user = users[0];
  if (!user) notFound();

  const all = listTrials();
  const idx = all.findIndex((t) => t.nctId === nctId);
  const prevNctId = idx > 0 ? all[idx - 1].nctId : null;
  const nextNctId = idx < all.length - 1 ? all[idx + 1].nctId : null;

  const initial = reviews[0]
    ? {
        reviewed_data: reviews[0].reviewed_data as Record<string, unknown>,
        completed: reviews[0].completed,
      }
    : null;

  return (
    <ReviewClient
      userId={userId}
      userName={user.name}
      trial={trial}
      prevNctId={prevNctId}
      nextNctId={nextNctId}
      initialReview={initial}
    />
  );
}
