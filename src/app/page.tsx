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
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xs shadow-sm">
            TM
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">
              TEMPO Trial Annotation Platform
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
        <section className="text-center mb-12">
          <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 leading-tight mb-4">
            Welcome
          </h2>
          <p className="text-base lg:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Experts annotate their assigned trials — test trials first, then the rest unlock
            once the reviewer signs off. Reviewers build reference keys and adjudicate.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/signup"
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/40 hover:border-blue-400 hover:shadow-blue-100 transition group"
          >
            <h3 className="text-xl font-semibold text-slate-900 group-hover:text-blue-700 transition">
              Sign up →
            </h3>
          </Link>

          <Link
            href="/login"
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-100/40 hover:border-blue-400 hover:shadow-blue-100 transition group"
          >
            <h3 className="text-xl font-semibold text-slate-900 group-hover:text-blue-700 transition">
              Sign in →
            </h3>
          </Link>
        </div>
      </main>
    </div>
  );
}
