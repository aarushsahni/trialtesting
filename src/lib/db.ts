import { Pool } from 'pg';
import type { TrialHighlights } from './highlights';

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
  password_hash: string;
  created_at: string;
}

export interface SchemaVersionRow {
  id: string;
  version_tag: string;
  schema_json: unknown;
  created_at: string;
}

// Global trial catalog.
export interface TrialRow {
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
  assigned_cancer_types: string[];
  schema_version_id: string | null;
  position: number;
  fetched_at: string;
}

// Per-expert assignment. is_test_trial flags the gate trials the expert must
// complete; test_reviewed_at is set when a reviewer marks that submission
// reviewed. The expert's non-test trials are unlocked iff no test-trial row
// of theirs has test_reviewed_at IS NULL.
export interface TrialAssignmentRow {
  expert_id: string;
  nct_id: string;
  is_test_trial: boolean;
  test_reviewed_at: string | null;
  test_reviewed_by: string | null;
  assigned_at: string;
}

export type AnnotationStatus = 'in_progress' | 'submitted';

// Trial-centric annotation. One row per (trial, expert). cohort_map is the
// reviewer's mapping { expertCohortKey → referenceCohortKey } applied at
// scoring time; missing entries mean unmapped. score_data is only populated
// for test trials (computed at submit time, recomputed on cohort_map change).
export interface AnnotationRow {
  id: string;
  nct_id: string;
  expert_id: string;
  schema_version_id: string | null;
  answers: Record<string, unknown>;     // TrialAnswers shape
  notes: string;
  flags: Record<string, boolean>;
  status: AnnotationStatus;
  cohort_map: Record<string, string>;
  highlights: TrialHighlights;
  score_data: Record<string, unknown> | null;
  scored_at: string | null;
  started_at: string;
  submitted_at: string | null;
  updated_at: string;
}

// Reviewer's ground truth for one trial. Re-keyed on nct_id alone — no set.
export interface ReferenceKeyRow {
  nct_id: string;
  schema_version_id: string;
  key_data: Record<string, unknown>;
  notes: string;
  flags: Record<string, boolean>;
  complete: boolean;
  built_by_reviewer_id: string | null;
  built_at: string;
}

// Per-field reviewer adjudication. cohort_key + cancer_type identify where
// in the two-level TrialAnswers shape the adjudicated field lives. Trial-
// level fields use the sentinel `__TRIAL__` in both columns (see
// TRIAL_LEVEL_SENTINEL in types.ts). final_value wraps the FieldValue as
// {"v": ...} so JSON null is distinguishable from SQL NULL.
export interface TrialAdjudicationRow {
  nct_id: string;
  cohort_key: string;
  cancer_type: string;
  field_key: string;
  final_value: { v: unknown };
  decided_by: string | null;
  decided_at: string;
}

// Every non-test trial needs this many independent expert annotations before
// it can be adjudicated. Enforced in startOrResumeAnnotation by counting
// existing non-test annotations on the trial before creating a new one.
export const MAX_ANNOTATIONS_PER_TRIAL = 2;
