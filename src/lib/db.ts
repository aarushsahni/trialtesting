import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Add it to .env.local');
  global.__pgPool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  return global.__pgPool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export interface ReviewRow {
  user_id: string;
  nct_id: string;
  reviewed_data: Record<string, unknown>;
  completed: boolean;
  updated_at: string;
}

export interface UserRow {
  id: string;
  name: string;
  created_at: string;
}
