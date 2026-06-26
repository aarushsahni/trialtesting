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

// Hover-tooltip definitions surfaced when a labeler hovers a cancer-type chip.
// First-pass clinical scope notes — expert review recommended before relying
// on these for anything beyond intuition-building.
export const CANCER_TYPE_DEFINITIONS: Record<CancerType, string> = {
  PROSTATE: 'Prostate cancer.',
  UROTHELIAL: 'Urothelial carcinoma of the bladder, upper tract (renal pelvis / ureter), or urethra.',
  RCC: 'Renal cell carcinoma',
  TESTICULAR: 'Testicular and extragonadal germ cell tumors (seminoma vs non-seminoma).',
  BREAST: 'Breast cancer.',
  LUNG: 'Lung cancer.',
  COLORECTAL: 'Colorectal cancer.',
  HEAD_AND_NECK: 'Squamous-cell carcinoma of the head and neck (oral cavity, oropharynx, larynx, hypopharynx, nasopharynx, salivary gland).',
  OVARIAN: 'Epithelial ovarian, fallopian tube, and primary peritoneal carcinoma.',
  UTERINE: 'Uterine (endometrial) carcinoma.',
  CERVICAL: 'Cervical cancer.',
  MELANOMA: 'Cutaneous, mucosal, acral, or uveal melanoma.',
  MESOTHELIOMA: 'Mesothelioma of pleura or peritoneum.',
  GASTROESOPHAGEAL: 'Esophageal (squamous or adenocarcinoma), gastroesophageal junction, and gastric carcinoma.',
  NEUROENDOCRINE: 'Neuroendocrine neoplasms.',
  PANCREATIC: 'Pancreatic ductal adenocarcinoma.',
  CNS: 'Primary CNS tumors - gliomas (glioblastoma, astrocytoma, oligodendroglioma), ependymoma, medulloblastoma, meningioma.',
  HCC: 'Hepatocellular carcinoma.',
  BILIARY: 'Biliary tract cancers — intrahepatic and extrahepatic cholangiocarcinoma, gallbladder, ampullary.',
  MATURE_B_CELL: 'Mature B-cell neoplasms — DLBCL and variants, follicular, mantle cell, marginal zone, CLL/SLL, Waldenström, hairy cell, classical Hodgkin lymphoma.',
  MATURE_T_NK_CELL: 'Mature T- and NK-cell neoplasms — PTCL-NOS, AITL, ALCL, cutaneous T-cell lymphoma (mycosis fungoides, Sézary), NK/T-cell, HSTCL, ATL.',
  MYELOID_NEOPLASM: 'Myeloid neoplasms — AML, MDS, MDS/MPN overlap, MPN (PV, ET, MF), CMML, CML.',
  PRECURSOR_LYMPHOID: 'B-cell or T-cell acute lymphoblastic leukemia / lymphoma.',
  PLASMA_CELL: 'Plasma cell neoplasms such as multiple myeloma, plasma cell leukemia, plasmacytoma, AL amyloidosis, Waldenström, POEMS.',
  OTHER: 'Basket catch-all for cancer types not covered by a named block.',
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
  // Per-option hover-tooltip definitions (multi only). Surfaced when a
  // labeler hovers an option chip. Missing keys simply skip the tooltip.
  optionHelp?: Record<string, string>;
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
