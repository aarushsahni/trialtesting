import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/auth';
import { ALL_BLOCKS } from '@/lib/schema/field-schemas';
import { AppHeader } from '@/components/AppHeader';
import { GuideMarkdown } from './GuideMarkdown';
import { ANNOTATION_GUIDE_MD } from '@/lib/annotation-guide-content';

export const dynamic = 'force-dynamic';

export default async function GuidePage() {
  const session = await readSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader name={session.name} role={session.role} />
      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <aside className="lg:sticky lg:top-[68px] lg:self-start">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm shadow-blue-100/30">
            <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
              Jump to block
            </h2>
            <nav className="text-sm space-y-1.5">
              {ALL_BLOCKS.map((b) => (
                <a
                  key={b.key}
                  href={`#${b.key}`}
                  className="block text-slate-700 hover:text-blue-700 hover:underline truncate"
                >
                  {b.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <article className="min-w-0">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm shadow-blue-100/30">
            <Link href={session.role === 'annotator' ? '/annotate' : '/review'} className="text-sm text-blue-600 hover:underline">
              ← {session.role === 'annotator' ? 'Annotator dashboard' : 'Reviewer dashboard'}
            </Link>
            <GuideMarkdown source={ANNOTATION_GUIDE_MD} />
          </div>
        </article>
      </main>
    </div>
  );
}
