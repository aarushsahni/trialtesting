import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { AppHeader } from '@/components/AppHeader';
import { AnnotatorAssignmentTable } from './AnnotatorAssignmentTable';

export const dynamic = 'force-dynamic';

interface ExpertRow {
  expert_id: string;
  expert_name: string;
  annotator_slot: number | null;
  assigned_main_trials: number;
}

interface SlotStat {
  slot: number;
  main_trial_count: number;
}

export default async function AnnotatorsPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/expert');

  const experts = await query<ExpertRow>(`
    SELECT
      u.id AS expert_id,
      u.name AS expert_name,
      u.annotator_slot,
      COUNT(ta.*) FILTER (WHERE NOT ta.is_test_trial)::int AS assigned_main_trials
    FROM users u
    LEFT JOIN trial_assignments ta ON ta.expert_id = u.id
    WHERE u.role = 'expert'
    GROUP BY u.id, u.name, u.annotator_slot
    ORDER BY u.name
  `);

  const slotStats = await query<SlotStat>(`
    SELECT slot, COUNT(*)::int AS main_trial_count
      FROM (
        SELECT annotator_slot_1 AS slot FROM trials
         WHERE is_test_trial = FALSE AND annotator_slot_1 IS NOT NULL
        UNION ALL
        SELECT annotator_slot_2 AS slot FROM trials
         WHERE is_test_trial = FALSE AND annotator_slot_2 IS NOT NULL
      ) x
     GROUP BY slot
     ORDER BY slot
  `);
  const slotSizeMap = new Map(slotStats.map((s) => [s.slot, s.main_trial_count]));

  const slotToExpert = new Map<number, string>();
  for (const e of experts) {
    if (e.annotator_slot !== null) slotToExpert.set(e.annotator_slot, e.expert_id);
  }

  const totalMainTrials = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM trials WHERE is_test_trial = FALSE`,
  );
  const mainTrialCount = totalMainTrials[0]?.n ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/review" className="text-sm text-blue-600 hover:underline">← Reviewer dashboard</Link>
        <div className="mt-3 mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Annotator slots</h1>
          <p className="text-sm text-slate-600 mt-1">
            Each main trial is tagged with two annotator slots (1–5). Assigning an
            expert to a slot auto-adds every matching main trial to their queue.
          </p>
        </div>

        <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
            Slot pool ({mainTrialCount} main trials total)
          </div>
          <div className="grid grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((slot) => {
              const size = slotSizeMap.get(slot) ?? 0;
              const holderId = slotToExpert.get(slot);
              const holder = holderId ? experts.find((e) => e.expert_id === holderId)?.expert_name : null;
              return (
                <div key={slot} className="border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-lg font-bold text-slate-900">Slot {slot}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{size} trials</div>
                  <div className="text-xs mt-1 truncate">
                    {holder ? (
                      <span className="text-emerald-700 font-medium">{holder}</span>
                    ) : (
                      <span className="text-slate-400">unassigned</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {experts.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-900">
            No experts have signed up yet.
          </div>
        ) : (
          <AnnotatorAssignmentTable experts={experts} />
        )}
      </main>
    </div>
  );
}
