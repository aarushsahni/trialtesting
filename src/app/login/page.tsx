import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listUsers, readSession } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const session = await readSession();
  if (session) {
    redirect(session.role === 'reviewer' ? '/review' : '/expert');
  }
  const users = await listUsers();
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50 flex items-start justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-4 mb-1">Sign in</h1>
        <p className="text-sm text-slate-500 mb-6">
          Pick your name and enter your date of birth.
        </p>
        <LoginForm names={users.map((u) => u.name)} />
        <p className="text-xs text-slate-500 mt-6 text-center">
          New here?{' '}
          <Link href="/signup" className="text-blue-600 hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
