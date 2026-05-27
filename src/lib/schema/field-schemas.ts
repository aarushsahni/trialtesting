// v2 field-schema metadata for the 24-block annotation schema.
// Mirrors the TypeScript schema in 1_schema.md so the UI can render every
// field generically and the server can score against it.

import { BlockDef, BlockKey, FieldClass, FieldDef } from '../types';

// ──────────────────────────────────────────────────────────────────────────
// Shared option lists + helpers
// ──────────────────────────────────────────────────────────────────────────

const POS_NEG: string[] = ['POSITIVE', 'NEGATIVE'];
const MUT_WT: string[] = ['MUTATED', 'WILD_TYPE'];
const CNS_METS: string[] = ['ABSENT', 'TREATED_STABLE', 'ACTIVE'];
const STAGE_1_4: string[] = ['I', 'II', 'III', 'IV'];

const minLines = (): FieldDef => ({
  kind: 'number',
  label: 'Min prior systemic lines',
  helpText: 'The trial requires AT LEAST this many prior lines of systemic therapy. "Treatment-naive" → set max to 0; min stays null.',
  class: 'lab_cutoff',
});
const maxLines = (): FieldDef => ({
  kind: 'number',
  label: 'Max prior systemic lines',
  helpText: 'The trial allows NO MORE THAN this many prior lines of systemic therapy.',
  class: 'lab_cutoff',
});

const priorTherapyPair = (
  therapies: string[],
): { required: FieldDef; excluded: FieldDef } => ({
  required: {
    kind: 'multi',
    label: 'Prior therapy required',
    helpText: 'Therapies the trial requires the patient to have received.',
    options: therapies,
    class: 'prior_therapy',
    pairWith: 'priorTherapyExcluded',
  },
  excluded: {
    kind: 'multi',
    label: 'Prior therapy excluded',
    helpText: 'Therapies whose prior receipt disqualifies the patient.',
    options: therapies,
    class: 'prior_therapy',
    pairWith: 'priorTherapyRequired',
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Blocks
// ──────────────────────────────────────────────────────────────────────────

const prostate: BlockDef = (() => {
  const therapies = ['ARPI', 'TAXANE', 'PSMA_RADIOLIGAND', 'PARPI'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'prostate',
    label: 'Prostate',
    fields: {
      castrationStatus: { kind: 'multi', label: 'Castration status', options: ['SENSITIVE', 'RESISTANT'], helpText: 'CSPC vs CRPC. mHSPC/mCSPC → SENSITIVE; mCRPC → RESISTANT.', class: 'other' },
      metastaticStatus: { kind: 'multi', label: 'Metastatic status', options: ['METASTATIC', 'NON_METASTATIC'], helpText: 'M0 / nmCRPC → NON_METASTATIC. Biochemical recurrence without radiographic disease → NON_METASTATIC.', class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['ADENOCARCINOMA', 'NEUROENDOCRINE_SMALL_CELL'], class: 'other' },
      visceralMetastases: { kind: 'bool', label: 'Visceral metastases', helpText: 'true = trial requires present; false = explicit exclusion.', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      psmaPetPositive: { kind: 'bool', label: 'PSMA PET positive', helpText: 'Only true when PSMA-PET positivity is an explicit eligibility requirement.', class: 'biomarker' },
      hrrStatus: { kind: 'multi', label: 'HRR status', options: ['BRCA1', 'BRCA2', 'OTHER_HRR', 'NEGATIVE'], helpText: '"HRR-positive" unspecified → list BRCA1, BRCA2, OTHER_HRR.', class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH', 'MSS'], class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const urothelial: BlockDef = (() => {
  const therapies = ['PLATINUM', 'IMMUNOTHERAPY', 'ENFORTUMAB_VEDOTIN', 'FGFR3_INHIBITOR', 'RADICAL_CYSTECTOMY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'urothelial',
    label: 'Urothelial / Bladder',
    fields: {
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NMIBC', 'MIBC', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      site: { kind: 'multi', label: 'Site', options: ['BLADDER', 'UPPER_TRACT', 'URETHRAL'], class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['PURE_UROTHELIAL', 'VARIANT_HISTOLOGY', 'PURE_SQUAMOUS', 'PURE_NEUROENDOCRINE'], class: 'other' },
      cisPresent: { kind: 'bool', label: 'CIS present', class: 'other' },
      bcgStatus: { kind: 'multi', label: 'BCG status', options: ['NAIVE', 'EXPOSED', 'UNRESPONSIVE'], helpText: 'BCG-unresponsive is a specific regulatory term — only use UNRESPONSIVE when the trial uses that term or its definition.', class: 'other' },
      cisplatinEligible: { kind: 'bool', label: 'Cisplatin eligible', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      fgfr3Status: { kind: 'multi', label: 'FGFR3 status', options: ['ALTERED', 'WILD_TYPE'], class: 'biomarker' },
      pdl1Status: { kind: 'multi', label: 'PD-L1 status', options: POS_NEG, class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, class: 'biomarker' },
      nectin4Status: { kind: 'multi', label: 'Nectin-4 status', options: POS_NEG, class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const rcc: BlockDef = (() => {
  const therapies = ['NEPHRECTOMY', 'VEGF_TKI', 'IMMUNOTHERAPY_METASTATIC', 'IMMUNOTHERAPY_ADJUVANT', 'HIF2A_INHIBITOR', 'MTOR_INHIBITOR'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'rcc',
    label: 'Renal cell carcinoma',
    fields: {
      histologySubtype: { kind: 'multi', label: 'Histology subtype', options: ['CLEAR_CELL', 'PAPILLARY', 'CHROMOPHOBE', 'OTHER_NON_CLEAR_CELL'], class: 'other' },
      sarcomatoidFeatures: { kind: 'bool', label: 'Sarcomatoid features', class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['LOCALIZED', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      imdcRisk: { kind: 'multi', label: 'IMDC risk', options: ['FAVORABLE', 'INTERMEDIATE', 'POOR'], class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, helpText: 'TREATED_STABLE = prior local therapy with no progression.', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const testicular: BlockDef = (() => {
  const therapies = ['PLATINUM_CHEMOTHERAPY', 'HDCT_ASCT'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'testicular',
    label: 'Testicular / Germ cell',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['SEMINOMA', 'NON_SEMINOMA'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['STAGE_I', 'METASTATIC_INITIAL', 'RELAPSED_REFRACTORY'], class: 'other' },
      igcccgRisk: { kind: 'multi', label: 'IGCCCG risk', options: ['GOOD', 'INTERMEDIATE', 'POOR'], class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const breast: BlockDef = (() => {
  const therapies = ['ENDOCRINE_THERAPY', 'CDK46_INHIBITOR', 'CHEMOTHERAPY_ADVANCED', 'HER2_DIRECTED_THERAPY', 'ANTIBODY_DRUG_CONJUGATE'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'breast',
    label: 'Breast',
    fields: {
      hrStatus: { kind: 'multi', label: 'HR status', options: POS_NEG, helpText: 'POSITIVE if ER and/or PR ≥1%.', class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, helpText: 'POSITIVE = IHC 3+ or ISH amplified. NEGATIVE = otherwise; HER2-low/ultralow goes in the next field.', class: 'biomarker' },
      her2LowOrUltralowStatus: { kind: 'multi', label: 'HER2-low / ultralow status', options: ['NEGATIVE', 'ULTRA_LOW', 'LOW'], helpText: 'Only populate for trials that gate on the HER2-low/ultralow distinction. LOW = IHC 1+ or 2+/ISH−. ULTRA_LOW = IHC >0 to <1+. NEGATIVE = IHC 0.', class: 'biomarker' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NEOADJUVANT', 'ADJUVANT', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      menopausalStatus: { kind: 'multi', label: 'Menopausal status', options: ['PRE', 'PERI', 'POST'], class: 'other' },
      brcaStatus: { kind: 'multi', label: 'BRCA status', options: ['GERMLINE', 'SOMATIC', 'NEGATIVE'], class: 'biomarker' },
      pi3kAktPathwayStatus: { kind: 'multi', label: 'PI3K/AKT pathway status', options: ['ALTERED', 'WILD_TYPE'], helpText: 'PIK3CA / AKT1 / PTEN pathway alteration (capivasertib eligibility).', class: 'biomarker' },
      esr1Status: { kind: 'multi', label: 'ESR1 status', options: MUT_WT, class: 'biomarker' },
      pdl1Status: { kind: 'multi', label: 'PD-L1 status', options: POS_NEG, class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const lung: BlockDef = (() => {
  const therapies = ['PLATINUM_CHEMOTHERAPY', 'IMMUNOTHERAPY', 'TARGETED_THERAPY', 'OSIMERTINIB'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'lung',
    label: 'Lung',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['NSCLC_NONSQUAMOUS', 'NSCLC_SQUAMOUS', 'SCLC'], class: 'other' },
      metastaticStatus: { kind: 'multi', label: 'Metastatic status (NSCLC)', options: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'METASTATIC'], helpText: 'Use for NSCLC. For SCLC use sclcExtent below instead.', class: 'other' },
      sclcExtent: { kind: 'multi', label: 'SCLC extent', options: ['LIMITED', 'EXTENSIVE'], helpText: 'Applies only if histology is SCLC.', class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, class: 'other' },
      leptomeningealDisease: { kind: 'bool', label: 'Leptomeningeal disease', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      egfrStatus: { kind: 'multi', label: 'EGFR status', options: ['CLASSICAL_DEL19_L858R', 'EXON20_INS', 'UNCOMMON', 'WILD_TYPE'], helpText: 'Classical = exon 19 del / L858R. "EGFR-mutant" unspecified → list all mutant values.', class: 'biomarker' },
      alkStatus: { kind: 'multi', label: 'ALK status', options: ['REARRANGED', 'WILD_TYPE'], class: 'biomarker' },
      ros1Status: { kind: 'multi', label: 'ROS1 status', options: ['REARRANGED', 'WILD_TYPE'], class: 'biomarker' },
      krasStatus: { kind: 'multi', label: 'KRAS status', options: ['G12C', 'NON_G12C', 'WILD_TYPE'], class: 'biomarker' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'NON_V600E', 'WILD_TYPE'], class: 'biomarker' },
      metStatus: { kind: 'multi', label: 'MET status', options: ['EXON14_SKIPPING', 'AMPLIFIED', 'WILD_TYPE'], class: 'biomarker' },
      retStatus: { kind: 'multi', label: 'RET status', options: ['REARRANGED', 'WILD_TYPE'], class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: ['MUTATED', 'AMPLIFIED', 'WILD_TYPE'], class: 'biomarker' },
      ntrkStatus: { kind: 'multi', label: 'NTRK status', options: ['FUSION', 'WILD_TYPE'], class: 'biomarker' },
      pdl1TpsCategory: { kind: 'multi', label: 'PD-L1 TPS category', options: ['HIGH_GE_50', 'INTERMEDIATE_1_49', 'NEGATIVE_LT_1'], helpText: 'PD-L1 tumor proportion score band (Dako 22C3). ≥50% → HIGH_GE_50. ≥1% → both HIGH_GE_50 and INTERMEDIATE_1_49.', class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const colorectal: BlockDef = (() => {
  const therapies = ['FLUOROPYRIMIDINE', 'OXALIPLATIN', 'IRINOTECAN', 'ANTI_EGFR', 'ANTI_VEGF', 'IMMUNOTHERAPY', 'BRAF_COMBINATION_THERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'colorectal',
    label: 'Colorectal',
    fields: {
      primarySiteSidedness: { kind: 'multi', label: 'Primary site / sidedness', options: ['RIGHT_COLON', 'LEFT_COLON', 'RECTUM'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['ADENOCARCINOMA', 'OTHER'], class: 'other' },
      liverLimitedDisease: { kind: 'bool', label: 'Liver-limited disease', helpText: 'true only for trials requiring liver-confined metastases (e.g., HAI / liver-directed).', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      rasStatus: { kind: 'multi', label: 'RAS status', options: ['KRAS_MUTATED', 'NRAS_MUTATED', 'WILD_TYPE'], helpText: 'Anti-EGFR trials usually require RAS WT.', class: 'biomarker' },
      krasG12cStatus: { kind: 'multi', label: 'KRAS G12C status', options: MUT_WT, class: 'biomarker' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'NON_V600E', 'WILD_TYPE'], class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], helpText: 'MSI-H by PCR and dMMR by IHC are treated as the same value.', class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: ['AMPLIFIED', 'OVEREXPRESSED', 'NEGATIVE'], helpText: 'CRC-style: amplification or IHC 3+ (not breast-style "positive").', class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const head_and_neck: BlockDef = (() => {
  const therapies = ['RADIATION', 'PLATINUM', 'IMMUNOTHERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'head_and_neck',
    label: 'Head and neck',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['ORAL_CAVITY', 'OROPHARYNX', 'LARYNX', 'HYPOPHARYNX', 'NASOPHARYNX', 'SALIVARY_GLAND'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'], class: 'other' },
      hpvP16Status: { kind: 'multi', label: 'HPV / p16 status', options: POS_NEG, helpText: 'p16 IHC is the standard surrogate for HPV in oropharyngeal cancer.', class: 'biomarker' },
      ebvStatus: { kind: 'multi', label: 'EBV status', options: POS_NEG, helpText: 'Relevant for nasopharyngeal carcinoma; null for most other sites.', class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      pdl1CpsCategory: { kind: 'multi', label: 'PD-L1 CPS category', options: ['HIGH_GE_20', 'INTERMEDIATE_1_19', 'NEGATIVE_LT_1'], class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const ovarian: BlockDef = (() => {
  const therapies = ['DEBULKING', 'PLATINUM', 'BEVACIZUMAB', 'PARPI'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'ovarian',
    label: 'Ovarian / fallopian / primary peritoneal',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['HIGH_GRADE_SEROUS', 'LOW_GRADE_SEROUS', 'MUCINOUS', 'CLEAR_CELL', 'ENDOMETRIOID'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NEWLY_DIAGNOSED', 'MAINTENANCE', 'RECURRENT'], class: 'other' },
      platinumSensitivity: { kind: 'multi', label: 'Platinum sensitivity', options: ['SENSITIVE', 'RESISTANT', 'REFRACTORY'], class: 'other' },
      brcaStatus: { kind: 'multi', label: 'BRCA status', options: ['GERMLINE', 'SOMATIC', 'NEGATIVE'], class: 'biomarker' },
      hrdStatus: { kind: 'multi', label: 'HRD status', options: POS_NEG, helpText: 'BRCA is a subset of HRD. Populate brcaStatus only if the trial separately gates on BRCA.', class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const uterine: BlockDef = (() => {
  const therapies = ['RADIATION', 'PLATINUM', 'IMMUNOTHERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'uterine',
    label: 'Uterine',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['ENDOMETRIOID', 'SEROUS', 'CARCINOSARCOMA', 'CLEAR_CELL'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'], class: 'other' },
      tcgaMolecularClass: { kind: 'multi', label: 'TCGA molecular class', options: ['POLE_ULTRAMUTATED', 'MSI_HYPERMUTATED_DMMR', 'COPY_NUMBER_LOW_NSMP', 'COPY_NUMBER_HIGH_P53ABN'], class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const cervical: BlockDef = (() => {
  const therapies = ['CHEMORADIATION', 'PLATINUM', 'IMMUNOTHERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'cervical',
    label: 'Cervical',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['SQUAMOUS', 'ADENOCARCINOMA', 'ADENOSQUAMOUS'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'], class: 'other' },
      hpvStatus: { kind: 'multi', label: 'HPV status', options: POS_NEG, class: 'biomarker' },
      pdl1CpsCategory: { kind: 'multi', label: 'PD-L1 CPS category', options: ['POSITIVE_GE_1', 'NEGATIVE_LT_1'], class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const melanoma: BlockDef = (() => {
  const therapies = ['IMMUNOTHERAPY', 'BRAF_MEK_INHIBITOR'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'melanoma',
    label: 'Melanoma',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['CUTANEOUS', 'MUCOSAL', 'UVEAL', 'ACRAL'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTED_ADJUVANT', 'UNRESECTABLE', 'METASTATIC'], class: 'other' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'V600K', 'NON_V600', 'WILD_TYPE'], class: 'biomarker' },
      nrasStatus: { kind: 'multi', label: 'NRAS status', options: MUT_WT, class: 'biomarker' },
      ldhCategory: { kind: 'multi', label: 'LDH category', options: ['NORMAL', 'ELEVATED_1_2X_ULN', 'ELEVATED_GT_2X_ULN'], helpText: 'LDH level relative to ULN (used for M1 sub-staging).', class: 'lab_cutoff' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, class: 'other' },
      leptomeningealDisease: { kind: 'bool', label: 'Leptomeningeal disease', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const mesothelioma: BlockDef = (() => {
  const therapies = ['PLATINUM', 'PEMETREXED', 'IMMUNOTHERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'mesothelioma',
    label: 'Mesothelioma',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['EPITHELIOID', 'SARCOMATOID', 'BIPHASIC'], class: 'other' },
      primarySite: { kind: 'multi', label: 'Primary site', options: ['PLEURAL', 'PERITONEAL'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTABLE', 'UNRESECTABLE', 'METASTATIC'], class: 'other' },
      bap1Status: { kind: 'multi', label: 'BAP1 status', options: ['LOST', 'INTACT'], class: 'biomarker' },
      measurableDiseaseModifiedRecist: { kind: 'bool', label: 'Measurable disease (mod. RECIST)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const gastroesophageal: BlockDef = (() => {
  const therapies = ['FLUOROPYRIMIDINE', 'PLATINUM', 'IMMUNOTHERAPY', 'HER2_DIRECTED_THERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'gastroesophageal',
    label: 'Gastroesophageal',
    fields: {
      primarySiteHistology: { kind: 'multi', label: 'Primary site + histology', options: ['ESOPHAGEAL_SQUAMOUS', 'ESOPHAGEAL_ADENOCARCINOMA', 'GEJ_ADENOCARCINOMA', 'GASTRIC_ADENOCARCINOMA', 'OTHER'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NEOADJUVANT', 'PERIOPERATIVE', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, class: 'biomarker' },
      pdl1CpsCategory: { kind: 'multi', label: 'PD-L1 CPS category', options: ['HIGH_GE_10', 'INTERMEDIATE_1_9', 'NEGATIVE_LT_1'], class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], class: 'biomarker' },
      claudin18_2Status: { kind: 'multi', label: 'Claudin 18.2 status', options: POS_NEG, helpText: 'Zolbetuximab eligibility (≥75% 2+/3+ IHC).', class: 'biomarker' },
      fgfr2bStatus: { kind: 'multi', label: 'FGFR2b status', options: ['OVEREXPRESSED', 'NEGATIVE'], helpText: 'Bemarituzumab eligibility.', class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const neuroendocrine: BlockDef = (() => {
  const therapies = ['SOMATOSTATIN_ANALOG', 'CHEMOTHERAPY', 'PRRT', 'EVEROLIMUS'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'neuroendocrine',
    label: 'Neuroendocrine',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['PANCREATIC', 'GI_MIDGUT', 'GI_HINDGUT', 'LUNG', 'OTHER'], class: 'other' },
      differentiation: { kind: 'multi', label: 'Differentiation', options: ['WELL_DIFFERENTIATED', 'POORLY_DIFFERENTIATED'], class: 'other' },
      grade: { kind: 'multi', label: 'WHO grade', options: ['G1', 'G2', 'G3'], class: 'other' },
      ki67Percent: { kind: 'number', label: 'Ki-67 (%)', helpText: 'Proliferation index as a percentage.', class: 'lab_cutoff' },
      functionalStatus: { kind: 'multi', label: 'Functional status', options: ['FUNCTIONAL', 'NON_FUNCTIONAL'], class: 'other' },
      somatostatinReceptorImagingPositive: { kind: 'bool', label: 'SSR imaging positive', helpText: 'Ga-68 DOTATATE PET or octreotide scan positive.', class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const pancreatic: BlockDef = (() => {
  const therapies = ['FOLFIRINOX', 'GEMCITABINE_NABPACLITAXEL', 'IMMUNOTHERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'pancreatic',
    label: 'Pancreatic',
    fields: {
      resectability: { kind: 'multi', label: 'Resectability', options: ['RESECTABLE', 'BORDERLINE', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['ADENOCARCINOMA', 'OTHER'], helpText: 'Pancreatic NETs go in the neuroendocrine block.', class: 'other' },
      krasStatus: { kind: 'multi', label: 'KRAS status', options: ['G12C', 'G12D', 'OTHER_KRAS', 'WILD_TYPE'], class: 'biomarker' },
      brcaStatus: { kind: 'multi', label: 'BRCA status', options: ['GERMLINE', 'SOMATIC', 'NEGATIVE'], class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      ca199Elevated: { kind: 'bool', label: 'CA 19-9 elevated', helpText: 'Above laboratory ULN.', class: 'lab_cutoff' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const cns: BlockDef = (() => {
  const therapies = ['RADIOTHERAPY', 'TEMOZOLOMIDE', 'BEVACIZUMAB', 'TTFIELDS'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'cns',
    label: 'CNS / glioma',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['GLIOBLASTOMA', 'ASTROCYTOMA', 'OLIGODENDROGLIOMA', 'EPENDYMOMA', 'MEDULLOBLASTOMA', 'MENINGIOMA', 'PRIMARY_CNS_LYMPHOMA', 'OTHER'], class: 'other' },
      whoGrade: { kind: 'multi', label: 'WHO grade', options: ['1', '2', '3', '4'], class: 'other' },
      diseaseStatus: { kind: 'multi', label: 'Disease status', options: ['NEWLY_DIAGNOSED', 'RECURRENT_PROGRESSIVE'], class: 'other' },
      idhStatus: { kind: 'multi', label: 'IDH status', options: ['MUTANT', 'WILD_TYPE'], class: 'biomarker' },
      codeletion1p19q: { kind: 'bool', label: '1p/19q co-deletion', class: 'biomarker' },
      mgmtMethylated: { kind: 'bool', label: 'MGMT methylated', class: 'biomarker' },
      egfrAmplified: { kind: 'bool', label: 'EGFR amplified / EGFRvIII', class: 'biomarker' },
      atrxLoss: { kind: 'bool', label: 'ATRX loss', class: 'biomarker' },
      braf600eMutated: { kind: 'bool', label: 'BRAF V600E mutated', class: 'biomarker' },
      measurableDiseaseRano: { kind: 'bool', label: 'Measurable disease (RANO)', class: 'other' },
      resectionExtent: { kind: 'multi', label: 'Resection extent', options: ['BIOPSY_ONLY', 'SUBTOTAL', 'GROSS_TOTAL'], class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const hcc: BlockDef = (() => {
  const therapies = ['ATEZOLIZUMAB_BEVACIZUMAB', 'TKI', 'IMMUNOTHERAPY', 'TRANSARTERIAL_THERAPY'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'hcc',
    label: 'Hepatocellular carcinoma',
    fields: {
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTABLE', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      childPughClass: { kind: 'multi', label: 'Child-Pugh class', options: ['A', 'B', 'C'], helpText: 'Key HCC eligibility gate.', class: 'lab_cutoff' },
      bclcStage: { kind: 'multi', label: 'BCLC stage', options: ['0', 'A', 'B', 'C', 'D'], class: 'other' },
      viralHepatitisStatus: { kind: 'multi', label: 'Viral hepatitis status', options: ['HBV', 'HCV', 'NONE'], class: 'other' },
      portalVeinInvasion: { kind: 'bool', label: 'Portal vein invasion', class: 'other' },
      extrahepaticSpread: { kind: 'bool', label: 'Extrahepatic spread', class: 'other' },
      afpElevated: { kind: 'bool', label: 'AFP elevated', helpText: 'Above trial threshold (ramucirumab-type gate).', class: 'lab_cutoff' },
      priorLocoregionalTherapy: { kind: 'bool', label: 'Prior loco-regional therapy', helpText: 'Prior TACE / TARE / ablation / SBRT.', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1 / mRECIST)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const biliary: BlockDef = (() => {
  const therapies = ['GEMCITABINE_CISPLATIN', 'IMMUNOTHERAPY', 'FGFR_INHIBITOR', 'IDH1_INHIBITOR'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'biliary',
    label: 'Biliary tract',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['INTRAHEPATIC_CHOLANGIO', 'EXTRAHEPATIC_CHOLANGIO', 'GALLBLADDER', 'AMPULLARY'], class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTABLE', 'LOCALLY_ADVANCED', 'METASTATIC'], class: 'other' },
      fgfr2Status: { kind: 'multi', label: 'FGFR2 status', options: ['FUSION', 'WILD_TYPE'], class: 'biomarker' },
      idh1Status: { kind: 'multi', label: 'IDH1 status', options: ['MUTANT', 'WILD_TYPE'], class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, class: 'biomarker' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'WILD_TYPE'], class: 'biomarker' },
      krasStatus: { kind: 'multi', label: 'KRAS status', options: ['G12C', 'OTHER_KRAS', 'WILD_TYPE'], class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const mature_b_cell: BlockDef = (() => {
  const therapies = ['ANTI_CD20', 'ANTI_CD19', 'BTK_INHIBITOR', 'BCL2_INHIBITOR', 'ANTHRACYCLINE', 'BISPECIFIC', 'CAR_T', 'AUTO_TRANSPLANT', 'ALLO_TRANSPLANT'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'mature_b_cell',
    label: 'Mature B-cell lymphoma',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['DLBCL_NOS', 'HGBCL', 'HGBCL_DH_TH', 'PMBCL', 'DLBCL_LEG_TYPE', 'TCRBCL', 'TRANSFORMED_FL', 'TRANSFORMED_MZL', 'RICHTER', 'FL', 'MCL', 'MZL', 'CHL', 'CLL_SLL', 'WALDENSTROM', 'HCL', 'OTHER'], helpText: 'List every disease subtype the trial enrolls. High-consequence scoping field.', class: 'accepted_diseases' },
      cellOfOrigin: { kind: 'multi', label: 'Cell of origin (DLBCL)', options: ['GCB', 'NON_GCB_ABC'], class: 'biomarker' },
      doubleOrTripleHit: { kind: 'bool', label: 'Double / triple hit', helpText: 'MYC + BCL2 or BCL6 rearrangement.', class: 'biomarker' },
      ighvStatus: { kind: 'multi', label: 'IGHV status (CLL)', options: ['MUTATED', 'UNMUTATED'], class: 'biomarker' },
      del17pOrTp53Mutated: { kind: 'bool', label: 'del(17p) or TP53 mutated', class: 'biomarker' },
      myd88Status: { kind: 'multi', label: 'MYD88 status', options: ['L265P', 'WILD_TYPE'], class: 'biomarker' },
      cnsInvolvement: { kind: 'bool', label: 'CNS involvement', class: 'other' },
      cd19Positive: { kind: 'bool', label: 'CD19+', class: 'biomarker' },
      cd20Positive: { kind: 'bool', label: 'CD20+', class: 'biomarker' },
      cd22Positive: { kind: 'bool', label: 'CD22+', class: 'biomarker' },
      cd79bPositive: { kind: 'bool', label: 'CD79b+', class: 'biomarker' },
      transplantEligible: { kind: 'bool', label: 'Transplant eligible', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const mature_t_nk_cell: BlockDef = (() => {
  const therapies = ['BRENTUXIMAB', 'MOGAMULIZUMAB', 'CHEMOTHERAPY', 'AUTO_TRANSPLANT', 'ALLO_TRANSPLANT'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'mature_t_nk_cell',
    label: 'Mature T / NK-cell lymphoma',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['PTCL_NOS', 'AITL', 'ALCL_ALK_POS', 'ALCL_ALK_NEG', 'CTCL_MF', 'CTCL_SS', 'NK_T', 'HSTCL', 'MEITL', 'EATL', 'ATL', 'OTHER'], class: 'accepted_diseases' },
      atlSubtype: { kind: 'multi', label: 'ATL subtype', options: ['ACUTE', 'LYMPHOMATOUS', 'CHRONIC', 'SMOLDERING'], class: 'other' },
      htlv1Status: { kind: 'multi', label: 'HTLV-1 status', options: POS_NEG, class: 'biomarker' },
      cd30Positive: { kind: 'bool', label: 'CD30+', class: 'biomarker' },
      ccr4Positive: { kind: 'bool', label: 'CCR4+', class: 'biomarker' },
      cnsInvolvement: { kind: 'bool', label: 'CNS involvement', class: 'other' },
      ctclStageAdvanced: { kind: 'bool', label: 'CTCL stage advanced (≥IIB)', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const myeloid_neoplasm: BlockDef = (() => {
  const therapies = ['HMA', 'VENETOCLAX', 'INTENSIVE_CHEMOTHERAPY', 'FLT3_INHIBITOR', 'IDH_INHIBITOR', 'MENIN_INHIBITOR', 'JAK_INHIBITOR', 'BCR_ABL_TKI', 'ALLO_TRANSPLANT'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'myeloid_neoplasm',
    label: 'Myeloid neoplasm',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['AML', 'MDS', 'CMML', 'MDS_MPN', 'MPN_PV', 'MPN_ET', 'MPN_MF', 'CML', 'OTHER'], class: 'accepted_diseases' },
      amlClassification: { kind: 'multi', label: 'AML classification', options: ['DE_NOVO', 'SECONDARY', 'THERAPY_RELATED'], class: 'other' },
      elnRisk: { kind: 'multi', label: 'ELN 2022 risk', options: ['FAVORABLE', 'INTERMEDIATE', 'ADVERSE'], class: 'other' },
      flt3Status: { kind: 'multi', label: 'FLT3 status', options: ['ITD', 'TKD', 'WILD_TYPE'], class: 'biomarker' },
      npm1Mutated: { kind: 'bool', label: 'NPM1 mutated', class: 'biomarker' },
      idh1Mutated: { kind: 'bool', label: 'IDH1 mutated', class: 'biomarker' },
      idh2Mutated: { kind: 'bool', label: 'IDH2 mutated', class: 'biomarker' },
      kmt2aRearranged: { kind: 'bool', label: 'KMT2A (MLL) rearranged', class: 'biomarker' },
      ipssR: { kind: 'multi', label: 'IPSS-R (MDS)', options: ['VERY_LOW', 'LOW', 'INT', 'HIGH', 'VERY_HIGH'], class: 'other' },
      ipssM: { kind: 'multi', label: 'IPSS-M (MDS)', options: ['VERY_LOW', 'LOW', 'MODERATE_LOW', 'MODERATE_HIGH', 'HIGH', 'VERY_HIGH'], class: 'other' },
      minBlastsPercent: { kind: 'number', label: 'Min bone-marrow blasts (%)', class: 'lab_cutoff' },
      maxBlastsPercent: { kind: 'number', label: 'Max bone-marrow blasts (%)', class: 'lab_cutoff' },
      ringSideroblasts: { kind: 'bool', label: 'Ring sideroblasts', class: 'other' },
      sf3b1Mutated: { kind: 'bool', label: 'SF3B1 mutated', class: 'biomarker' },
      jak2Status: { kind: 'multi', label: 'JAK2 status', options: ['V617F', 'EXON12', 'WILD_TYPE'], class: 'biomarker' },
      calrMutated: { kind: 'bool', label: 'CALR mutated', class: 'biomarker' },
      mplMutated: { kind: 'bool', label: 'MPL mutated', class: 'biomarker' },
      bcrAblStatus: { kind: 'multi', label: 'BCR-ABL status (CML)', options: POS_NEG, class: 'biomarker' },
      cmlPhase: { kind: 'multi', label: 'CML phase', options: ['CHRONIC', 'ACCELERATED', 'BLAST'], class: 'other' },
      complexKaryotype: { kind: 'bool', label: 'Complex karyotype (≥3 abnormalities)', class: 'biomarker' },
      monosomy7OrDel7q: { kind: 'bool', label: 'Monosomy 7 / del(7q)', class: 'biomarker' },
      tp53Mutated: { kind: 'bool', label: 'TP53 mutated', class: 'biomarker' },
      cnsInvolvement: { kind: 'bool', label: 'CNS involvement', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const precursor_lymphoid: BlockDef = (() => {
  const therapies = ['BLINATUMOMAB', 'INOTUZUMAB', 'CAR_T', 'BCR_ABL_TKI', 'ALLO_TRANSPLANT'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'precursor_lymphoid',
    label: 'Precursor lymphoid (ALL / LBL)',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['B_ALL', 'T_ALL', 'LBL_B', 'LBL_T', 'OTHER'], class: 'accepted_diseases' },
      philadelphiaStatus: { kind: 'multi', label: 'Philadelphia status', options: ['POSITIVE', 'PH_LIKE', 'NEGATIVE'], class: 'biomarker' },
      cd19Positive: { kind: 'bool', label: 'CD19+', class: 'biomarker' },
      cd22Positive: { kind: 'bool', label: 'CD22+', class: 'biomarker' },
      cd7Positive: { kind: 'bool', label: 'CD7+ (T-ALL)', class: 'biomarker' },
      mrdStatus: { kind: 'multi', label: 'MRD status', options: POS_NEG, class: 'biomarker' },
      cnsStatus: { kind: 'multi', label: 'CNS status', options: ['CNS1', 'CNS2', 'CNS3'], class: 'other' },
      minRelapseNumber: { kind: 'number', label: 'Min relapse number', class: 'lab_cutoff' },
      maxRelapseNumber: { kind: 'number', label: 'Max relapse number', class: 'lab_cutoff' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const plasma_cell: BlockDef = (() => {
  const therapies = ['IMID', 'PROTEASOME_INHIBITOR', 'ANTI_CD38', 'BCMA_THERAPY', 'BISPECIFIC', 'AUTO_TRANSPLANT', 'ALLO_TRANSPLANT'];
  const pt = priorTherapyPair(therapies);
  return {
    key: 'plasma_cell',
    label: 'Plasma cell',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['MM', 'PCL', 'PLASMACYTOMA', 'AL_AMYLOIDOSIS', 'WALDENSTROM_LPL', 'POEMS', 'OTHER'], class: 'accepted_diseases' },
      rissStage: { kind: 'multi', label: 'R-ISS stage (MM)', options: ['I', 'II', 'III'], class: 'other' },
      highRiskCytogenetics: { kind: 'bool', label: 'High-risk cytogenetics', helpText: 'del(17p), t(4;14), t(14;16), gain 1q.', class: 'biomarker' },
      measurableDiseaseImwg: { kind: 'bool', label: 'Measurable disease (IMWG)', class: 'other' },
      extramedullaryDisease: { kind: 'bool', label: 'Extramedullary disease', class: 'other' },
      cnsInvolvement: { kind: 'bool', label: 'CNS involvement', class: 'other' },
      amyloidCardiacInvolvement: { kind: 'bool', label: 'Amyloid cardiac involvement', class: 'other' },
      amyloidMayoStage: { kind: 'multi', label: 'AL amyloid Mayo stage', options: ['I', 'II', 'III', 'IIIA', 'IIIB'], class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

// ──────────────────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────────────────

export const BLOCKS: Record<BlockKey, BlockDef> = {
  prostate, urothelial, rcc, testicular, breast, lung, colorectal, head_and_neck,
  ovarian, uterine, cervical, melanoma, mesothelioma, gastroesophageal,
  neuroendocrine, pancreatic, cns, hcc, biliary,
  mature_b_cell, mature_t_nk_cell, myeloid_neoplasm, precursor_lymphoid, plasma_cell,
};

export const ALL_BLOCKS: BlockDef[] = Object.values(BLOCKS);

// Iterate every field in every block with stable identification.
export function* iterAllFields(): IterableIterator<{
  block: BlockKey;
  fieldKey: string;
  def: FieldDef;
}> {
  for (const block of ALL_BLOCKS) {
    for (const [fieldKey, def] of Object.entries(block.fields)) {
      yield { block: block.key, fieldKey, def };
    }
  }
}

export function fieldsByClass(klass: FieldClass): Array<{ block: BlockKey; fieldKey: string }> {
  const out: Array<{ block: BlockKey; fieldKey: string }> = [];
  for (const { block, fieldKey, def } of iterAllFields()) {
    if (def.class === klass) out.push({ block, fieldKey });
  }
  return out;
}

// Build a serializable snapshot of the schema to store in schema_versions.schema_json.
// This is what every reference key and attempt is stamped against.
export function snapshotSchema(): unknown {
  const out: Record<string, unknown> = {};
  for (const block of ALL_BLOCKS) {
    out[block.key] = {
      label: block.label,
      fields: Object.fromEntries(
        Object.entries(block.fields).map(([k, def]) => [k, {
          kind: def.kind, label: def.label, class: def.class,
          options: def.options ?? null,
          pairWith: def.pairWith ?? null,
        }]),
      ),
    };
  }
  return out;
}
