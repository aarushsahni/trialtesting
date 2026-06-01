import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';

export default async function HomePage() {
  const session = await readSession();
  if (session) {
    redirect(session.role === 'reviewer' ? '/review' : '/expert');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-sky-50">
      <header className="border-b border-blue-100 bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold shadow-sm">
            Q
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">
              Clinical Trial Extraction — Qualification Phase
            </h1>
            <p className="text-xs text-slate-500 leading-tight">
              Sign in to take the test, or build the reference key
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
        <section className="text-center mb-12">
          <span className="inline-block text-xs uppercase tracking-wider text-blue-700 bg-blue-100 px-3 py-1 rounded-full font-semibold mb-4">
            Qualification phase
          </span>
          <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4">
            Welcome
          </h2>
          <p className="text-base lg:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Two ways to participate. Experts take a fixed-trial test labeled blind
            against an expert reference key. Reviewers build that reference key.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/signup"
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/40 hover:border-blue-400 hover:shadow-blue-100 transition group"
          >
            <div className="text-xs uppercase tracking-wider text-blue-700 font-semibold mb-2">
              First time
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-1 group-hover:text-blue-700 transition">
              Sign up →
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Create a expert or reviewer account.
            </p>
          </Link>

          <Link
            href="/login"
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/40 hover:border-blue-400 hover:shadow-blue-100 transition group"
          >
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Returning
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-1 group-hover:text-blue-700 transition">
              Sign in →
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Pick your name and enter your date of birth.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
