'use client';

import { useActionState } from 'react';
import { loginAction, ActionResult } from '../actions/auth';

const initial: ActionResult = { ok: true };

export default function LoginForm({ names }: { names: string[] }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  if (names.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
        No accounts yet. <a href="/signup" className="underline font-medium">Create the first one</a>.
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/40 p-6 space-y-5">
      <div>
        <label htmlFor="name" className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          Name
        </label>
        <select
          id="name"
          name="name"
          required
          defaultValue=""
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="" disabled>Pick your name…</option>
          {names.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="password" className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {state && !state.ok && state.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-blue-700 transition shadow-sm shadow-blue-200"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
