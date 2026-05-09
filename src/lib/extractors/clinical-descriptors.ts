// Cancer-specific clinical descriptor extractor.

import OpenAI from 'openai';
import { CancerType, ClinicalDescriptors, ProcessedTrial } from '../types';
import { withRetry, runConcurrent } from '../rate-limiter';

export interface TrialForDescriptorExtraction {
  nctId: string;
  briefTitle: string;
  briefSummary?: string;
  eligibilityRaw?: string;
  conditions: string[];
  interventions: string[];
  cancerTypes: CancerType[];
}

const SCHEMA_SECTIONS: Record<string, string> = {
  prostate: `  "prostate": {
    "castrationStatus": "SENSITIVE" | "RESISTANT" | "EITHER" | null,
    "metastaticStatus": "METASTATIC" | "NON_METASTATIC" | "EITHER" | null,
    "metastaticSites": ["BONE" | "VISCERAL" | "LYMPH_NODE"] | null,
    "histology": "ADENOCARCINOMA" | "SMALL_CELL" | "NEUROENDOCRINE" | "EITHER" | null,
    "psmaStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "hrrStatus": "BRCA" | "NON_BRCA_HRR" | "NEGATIVE" | "EITHER" | null,
    "msiStatus": "MSI_HIGH" | "MSS" | "EITHER" | null,
    "priorArpi": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorTaxane": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPsmaTherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorParpi": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  urothelial: `  "urothelial": {
    "site": ["BLADDER" | "UPPER_TRACT" | "URETHRAL"] | null,
    "muscleInvasive": boolean | null,
    "tStage": ["Ta" | "Tis" | "T1" | "T2" | "T3" | "T4"] | null,
    "nStage": ["N0" | "N1" | "N2" | "N3"] | null,
    "mStage": ["M0" | "M1"] | null,
    "highGrade": boolean | null,
    "cisPresent": boolean | null,
    "bcgStatus": "NAIVE" | "UNRESPONSIVE" | "EXPOSED" | "INTOLERANT" | "EITHER" | null,
    "fgfrStatus": "ALTERED" | "WILD_TYPE" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "her2Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "cisplatinEligible": boolean | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorEnfortumab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorCystectomy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "histology": ["UROTHELIAL" | "SQUAMOUS" | "NEUROENDOCRINE" | "SMALL_CELL" | "VARIANT"] | null
  } | null`,
  rcc: `  "rcc": {
    "histologySubtype": "CLEAR_CELL" | "PAPILLARY" | "CHROMOPHOBE" | "NON_CLEAR_CELL" | "EITHER" | null,
    "sarcomatoidFeatures": boolean | null,
    "metastaticStatus": "METASTATIC" | "LOCALLY_ADVANCED" | "NON_METASTATIC" | "EITHER" | null,
    "imdcRisk": "FAVORABLE" | "INTERMEDIATE" | "POOR" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorNephrectomy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorTki": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorMetastaticImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAdjuvantImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorHif2aInhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  testicular: `  "testicular": {
    "histology": "SEMINOMA" | "NON_SEMINOMA" | "MIXED" | "EITHER" | null,
    "riskGroup": "GOOD" | "INTERMEDIATE" | "POOR" | "EITHER" | null,
    "priorChemotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorHdctAsct": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  breast: `  "breast": {
    "receptorSubtype": "HR_POS_HER2_NEG" | "HER2_POS" | "TRIPLE_NEGATIVE" | "EITHER" | null,
    "erStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "her2Status": "POSITIVE" | "NEGATIVE" | "EQUIVOCAL" | "EITHER" | null,
    "her2LowStatus": boolean | null,
    "metastaticStatus": "METASTATIC" | "LOCALLY_ADVANCED" | "EARLY_STAGE" | "EITHER" | null,
    "metastaticSites": ["BONE" | "LIVER" | "LUNG" | "BRAIN" | "LYMPH_NODE"] | null,
    "menopausalStatus": "PRE" | "POST" | "EITHER" | null,
    "brcaStatus": "GERMLINE" | "SOMATIC" | "NEGATIVE" | "EITHER" | null,
    "esr1Status": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "pik3caStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "priorEndocrine": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorCdk46Inhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorChemotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorTrastuzumab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  lung: `  "lung": {
    "histology": "NSCLC" | "SCLC" | "EITHER" | null,
    "nsclcSubtype": "ADENOCARCINOMA" | "SQUAMOUS" | "LARGE_CELL" | "EITHER" | null,
    "metastaticStatus": "METASTATIC" | "LOCALLY_ADVANCED" | "EARLY_STAGE" | "EITHER" | null,
    "sclcExtent": "LIMITED" | "EXTENSIVE" | "EITHER" | null,
    "brainMetastases": boolean | null,
    "egfrStatus": "CLASSICAL" | "EXON20_INS" | "UNCOMMON" | "WILD_TYPE" | "EITHER" | null,
    "alkStatus": "REARRANGED" | "WILD_TYPE" | "EITHER" | null,
    "ros1Status": "REARRANGED" | "WILD_TYPE" | "EITHER" | null,
    "krasStatus": "G12C" | "NON_G12C" | "WILD_TYPE" | "EITHER" | null,
    "brafStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "metStatus": "AMPLIFIED" | "EXON_14_SKIPPING" | "WILD_TYPE" | "EITHER" | null,
    "retStatus": "REARRANGED" | "WILD_TYPE" | "EITHER" | null,
    "her2Status": "MUTATED" | "AMPLIFIED" | "WILD_TYPE" | "EITHER" | null,
    "pdl1Expression": "HIGH" | "LOW" | "NEGATIVE" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorTki": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorOsimertinib": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  colorectal: `  "colorectal": {
    "site": "COLON" | "RECTUM" | "EITHER" | null,
    "sidedness": "LEFT" | "RIGHT" | "EITHER" | null,
    "metastaticStatus": "METASTATIC" | "LOCALLY_ADVANCED" | "EARLY_STAGE" | "EITHER" | null,
    "histology": "ADENOCARCINOMA" | "OTHER" | "EITHER" | null,
    "rasStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "krasg12cStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "brafStatus": "V600E" | "NON_V600E" | "WILD_TYPE" | "EITHER" | null,
    "msiStatus": "MSI_HIGH" | "MSS" | "EITHER" | null,
    "her2Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorFluoropyrimidine": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorOxaliplatin": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorIrinotecan": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAntiEgfr": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAntiVegf": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorRegorafenibOrTas102": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  head_and_neck: `  "headAndNeck": {
    "primarySite": "ORAL_CAVITY" | "OROPHARYNX" | "LARYNX" | "HYPOPHARYNX" | "NASOPHARYNX" | "SALIVARY_GLAND" | "EITHER" | null,
    "hpvStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "p16Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "tStage": ["T1" | "T2" | "T3" | "T4"] | null,
    "nStage": ["N0" | "N1" | "N2" | "N3"] | null,
    "mStage": ["M0" | "M1"] | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorRadiation": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  ovarian: `  "ovarian": {
    "histology": "HIGH_GRADE_SEROUS" | "LOW_GRADE_SEROUS" | "MUCINOUS" | "CLEAR_CELL" | "ENDOMETRIOID" | "EITHER" | null,
    "figoStage": ["I" | "II" | "III" | "IV"] | null,
    "platinumSensitivity": "SENSITIVE" | "RESISTANT" | "REFRACTORY" | "EITHER" | null,
    "brcaStatus": "GERMLINE" | "SOMATIC" | "NEGATIVE" | "EITHER" | null,
    "hrdStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorDebulking": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBevacizumab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorParpi": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  uterine: `  "uterine": {
    "histology": "ENDOMETRIOID" | "SEROUS" | "CARCINOSARCOMA" | "CLEAR_CELL" | "EITHER" | null,
    "figoStage": ["I" | "II" | "III" | "IV"] | null,
    "msiStatus": "MSI_HIGH" | "MSS" | "EITHER" | null,
    "her2Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "p53Status": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "priorRadiation": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  cervical: `  "cervical": {
    "histology": "SQUAMOUS" | "ADENOCARCINOMA" | "ADENOSQUAMOUS" | "EITHER" | null,
    "figoStage": ["I" | "II" | "III" | "IV"] | null,
    "hpvStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorChemoradiation": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  melanoma: `  "melanoma": {
    "primarySite": "CUTANEOUS" | "MUCOSAL" | "UVEAL" | "ACRAL" | "EITHER" | null,
    "stage": ["I" | "II" | "III" | "IV"] | null,
    "brafStatus": "V600E" | "V600K" | "NON_V600" | "WILD_TYPE" | "EITHER" | null,
    "nrasStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "kitStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBrafMekInhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  mesothelioma: `  "mesothelioma": {
    "histology": "EPITHELIOID" | "SARCOMATOID" | "BIPHASIC" | "EITHER" | null,
    "primarySite": "PLEURAL" | "PERITONEAL" | "EITHER" | null,
    "stage": ["I" | "II" | "III" | "IV"] | null,
    "bap1Status": "LOST" | "INTACT" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPemetrexed": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  gastroesophageal: `  "gastroesophageal": {
    "primarySite": "GASTRIC" | "GEJ" | "ESOPHAGEAL" | "EITHER" | null,
    "histology": "ADENOCARCINOMA" | "SQUAMOUS" | "OTHER" | "EITHER" | null,
    "her2Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "pdl1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "msiStatus": "MSI_HIGH" | "MSS" | "EITHER" | null,
    "claudin18_2Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorFluoropyrimidine": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPlatinum": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorTrastuzumab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  neuroendocrine: `  "neuroendocrine": {
    "primarySite": "PANCREATIC" | "GI" | "LUNG" | "OTHER" | "EITHER" | null,
    "grade": "G1" | "G2" | "G3" | "EITHER" | null,
    "functionalStatus": "FUNCTIONAL" | "NON_FUNCTIONAL" | "EITHER" | null,
    "somatostatinReceptorStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "priorSomatostatinAnalog": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorChemotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorPrrt": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  pancreatic: `  "pancreatic": {
    "resectability": "RESECTABLE" | "BORDERLINE" | "LOCALLY_ADVANCED" | "METASTATIC" | "EITHER" | null,
    "histology": "ADENOCARCINOMA" | "OTHER" | "EITHER" | null,
    "krasStatus": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "brcaStatus": "GERMLINE" | "SOMATIC" | "NEGATIVE" | "EITHER" | null,
    "msiStatus": "MSI_HIGH" | "MSS" | "EITHER" | null,
    "priorFolfirinox": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorGemcitabineNabpaclitaxel": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorImmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  mature_b_cell: `  "matureBCell": {
    "acceptedDiseases": ["DLBCL_NOS" | "HGBCL" | "HGBCL_DH_TH" | "PMBCL" | "DLBCL_LEG_TYPE" | "TCRBCL" | "TRANSFORMED_FL" | "TRANSFORMED_MZL" | "RICHTER" | "FL" | "MCL" | "MZL" | "CHL" | "CLL_SLL" | "WALDENSTROM" | "HCL" | "OTHER"] | null,
    "cellOfOrigin": "GCB" | "NON_GCB" | "ABC" | "EITHER" | null,
    "doubleHit": boolean | null,
    "follicularGrade": ["1_2" | "3A" | "3B"] | null,
    "mantleCellVariant": ["CLASSICAL" | "BLASTOID" | "PLEOMORPHIC"] | null,
    "ighvStatus": "MUTATED" | "UNMUTATED" | "EITHER" | null,
    "del17p": boolean | null,
    "tp53Mutated": boolean | null,
    "myd88Status": "L265P" | "WILD_TYPE" | "EITHER" | null,
    "cxcr4Status": "MUTATED" | "WILD_TYPE" | "EITHER" | null,
    "cnsInvolvement": boolean | null,
    "cd19Positive": boolean | null,
    "cd20Positive": boolean | null,
    "cd22Positive": boolean | null,
    "stage": ["I" | "II" | "III" | "IV"] | null,
    "transplantEligible": boolean | null,
    "priorAntiCd20": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAntiCd19": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBtkInhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBcl2Inhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAnthracycline": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorChemoimmunotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorCarT": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAutoTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAlloTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  mature_t_nk_cell: `  "matureTnk": {
    "acceptedDiseases": ["PTCL_NOS" | "AITL" | "ALCL_ALK_POS" | "ALCL_ALK_NEG" | "CTCL_MF" | "CTCL_SS" | "NK_T" | "HSTCL" | "MEITL" | "EATL" | "ATL" | "OTHER"] | null,
    "atlSubtype": ["ACUTE" | "LYMPHOMATOUS" | "CHRONIC" | "SMOLDERING"] | null,
    "htlv1Status": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "cd30Positive": boolean | null,
    "cd52Positive": boolean | null,
    "ccr4Positive": boolean | null,
    "cnsInvolvement": boolean | null,
    "ctclStage": ["IA" | "IB" | "IIA" | "IIB" | "III" | "IVA" | "IVB"] | null,
    "systemicStage": ["I" | "II" | "III" | "IV"] | null,
    "priorBrentuximab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorMogamulizumab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorChemotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorRadiation": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAutoTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAlloTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  myeloid_neoplasm: `  "myeloid": {
    "acceptedDiseases": ["AML" | "MDS" | "CMML" | "MDS_MPN" | "MPN_PV" | "MPN_ET" | "MPN_MF" | "CML" | "OTHER"] | null,
    "amlClassification": ["DE_NOVO" | "SECONDARY" | "THERAPY_RELATED"] | null,
    "elnRisk": ["FAVORABLE" | "INTERMEDIATE" | "ADVERSE"] | null,
    "flt3Status": "ITD" | "TKD" | "WILD_TYPE" | "EITHER" | null,
    "npm1Mutated": boolean | null,
    "idh1Mutated": boolean | null,
    "idh2Mutated": boolean | null,
    "ipssR": ["VERY_LOW" | "LOW" | "INT" | "HIGH" | "VERY_HIGH"] | null,
    "ipssM": ["VERY_LOW" | "LOW" | "MODERATE_LOW" | "MODERATE_HIGH" | "HIGH" | "VERY_HIGH"] | null,
    "minBlastsPercent": number | null,
    "maxBlastsPercent": number | null,
    "ringSideroblasts": boolean | null,
    "sf3b1Mutated": boolean | null,
    "jak2Status": "V617F" | "EXON12" | "WILD_TYPE" | "EITHER" | null,
    "calrMutated": boolean | null,
    "mplMutated": boolean | null,
    "bcrAblStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "cmlPhase": ["CHRONIC" | "ACCELERATED" | "BLAST"] | null,
    "complexKaryotype": boolean | null,
    "monosomy7": boolean | null,
    "tp53Mutated": boolean | null,
    "maxWhiteBloodCount": number | null,
    "hlaA0201Required": boolean | null,
    "cnsInvolvement": boolean | null,
    "priorHma": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorVenetoclax": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorIntensiveChemotherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorFlt3Inhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorIdhInhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorJakInhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBcrAblTki": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAlloTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  precursor_lymphoid: `  "precursorLymphoid": {
    "acceptedDiseases": ["B_ALL" | "T_ALL" | "LBL_B" | "LBL_T" | "OTHER"] | null,
    "philadelphiaStatus": "POSITIVE" | "NEGATIVE" | "PH_LIKE" | "EITHER" | null,
    "cd19Positive": boolean | null,
    "cd22Positive": boolean | null,
    "cd7Positive": boolean | null,
    "mrdStatus": "POSITIVE" | "NEGATIVE" | "EITHER" | null,
    "cnsStatus": ["CNS1" | "CNS2" | "CNS3"] | null,
    "minRelapseNumber": number | null,
    "maxRelapseNumber": number | null,
    "priorBlinatumomab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorInotuzumab": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorCarT": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBcrAblTki": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAlloTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
  plasma_cell: `  "plasmaCell": {
    "acceptedDiseases": ["MM" | "PCL" | "PLASMACYTOMA" | "AL_AMYLOIDOSIS" | "WALDENSTROM_LPL" | "POEMS" | "OTHER"] | null,
    "issStage": ["I" | "II" | "III"] | null,
    "rissStage": ["I" | "II" | "III"] | null,
    "highRiskCytogenetics": boolean | null,
    "del17p": boolean | null,
    "t4_14": boolean | null,
    "t14_16": boolean | null,
    "gain1q": boolean | null,
    "measurableDiseaseImwg": boolean | null,
    "extramedullaryDisease": boolean | null,
    "cnsInvolvement": boolean | null,
    "amyloidOrganInvolvement": ["CARDIAC" | "RENAL" | "HEPATIC" | "NEURO" | "GI"] | null,
    "mayoStage": ["I" | "II" | "III" | "IIIA" | "IIIB"] | null,
    "priorImid": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorProteasomeInhibitor": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAntiCd38": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorBcmaTherapy": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAutoTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "priorAlloTransplant": "REQUIRED" | "EXCLUDED" | "EITHER" | null,
    "maxPriorRegimens": number | null
  } | null`,
};

const PROMPT_HEADER = `You are a clinical trial eligibility extraction specialist. Analyze the eligibility criteria below and extract ONLY cancer-specific clinical descriptors for the specified cancer types.

ELIGIBILITY CRITERIA:
{eligibility}

TARGET CANCER TYPES: {cancerTypes}

Extract cancer-specific clinical descriptors for EACH of the target cancer types listed above.

CRITICAL RULES — READ CAREFULLY:
1. Extract ONLY from the ELIGIBILITY CRITERIA text above. Do NOT infer descriptor requirements from the study drug, title, or treatment arms.
2. Default to null. Only set a value when the eligibility criteria explicitly and unambiguously state a requirement.
3. For prior therapy fields, ONLY set REQUIRED or EXCLUDED if the eligibility text explicitly names the specific therapy.
4. ONLY include descriptors for cancer types listed in TARGET CANCER TYPES.
5. If a cancer type is listed but no specific requirements are found, include an empty object for that type — do NOT guess.

Respond with ONLY valid JSON matching this schema:

{
`;

const PROMPT_FOOTER = `
}

Only include keys for the cancer types specified in TARGET CANCER TYPES.`;

export class ClinicalDescriptorExtractor {
  private openai: OpenAI;
  // Per-request timeout: high-reasoning calls occasionally hang on the longest
  // trials. 120s is generous for high reasoning + JSON output but bounded so
  // one bad trial can't stall the whole batch.
  constructor(private model: string) {
    this.openai = new OpenAI({ timeout: 120_000, maxRetries: 1 });
  }

  async extractFromTrial(trial: TrialForDescriptorExtraction): Promise<ClinicalDescriptors> {
    const relevantTypes = trial.cancerTypes.filter((ct) => ct !== 'OTHER');
    if (relevantTypes.length === 0) return {};

    const prompt = this.buildPrompt(trial, relevantTypes);

    try {
      const response = await withRetry(async () => {
        return this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a clinical trial eligibility extraction specialist. Always respond with valid JSON only, no markdown or explanation.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          reasoning_effort: 'high',
        } as any);
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty response from LLM');
      const parsed = JSON.parse(content);
      return this.validateDescriptors(parsed, trial.cancerTypes);
    } catch (error) {
      console.error(`Failed to extract descriptors for ${trial.nctId}:`, error);
      return this.empty(trial.cancerTypes);
    }
  }

  async extractBatch(
    trials: TrialForDescriptorExtraction[],
    batchSize = 5,
    onProgress?: (n: number, total: number) => void,
  ): Promise<Map<string, ClinicalDescriptors>> {
    const results = new Map<string, ClinicalDescriptors>();
    await runConcurrent(
      trials,
      batchSize,
      async (trial) => {
        const desc = await this.extractFromTrial(trial);
        results.set(trial.nctId, desc);
      },
      onProgress,
    );
    return results;
  }

  private buildPrompt(trial: TrialForDescriptorExtraction, relevantTypes: CancerType[]): string {
    const schema = relevantTypes
      .map((t) => SCHEMA_SECTIONS[t.toLowerCase()])
      .filter(Boolean)
      .join(',\n');

    return PROMPT_HEADER
      .replace('{eligibility}', trial.eligibilityRaw || 'Not available')
      .replace('{cancerTypes}', relevantTypes.join(', '))
      + schema + '\n'
      + PROMPT_FOOTER;
  }

  private cancerTypeToKey(c: CancerType): string | null {
    const map: Partial<Record<CancerType, string>> = {
      PROSTATE: 'prostate', UROTHELIAL: 'urothelial', RCC: 'rcc', TESTICULAR: 'testicular',
      BREAST: 'breast', LUNG: 'lung', COLORECTAL: 'colorectal', HEAD_AND_NECK: 'headAndNeck',
      OVARIAN: 'ovarian', UTERINE: 'uterine', CERVICAL: 'cervical', MELANOMA: 'melanoma',
      MESOTHELIOMA: 'mesothelioma', GASTROESOPHAGEAL: 'gastroesophageal',
      NEUROENDOCRINE: 'neuroendocrine', PANCREATIC: 'pancreatic',
      MATURE_B_CELL: 'matureBCell', MATURE_T_NK_CELL: 'matureTnk',
      MYELOID_NEOPLASM: 'myeloid', PRECURSOR_LYMPHOID: 'precursorLymphoid',
      PLASMA_CELL: 'plasmaCell',
    };
    return map[c] ?? null;
  }

  private validateDescriptors(data: unknown, cancerTypes: CancerType[]): ClinicalDescriptors {
    if (typeof data !== 'object' || data === null) return this.empty(cancerTypes);
    const parsed = data as Record<string, unknown>;
    const result: ClinicalDescriptors = {};
    for (const ct of cancerTypes) {
      const key = this.cancerTypeToKey(ct);
      if (!key) continue;
      const desc = parsed[key];
      result[key] = desc && typeof desc === 'object' ? (desc as Record<string, unknown>) : {};
    }
    return result;
  }

  private empty(cancerTypes: CancerType[]): ClinicalDescriptors {
    const r: ClinicalDescriptors = {};
    for (const ct of cancerTypes) {
      const key = this.cancerTypeToKey(ct);
      if (key) r[key] = {};
    }
    return r;
  }
}
