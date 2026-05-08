// Core types — self-contained for this project.

export type CancerType =
  | 'PROSTATE' | 'UROTHELIAL' | 'RCC' | 'TESTICULAR' | 'BREAST' | 'LUNG'
  | 'COLORECTAL' | 'HEAD_AND_NECK' | 'OVARIAN' | 'UTERINE' | 'CERVICAL'
  | 'MELANOMA' | 'MESOTHELIOMA' | 'GASTROESOPHAGEAL' | 'NEUROENDOCRINE' | 'PANCREATIC'
  | 'MATURE_B_CELL' | 'MATURE_T_NK_CELL' | 'MYELOID_NEOPLASM' | 'PRECURSOR_LYMPHOID' | 'PLASMA_CELL'
  | 'OTHER';

export const ALL_CANCER_TYPES: CancerType[] = [
  'PROSTATE', 'UROTHELIAL', 'RCC', 'TESTICULAR', 'BREAST', 'LUNG',
  'COLORECTAL', 'HEAD_AND_NECK', 'OVARIAN', 'UTERINE', 'CERVICAL',
  'MELANOMA', 'MESOTHELIOMA', 'GASTROESOPHAGEAL', 'NEUROENDOCRINE', 'PANCREATIC',
  'MATURE_B_CELL', 'MATURE_T_NK_CELL', 'MYELOID_NEOPLASM', 'PRECURSOR_LYMPHOID', 'PLASMA_CELL',
  'OTHER',
];

export const SOLID_TUMOR_TYPES: CancerType[] = [
  'PROSTATE', 'UROTHELIAL', 'RCC', 'TESTICULAR', 'BREAST', 'LUNG', 'COLORECTAL',
  'HEAD_AND_NECK', 'OVARIAN', 'UTERINE', 'CERVICAL', 'MELANOMA', 'MESOTHELIOMA',
  'GASTROESOPHAGEAL', 'NEUROENDOCRINE', 'PANCREATIC',
];

export type TrialSex = 'MALE' | 'FEMALE' | 'ALL';

export interface StructuredEligibilityFields {
  cancerTypes: CancerType[];
  acceptsAllSolidTumors: boolean;
  minAge?: number;
  maxAge?: number;
  allowedSex?: TrialSex;
  ecogMin?: number;
  ecogMax?: number;
  previouslyUntreated?: boolean;
}

// Cancer-specific descriptors are dynamically shaped — keep loose here.
export type ClinicalDescriptors = Record<string, Record<string, unknown>>;

export interface ProcessedTrial {
  nctId: string;
  briefTitle: string;
  briefSummary?: string;
  detailedDescription?: string;
  eligibilityRaw?: string;
  conditions: string[];
  interventions: string[];
  ctGovSex?: string;
  ctGovMinAge?: string;
  ctGovMaxAge?: string;
  cancerTypes?: CancerType[];
  overallStatus?: string;
  studyType?: string;
  phases?: string[];
}

export interface ExtractedTrial extends ProcessedTrial {
  assignedCancerType: CancerType;
  basicFields: StructuredEligibilityFields;
  descriptors: ClinicalDescriptors;
}

export interface TrialsDataFile {
  generatedAt: string;
  model: string;
  trials: ExtractedTrial[];
}

// CT.gov API v2 (subset we use)
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
    statusModule?: { overallStatus?: string };
    designModule?: { studyType?: string; phases?: string[] };
  };
}

export interface CTGovSearchResponse {
  studies: CTGovStudy[];
  nextPageToken?: string;
  totalCount?: number;
}
