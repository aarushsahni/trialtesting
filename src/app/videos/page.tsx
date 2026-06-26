import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { AppHeader } from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

const VIDEOS: { id: string; title: string }[] = [
  { id: 'EzA-hyUHOSg', title: 'Example annotation walkthrough 1' },
  { id: '9MMpboTiltg', title: 'Example annotation walkthrough 2' },
];

export default async function VideosPage() {
  const session = await readSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm shadow-blue-100/30">
          <div className="flex items-baseline justify-between gap-4 mb-6">
            <Link
              href={session.role === 'reviewer' ? '/review' : '/expert'}
              className="text-sm text-blue-600 hover:underline"
            >
              ← {session.role === 'reviewer' ? 'Reviewer dashboard' : 'Expert dashboard'}
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Example videos</h1>
          <p className="text-sm text-slate-600 mb-8">
            Walkthroughs of the annotation workflow on real trials. Make sure to set to 1080p resolution and full-screen for best clarity.
          </p>

          <div className="space-y-10">
            {VIDEOS.map((v) => (
              <section key={v.id}>
                <h2 className="text-sm font-semibold text-slate-800 mb-3">{v.title}</h2>
                <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-black" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${v.id}`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  <a
                    href={`https://youtu.be/${v.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-blue-700 hover:underline"
                  >
                    Open on YouTube ↗
                  </a>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
