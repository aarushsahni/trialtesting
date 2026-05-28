// DB-backed annotation guide. Single-row table; reads/writes go through here.

import { query } from './db';

export interface GuideRow {
  markdown: string;
  edited_by_name: string | null;
  edited_at: string;
}

export async function getCurrentGuide(): Promise<GuideRow | null> {
  const rows = await query<GuideRow>(`
    SELECT g.markdown, g.edited_at, u.name AS edited_by_name
    FROM annotation_guide g
    LEFT JOIN users u ON u.id = g.edited_by_user_id
    WHERE g.id = 0
  `);
  return rows[0] ?? null;
}

export async function saveGuide(markdown: string, userId: string): Promise<void> {
  await query(
    `UPDATE annotation_guide
     SET markdown = $1, edited_by_user_id = $2, edited_at = NOW()
     WHERE id = 0`,
    [markdown, userId],
  );
}
