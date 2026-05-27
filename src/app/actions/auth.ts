'use server';

import { redirect } from 'next/navigation';
import {
  annotatorPasskeyConfigured,
  annotatorPasskeyMatches,
  clearSession,
  compareDob,
  createSession,
  createUser,
  findUserByName,
  normalizeDob,
} from '@/lib/auth';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Signup
// ──────────────────────────────────────────────────────────────────────────

export async function signupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') || '').trim();
  const dobRaw = String(formData.get('dob') || '').trim();
  const role = String(formData.get('role') || '').trim();
  const passkey = String(formData.get('passkey') || '').trim();

  if (!name) return { ok: false, error: 'Name is required.' };
  if (name.length > 80) return { ok: false, error: 'Name too long.' };
  if (role !== 'reviewer' && role !== 'annotator') {
    return { ok: false, error: 'Pick a role.' };
  }

  const dob = normalizeDob(dobRaw);
  if (!dob) return { ok: false, error: 'Date of birth must be MM/DD/YYYY.' };

  if (role === 'annotator') {
    if (!annotatorPasskeyConfigured()) {
      return {
        ok: false,
        error: 'Annotator signup is not configured on this server (ANNOTATOR_PASSKEY env var not set). Ask the project lead.',
      };
    }
    if (!passkey) return { ok: false, error: 'Annotator passkey required.' };
    if (!annotatorPasskeyMatches(passkey)) {
      return { ok: false, error: 'Incorrect annotator passkey.' };
    }
  }

  // Name collision
  const existing = await findUserByName(name);
  if (existing) {
    return { ok: false, error: 'Name already taken. Pick a different one or sign in.' };
  }

  let user;
  try {
    user = await createUser({ name, role, dob });
  } catch (e: any) {
    if (e?.code === '23505') {
      return { ok: false, error: 'Name already taken. Pick a different one.' };
    }
    throw e;
  }

  await createSession({ userId: user.id, name: user.name, role: user.role });
  redirect(user.role === 'annotator' ? '/annotate' : '/review');
}

// ──────────────────────────────────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────────────────────────────────

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') || '').trim();
  const dobRaw = String(formData.get('dob') || '').trim();

  if (!name) return { ok: false, error: 'Pick a name.' };

  const dob = normalizeDob(dobRaw);
  if (!dob) return { ok: false, error: 'Date of birth must be MM/DD/YYYY.' };

  const user = await findUserByName(name);
  if (!user) return { ok: false, error: 'No account with that name.' };

  const dobOk = await compareDob(dob, user.dob_hash);
  if (!dobOk) return { ok: false, error: 'Incorrect date of birth.' };

  await createSession({ userId: user.id, name: user.name, role: user.role });
  redirect(user.role === 'annotator' ? '/annotate' : '/review');
}

// ──────────────────────────────────────────────────────────────────────────
// Logout
// ──────────────────────────────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect('/');
}
