// A biomarker a cohort requires whatever the tumor type, e.g. "any solid tumor
// with an NTRK fusion". The per-cancer blocks only carry the biomarkers that
// matter for that cancer (NTRK is in Lung alone, and OTHER has no fields), so
// without this a basket's defining criterion could not be recorded.
//
// Stored on the cohort as requiredBiomarkers. Annotations made before the field
// existed have no such key; that reads as blank.
//
// Options can be added freely. Renaming or removing one would orphan saved values.

import { FieldDef } from '../types';

export const REQUIRED_BIOMARKERS_FIELD = 'requiredBiomarkers';

const OPTION_HELP: Record<string, string> = {
  NTRK_FUSION: 'NTRK1, NTRK2 or NTRK3 gene fusion.',
  ALK_ALTERED: 'ALK rearrangement or other activating ALK alteration.',
  ROS1_FUSION: 'ROS1 rearrangement.',
  RET_ALTERED: 'RET fusion or activating mutation.',
  NRG1_FUSION: 'NRG1 gene fusion.',
  FGFR_ALTERED: 'FGFR1-4 fusion, mutation or amplification.',
  MET_ALTERED: 'MET exon 14 skipping, amplification or overexpression.',
  EGFR_ALTERED: 'EGFR mutation or amplification.',
  HER2_POSITIVE: 'HER2 IHC 3+, IHC 2+/ISH+ or amplified.',
  HER2_LOW: 'HER2 IHC 1+, or IHC 2+/ISH-.',
  HER2_MUTATED: 'Activating HER2 (ERBB2) mutation.',
  KRAS_G12C: 'KRAS G12C mutation.',
  KRAS_G12D: 'KRAS G12D mutation.',
  KRAS_OTHER: 'Any other KRAS mutation. For "any KRAS mutation", select all three KRAS options.',
  NRAS_MUTATED: 'NRAS mutation.',
  BRAF_V600: 'BRAF V600 mutation (E, K or other V600).',
  BRAF_NON_V600: 'BRAF alteration other than V600.',
  PIK3CA_MUTATED: 'PIK3CA mutation.',
  PTEN_LOSS: 'PTEN loss or loss-of-function alteration.',
  IDH_MUTATED: 'IDH1 or IDH2 mutation.',
  BRCA_MUTATED: 'BRCA1 or BRCA2 mutation, germline or somatic.',
  OTHER_HRR: 'Other homologous-recombination repair alteration (ATM, PALB2, CHEK2, ...) or HRD.',
  MSI_HIGH_DMMR: 'Microsatellite instability-high or mismatch repair-deficient.',
  TMB_HIGH: 'High tumor mutational burden, as the trial defines it.',
  PDL1_POSITIVE: 'PD-L1 positive, as the trial defines it.',
  MTAP_DEFICIENT: 'MTAP deletion or loss of expression.',
  CLAUDIN18_2_POSITIVE: 'Claudin 18.2 positive, as the trial defines it.',
  OTHER: 'A required biomarker not listed here. Name it in the notes.',
};

export const REQUIRED_BIOMARKERS_DEF: FieldDef = {
  kind: 'multi',
  label: 'Required biomarkers (any tumor type)',
  options: Object.keys(OPTION_HELP),
  optionHelp: OPTION_HELP,
  helpText:
    'Only for a cohort of several cancer types where every patient needs a biomarker whatever the tumor type, '
    + 'e.g. any solid tumor with an NTRK fusion. Select every biomarker the trial accepts: the patient needs at '
    + 'least one of them. Blank = no such requirement. Also fill in the cancer-specific biomarker fields where one exists.',
  class: 'biomarker',
};
