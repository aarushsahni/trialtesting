'use client';

import { useActionState, useState } from 'react';
import { signupAction, ActionResult } from '../actions/auth';
import { DobInput } from '@/components/DobInput';

const initial: ActionResult = { ok: true };

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initial);
  const [role, setRole] = useState<'expert' | 'reviewer'>('expert');

  return (
    <form action={formAction} className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-blue-100/40 p-6 space-y-5">
      <div>
        <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          Role
        </label>
        <div className="grid grid-cols-2 gap-2">
          <RoleCard
            value="expert"
            current={role}
            onChange={setRole}
            label="Expert"
            sub="Takes the test"
          />
          <RoleCard
            value="reviewer"
            current={role}
            onChange={setRole}
            label="Reviewer"
            sub="Builds reference key"
          />
        </div>
        <input type="hidden" name="role" value={role} />
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
          placeholder="Your full name"
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="dob" className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
          Date of birth <span className="text-slate-400 normal-case font-normal">(MM/DD/YYYY)</span>
        </label>
        <DobInput id="dob" name="dob" required />
        <p className="text-xs text-slate-400 mt-1.5">
          Used as your password to sign back in later.
        </p>
      </div>

      {role === 'reviewer' && (
        <div>
          <label htmlFor="passkey" className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-2">
            Reviewer passkey
          </label>
          <input
            id="passkey"
            name="passkey"
            type="password"
            required
            autoComplete="off"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Shared secret. Ask the project lead if you don&apos;t have it.
          </p>
        </div>
      )}

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
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}

function RoleCard({
  value, current, onChange, label, sub,
}: {
  value: 'expert' | 'reviewer';
  current: 'expert' | 'reviewer';
  onChange: (r: 'expert' | 'reviewer') => void;
  label: string;
  sub: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={
        'text-left px-4 py-3 rounded-lg border transition ' +
        (selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
          : 'border-slate-200 hover:border-blue-300 bg-white')
      }
    >
      <div className="font-semibold text-slate-900 text-sm">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
    </button>
  );
}
