import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
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

// Run a callback inside a transaction on a dedicated client. Rolls back on
// throw, commits on return.
export async function withTransaction<T>(
  fn: (q: <R = any>(text: string, params?: any[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const q = async <R = any>(text: string, params?: any[]): Promise<R[]> => {
      const res = await client.query(text, params);
      return res.rows as R[];
    };
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Row types
// ──────────────────────────────────────────────────────────────────────────

export type UserRole = 'reviewer' | 'expert';

export interface UserRow {
  id: string;
  name: string;
  role: UserRole;
  dob_hash: string;
  created_at: string;
  corpus_approved_at: string | null;
  corpus_approved_by: string | null;
}

export interface SchemaVersionRow {
  id: string;
  version_tag: string;
  schema_json: unknown;
  created_at: string;
}

export interface QualificationSetRow {
  id: string;
  name: string;
  schema_version_id: string;
  trial_nct_ids: string[];
  locked_at: string | null;
  created_at: string;
}

export interface QualificationTrialRow {
  nct_id: string;
  brief_title: string;
  brief_summary: string | null;
  detailed_description: string | null;
  eligibility_raw: string | null;
  conditions: string[];
  interventions: string[];
  ctgov_sex: string | null;
  ctgov_min_age: string | null;
  ctgov_max_age: string | null;
  overall_status: string | null;
  study_type: string | null;
  phases: string[] | null;
  assigned_blocks: string[];
  fetched_at: string;
}

export interface ReferenceKeyRow {
  qualification_set_id: string;
  nct_id: string;
  schema_version_id: string;
  key_data: Record<string, unknown>;
  notes: string;
  flags: Record<string, boolean>;
  complete: boolean;
  built_by_reviewer_id: string | null;
  built_at: string;
}

export interface PerTrialMeta {
  notes: string;
  flags: Record<string, boolean>;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'passed' | 'failed';

export interface QualificationAttemptRow {
  id: string;
  expert_id: string;
  qualification_set_id: string;
  schema_version_id: string;
  answers: Record<string, unknown>;
  per_trial_meta: Record<string, PerTrialMeta>;
  completed_nct_ids: string[];
  status: AttemptStatus;
  score_data: Record<string, unknown> | null;
  started_at: string;
  submitted_at: string | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Production corpus (post-qualification labeling phase)
// ──────────────────────────────────────────────────────────────────────────

// Every corpus trial needs this many independent expert reviews to be done.
export const MAX_CORPUS_REVIEWS = 2;

export interface CorpusTrialRow {
  nct_id: string;
  brief_title: string;
  brief_summary: string | null;
  detailed_description: string | null;
  eligibility_raw: string | null;
  conditions: string[];
  interventions: string[];
  ctgov_sex: string | null;
  ctgov_min_age: string | null;
  ctgov_max_age: string | null;
  overall_status: string | null;
  study_type: string | null;
  phases: string[] | null;
  assigned_blocks: string[];
  ai_answers: Record<string, unknown>;
  schema_version_id: string | null;
  position: number;
  fetched_at: string;
}

export type CorpusReviewStatus = 'in_progress' | 'submitted';

export interface CorpusReviewRow {
  id: string;
  nct_id: string;
  expert_id: string;
  answers: Record<string, unknown>;
  notes: string;
  flags: Record<string, boolean>;
  status: CorpusReviewStatus;
  claimed_at: string;
  submitted_at: string | null;
  updated_at: string;
}

export interface CorpusAdjudicationRow {
  nct_id: string;
  block_key: string;
  field_key: string;
  // FieldValue wrapped as {"v": ...} so JSON null ≠ SQL NULL
  final_value: { v: unknown };
  decided_by: string | null;
  decided_at: string;
}
