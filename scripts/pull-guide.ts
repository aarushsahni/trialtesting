// Pull the live annotation_guide DB row into src/lib/annotation-guide.md.
// The inverse of sync-guide: use it when the guide was edited in the app and
// the repo copy should catch up before further edits.
//
//   npm run pull-guide

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const { rows } = await pool.query<{ markdown: string; edited_at: string }>(
    `SELECT markdown, edited_at FROM annotation_guide WHERE id = 0`,
  );
  await pool.end();
  if (!rows[0]) throw new Error('annotation_guide row not found');

  const path = join(process.cwd(), 'src/lib/annotation-guide.md');
  writeFileSync(path, rows[0].markdown);
  console.log(`Wrote ${rows[0].markdown.length} chars to ${path} (live guide edited ${rows[0].edited_at}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
