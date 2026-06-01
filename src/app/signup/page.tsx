import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import SignupForm from './SignupForm';

export default async function SignupPage() {
  const session = await readSession();
  if (session) {
    redirect(session.role === 'reviewer' ? '/review' : '/expert');
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50 flex items-start justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-4 mb-1">Create an account</h1>
        <p className="text-sm text-slate-500 mb-6">
          Pick the role you&apos;ll be working in. Experts take the test; reviewers
          build the reference key.
        </p>
        <SignupForm />
        <p className="text-xs text-slate-500 mt-6 text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
