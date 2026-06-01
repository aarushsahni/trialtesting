'use client';

import { useActionState } from 'react';
import { updateAccountAction, ActionResult } from '../actions/auth';
import { DobInput } from '@/components/DobInput';

const initial: ActionResult = { ok: true };

export function AccountForm({ currentName, role }: { currentName: string; role: 'reviewer' | 'expert' }) {
  const [state, formAction, pending] = useActionState(updateAccountAction, initial);

  return (
    <form action={formAction} className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/40 p-6 space-y-5">
      <div>
        <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          Role
        </label>
        <div className="text-sm text-slate-800 capitalize">{role}</div>
        <p className="text-xs text-slate-400 mt-1">Role can&apos;t be changed from this screen.</p>
      </div>

      <div>
        <label htmlFor="name" className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={currentName}
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="dob" className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          New date of birth <span className="text-slate-400 normal-case font-normal">(MM/DD/YYYY)</span>
        </label>
        <DobInput id="dob" name="dob" />
        <p className="text-xs text-slate-400 mt-1.5">
          Leave blank to keep your current DOB. Fill in only if you want to change it.
        </p>
      </div>

      {state && !state.ok && state.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </div>
      )}
      {state && state.ok && !pending && state !== initial && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Saved.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-blue-700 transition shadow-sm shadow-blue-200"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
