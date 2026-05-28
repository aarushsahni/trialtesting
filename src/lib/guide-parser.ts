// Parse the annotation guide markdown to extract per-field "What it captures"
// text. Used as the source of truth for hover tooltips on FieldEditor.
//
// The guide structure is:
//   ## <Block heading>
//   | Field | Type | What it captures | How to annotate from the CT.gov record |
//   |---|---|---|---|
//   | `fieldKey` | ... | the description we want | ... |

import { BlockKey } from './types';

// Map from H2 heading text in the guide to BlockKey.
// Kept in sync with /guide page's HEADING_TO_BLOCK.
const HEADING_TO_BLOCK: Record<string, BlockKey> = {
  'Prostate': 'prostate',
  'Urothelial / Bladder': 'urothelial',
  'Renal Cell Carcinoma (RCC)': 'rcc',
  'Testicular / Germ Cell': 'testicular',
  'Breast': 'breast',
  'Lung': 'lung',
  'Colorectal': 'colorectal',
  'Head & Neck': 'head_and_neck',
  'Ovarian / Fallopian / Primary Peritoneal': 'ovarian',
  'Uterine / Endometrial': 'uterine',
  'Cervical': 'cervical',
  'Melanoma': 'melanoma',
  'Mesothelioma': 'mesothelioma',
  'Gastroesophageal (Gastric / GEJ / Esophageal)': 'gastroesophageal',
  'Neuroendocrine Tumors': 'neuroendocrine',
  'Pancreatic': 'pancreatic',
  'CNS / Glioma': 'cns',
  'Hepatocellular Carcinoma (HCC)': 'hcc',
  'Biliary Tract (Cholangiocarcinoma / Gallbladder)': 'biliary',
  'Mature B-Cell Lymphoma': 'mature_b_cell',
  'Mature T/NK-Cell Lymphoma': 'mature_t_nk_cell',
  'Myeloid Neoplasms (AML / MDS / MPN / CML)': 'myeloid_neoplasm',
  'Precursor Lymphoid (ALL / LBL)': 'precursor_lymphoid',
  'Plasma Cell (Myeloma / Amyloidosis)': 'plasma_cell',
};

export type HelpTextMap = Partial<Record<BlockKey, Record<string, string>>>;

/**
 * Walk the markdown, find each H2 block section, parse its field table.
 * Returns { [blockKey]: { [fieldKey]: "What it captures" text } }
 */
export function parseGuideHelpText(markdown: string): HelpTextMap {
  const out: HelpTextMap = {};

  // Split into chunks at each H2 heading. The first chunk (before the first ##)
  // is the preamble (general rules, etc.) and we skip it.
  const chunks = markdown.split(/^## /gm).slice(1);

  for (const chunk of chunks) {
    const newlineIdx = chunk.indexOf('\n');
    if (newlineIdx === -1) continue;
    const heading = chunk.slice(0, newlineIdx).trim();
    const blockKey = HEADING_TO_BLOCK[heading];
    if (!blockKey) continue;

    const body = chunk.slice(newlineIdx + 1);
    const fields: Record<string, string> = {};
    const lines = body.split('\n');
    let inTable = false;
    let columnsLayout: string[] | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Detect the header row of the table we care about — must include "Field"
      // and "What it captures" columns.
      if (line.startsWith('| Field ') && line.includes('What it captures')) {
        inTable = true;
        columnsLayout = line.split('|').map((c) => c.trim());
        continue;
      }
      // Separator row right under the header (|---|---|...)
      if (inTable && /^\|[\s:|-]+\|$/.test(line)) continue;

      // End of table (blank line or non-pipe content)
      if (inTable && !line.startsWith('|')) {
        inTable = false;
        columnsLayout = null;
        continue;
      }
      if (!inTable) continue;

      // Data row: split by pipe. First and last cells are empty (leading/trailing |).
      const cells = line.split('|').map((c) => c.trim());
      if (!columnsLayout || cells.length !== columnsLayout.length) continue;

      // Column index of "Field" and "What it captures"
      const fieldIdx = columnsLayout.indexOf('Field');
      const whatIdx = columnsLayout.indexOf('What it captures');
      if (fieldIdx < 0 || whatIdx < 0) continue;

      const fieldKey = cells[fieldIdx].replace(/`/g, '').trim();
      const whatItCaptures = cells[whatIdx].trim();
      if (fieldKey && whatItCaptures) {
        fields[fieldKey] = whatItCaptures;
      }
    }

    if (Object.keys(fields).length > 0) {
      out[blockKey] = fields;
    }
  }

  return out;
}
