// Seed PLACEHOLDER corpus trials for the production labeling phase.
//
//   npm run seed-corpus
//
// Creates 250 placeholder trials (TRIAL-001 .. TRIAL-250) cycling through the
// 24 cancer blocks, each with deterministic dummy ai_answers so the
// AI-prefilled review UX is testable end-to-end. Replace with the real trial
// list + real TEMPO extractions later (same columns; ai_answers holds the
// TrialAnswers the editor prefills from).
//
// Idempotent: bails out if corpus_trials already has rows. To replace:
//   npm run seed-corpus -- --force   (deletes corpus reviews/adjudications too)

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { Pool } from 'pg';
import { ALL_BLOCK_KEYS, BlockKey, FieldValue, TrialAnswers } from '../src/lib/types';
import { BLOCKS, snapshotSchema } from '../src/lib/schema/field-schemas';

const COUNT = Number(process.env.CORPUS_PLACEHOLDER_COUNT || 250);
const SCHEMA_VERSION_TAG = process.env.SCHEMA_VERSION_TAG || 'v1.0';
const FORCE = process.argv.includes('--force');

// Small deterministic PRNG so re-seeding produces identical dummy answers.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Dummy AI answers: fill ~60% of the block's fields with plausible values.
function dummyAnswers(block: BlockKey, trialIndex: number): TrialAnswers {
  const rand = mulberry32(trialIndex * 7919 + 17);
  const fields = BLOCKS[block].fields;
  const blockAnswers: Record<string, FieldValue> = {};
  for (const [fieldKey, def] of Object.entries(fields)) {
    if (rand() > 0.6) continue; // leave unconstrained (null / absent)
    if (def.kind === 'multi' && def.options && def.options.length > 0) {
      const n = 1 + Math.floor(rand() * Math.min(2, def.options.length));
      const shuffled = [...def.options].sort(() => rand() - 0.5);
      blockAnswers[fieldKey] = shuffled.slice(0, n);
    } else if (def.kind === 'bool') {
      blockAnswers[fieldKey] = rand() > 0.5;
    } else if (def.kind === 'number') {
      blockAnswers[fieldKey] = Math.floor(rand() * 4);
    }
  }
  return { [block]: blockAnswers };
}

const PLACEHOLDER_ELIGIBILITY = (n: number, blockLabel: string) => `PLACEHOLDER TRIAL ${n} — ${blockLabel}

Inclusion Criteria:

* This is placeholder text. The real corpus trial list (~250 trials from ClinicalTrials.gov) will replace these rows.
* Histologically confirmed disease appropriate to the ${blockLabel} block.
* Age ≥ 18 years; ECOG performance status 0-1.
* Adequate organ function per protocol.

Exclusion Criteria:

* Prior enrollment in this placeholder.
* Any condition that would interfere with placeholder interpretation.`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const existing = await pool.query(`SELECT COUNT(*)::int AS n FROM corpus_trials`);
  if (existing.rows[0].n > 0) {
    if (!FORCE) {
      console.log(`corpus_trials already has ${existing.rows[0].n} rows. Re-run with --force to wipe and re-seed.`);
      await pool.end();
      return;
    }
    console.log(`--force: wiping ${existing.rows[0].n} corpus trials (+ reviews/adjudications)…`);
    await pool.query(`DELETE FROM corpus_adjudications`);
    await pool.query(`DELETE FROM corpus_reviews`);
    await pool.query(`DELETE FROM corpus_trials`);
  }

  // Reuse (or create) the schema version
  let schemaVersionId: string;
  const sv = await pool.query(`SELECT id FROM schema_versions WHERE version_tag = $1`, [SCHEMA_VERSION_TAG]);
  if (sv.rowCount && sv.rowCount > 0) {
    schemaVersionId = sv.rows[0].id;
  } else {
    const r = await pool.query(
      `INSERT INTO schema_versions (version_tag, schema_json) VALUES ($1, $2) RETURNING id`,
      [SCHEMA_VERSION_TAG, JSON.stringify(snapshotSchema())],
    );
    schemaVersionId = r.rows[0].id;
  }

  for (let i = 1; i <= COUNT; i++) {
    const block = ALL_BLOCK_KEYS[(i - 1) % ALL_BLOCK_KEYS.length];
    const label = BLOCKS[block].label;
    const nctId = `TRIAL-${String(i).padStart(3, '0')}`;
    await pool.query(
      `INSERT INTO corpus_trials (
        nct_id, brief_title, brief_summary, eligibility_raw,
        conditions, interventions, overall_status, study_type, phases,
        assigned_blocks, ai_answers, schema_version_id, position
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
      [
        nctId,
        `Placeholder Trial ${i} (${label})`,
        `Placeholder brief summary for trial ${i}. Will be replaced by the real corpus trial.`,
        PLACEHOLDER_ELIGIBILITY(i, label),
        [label],
        ['Placeholder intervention'],
        'PLACEHOLDER',
        'INTERVENTIONAL',
        ['PHASE2'],
        [block],
        JSON.stringify(dummyAnswers(block, i)),
        schemaVersionId,
        i,
      ],
    );
  }
  console.log(`Seeded ${COUNT} placeholder corpus trials (TRIAL-001 .. TRIAL-${String(COUNT).padStart(3, '0')}).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
