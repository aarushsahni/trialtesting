import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';

interface Props {
  name: string;
  role: 'annotator' | 'reviewer';
}

export function AppHeader({ name, role }: Props) {
  return (
    <header className="border-b border-blue-100 bg-white/70 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm">
            Q
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 leading-tight">
              Trial Extraction · Qualification
            </div>
            <div className="text-xs text-slate-500 leading-tight">
              {name} · <span className="capitalize">{role}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/guide"
            className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
          >
            Annotation guide
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
