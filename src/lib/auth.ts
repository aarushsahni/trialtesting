// Lightweight auth: name + DOB (mm/dd/yyyy) as password.
// Session stored in HTTP-only signed JWT cookie via `jose`.

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { query, UserRole, UserRow } from './db';

const COOKIE = 'qual_session';
const ALG = 'HS256';

// Hardcoded session-signing key. The threat model is small (a handful of
// trusted reviewers); knowing this value lets you forge session cookies, so
// if the source ever becomes public for a higher-stakes deployment, replace
// this with an env-var read or rotate it.
const SESSION_KEY = new TextEncoder().encode(
  'tempo-qualification-internal-session-key-9f4e2a3c7b1d8e2f-do-not-share',
);
function secret(): Uint8Array { return SESSION_KEY; }

// ──────────────────────────────────────────────────────────────────────────
// DOB normalization + hashing
// ──────────────────────────────────────────────────────────────────────────

/** Normalize "M/D/YYYY" or "MM/DD/YYYY" -> canonical "MM/DD/YYYY". */
export function normalizeDob(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mm = m[1].padStart(2, '0');
  const dd = m[2].padStart(2, '0');
  const yyyy = m[3];
  if (Number(mm) < 1 || Number(mm) > 12) return null;
  if (Number(dd) < 1 || Number(dd) > 31) return null;
  return `${mm}/${dd}/${yyyy}`;
}

export async function hashDob(dob: string): Promise<string> {
  return bcrypt.hash(dob, 10);
}

export async function compareDob(dob: string, hash: string): Promise<boolean> {
  return bcrypt.compare(dob, hash);
}

// ──────────────────────────────────────────────────────────────────────────
// Passkey check (annotator role gate)
// ──────────────────────────────────────────────────────────────────────────

export function annotatorPasskeyConfigured(): boolean {
  return !!process.env.ANNOTATOR_PASSKEY;
}

export function annotatorPasskeyMatches(input: string): boolean {
  const expected = process.env.ANNOTATOR_PASSKEY;
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
      (payload.role === 'annotator' || payload.role === 'reviewer')
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
  dob: string;
}): Promise<UserRow> {
  const dobHash = await hashDob(opts.dob);
  const rows = await query<UserRow>(
    `INSERT INTO users (name, role, dob_hash) VALUES ($1, $2, $3) RETURNING *`,
    [opts.name, opts.role, dobHash],
  );
  return rows[0];
}

export async function updateUserName(userId: string, name: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `UPDATE users SET name = $1 WHERE id = $2 RETURNING *`,
    [name, userId],
  );
  return rows[0] ?? null;
}

export async function updateUserDob(userId: string, dob: string): Promise<void> {
  const hash = await hashDob(dob);
  await query(`UPDATE users SET dob_hash = $1 WHERE id = $2`, [hash, userId]);
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return rows[0] ?? null;
}
