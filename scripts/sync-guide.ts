// Push src/lib/annotation-guide.md to the annotation_guide DB row.
// Use after editing the markdown file when you want the change reflected
// in the running app without re-initializing the DB.
//
//   npm run sync-guide

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');

  const path = join(process.cwd(), 'src/lib/annotation-guide.md');
  const markdown = readFileSync(path, 'utf8');

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('sslmode=require') || url.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const result = await pool.query(
    `UPDATE annotation_guide
       SET markdown = $1, edited_at = NOW()
       WHERE id = 0`,
    [markdown],
  );
  console.log(`Updated ${result.rowCount} row (${markdown.length} chars from ${path}).`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
