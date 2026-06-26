// Lightweight auth: name + password.
// Session stored in HTTP-only signed JWT cookie via `jose`.

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { query, UserRole, UserRow } from './db';

const COOKIE = 'qual_session';
const ALG = 'HS256';

// Hardcoded session-signing key. The threat model is small (a handful of
// trusted experts); knowing this value lets you forge session cookies, so
// if the source ever becomes public for a higher-stakes deployment, replace
// this with an env-var read or rotate it.
const SESSION_KEY = new TextEncoder().encode(
  'tempo-qualification-internal-session-key-9f4e2a3c7b1d8e2f-do-not-share',
);
function secret(): Uint8Array { return SESSION_KEY; }

// ──────────────────────────────────────────────────────────────────────────
// Password helpers
// ──────────────────────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message if the password is unacceptable, else null. */
export function validatePassword(input: string): string | null {
  if (!input) return 'Password is required.';
  if (input.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ──────────────────────────────────────────────────────────────────────────
// Passkey check (reviewer role gate)
// ──────────────────────────────────────────────────────────────────────────

export function reviewerPasskeyConfigured(): boolean {
  return !!process.env.REVIEWER_PASSKEY;
}

export function reviewerPasskeyMatches(input: string): boolean {
  const expected = process.env.REVIEWER_PASSKEY;
  if (!expected) return false;
  return input.trim() === expected;
}

// ──────────────────────────────────────────────────────────────────────────
// Session cookie
// ──────────────────────────────────────────────────────────────────────────

interface SessionPayload {
  userId: string;
  name: string;
  role: UserRole;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('6h')
    .sign(secret());

  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 6,
  });
}

export async function clearSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (
      typeof payload.userId === 'string' &&
      typeof payload.name === 'string' &&
      (payload.role === 'reviewer' || payload.role === 'expert')
    ) {
      return { userId: payload.userId, name: payload.name, role: payload.role };
    }
    return null;
  } catch {
    return null;
  }
}

/** Throws if no session or role doesn't match required role(s). */
export async function requireSession(required?: UserRole | UserRole[]): Promise<SessionPayload> {
  const s = await readSession();
  if (!s) throw new Error('UNAUTHENTICATED');
  if (required) {
    const allowed = Array.isArray(required) ? required : [required];
    if (!allowed.includes(s.role)) throw new Error('FORBIDDEN');
  }
  return s;
}

// ──────────────────────────────────────────────────────────────────────────
// User CRUD
// ──────────────────────────────────────────────────────────────────────────

export async function findUserByName(name: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(`SELECT * FROM users WHERE name = $1`, [name]);
  return rows[0] ?? null;
}

export async function listUsers(role?: UserRole): Promise<UserRow[]> {
  if (role) {
    return query<UserRow>(
      `SELECT * FROM users WHERE role = $1 ORDER BY name ASC`,
      [role],
    );
  }
  return query<UserRow>(`SELECT * FROM users ORDER BY name ASC`);
}

export async function createUser(opts: {
  name: string;
  role: UserRole;
  password: string;
}): Promise<UserRow> {
  const passwordHash = await hashPassword(opts.password);
  const rows = await query<UserRow>(
    `INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3) RETURNING *`,
    [opts.name, opts.role, passwordHash],
  );
  return rows[0];
}

// Insert an is_test_trial=TRUE assignment for the expert against every trial
// flagged as a test trial. Called from the signup flow so new experts see the
// test trials on their dashboard immediately. Idempotent.
export async function assignTestTrialsToExpert(expertId: string): Promise<void> {
  await query(
    `INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
     SELECT $1, t.nct_id, TRUE
       FROM trials t
      WHERE t.is_test_trial = TRUE
     ON CONFLICT (expert_id, nct_id) DO NOTHING`,
    [expertId],
  );
}

export async function updateUserName(userId: string, name: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `UPDATE users SET name = $1 WHERE id = $2 RETURNING *`,
    [name, userId],
  );
  return rows[0] ?? null;
}

export async function updateUserPassword(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, userId]);
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return rows[0] ?? null;
}
