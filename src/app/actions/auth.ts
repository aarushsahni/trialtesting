'use server';

import { redirect } from 'next/navigation';
import {
  assignTestTrialsToExpert,
  reviewerPasskeyConfigured,
  reviewerPasskeyMatches,
  clearSession,
  comparePassword,
  createSession,
  createUser,
  findUserByName,
  getUserById,
  readSession,
  updateUserName,
  updateUserPassword,
  validatePassword,
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
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');
  const role = String(formData.get('role') || '').trim();
  const passkey = String(formData.get('passkey') || '').trim();

  if (!name) return { ok: false, error: 'Name is required.' };
  if (name.length > 80) return { ok: false, error: 'Name too long.' };
  if (role !== 'expert' && role !== 'reviewer') {
    return { ok: false, error: 'Pick a role.' };
  }

  const pwError = validatePassword(password);
  if (pwError) return { ok: false, error: pwError };
  if (password !== passwordConfirm) {
    return { ok: false, error: 'Passwords do not match.' };
  }

  if (role === 'reviewer') {
    if (!reviewerPasskeyConfigured()) {
      return {
        ok: false,
        error: 'Reviewer signup is not configured on this server (REVIEWER_PASSKEY env var not set). Ask the project lead.',
      };
    }
    if (!passkey) return { ok: false, error: 'Reviewer passkey required.' };
    if (!reviewerPasskeyMatches(passkey)) {
      return { ok: false, error: 'Incorrect reviewer passkey.' };
    }
  }

  // Name collision
  const existing = await findUserByName(name);
  if (existing) {
    return { ok: false, error: 'Name already taken. Pick a different one or sign in.' };
  }

  let user;
  try {
    user = await createUser({ name, role, password });
  } catch (e: any) {
    if (e?.code === '23505') {
      return { ok: false, error: 'Name already taken. Pick a different one.' };
    }
    throw e;
  }

  if (user.role === 'expert') {
    await assignTestTrialsToExpert(user.id);
  }

  await createSession({ userId: user.id, name: user.name, role: user.role });
  redirect(user.role === 'reviewer' ? '/review' : '/expert');
}

// ──────────────────────────────────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────────────────────────────────

export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') || '').trim();
  const password = String(formData.get('password') || '');

  if (!name) return { ok: false, error: 'Pick a name.' };
  if (!password) return { ok: false, error: 'Password is required.' };

  const user = await findUserByName(name);
  if (!user) return { ok: false, error: 'No account with that name.' };

  const pwOk = await comparePassword(password, user.password_hash);
  if (!pwOk) return { ok: false, error: 'Incorrect password.' };

  await createSession({ userId: user.id, name: user.name, role: user.role });
  redirect(user.role === 'reviewer' ? '/review' : '/expert');
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
  const newPassword = String(formData.get('password') || '');
  const newPasswordConfirm = String(formData.get('passwordConfirm') || '');

  if (!newName) return { ok: false, error: 'Name is required.' };
  if (newName.length > 80) return { ok: false, error: 'Name too long.' };

  // Password is optional on update — only validate if a new one was entered.
  if (newPassword || newPasswordConfirm) {
    const pwError = validatePassword(newPassword);
    if (pwError) return { ok: false, error: pwError };
    if (newPassword !== newPasswordConfirm) {
      return { ok: false, error: 'Passwords do not match.' };
    }
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

  if (newPassword) {
    await updateUserPassword(user.id, newPassword);
  }

  // Refresh session cookie with possibly-updated name (role unchanged)
  await createSession({ userId: user.id, name: newName, role: user.role });

  return { ok: true };
}
