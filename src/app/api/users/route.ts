import { NextRequest, NextResponse } from 'next/server';
import { query, UserRow } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const rows = await query<UserRow>(`SELECT id, name, created_at FROM users ORDER BY created_at ASC`);
  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const rows = await query<UserRow>(
      `INSERT INTO users (name) VALUES ($1) RETURNING id, name, created_at`,
      [name.trim()],
    );
    return NextResponse.json({ user: rows[0] });
  } catch (e: any) {
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'name already exists' }, { status: 409 });
    }
    throw e;
  }
}
