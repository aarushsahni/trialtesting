// v3 type system — two-level annotation: trial-level fields + cohorts.
// Each cohort lists applicable cancer types; for every applicable cancer type
// the labeler fills a block of typed descriptor fields (BlockAnswers).

// ──────────────────────────────────────────────────────────────────────────
// Cancer types
// ──────────────────────────────────────────────────────────────────────────

export type CancerType =
  | 'PROSTATE'
  | 'UROTHELIAL'
  | 'RCC'
  | 'TESTICULAR'
  | 'BREAST'
  | 'LUNG'
  | 'COLORECTAL'
  | 'HEAD_AND_NECK'
  | 'OVARIAN'
  | 'UTERINE'
  | 'CERVICAL'
  | 'MELANOMA'
  | 'MESOTHELIOMA'
  | 'GASTROESOPHAGEAL'
  | 'NEUROENDOCRINE'
  | 'PANCREATIC'
  | 'CNS'
  | 'HCC'
  | 'BILIARY'
  | 'MATURE_B_CELL'
  | 'MATURE_T_NK_CELL'
  | 'MYELOID_NEOPLASM'
  | 'PRECURSOR_LYMPHOID'
  | 'PLASMA_CELL'
  | 'OTHER';

export const ALL_CANCER_TYPES: CancerType[] = [
  'PROSTATE', 'UROTHELIAL', 'RCC', 'TESTICULAR', 'BREAST', 'LUNG',
  'COLORECTAL', 'HEAD_AND_NECK', 'OVARIAN', 'UTERINE', 'CERVICAL',
  'MELANOMA', 'MESOTHELIOMA', 'GASTROESOPHAGEAL', 'NEUROENDOCRINE',
  'PANCREATIC', 'CNS', 'HCC', 'BILIARY',
  'MATURE_B_CELL', 'MATURE_T_NK_CELL', 'MYELOID_NEOPLASM',
  'PRECURSOR_LYMPHOID', 'PLASMA_CELL', 'OTHER',
];

export const CANCER_TYPE_LABELS: Record<CancerType, string> = {
  PROSTATE: 'Prostate',
  UROTHELIAL: 'Urothelial',
  RCC: 'Renal cell',
  TESTICULAR: 'Testicular',
  BREAST: 'Breast',
  LUNG: 'Lung',
  COLORECTAL: 'Colorectal',
  HEAD_AND_NECK: 'Head & Neck',
  OVARIAN: 'Ovarian',
  UTERINE: 'Uterine / Endometrial',
  CERVICAL: 'Cervical',
  MELANOMA: 'Melanoma',
  MESOTHELIOMA: 'Mesothelioma',
  GASTROESOPHAGEAL: 'Gastroesophageal',
  NEUROENDOCRINE: 'Neuroendocrine',
  PANCREATIC: 'Pancreatic',
  CNS: 'CNS',
  HCC: 'Hepatocellular',
  BILIARY: 'Biliary',
  MATURE_B_CELL: 'Mature B-cell',
  MATURE_T_NK_CELL: 'Mature T/NK-cell',
  MYELOID_NEOPLASM: 'Myeloid neoplasm',
  PRECURSOR_LYMPHOID: 'Precursor lymphoid',
  PLASMA_CELL: 'Plasma cell',
  OTHER: 'Other (basket)',
};

// ──────────────────────────────────────────────────────────────────────────
// Field classification (informational only — drives the per-class breakdown
// on the reviewer's scores page; not used as a pass-gate threshold).
// ──────────────────────────────────────────────────────────────────────────

export type FieldClass =
  | 'biomarker'
  | 'prior_therapy'
  | 'lab_cutoff'
  | 'accepted_diseases'
  | 'other';

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
  key: CancerType;
  label: string;
  fields: Record<string, FieldDef>;
}

// ──────────────────────────────────────────────────────────────────────────
// Answer shapes
// ──────────────────────────────────────────────────────────────────────────

// Per-field value.
//   multi   -> string[] | null
//   bool    -> boolean | null
//   number  -> number | null
export type FieldValue = string[] | boolean | number | null;

// Per-cancer-type block of answers: { fieldKey: value }
export type BlockAnswers = Record<string, FieldValue>;

// A cohort = a trial subgroup with its own eligibility bounds + a set of
// applicable cancer types. For each applicable cancer type, the labeler fills
// a BlockAnswers object. OTHER may appear as a key but its value is always {}.
export interface Cohort {
  cohortKey: string;          // canonical id — used for matching during scoring & adjudication
  displayName: string;
  applicableCancerTypes: Partial<Record<CancerType, BlockAnswers>>;
  minAge: number | null;
  maxAge: number | null;
  ecogMin: number | null;
  ecogMax: number | null;
}

// Top-level annotation payload for one trial. Stored as the value of:
//   reference_keys.key_data    (reviewer's ground truth)
//   annotations.answers        (expert's per-trial annotation)
export interface TrialAnswers {
  nctId: string;
  expertId: string | null;        // null for reference keys / AI prefill
  cancerTypes: CancerType[];      // trial-level applicable cancer types (superset across cohorts)
  minAge: number | null;
  maxAge: number | null;
  ecogMin: number | null;
  ecogMax: number | null;
  cohorts: Cohort[];
}

// Build an empty TrialAnswers for a fresh trial. Caller supplies nctId and
// any seeding info from CT.gov assigned_cancer_types.
export function emptyTrialAnswers(nctId: string, expertId: string | null = null): TrialAnswers {
  return {
    nctId,
    expertId,
    cancerTypes: [],
    minAge: null,
    maxAge: null,
    ecogMin: null,
    ecogMax: null,
    cohorts: [],
  };
}

// Sentinel value used in trial_adjudications when the adjudicated field is
// a trial-level field (not scoped to any cohort or cancer type). Stored in
// both the cohort_key and cancer_type columns. Lives here (rather than db.ts)
// so non-DB code paths can construct adjudication keys.
export const TRIAL_LEVEL_SENTINEL = '__TRIAL__';

// ──────────────────────────────────────────────────────────────────────────
// CT.gov API v2 (subset we use for fetching trials)
// ──────────────────────────────────────────────────────────────────────────

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
