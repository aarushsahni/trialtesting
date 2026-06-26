// Parse the annotation guide markdown to extract per-field "What it captures"
// text. Used as the source of truth for hover tooltips on FieldEditor.
//
// The guide structure is:
//   ## <Block heading>
//   | Field | Type | What it captures | How to annotate from the CT.gov record |
//   |---|---|---|---|
//   | `fieldKey` | ... | the description we want | ... |

import { CancerType } from './types';

// Map from H2 heading text in the guide to CancerType (UPPERCASE).
// Kept in sync with /guide page's HEADING_TO_CANCER_TYPE.
const HEADING_TO_CANCER_TYPE: Record<string, CancerType> = {
  'Prostate': 'PROSTATE',
  'Urothelial / Bladder': 'UROTHELIAL',
  'Renal Cell Carcinoma (RCC)': 'RCC',
  'Testicular / Germ Cell': 'TESTICULAR',
  'Breast': 'BREAST',
  'Lung': 'LUNG',
  'Colorectal': 'COLORECTAL',
  'Head & Neck': 'HEAD_AND_NECK',
  'Ovarian / Fallopian / Primary Peritoneal': 'OVARIAN',
  'Uterine / Endometrial': 'UTERINE',
  'Cervical': 'CERVICAL',
  'Melanoma': 'MELANOMA',
  'Mesothelioma': 'MESOTHELIOMA',
  'Gastroesophageal (Gastric / GEJ / Esophageal)': 'GASTROESOPHAGEAL',
  'Neuroendocrine Tumors': 'NEUROENDOCRINE',
  'Pancreatic': 'PANCREATIC',
  'CNS / Glioma': 'CNS',
  'Hepatocellular Carcinoma (HCC)': 'HCC',
  'Biliary Tract (Cholangiocarcinoma / Gallbladder)': 'BILIARY',
  'Mature B-Cell Lymphoma': 'MATURE_B_CELL',
  'Mature T/NK-Cell Lymphoma': 'MATURE_T_NK_CELL',
  'Myeloid Neoplasms (AML / MDS / MPN / CML)': 'MYELOID_NEOPLASM',
  'Precursor Lymphoid (ALL / LBL)': 'PRECURSOR_LYMPHOID',
  'Plasma Cell (Myeloma / Amyloidosis)': 'PLASMA_CELL',
};

export type HelpTextMap = Partial<Record<CancerType, Record<string, string>>>;

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
    const cancerType = HEADING_TO_CANCER_TYPE[heading];
    if (!cancerType) continue;

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
      out[cancerType] = fields;
    }
  }

  return out;
}
