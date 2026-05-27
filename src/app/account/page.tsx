import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserById, readSession } from '@/lib/auth';
import { AppHeader } from '@/components/AppHeader';
import { AccountForm } from './AccountForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await readSession();
  if (!session) redirect('/login');
  const user = await getUserById(session.userId);
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-md mx-auto px-6 py-10">
        <Link
          href={session.role === 'annotator' ? '/annotate' : '/review'}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-3 mb-1">Account info</h1>
        <p className="text-sm text-slate-500 mb-6">
          Change your display name or date of birth (used as your password to sign in).
        </p>
        <AccountForm currentName={user.name} role={user.role} />
      </main>
    </div>
  );
}
