import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

export default async function ReviewHome() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'reviewer') redirect('/annotate');

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Reviewer dashboard</h1>
        <p className="text-slate-600 mb-8">Take the qualification test when it&apos;s ready.</p>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/40">
          <p className="text-sm text-slate-500">
            The qualification set isn&apos;t available yet. Once an annotator builds
            and locks a reference key, a &quot;Start test&quot; button will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}
