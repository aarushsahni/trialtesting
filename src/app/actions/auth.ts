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
  getUserById,
  normalizeDob,
  readSession,
  updateUserDob,
  updateUserName,
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

// ──────────────────────────────────────────────────────────────────────────
// Update account (name and/or DOB) — logged-in user updates their own
// ──────────────────────────────────────────────────────────────────────────

export async function updateAccountAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await readSession();
  if (!session) return { ok: false, error: 'Not signed in.' };

  const user = await getUserById(session.userId);
  if (!user) return { ok: false, error: 'Account not found.' };

  const newName = String(formData.get('name') || '').trim();
  const newDobRaw = String(formData.get('dob') || '').trim();

  if (!newName) return { ok: false, error: 'Name is required.' };
  if (newName.length > 80) return { ok: false, error: 'Name too long.' };

  // If the user typed a new DOB, validate it; otherwise leave existing hash.
  let normalizedNewDob: string | null = null;
  if (newDobRaw) {
    normalizedNewDob = normalizeDob(newDobRaw);
    if (!normalizedNewDob) return { ok: false, error: 'Date of birth must be MM/DD/YYYY.' };
  }

  // If renaming, ensure no collision with another user
  if (newName !== user.name) {
    const existing = await findUserByName(newName);
    if (existing && existing.id !== user.id) {
      return { ok: false, error: 'Name already taken.' };
    }
    try {
      await updateUserName(user.id, newName);
    } catch (e: any) {
      if (e?.code === '23505') return { ok: false, error: 'Name already taken.' };
      throw e;
    }
  }

  if (normalizedNewDob) {
    await updateUserDob(user.id, normalizedNewDob);
  }

  // Refresh session cookie with possibly-updated name (role unchanged)
  await createSession({ userId: user.id, name: newName, role: user.role });

  return { ok: true };
}
