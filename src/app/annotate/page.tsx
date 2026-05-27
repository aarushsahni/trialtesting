import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

export default async function AnnotateHome() {
  const session = await readSession();
  if (!session) redirect('/login');
  if (session.role !== 'annotator') redirect('/review');

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Annotator dashboard</h1>
        <p className="text-slate-600 mb-8">Build reference keys and monitor reviewer scores.</p>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/40">
          <p className="text-sm text-slate-500">
            Reference-key builder UI is coming next. Soon you&apos;ll see qualification
            sets here, pick trials, and fill in the correct labels.
          </p>
        </div>
      </main>
    </div>
  );
}
