// Seed per-expert trial_assignments from a CSV.
//
// CSV: data/assignments.csv with header
//   expert_name,nct_id,is_test_trial
// where is_test_trial is one of: true, false, 1, 0, yes, no (case-insensitive).
// Lines starting with `#` are ignored.
//
//   npm run seed-assignments
//
// Idempotent — uses ON CONFLICT to update is_test_trial in place. Existing
// test_reviewed_at timestamps are preserved.

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const CSV_PATH = join(process.cwd(), 'data', 'assignments.csv');

function parseBool(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 't'].includes(t)) return true;
  if (['false', '0', 'no', 'n', 'f', ''].includes(t)) return false;
  throw new Error(`Could not parse boolean: "${s}"`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  let raw: string;
  try { raw = readFileSync(CSV_PATH, 'utf8'); }
  catch {
    console.error(`Could not read ${CSV_PATH}. Create it with columns: expert_name,nct_id,is_test_trial`);
    process.exit(1);
  }

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idxName = header.indexOf('expert_name');
  const idxNct = header.indexOf('nct_id');
  const idxTest = header.indexOf('is_test_trial');
  if (idxName < 0 || idxNct < 0 || idxTest < 0) {
    throw new Error(`CSV must have columns: expert_name, nct_id, is_test_trial. Got: ${header.join(', ')}`);
  }

  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      expertName: cells[idxName].trim(),
      nctId: cells[idxNct].trim(),
      isTestTrial: parseBool(cells[idxTest] ?? ''),
    };
  });

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let inserted = 0, missingExpert = 0, missingTrial = 0;
    for (const r of rows) {
      const user = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE name = $1 AND role = 'expert'`,
        [r.expertName],
      );
      if (user.rowCount === 0) {
        console.warn(`  ! expert "${r.expertName}" not found — skipping ${r.nctId}`);
        missingExpert++;
        continue;
      }
      const trial = await client.query<{ nct_id: string }>(
        `SELECT nct_id FROM trials WHERE nct_id = $1`,
        [r.nctId],
      );
      if (trial.rowCount === 0) {
        console.warn(`  ! trial ${r.nctId} not in DB — skipping`);
        missingTrial++;
        continue;
      }
      await client.query(`
        INSERT INTO trial_assignments (expert_id, nct_id, is_test_trial)
        VALUES ($1, $2, $3)
        ON CONFLICT (expert_id, nct_id) DO UPDATE
          SET is_test_trial = EXCLUDED.is_test_trial
      `, [user.rows[0].id, r.nctId, r.isTestTrial]);
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`Upserted ${inserted} assignments` +
      (missingExpert ? `, skipped ${missingExpert} (expert missing)` : '') +
      (missingTrial ? `, skipped ${missingTrial} (trial missing)` : '') +
      '.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
