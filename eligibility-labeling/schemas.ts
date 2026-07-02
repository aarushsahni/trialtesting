// Per-cancer-type descriptor schemas. Each `<X>_SCHEMA` is a typed
// `as const` object describing the fields the labeler fills out for that
// cancer type. The schemas drive the dynamic descriptor form: the client
// renders each field's control based on its `kind` (categorical | boolean |
// numeric | fromAlphabet).
//
// This file is intentionally self-contained — no project imports. The
// recipient can copy it into another app as-is, edit the field set, or
// translate it to a different language.
//
// To add or change a field:
//   1. Edit the relevant `<X>_SCHEMA.fields` block below.
//   2. (optional) Add a prose description under the matching cancer-type
//      block in `field-descriptions.json`.

// ----------------------------------------------------------------------------
// Schema DSL
// ----------------------------------------------------------------------------

export interface CategoricalSpec<V extends string = string> {
  kind: 'categorical';
  values: readonly V[];
}
export interface BooleanSpec { kind: 'boolean'; }
export interface NumericSpec { kind: 'numeric'; }
export interface FromAlphabetSpec<A extends readonly string[] = readonly string[]> {
  kind: 'fromAlphabet';
  alphabet: A;
}
export type FieldSpec = CategoricalSpec | BooleanSpec | NumericSpec | FromAlphabetSpec;

export interface CancerTrialSchema {
  readonly descriptorKey: string;
  readonly fields: Readonly<Record<string, FieldSpec>>;
}

// Mapped-type view of a schema → the JSON shape the labeler emits per cohort
// per cancer type. categorical / fromAlphabet → string[] | null (multi-select);
// boolean → boolean | null; numeric → number | null.
type FieldToTrialType<F extends FieldSpec> =
  F extends CategoricalSpec<infer V> ? V[] | null :
  F extends BooleanSpec ? boolean | null :
  F extends NumericSpec ? number | null :
  F extends FromAlphabetSpec<infer A> ? A[number][] | null :
  never;
export type TrialDescriptorsOf<S extends CancerTrialSchema> = {
  [K in keyof S['fields']]?: FieldToTrialType<S['fields'][K]>;
};

// ----------------------------------------------------------------------------
// Cancer types
// ----------------------------------------------------------------------------

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

export const CANCER_TYPE_LABELS: Record<CancerType, string> = {
  PROSTATE: 'Prostate Cancer',
  UROTHELIAL: 'Urothelial Cancer',
  RCC: 'Renal Cell Carcinoma',
  TESTICULAR: 'Testicular Cancer',
  BREAST: 'Breast Cancer',
  LUNG: 'Lung Cancer',
  COLORECTAL: 'Colorectal Cancer',
  HEAD_AND_NECK: 'Head & Neck Cancer',
  OVARIAN: 'Ovarian Cancer',
  UTERINE: 'Uterine/Endometrial Cancer',
  CERVICAL: 'Cervical Cancer',
  MELANOMA: 'Melanoma',
  MESOTHELIOMA: 'Mesothelioma',
  GASTROESOPHAGEAL: 'Gastroesophageal Cancer',
  NEUROENDOCRINE: 'Neuroendocrine Tumor',
  PANCREATIC: 'Pancreatic Cancer',
  CNS: 'CNS Tumor',
  HCC: 'Hepatocellular Carcinoma',
  BILIARY: 'Biliary Tract Cancer',
  MATURE_B_CELL: 'Mature B-cell Neoplasm',
  MATURE_T_NK_CELL: 'Mature T/NK-cell Neoplasm',
  MYELOID_NEOPLASM: 'Myeloid Neoplasm',
  PRECURSOR_LYMPHOID: 'Precursor Lymphoid Neoplasm',
  PLASMA_CELL: 'Plasma Cell Neoplasm',
  OTHER: 'Other (basket catch-all)',
};

// ----------------------------------------------------------------------------
// Per-cancer therapy alphabets (used as `FromAlphabetSpec` source)
// ----------------------------------------------------------------------------

export const PROSTATE_THERAPIES = ['ARPI', 'TAXANE', 'PSMA_RADIOLIGAND', 'PARPI'] as const;
export const UROTHELIAL_THERAPIES = ['PLATINUM', 'IMMUNOTHERAPY', 'ENFORTUMAB_VEDOTIN', 'FGFR3_INHIBITOR', 'RADICAL_CYSTECTOMY'] as const;
export const RCC_THERAPIES = ['NEPHRECTOMY', 'VEGF_TKI', 'IMMUNOTHERAPY_METASTATIC', 'IMMUNOTHERAPY_ADJUVANT', 'HIF2A_INHIBITOR', 'MTOR_INHIBITOR'] as const;
export const TESTICULAR_THERAPIES = ['PLATINUM_CHEMOTHERAPY', 'HDCT_ASCT'] as const;
export const BREAST_THERAPIES = ['ENDOCRINE_THERAPY', 'CDK46_INHIBITOR', 'CHEMOTHERAPY_ADVANCED', 'HER2_DIRECTED_THERAPY', 'ANTIBODY_DRUG_CONJUGATE'] as const;
export const LUNG_THERAPIES = ['PLATINUM_CHEMOTHERAPY', 'IMMUNOTHERAPY', 'TARGETED_THERAPY', 'OSIMERTINIB'] as const;
export const COLORECTAL_THERAPIES = ['FLUOROPYRIMIDINE', 'OXALIPLATIN', 'IRINOTECAN', 'ANTI_EGFR', 'ANTI_VEGF', 'IMMUNOTHERAPY', 'BRAF_COMBINATION_THERAPY'] as const;
export const HEAD_AND_NECK_THERAPIES = ['RADIATION', 'PLATINUM', 'IMMUNOTHERAPY'] as const;
export const OVARIAN_THERAPIES = ['DEBULKING', 'PLATINUM', 'BEVACIZUMAB', 'PARPI'] as const;
export const UTERINE_THERAPIES = ['RADIATION', 'PLATINUM', 'IMMUNOTHERAPY'] as const;
export const CERVICAL_THERAPIES = ['CHEMORADIATION', 'PLATINUM', 'IMMUNOTHERAPY'] as const;
export const MELANOMA_THERAPIES = ['IMMUNOTHERAPY', 'BRAF_MEK_INHIBITOR'] as const;
export const MESOTHELIOMA_THERAPIES = ['PLATINUM', 'PEMETREXED', 'IMMUNOTHERAPY'] as const;
export const GASTROESOPHAGEAL_THERAPIES = ['FLUOROPYRIMIDINE', 'PLATINUM', 'IMMUNOTHERAPY', 'HER2_DIRECTED_THERAPY'] as const;
export const NEUROENDOCRINE_THERAPIES = ['SOMATOSTATIN_ANALOG', 'CHEMOTHERAPY', 'PRRT', 'EVEROLIMUS'] as const;
export const PANCREATIC_THERAPIES = ['FOLFIRINOX', 'GEMCITABINE_NABPACLITAXEL', 'IMMUNOTHERAPY'] as const;
export const CNS_THERAPIES = ['RADIOTHERAPY', 'TEMOZOLOMIDE', 'BEVACIZUMAB', 'TTFIELDS'] as const;
export const HCC_THERAPIES = ['ATEZOLIZUMAB_BEVACIZUMAB', 'TKI', 'IMMUNOTHERAPY', 'TRANSARTERIAL_THERAPY'] as const;
export const BILIARY_THERAPIES = ['GEMCITABINE_CISPLATIN', 'IMMUNOTHERAPY', 'FGFR_INHIBITOR', 'IDH1_INHIBITOR'] as const;
export const MATURE_B_CELL_THERAPIES = ['ANTI_CD20', 'ANTI_CD19', 'BTK_INHIBITOR', 'BCL2_INHIBITOR', 'ANTHRACYCLINE', 'BISPECIFIC', 'CAR_T', 'AUTO_TRANSPLANT', 'ALLO_TRANSPLANT'] as const;
export const MATURE_T_NK_THERAPIES = ['BRENTUXIMAB', 'MOGAMULIZUMAB', 'CHEMOTHERAPY', 'AUTO_TRANSPLANT', 'ALLO_TRANSPLANT'] as const;
export const MYELOID_THERAPIES = ['HMA', 'VENETOCLAX', 'INTENSIVE_CHEMOTHERAPY', 'FLT3_INHIBITOR', 'IDH_INHIBITOR', 'MENIN_INHIBITOR', 'JAK_INHIBITOR', 'BCR_ABL_TKI', 'ALLO_TRANSPLANT'] as const;
export const PRECURSOR_LYMPHOID_THERAPIES = ['BLINATUMOMAB', 'INOTUZUMAB', 'CAR_T', 'BCR_ABL_TKI', 'ALLO_TRANSPLANT'] as const;
export const PLASMA_CELL_THERAPIES = ['IMID', 'PROTEASOME_INHIBITOR', 'ANTI_CD38', 'BCMA_THERAPY', 'BISPECIFIC', 'AUTO_TRANSPLANT', 'ALLO_TRANSPLANT'] as const;

// Heme lineage disease alphabets (used as `FromAlphabetSpec` source for acceptedDiseases)
export const MATURE_B_CELL_DISEASES = ['DLBCL_NOS', 'HGBCL', 'HGBCL_DH_TH', 'PMBCL', 'DLBCL_LEG_TYPE', 'TCRBCL', 'TRANSFORMED_FL', 'TRANSFORMED_MZL', 'RICHTER', 'FL', 'MCL', 'MZL', 'CHL', 'CLL_SLL', 'WALDENSTROM', 'HCL', 'OTHER'] as const;
export const MATURE_T_NK_DISEASES = ['PTCL_NOS', 'AITL', 'ALCL_ALK_POS', 'ALCL_ALK_NEG', 'CTCL_MF', 'CTCL_SS', 'NK_T', 'HSTCL', 'MEITL', 'EATL', 'ATL', 'OTHER'] as const;
export const MYELOID_DISEASES = ['AML', 'MDS', 'CMML', 'MDS_MPN', 'MPN_PV', 'MPN_ET', 'MPN_MF', 'CML', 'OTHER'] as const;
export const PRECURSOR_LYMPHOID_DISEASES = ['B_ALL', 'T_ALL', 'LBL_B', 'LBL_T', 'OTHER'] as const;
export const PLASMA_CELL_DISEASES = ['MM', 'PCL', 'PLASMACYTOMA', 'AL_AMYLOIDOSIS', 'WALDENSTROM_LPL', 'POEMS', 'OTHER'] as const;

// ----------------------------------------------------------------------------
// Per-cancer schemas
// ----------------------------------------------------------------------------

export const PROSTATE_SCHEMA = {
  descriptorKey: 'PROSTATE',
  fields: {
    castrationStatus: { kind: 'categorical', values: ['SENSITIVE', 'RESISTANT'] },
    metastaticStatus: { kind: 'categorical', values: ['METASTATIC', 'NON_METASTATIC'] },
    histology: { kind: 'categorical', values: ['ADENOCARCINOMA', 'NEUROENDOCRINE_SMALL_CELL'] },
    visceralMetastases: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    psmaPetPositive: { kind: 'boolean' },
    hrrStatus: { kind: 'categorical', values: ['BRCA1', 'BRCA2', 'OTHER_HRR', 'NEGATIVE'] },
    msiStatus: { kind: 'categorical', values: ['MSI_HIGH_DMMR', 'MSS_PMMR'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: PROSTATE_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: PROSTATE_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const UROTHELIAL_SCHEMA = {
  descriptorKey: 'UROTHELIAL',
  fields: {
    diseaseSetting: { kind: 'categorical', values: ['NMIBC', 'MIBC', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    site: { kind: 'categorical', values: ['BLADDER', 'UPPER_TRACT', 'URETHRAL'] },
    histology: { kind: 'categorical', values: ['PURE_UROTHELIAL', 'VARIANT_HISTOLOGY', 'PURE_SQUAMOUS', 'PURE_NEUROENDOCRINE'] },
    cisPresent: { kind: 'boolean' },
    bcgStatus: { kind: 'categorical', values: ['NAIVE', 'EXPOSED', 'UNRESPONSIVE'] },
    cisplatinEligible: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    fgfr3Status: { kind: 'categorical', values: ['ALTERED', 'WILD_TYPE'] },
    pdl1Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    her2Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    nectin4Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: UROTHELIAL_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: UROTHELIAL_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const RCC_SCHEMA = {
  descriptorKey: 'RCC',
  fields: {
    histologySubtype: { kind: 'categorical', values: ['CLEAR_CELL', 'PAPILLARY', 'CHROMOPHOBE', 'OTHER_NON_CLEAR_CELL'] },
    sarcomatoidFeatures: { kind: 'boolean' },
    diseaseSetting: { kind: 'categorical', values: ['LOCALIZED', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    imdcRisk: { kind: 'categorical', values: ['FAVORABLE', 'INTERMEDIATE', 'POOR'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    cnsMetastases: { kind: 'categorical', values: ['ABSENT', 'TREATED_STABLE', 'ACTIVE'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: RCC_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: RCC_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const TESTICULAR_SCHEMA = {
  descriptorKey: 'TESTICULAR',
  fields: {
    histology: { kind: 'categorical', values: ['SEMINOMA', 'NON_SEMINOMA'] },
    diseaseSetting: { kind: 'categorical', values: ['STAGE_I', 'METASTATIC_INITIAL', 'RELAPSED_REFRACTORY'] },
    igcccgRisk: { kind: 'categorical', values: ['GOOD', 'INTERMEDIATE', 'POOR'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: TESTICULAR_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: TESTICULAR_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const BREAST_SCHEMA = {
  descriptorKey: 'BREAST',
  fields: {
    hrStatus: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    her2Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    her2LowOrUltralowStatus: { kind: 'categorical', values: ['NEGATIVE', 'ULTRA_LOW', 'LOW'] },
    diseaseSetting: { kind: 'categorical', values: ['NEOADJUVANT', 'ADJUVANT', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    cnsMetastases: { kind: 'categorical', values: ['ABSENT', 'TREATED_STABLE', 'ACTIVE'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    menopausalStatus: { kind: 'categorical', values: ['PRE', 'PERI', 'POST'] },
    brcaStatus: { kind: 'categorical', values: ['GERMLINE', 'SOMATIC', 'NEGATIVE'] },
    pi3kAktPathwayStatus: { kind: 'categorical', values: ['ALTERED', 'WILD_TYPE'] },
    esr1Status: { kind: 'categorical', values: ['MUTATED', 'WILD_TYPE'] },
    pdl1Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: BREAST_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: BREAST_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const LUNG_SCHEMA = {
  descriptorKey: 'LUNG',
  fields: {
    histology: { kind: 'categorical', values: ['NSCLC_NONSQUAMOUS', 'NSCLC_SQUAMOUS', 'SCLC'] },
    metastaticStatus: { kind: 'categorical', values: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    sclcExtent: { kind: 'categorical', values: ['LIMITED', 'EXTENSIVE'] },
    cnsMetastases: { kind: 'categorical', values: ['ABSENT', 'TREATED_STABLE', 'ACTIVE'] },
    leptomeningealDisease: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    egfrStatus: { kind: 'categorical', values: ['CLASSICAL_DEL19_L858R', 'EXON20_INS', 'UNCOMMON', 'WILD_TYPE'] },
    alkStatus: { kind: 'categorical', values: ['REARRANGED', 'WILD_TYPE'] },
    ros1Status: { kind: 'categorical', values: ['REARRANGED', 'WILD_TYPE'] },
    krasStatus: { kind: 'categorical', values: ['G12C', 'G12D', 'OTHER_KRAS', 'WILD_TYPE'] },
    brafStatus: { kind: 'categorical', values: ['V600E', 'V600K', 'OTHER_V600', 'NON_V600', 'WILD_TYPE'] },
    metStatus: { kind: 'categorical', values: ['EXON14_SKIPPING', 'AMPLIFIED', 'WILD_TYPE'] },
    retStatus: { kind: 'categorical', values: ['REARRANGED', 'WILD_TYPE'] },
    her2Status: { kind: 'categorical', values: ['MUTATED', 'AMPLIFIED', 'OVEREXPRESSED', 'WILD_TYPE'] },
    ntrkStatus: { kind: 'categorical', values: ['FUSION', 'WILD_TYPE'] },
    pdl1TpsCategory: { kind: 'categorical', values: ['HIGH_GE_50', 'INTERMEDIATE_1_49', 'NEGATIVE_LT_1'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: LUNG_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: LUNG_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const COLORECTAL_SCHEMA = {
  descriptorKey: 'COLORECTAL',
  fields: {
    primarySiteSidedness: { kind: 'categorical', values: ['RIGHT_COLON', 'LEFT_COLON', 'RECTUM'] },
    diseaseSetting: { kind: 'categorical', values: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    histology: { kind: 'categorical', values: ['ADENOCARCINOMA', 'OTHER'] },
    liverLimitedDisease: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    krasStatus: { kind: 'categorical', values: ['G12C', 'G12D', 'OTHER_KRAS', 'WILD_TYPE'] },
    nrasStatus: { kind: 'categorical', values: ['G12C', 'G12D', 'Q61K', 'Q61R', 'OTHER_NRAS', 'WILD_TYPE'] },
    brafStatus: { kind: 'categorical', values: ['V600E', 'V600K', 'OTHER_V600', 'NON_V600', 'WILD_TYPE'] },
    msiStatus: { kind: 'categorical', values: ['MSI_HIGH_DMMR', 'MSS_PMMR'] },
    her2Status: { kind: 'categorical', values: ['MUTATED', 'AMPLIFIED', 'OVEREXPRESSED', 'WILD_TYPE'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: COLORECTAL_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: COLORECTAL_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const HEAD_AND_NECK_SCHEMA = {
  descriptorKey: 'HEAD_AND_NECK',
  fields: {
    primarySite: { kind: 'categorical', values: ['ORAL_CAVITY', 'OROPHARYNX', 'LARYNX', 'HYPOPHARYNX', 'NASOPHARYNX', 'SALIVARY_GLAND'] },
    diseaseSetting: { kind: 'categorical', values: ['LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'] },
    hpvP16Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    ebvStatus: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    pdl1CpsCategory: { kind: 'categorical', values: ['HIGH_GE_20', 'INTERMEDIATE_1_19', 'NEGATIVE_LT_1'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: HEAD_AND_NECK_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: HEAD_AND_NECK_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const OVARIAN_SCHEMA = {
  descriptorKey: 'OVARIAN',
  fields: {
    histology: { kind: 'categorical', values: ['HIGH_GRADE_SEROUS', 'LOW_GRADE_SEROUS', 'MUCINOUS', 'CLEAR_CELL', 'ENDOMETRIOID'] },
    diseaseSetting: { kind: 'categorical', values: ['NEWLY_DIAGNOSED', 'MAINTENANCE', 'RECURRENT'] },
    platinumSensitivity: { kind: 'categorical', values: ['SENSITIVE', 'RESISTANT', 'REFRACTORY'] },
    brcaStatus: { kind: 'categorical', values: ['GERMLINE', 'SOMATIC', 'NEGATIVE'] },
    hrdStatus: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    cnsMetastases: { kind: 'categorical', values: ['ABSENT', 'TREATED_STABLE', 'ACTIVE'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: OVARIAN_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: OVARIAN_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const UTERINE_SCHEMA = {
  descriptorKey: 'UTERINE',
  fields: {
    histology: { kind: 'categorical', values: ['ENDOMETRIOID', 'SEROUS', 'CARCINOSARCOMA', 'CLEAR_CELL'] },
    diseaseSetting: { kind: 'categorical', values: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'] },
    tcgaMolecularClass: { kind: 'categorical', values: ['POLE_ULTRAMUTATED', 'MSI_HYPERMUTATED_DMMR', 'COPY_NUMBER_LOW_NSMP', 'COPY_NUMBER_HIGH_P53ABN'] },
    msiStatus: { kind: 'categorical', values: ['MSI_HIGH_DMMR', 'MSS_PMMR'] },
    her2Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: UTERINE_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: UTERINE_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const CERVICAL_SCHEMA = {
  descriptorKey: 'CERVICAL',
  fields: {
    histology: { kind: 'categorical', values: ['SQUAMOUS', 'ADENOCARCINOMA', 'ADENOSQUAMOUS'] },
    diseaseSetting: { kind: 'categorical', values: ['LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'] },
    hpvStatus: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    pdl1CpsCategory: { kind: 'categorical', values: ['POSITIVE_GE_1', 'NEGATIVE_LT_1'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: CERVICAL_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: CERVICAL_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const MELANOMA_SCHEMA = {
  descriptorKey: 'MELANOMA',
  fields: {
    primarySite: { kind: 'categorical', values: ['CUTANEOUS', 'MUCOSAL', 'UVEAL', 'ACRAL'] },
    diseaseSetting: { kind: 'categorical', values: ['RESECTED_ADJUVANT', 'UNRESECTABLE', 'METASTATIC'] },
    brafStatus: { kind: 'categorical', values: ['V600E', 'V600K', 'OTHER_V600', 'NON_V600', 'WILD_TYPE'] },
    nrasStatus: { kind: 'categorical', values: ['MUTATED', 'WILD_TYPE'] },
    ldhCategory: { kind: 'categorical', values: ['NORMAL', 'ELEVATED_1_2X_ULN', 'ELEVATED_GT_2X_ULN'] },
    cnsMetastases: { kind: 'categorical', values: ['ABSENT', 'TREATED_STABLE', 'ACTIVE'] },
    leptomeningealDisease: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: MELANOMA_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: MELANOMA_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const MESOTHELIOMA_SCHEMA = {
  descriptorKey: 'MESOTHELIOMA',
  fields: {
    histology: { kind: 'categorical', values: ['EPITHELIOID', 'SARCOMATOID', 'BIPHASIC'] },
    primarySite: { kind: 'categorical', values: ['PLEURAL', 'PERITONEAL'] },
    diseaseSetting: { kind: 'categorical', values: ['RESECTABLE', 'UNRESECTABLE', 'METASTATIC'] },
    bap1Status: { kind: 'categorical', values: ['LOST', 'INTACT'] },
    measurableDiseaseModifiedRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: MESOTHELIOMA_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: MESOTHELIOMA_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const GASTROESOPHAGEAL_SCHEMA = {
  descriptorKey: 'GASTROESOPHAGEAL',
  fields: {
    primarySiteHistology: { kind: 'categorical', values: ['ESOPHAGEAL_SQUAMOUS', 'ESOPHAGEAL_ADENOCARCINOMA', 'GEJ_ADENOCARCINOMA', 'GASTRIC_ADENOCARCINOMA', 'OTHER'] },
    diseaseSetting: { kind: 'categorical', values: ['NEOADJUVANT', 'PERIOPERATIVE', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    her2Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    pdl1CpsCategory: { kind: 'categorical', values: ['HIGH_GE_10', 'INTERMEDIATE_1_9', 'NEGATIVE_LT_1'] },
    msiStatus: { kind: 'categorical', values: ['MSI_HIGH_DMMR', 'MSS_PMMR'] },
    claudin18_2Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    fgfr2bStatus: { kind: 'categorical', values: ['OVEREXPRESSED', 'NEGATIVE'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: GASTROESOPHAGEAL_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: GASTROESOPHAGEAL_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const NEUROENDOCRINE_SCHEMA = {
  descriptorKey: 'NEUROENDOCRINE',
  fields: {
    primarySite: { kind: 'categorical', values: ['PANCREATIC', 'GI_MIDGUT', 'GI_HINDGUT', 'LUNG', 'OTHER'] },
    differentiation: { kind: 'categorical', values: ['WELL_DIFFERENTIATED', 'POORLY_DIFFERENTIATED'] },
    grade: { kind: 'categorical', values: ['G1', 'G2', 'G3'] },
    ki67Percent: { kind: 'numeric' },
    functionalStatus: { kind: 'categorical', values: ['FUNCTIONAL', 'NON_FUNCTIONAL'] },
    somatostatinReceptorImagingPositive: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: NEUROENDOCRINE_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: NEUROENDOCRINE_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const PANCREATIC_SCHEMA = {
  descriptorKey: 'PANCREATIC',
  fields: {
    resectability: { kind: 'categorical', values: ['RESECTABLE', 'BORDERLINE', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    histology: { kind: 'categorical', values: ['ADENOCARCINOMA', 'OTHER'] },
    krasStatus: { kind: 'categorical', values: ['G12C', 'G12D', 'OTHER_KRAS', 'WILD_TYPE'] },
    brcaStatus: { kind: 'categorical', values: ['GERMLINE', 'SOMATIC', 'NEGATIVE'] },
    msiStatus: { kind: 'categorical', values: ['MSI_HIGH_DMMR', 'MSS_PMMR'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    ca199Elevated: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: PANCREATIC_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: PANCREATIC_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const CNS_SCHEMA = {
  descriptorKey: 'CNS',
  fields: {
    histology: { kind: 'categorical', values: ['GLIOBLASTOMA', 'ASTROCYTOMA', 'OLIGODENDROGLIOMA', 'EPENDYMOMA', 'MEDULLOBLASTOMA', 'MENINGIOMA', 'PRIMARY_CNS_LYMPHOMA', 'OTHER'] },
    whoGrade: { kind: 'categorical', values: ['1', '2', '3', '4'] },
    diseaseStatus: { kind: 'categorical', values: ['NEWLY_DIAGNOSED', 'RECURRENT_PROGRESSIVE'] },
    idhStatus: { kind: 'categorical', values: ['IDH1_MUTATED', 'IDH2_MUTATED', 'WILD_TYPE'] },
    codeletion1p19q: { kind: 'boolean' },
    mgmtMethylated: { kind: 'boolean' },
    egfrAmplified: { kind: 'boolean' },
    atrxLoss: { kind: 'boolean' },
    brafStatus: { kind: 'categorical', values: ['V600E', 'V600K', 'OTHER_V600', 'NON_V600', 'WILD_TYPE'] },
    measurableDiseaseRano: { kind: 'boolean' },
    resectionExtent: { kind: 'categorical', values: ['BIOPSY_ONLY', 'SUBTOTAL', 'GROSS_TOTAL'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: CNS_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: CNS_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const HCC_SCHEMA = {
  descriptorKey: 'HCC',
  fields: {
    diseaseSetting: { kind: 'categorical', values: ['RESECTABLE', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    childPughClass: { kind: 'categorical', values: ['A', 'B', 'C'] },
    bclcStage: { kind: 'categorical', values: ['0', 'A', 'B', 'C', 'D'] },
    viralHepatitisStatus: { kind: 'categorical', values: ['HBV', 'HCV', 'NONE'] },
    portalVeinInvasion: { kind: 'boolean' },
    extrahepaticSpread: { kind: 'boolean' },
    afpElevated: { kind: 'boolean' },
    priorLocoregionalTherapy: { kind: 'boolean' },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: HCC_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: HCC_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const BILIARY_SCHEMA = {
  descriptorKey: 'BILIARY',
  fields: {
    primarySite: { kind: 'categorical', values: ['INTRAHEPATIC_CHOLANGIO', 'EXTRAHEPATIC_CHOLANGIO', 'GALLBLADDER', 'AMPULLARY'] },
    diseaseSetting: { kind: 'categorical', values: ['RESECTABLE', 'LOCALLY_ADVANCED', 'METASTATIC'] },
    fgfr2Status: { kind: 'categorical', values: ['FUSION', 'WILD_TYPE'] },
    idhStatus: { kind: 'categorical', values: ['IDH1_MUTATED', 'IDH2_MUTATED', 'WILD_TYPE'] },
    her2Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    brafStatus: { kind: 'categorical', values: ['V600E', 'V600K', 'OTHER_V600', 'NON_V600', 'WILD_TYPE'] },
    krasStatus: { kind: 'categorical', values: ['G12C', 'G12D', 'OTHER_KRAS', 'WILD_TYPE'] },
    msiStatus: { kind: 'categorical', values: ['MSI_HIGH_DMMR', 'MSS_PMMR'] },
    measurableDiseaseRecist: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: BILIARY_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: BILIARY_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const MATURE_B_CELL_SCHEMA = {
  descriptorKey: 'MATURE_B_CELL',
  fields: {
    acceptedDiseases: { kind: 'fromAlphabet', alphabet: MATURE_B_CELL_DISEASES },
    cellOfOrigin: { kind: 'categorical', values: ['GCB', 'NON_GCB_ABC'] },
    doubleOrTripleHit: { kind: 'boolean' },
    ighvStatus: { kind: 'categorical', values: ['MUTATED', 'UNMUTATED'] },
    del17pOrTp53Mutated: { kind: 'boolean' },
    myd88Status: { kind: 'categorical', values: ['L265P', 'WILD_TYPE'] },
    cnsInvolvement: { kind: 'boolean' },
    cd19Positive: { kind: 'boolean' },
    cd20Positive: { kind: 'boolean' },
    cd22Positive: { kind: 'boolean' },
    cd79bPositive: { kind: 'boolean' },
    transplantEligible: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: MATURE_B_CELL_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: MATURE_B_CELL_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const MATURE_T_NK_SCHEMA = {
  descriptorKey: 'MATURE_T_NK_CELL',
  fields: {
    acceptedDiseases: { kind: 'fromAlphabet', alphabet: MATURE_T_NK_DISEASES },
    atlSubtype: { kind: 'categorical', values: ['ACUTE', 'LYMPHOMATOUS', 'CHRONIC', 'SMOLDERING'] },
    htlv1Status: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    cd30Positive: { kind: 'boolean' },
    ccr4Positive: { kind: 'boolean' },
    cnsInvolvement: { kind: 'boolean' },
    ctclStageAdvanced: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: MATURE_T_NK_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: MATURE_T_NK_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const MYELOID_SCHEMA = {
  descriptorKey: 'MYELOID_NEOPLASM',
  fields: {
    acceptedDiseases: { kind: 'fromAlphabet', alphabet: MYELOID_DISEASES },
    amlClassification: { kind: 'categorical', values: ['DE_NOVO', 'SECONDARY', 'THERAPY_RELATED'] },
    elnRisk: { kind: 'categorical', values: ['FAVORABLE', 'INTERMEDIATE', 'ADVERSE'] },
    flt3Status: { kind: 'categorical', values: ['ITD', 'TKD', 'WILD_TYPE'] },
    npm1Mutated: { kind: 'boolean' },
    idhStatus: { kind: 'categorical', values: ['IDH1_MUTATED', 'IDH2_MUTATED', 'WILD_TYPE'] },
    kmt2aRearranged: { kind: 'boolean' },
    ipssR: { kind: 'categorical', values: ['VERY_LOW', 'LOW', 'INT', 'HIGH', 'VERY_HIGH'] },
    ipssM: { kind: 'categorical', values: ['VERY_LOW', 'LOW', 'MODERATE_LOW', 'MODERATE_HIGH', 'HIGH', 'VERY_HIGH'] },
    minBlastsPercent: { kind: 'numeric' },
    maxBlastsPercent: { kind: 'numeric' },
    ringSideroblasts: { kind: 'boolean' },
    sf3b1Mutated: { kind: 'boolean' },
    jak2Status: { kind: 'categorical', values: ['V617F', 'EXON12', 'WILD_TYPE'] },
    calrMutated: { kind: 'boolean' },
    mplMutated: { kind: 'boolean' },
    bcrAblStatus: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    cmlPhase: { kind: 'categorical', values: ['CHRONIC', 'ACCELERATED', 'BLAST'] },
    complexKaryotype: { kind: 'boolean' },
    monosomy7OrDel7q: { kind: 'boolean' },
    tp53Mutated: { kind: 'boolean' },
    cnsInvolvement: { kind: 'boolean' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: MYELOID_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: MYELOID_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const PRECURSOR_LYMPHOID_SCHEMA = {
  descriptorKey: 'PRECURSOR_LYMPHOID',
  fields: {
    acceptedDiseases: { kind: 'fromAlphabet', alphabet: PRECURSOR_LYMPHOID_DISEASES },
    philadelphiaStatus: { kind: 'categorical', values: ['POSITIVE', 'PH_LIKE', 'NEGATIVE'] },
    cd19Positive: { kind: 'boolean' },
    cd22Positive: { kind: 'boolean' },
    cd7Positive: { kind: 'boolean' },
    mrdStatus: { kind: 'categorical', values: ['POSITIVE', 'NEGATIVE'] },
    cnsStatus: { kind: 'categorical', values: ['CNS1', 'CNS2', 'CNS3'] },
    minRelapseNumber: { kind: 'numeric' },
    maxRelapseNumber: { kind: 'numeric' },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: PRECURSOR_LYMPHOID_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: PRECURSOR_LYMPHOID_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

export const PLASMA_CELL_SCHEMA = {
  descriptorKey: 'PLASMA_CELL',
  fields: {
    acceptedDiseases: { kind: 'fromAlphabet', alphabet: PLASMA_CELL_DISEASES },
    rissStage: { kind: 'categorical', values: ['I', 'II', 'III'] },
    highRiskCytogenetics: { kind: 'boolean' },
    measurableDiseaseImwg: { kind: 'boolean' },
    extramedullaryDisease: { kind: 'boolean' },
    cnsInvolvement: { kind: 'boolean' },
    amyloidCardiacInvolvement: { kind: 'boolean' },
    amyloidMayoStage: { kind: 'categorical', values: ['I', 'II', 'III', 'IIIA', 'IIIB'] },
    priorTherapyRequired: { kind: 'fromAlphabet', alphabet: PLASMA_CELL_THERAPIES },
    priorTherapyExcluded: { kind: 'fromAlphabet', alphabet: PLASMA_CELL_THERAPIES },
    minPriorSystemicLines: { kind: 'numeric' },
    maxPriorSystemicLines: { kind: 'numeric' },
  },
} as const satisfies CancerTrialSchema;

// ----------------------------------------------------------------------------
// Registry — every supported cancer type maps to its schema, keyed by the
// CancerType enum value. OTHER has no schema (catch-all only).
// ----------------------------------------------------------------------------

export const TRIAL_SCHEMAS: Record<Exclude<CancerType, 'OTHER'>, CancerTrialSchema> = {
  PROSTATE: PROSTATE_SCHEMA,
  UROTHELIAL: UROTHELIAL_SCHEMA,
  RCC: RCC_SCHEMA,
  TESTICULAR: TESTICULAR_SCHEMA,
  BREAST: BREAST_SCHEMA,
  LUNG: LUNG_SCHEMA,
  COLORECTAL: COLORECTAL_SCHEMA,
  HEAD_AND_NECK: HEAD_AND_NECK_SCHEMA,
  OVARIAN: OVARIAN_SCHEMA,
  UTERINE: UTERINE_SCHEMA,
  CERVICAL: CERVICAL_SCHEMA,
  MELANOMA: MELANOMA_SCHEMA,
  MESOTHELIOMA: MESOTHELIOMA_SCHEMA,
  GASTROESOPHAGEAL: GASTROESOPHAGEAL_SCHEMA,
  NEUROENDOCRINE: NEUROENDOCRINE_SCHEMA,
  PANCREATIC: PANCREATIC_SCHEMA,
  CNS: CNS_SCHEMA,
  HCC: HCC_SCHEMA,
  BILIARY: BILIARY_SCHEMA,
  MATURE_B_CELL: MATURE_B_CELL_SCHEMA,
  MATURE_T_NK_CELL: MATURE_T_NK_SCHEMA,
  MYELOID_NEOPLASM: MYELOID_SCHEMA,
  PRECURSOR_LYMPHOID: PRECURSOR_LYMPHOID_SCHEMA,
  PLASMA_CELL: PLASMA_CELL_SCHEMA,
};
