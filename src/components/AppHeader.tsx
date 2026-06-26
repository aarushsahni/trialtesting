import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';

interface Props {
  name: string;
  role: 'reviewer' | 'expert';
}

export function AppHeader({ name, role }: Props) {
  const dashboardHref = role === 'reviewer' ? '/review' : '/expert';
  return (
    <header className="border-b border-blue-100 bg-white/70 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <Link
          href={dashboardHref}
          className="flex items-center gap-3 group"
          title="Back to dashboard"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-[10px] group-hover:shadow-md group-hover:shadow-blue-200 transition">
            TM
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 leading-tight group-hover:text-blue-700 transition">
              TEMPO Trial Annotation Platform
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={dashboardHref}
            className="text-xs px-2.5 py-1 rounded border border-slate-300 text-slate-700 hover:border-blue-400 hover:text-blue-700 transition whitespace-nowrap"
          >
            ← Dashboard
          </Link>
          <Link
            href="/guide"
            className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
          >
            Annotation guide
          </Link>
          <Link
            href="/videos"
            className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
          >
            Example videos
          </Link>
          <Link
            href="/account"
            className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
          >
            Account
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
