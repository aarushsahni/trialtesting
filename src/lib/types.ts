// v2 type system — keyed on cancer-type "blocks" matching the new schema.

export type BlockKey =
  | 'prostate'
  | 'urothelial'
  | 'rcc'
  | 'testicular'
  | 'breast'
  | 'lung'
  | 'colorectal'
  | 'head_and_neck'
  | 'ovarian'
  | 'uterine'
  | 'cervical'
  | 'melanoma'
  | 'mesothelioma'
  | 'gastroesophageal'
  | 'neuroendocrine'
  | 'pancreatic'
  | 'cns'
  | 'hcc'
  | 'biliary'
  | 'mature_b_cell'
  | 'mature_t_nk_cell'
  | 'myeloid_neoplasm'
  | 'precursor_lymphoid'
  | 'plasma_cell';

export const ALL_BLOCK_KEYS: BlockKey[] = [
  'prostate', 'urothelial', 'rcc', 'testicular', 'breast', 'lung',
  'colorectal', 'head_and_neck', 'ovarian', 'uterine', 'cervical',
  'melanoma', 'mesothelioma', 'gastroesophageal', 'neuroendocrine',
  'pancreatic', 'cns', 'hcc', 'biliary',
  'mature_b_cell', 'mature_t_nk_cell', 'myeloid_neoplasm',
  'precursor_lymphoid', 'plasma_cell',
];

// Field classification for scoring. Hard-exclude classes (biomarker /
// prior_therapy / lab_cutoff / accepted_diseases) get the higher F1 bar.
export type FieldClass =
  | 'biomarker'
  | 'prior_therapy'
  | 'lab_cutoff'
  | 'accepted_diseases'
  | 'other';

export const HARD_EXCLUDE_CLASSES: FieldClass[] = [
  'biomarker', 'prior_therapy', 'lab_cutoff', 'accepted_diseases',
];

export type FieldKind = 'multi' | 'bool' | 'number';

export interface FieldDef {
  kind: FieldKind;
  label: string;
  options?: string[];   // for multi
  helpText?: string;    // tooltip / annotation-guide hint
  class: FieldClass;
  // Two-key compound widget: priorTherapyRequired <-> priorTherapyExcluded.
  // When pairWith is set, the UI groups the two fields into one row of
  // three-way toggles (unconstrained / required / excluded).
  pairWith?: string;
}

export interface BlockDef {
  key: BlockKey;
  label: string;
  fields: Record<string, FieldDef>;
}

// ──────────────────────────────────────────────────────────────────────────
// Answer / reference-key data shapes
// ──────────────────────────────────────────────────────────────────────────

// Per-field value: matches the schema's union shape.
//   multi   -> string[] | null
//   bool    -> boolean | null
//   number  -> number | null
export type FieldValue = string[] | boolean | number | null;

// Per-block answers: { fieldKey: value }
export type BlockAnswers = Record<string, FieldValue>;

// Per-trial answers / reference-key payload: { blockKey: BlockAnswers }
export type TrialAnswers = Partial<Record<BlockKey, BlockAnswers>>;

// CT.gov API v2 (subset we use for fetching qualification trials)
export interface CTGovStudy {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string };
    descriptionModule?: { briefSummary?: string; detailedDescription?: string };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { name: string; type?: string }[] };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
    };
    statusModule?: { overallStatus?: string; primaryCompletionDateStruct?: { date?: string } };
    designModule?: { studyType?: string; phases?: string[] };
  };
}

export interface CTGovSearchResponse {
  studies: CTGovStudy[];
  nextPageToken?: string;
  totalCount?: number;
}
