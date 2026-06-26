// v3 field-schema metadata. Per-cancer-type descriptor blocks. The UI renders
// every field generically from this metadata and the server scores against it.
// OTHER is included as a catch-all block with no descriptor fields — it can
// appear as a value in trial-level cancerTypes[] and as a key in a cohort's
// applicableCancerTypes, but contributes zero fields to scoring.

import { BlockDef, CancerType, FieldClass, FieldDef } from '../types';

// ──────────────────────────────────────────────────────────────────────────
// Shared option lists + helpers
// ──────────────────────────────────────────────────────────────────────────

const POS_NEG: string[] = ['POSITIVE', 'NEGATIVE'];
const MUT_WT: string[] = ['MUTATED', 'WILD_TYPE'];
const CNS_METS: string[] = ['ABSENT', 'TREATED_STABLE', 'ACTIVE'];

// Shared option-tooltip maps. Field-specific positivity thresholds (e.g., HR
// at 1%, HER2 at IHC 3+) override these with inline optionHelp on the field.
const POS_NEG_HELP: Record<string, string> = {
  POSITIVE: "Marker present at or above the assay's positivity threshold.",
  NEGATIVE: "Marker absent or below the assay's positivity threshold.",
};
const MUT_WT_HELP: Record<string, string> = {
  MUTATED: 'Pathogenic / activating mutation present in the gene.',
  WILD_TYPE: 'No pathogenic mutation detected in the gene.',
};
const CNS_METS_HELP: Record<string, string> = {
  ABSENT: 'No central-nervous-system metastases.',
  TREATED_STABLE: 'Prior local therapy (surgery / radiation) with imaging-stable disease, typically off steroids for a defined interval.',
  ACTIVE: 'Symptomatic, untreated, or progressing CNS metastases.',
};
const STAGE_1_4_HELP: Record<string, string> = {
  I: 'Stage I — localized, smallest tumor burden.',
  II: 'Stage II — locally advanced or larger primary, still localized.',
  III: 'Stage III — regional nodal involvement or extensive locoregional spread.',
  IV: 'Stage IV — distant metastatic disease.',
};

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
  therapyHelp?: Record<string, string>,
): { required: FieldDef; excluded: FieldDef } => ({
  required: {
    kind: 'multi',
    label: 'Prior therapy required',
    helpText: 'Therapies the trial requires the patient to have received.',
    options: therapies,
    optionHelp: therapyHelp,
    class: 'prior_therapy',
    pairWith: 'priorTherapyExcluded',
  },
  excluded: {
    kind: 'multi',
    label: 'Prior therapy excluded',
    helpText: 'Therapies whose prior receipt disqualifies the patient.',
    options: therapies,
    optionHelp: therapyHelp,
    class: 'prior_therapy',
    pairWith: 'priorTherapyRequired',
  },
});

// ──────────────────────────────────────────────────────────────────────────
// Blocks
// ──────────────────────────────────────────────────────────────────────────

const prostate: BlockDef = (() => {
  const therapies = ['ARPI', 'TAXANE', 'PSMA_RADIOLIGAND', 'PARPI'];
  const therapyHelp: Record<string, string> = {
    ARPI: 'Androgen receptor pathway inhibitor (abiraterone, enzalutamide, apalutamide, darolutamide).',
    TAXANE: 'Taxane chemotherapy (docetaxel, cabazitaxel).',
    PSMA_RADIOLIGAND: 'PSMA-targeted radioligand therapy (Lu-177 PSMA-617 / Pluvicto).',
    PARPI: 'PARP inhibitor (olaparib, rucaparib, talazoparib, niraparib).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'PROSTATE',
    label: 'Prostate',
    fields: {
      castrationStatus: { kind: 'multi', label: 'Castration status', options: ['SENSITIVE', 'RESISTANT'], optionHelp: {
        SENSITIVE: 'Castration-sensitive (CSPC / mCSPC / mHSPC) — disease responds to androgen deprivation.',
        RESISTANT: 'Castration-resistant (CRPC / mCRPC) — progression despite castrate testosterone.',
      }, helpText: 'CSPC vs CRPC. mHSPC/mCSPC → SENSITIVE; mCRPC → RESISTANT.', class: 'other' },
      metastaticStatus: { kind: 'multi', label: 'Metastatic status', options: ['METASTATIC', 'NON_METASTATIC'], optionHelp: {
        METASTATIC: 'Radiographically detectable distant metastases (M1).',
        NON_METASTATIC: 'No radiographic metastases (M0 / nmCRPC). Biochemical/PSA recurrence without imaging disease counts as non-metastatic.',
      }, helpText: 'M0 / nmCRPC → NON_METASTATIC. Biochemical recurrence without radiographic disease → NON_METASTATIC.', class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['ADENOCARCINOMA', 'NEUROENDOCRINE_SMALL_CELL'], optionHelp: {
        ADENOCARCINOMA: 'Standard prostate adenocarcinoma.',
        NEUROENDOCRINE_SMALL_CELL: 'Neuroendocrine / small-cell prostate carcinoma — aggressive, often AR-pathway independent.',
      }, class: 'other' },
      visceralMetastases: { kind: 'bool', label: 'Visceral metastases', helpText: 'true = trial requires present; false = explicit exclusion.', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      psmaPetPositive: { kind: 'bool', label: 'PSMA PET positive', helpText: 'Only true when PSMA-PET positivity is an explicit eligibility requirement.', class: 'biomarker' },
      hrrStatus: { kind: 'multi', label: 'HRR status', options: ['BRCA1', 'BRCA2', 'OTHER_HRR', 'NEGATIVE'], optionHelp: {
        BRCA1: 'BRCA1 pathogenic alteration (germline or somatic).',
        BRCA2: 'BRCA2 pathogenic alteration (germline or somatic).',
        OTHER_HRR: 'Other homologous-recombination-repair gene alteration (ATM, PALB2, CHEK2, RAD51 family, etc.).',
        NEGATIVE: 'No detected HRR alteration.',
      }, helpText: '"HRR-positive" unspecified → list BRCA1, BRCA2, OTHER_HRR.', class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH', 'MSS'], optionHelp: {
        MSI_HIGH: 'Microsatellite instability-high or mismatch-repair deficient.',
        MSS: 'Microsatellite stable or mismatch-repair proficient.',
      }, class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const urothelial: BlockDef = (() => {
  const therapies = ['PLATINUM', 'IMMUNOTHERAPY', 'ENFORTUMAB_VEDOTIN', 'FGFR3_INHIBITOR', 'RADICAL_CYSTECTOMY'];
  const therapyHelp: Record<string, string> = {
    PLATINUM: 'Platinum-based chemotherapy (eg, cisplatin or carboplatin).',
    IMMUNOTHERAPY: 'PD-1/PD-L1 checkpoint inhibitor (pembrolizumab, nivolumab, atezolizumab, avelumab, durvalumab).',
    ENFORTUMAB_VEDOTIN: 'Enfortumab vedotin — Nectin-4-targeted antibody-drug conjugate.',
    FGFR3_INHIBITOR: 'FGFR inhibitor',
    RADICAL_CYSTECTOMY: 'Radical cystectomy — surgical removal of the bladder.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'UROTHELIAL',
    label: 'Urothelial / Bladder',
    fields: {
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NMIBC', 'MIBC', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        NMIBC: 'Non-muscle-invasive bladder cancer (Ta, Tis, T1).',
        MIBC: 'Muscle-invasive bladder cancer (≥T2).',
        LOCALLY_ADVANCED: 'Locally advanced / unresectable (T4 / N+ / pelvic side-wall).',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      site: { kind: 'multi', label: 'Site', options: ['BLADDER', 'UPPER_TRACT', 'URETHRAL'], optionHelp: {
        BLADDER: 'Bladder primary.',
        UPPER_TRACT: 'Renal pelvis or ureter primary.',
        URETHRAL: 'Urethral primary.',
      }, class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['PURE_UROTHELIAL', 'VARIANT_HISTOLOGY', 'PURE_SQUAMOUS', 'PURE_NEUROENDOCRINE'], optionHelp: {
        PURE_UROTHELIAL: 'Pure urothelial (transitional cell) carcinoma.',
        VARIANT_HISTOLOGY: 'Urothelial with variant histology component (micropapillary, plasmacytoid, sarcomatoid, nested, etc.).',
        PURE_SQUAMOUS: 'Pure squamous cell carcinoma of the urinary tract.',
        PURE_NEUROENDOCRINE: 'Pure small-cell / neuroendocrine carcinoma of the urinary tract.',
      }, class: 'other' },
      cisPresent: { kind: 'bool', label: 'CIS present', class: 'other' },
      bcgStatus: { kind: 'multi', label: 'BCG status', options: ['NAIVE', 'EXPOSED', 'UNRESPONSIVE'], optionHelp: {
        NAIVE: 'No prior intravesical BCG.',
        EXPOSED: 'Prior intravesical BCG but does not meet BCG-unresponsive criteria.',
        UNRESPONSIVE: 'BCG-unresponsive per FDA definition (persistent / recurrent high-grade NMIBC after adequate BCG).',
      }, helpText: 'BCG-unresponsive is a specific regulatory term — only use UNRESPONSIVE when the trial uses that term or its definition.', class: 'other' },
      cisplatinEligible: { kind: 'bool', label: 'Cisplatin eligible', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      fgfr3Status: { kind: 'multi', label: 'FGFR3 status', options: ['ALTERED', 'WILD_TYPE'], optionHelp: {
        ALTERED: 'FGFR3 activating mutation or fusion present.',
        WILD_TYPE: 'No FGFR3 alteration.',
      }, class: 'biomarker' },
      pdl1Status: { kind: 'multi', label: 'PD-L1 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
      nectin4Status: { kind: 'multi', label: 'Nectin-4 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const rcc: BlockDef = (() => {
  const therapies = ['NEPHRECTOMY', 'VEGF_TKI', 'IMMUNOTHERAPY_METASTATIC', 'IMMUNOTHERAPY_ADJUVANT', 'HIF2A_INHIBITOR', 'MTOR_INHIBITOR'];
  const therapyHelp: Record<string, string> = {
    NEPHRECTOMY: 'Prior radical or partial nephrectomy.',
    VEGF_TKI: 'VEGFR tyrosine kinase inhibitor (sunitinib, pazopanib, cabozantinib, axitinib, lenvatinib, tivozanib).',
    IMMUNOTHERAPY_METASTATIC: 'Checkpoint inhibitor therapy given in the metastatic setting.',
    IMMUNOTHERAPY_ADJUVANT: 'Checkpoint inhibitor therapy given in the adjuvant (post-nephrectomy) setting (e.g., adjuvant pembrolizumab).',
    HIF2A_INHIBITOR: 'HIF-2α inhibitor (eg, belzutifan).',
    MTOR_INHIBITOR: 'mTOR inhibitor (eg, everolimus, temsirolimus).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'RCC',
    label: 'Renal cell carcinoma',
    fields: {
      histologySubtype: { kind: 'multi', label: 'Histology subtype', options: ['CLEAR_CELL', 'PAPILLARY', 'CHROMOPHOBE', 'OTHER_NON_CLEAR_CELL'], optionHelp: {
        CLEAR_CELL: 'Clear-cell RCC',
        PAPILLARY: 'Papillary RCC.',
        CHROMOPHOBE: 'Chromophobe RCC.',
        OTHER_NON_CLEAR_CELL: 'Other non-clear-cell RCC (collecting duct, medullary, translocation, unclassified).',
      }, class: 'other' },
      sarcomatoidFeatures: { kind: 'bool', label: 'Sarcomatoid features', class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['LOCALIZED', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        LOCALIZED: 'Disease confined to the kidney.',
        LOCALLY_ADVANCED: 'Locally advanced.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      imdcRisk: { kind: 'multi', label: 'IMDC risk', options: ['FAVORABLE', 'INTERMEDIATE', 'POOR'], optionHelp: {
        FAVORABLE: 'Favorable risk — 0 IMDC factors.',
        INTERMEDIATE: 'Intermediate risk — 1–2 IMDC factors.',
        POOR: 'Poor risk — ≥3 IMDC factors. Factors: KPS<80, time-from-dx<1 y, anemia, hypercalcemia, neutrophilia, thrombocytosis.',
      }, class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, optionHelp: CNS_METS_HELP, helpText: 'TREATED_STABLE = prior local therapy with no progression.', class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const testicular: BlockDef = (() => {
  const therapies = ['PLATINUM_CHEMOTHERAPY', 'HDCT_ASCT'];
  const therapyHelp: Record<string, string> = {
    PLATINUM_CHEMOTHERAPY: 'Cisplatin-based combination chemotherapy (BEP, EP, VIP, TIP).',
    HDCT_ASCT: 'High-dose chemotherapy with autologous stem-cell transplant.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'TESTICULAR',
    label: 'Testicular / Germ cell',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['SEMINOMA', 'NON_SEMINOMA'], optionHelp: {
        SEMINOMA: 'Pure seminoma.',
        NON_SEMINOMA: 'Non-seminomatous germ cell tumor (embryonal, yolk sac, choriocarcinoma, teratoma, mixed).',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['STAGE_I', 'METASTATIC_INITIAL', 'RELAPSED_REFRACTORY'], optionHelp: {
        STAGE_I: 'Stage I — confined to testis.',
        METASTATIC_INITIAL: 'First-line metastatic disease.',
        RELAPSED_REFRACTORY: 'Relapsed or refractory after first-line treatment.',
      }, class: 'other' },
      igcccgRisk: { kind: 'multi', label: 'IGCCCG risk', options: ['GOOD', 'INTERMEDIATE', 'POOR'], optionHelp: {
        GOOD: 'IGCCCG good prognosis.',
        INTERMEDIATE: 'IGCCCG intermediate prognosis.',
        POOR: 'IGCCCG poor prognosis.',
      }, class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const breast: BlockDef = (() => {
  const therapies = ['ENDOCRINE_THERAPY', 'CDK46_INHIBITOR', 'HER2_DIRECTED_THERAPY', 'ANTIBODY_DRUG_CONJUGATE', 'TAXANE', 'ANTHRACYCLINE', 'PLATINUM', 'CYCLOPHOSPHAMIDE'];
  const therapyHelp: Record<string, string> = {
    ENDOCRINE_THERAPY: 'Hormonal therapy (tamoxifen, aromatase inhibitor, fulvestrant, elacestrant).',
    CDK46_INHIBITOR: 'CDK4/6 inhibitor (palbociclib, ribociclib, abemaciclib).',
    HER2_DIRECTED_THERAPY: 'HER2-targeted therapy (trastuzumab, pertuzumab, lapatinib, neratinib, tucatinib).',
    ANTIBODY_DRUG_CONJUGATE: 'Antibody-drug conjugate (T-DM1, trastuzumab deruxtecan, sacituzumab govitecan, datopotamab deruxtecan).',
    TAXANE: 'Taxane chemotherapy (paclitaxel, nab-paclitaxel, docetaxel).',
    ANTHRACYCLINE: 'Anthracycline chemotherapy (doxorubicin, epirubicin, liposomal doxorubicin).',
    PLATINUM: 'Platinum chemotherapy (carboplatin, cisplatin).',
    CYCLOPHOSPHAMIDE: 'Cyclophosphamide chemotherapy.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'BREAST',
    label: 'Breast',
    fields: {
      hrStatus: { kind: 'multi', label: 'HR status', options: POS_NEG, optionHelp: {
        POSITIVE: 'Hormone receptor positive — ER and/or PR ≥1% by IHC.',
        NEGATIVE: 'Hormone receptor negative — both ER and PR <1%.',
      }, helpText: 'POSITIVE if ER and/or PR ≥1%.', class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, optionHelp: {
        POSITIVE: 'HER2-positive — IHC 3+ or ISH amplified.',
        NEGATIVE: 'HER2-negative — does not meet IHC 3+ or ISH-amplified criteria.',
      }, helpText: 'POSITIVE = IHC 3+ or ISH amplified. NEGATIVE = otherwise; HER2-low/ultralow goes in the next field.', class: 'biomarker' },
      her2LowOrUltralowStatus: { kind: 'multi', label: 'HER2-low / ultralow status', options: ['NEGATIVE', 'ULTRA_LOW', 'LOW'], optionHelp: {
        NEGATIVE: 'HER2 IHC 0 — true HER2-null.',
        ULTRA_LOW: 'HER2 IHC >0 but <1+.',
        LOW: 'HER2 IHC 1+ or 2+/ISH−.',
      }, helpText: 'Only populate for trials that gate on the HER2-low/ultralow distinction. LOW = IHC 1+ or 2+/ISH−. ULTRA_LOW = IHC >0 to <1+. NEGATIVE = IHC 0.', class: 'biomarker' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NEOADJUVANT', 'ADJUVANT', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        NEOADJUVANT: 'Pre-operative systemic therapy for operable disease.',
        ADJUVANT: 'Post-operative systemic therapy after definitive surgery.',
        LOCALLY_ADVANCED: 'Locally advanced / inflammatory / inoperable disease.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, optionHelp: CNS_METS_HELP, class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      menopausalStatus: { kind: 'multi', label: 'Menopausal status', options: ['PRE', 'PERI', 'POST'], optionHelp: {
        PRE: 'Premenopausal.',
        PERI: 'Perimenopausal.',
        POST: 'Postmenopausal (defined biochemically or per the trial).',
      }, class: 'other' },
      brcaStatus: { kind: 'multi', label: 'BRCA status', options: ['GERMLINE', 'SOMATIC', 'NEGATIVE'], optionHelp: {
        GERMLINE: 'Germline (inherited) BRCA1/2 pathogenic variant.',
        SOMATIC: 'Tumor-only (somatic) BRCA1/2 pathogenic variant.',
        NEGATIVE: 'No BRCA1/2 pathogenic variant detected.',
      }, class: 'biomarker' },
      pi3kAktPathwayStatus: { kind: 'multi', label: 'PI3K/AKT pathway status', options: ['ALTERED', 'WILD_TYPE'], optionHelp: {
        ALTERED: 'Activating alteration in PIK3CA, AKT1, or PTEN.',
        WILD_TYPE: 'No detected PI3K / AKT / PTEN alteration.',
      }, helpText: 'PIK3CA / AKT1 / PTEN pathway alteration (capivasertib eligibility).', class: 'biomarker' },
      esr1Status: { kind: 'multi', label: 'ESR1 status', options: MUT_WT, optionHelp: {
        MUTATED: 'ESR1 activating mutation.',
        WILD_TYPE: 'No ESR1 mutation detected.',
      }, class: 'biomarker' },
      pdl1Status: { kind: 'multi', label: 'PD-L1 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const lung: BlockDef = (() => {
  const therapies = ['PLATINUM_CHEMOTHERAPY', 'IMMUNOTHERAPY', 'TARGETED_THERAPY'];
  const therapyHelp: Record<string, string> = {
    PLATINUM_CHEMOTHERAPY: 'Platinum doublet (cisplatin or carboplatin combined with pemetrexed, paclitaxel, etoposide, etc.).',
    IMMUNOTHERAPY: 'PD-1/PD-L1 checkpoint inhibitor (pembrolizumab, nivolumab, atezolizumab, durvalumab, cemiplimab).',
    TARGETED_THERAPY: 'Driver-mutation-directed small-molecule inhibitor (EGFR, ALK, ROS1, BRAF, KRAS, MET, RET, HER2, NTRK).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'LUNG',
    label: 'Lung',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['NSCLC_NONSQUAMOUS', 'NSCLC_SQUAMOUS', 'SCLC'], optionHelp: {
        NSCLC_NONSQUAMOUS: 'Non-squamous NSCLC (adenocarcinoma, large cell, NOS).',
        NSCLC_SQUAMOUS: 'Squamous-cell NSCLC.',
        SCLC: 'Small-cell lung cancer.',
      }, class: 'other' },
      metastaticStatus: { kind: 'multi', label: 'Metastatic status (NSCLC)', options: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        EARLY_STAGE: 'Resectable / stage I–II / early stage III.',
        LOCALLY_ADVANCED: 'Unresectable stage III.',
        METASTATIC: 'Stage IV / metastatic disease.',
      }, helpText: 'Use for NSCLC. For SCLC use sclcExtent below instead.', class: 'other' },
      sclcExtent: { kind: 'multi', label: 'SCLC extent', options: ['LIMITED', 'EXTENSIVE'], optionHelp: {
        LIMITED: 'Limited-stage SCLC — confined to one hemithorax / single radiation port.',
        EXTENSIVE: 'Extensive-stage SCLC — disease beyond limited-stage criteria.',
      }, helpText: 'Applies only if histology is SCLC.', class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, optionHelp: CNS_METS_HELP, class: 'other' },
      leptomeningealDisease: { kind: 'bool', label: 'Leptomeningeal disease', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      egfrStatus: { kind: 'multi', label: 'EGFR status', options: ['CLASSICAL_DEL19_L858R', 'EXON20_INS', 'UNCOMMON', 'WILD_TYPE'], optionHelp: {
        CLASSICAL_DEL19_L858R: 'Classical sensitizing EGFR mutation — exon 19 deletion or L858R.',
        EXON20_INS: 'EGFR exon 20 insertion.',
        UNCOMMON: 'Uncommon EGFR mutation (G719X, L861Q, S768I, compound mutations).',
        WILD_TYPE: 'EGFR wild-type.',
      }, helpText: 'Classical = exon 19 del / L858R. "EGFR-mutant" unspecified → list all mutant values.', class: 'biomarker' },
      alkStatus: { kind: 'multi', label: 'ALK status', options: ['REARRANGED', 'WILD_TYPE'], optionHelp: {
        REARRANGED: 'ALK gene rearrangement (e.g., EML4-ALK fusion).',
        WILD_TYPE: 'No ALK rearrangement.',
      }, class: 'biomarker' },
      ros1Status: { kind: 'multi', label: 'ROS1 status', options: ['REARRANGED', 'WILD_TYPE'], optionHelp: {
        REARRANGED: 'ROS1 gene rearrangement / fusion.',
        WILD_TYPE: 'No ROS1 rearrangement.',
      }, class: 'biomarker' },
      krasStatus: { kind: 'multi', label: 'KRAS status', options: ['G12C', 'NON_G12C', 'WILD_TYPE'], optionHelp: {
        G12C: 'KRAS G12C mutation.',
        NON_G12C: 'Non-G12C KRAS mutation (G12D, G12V, G13D, Q61H, etc.).',
        WILD_TYPE: 'KRAS wild-type.',
      }, class: 'biomarker' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'NON_V600E', 'WILD_TYPE'], optionHelp: {
        V600E: 'BRAF V600E point mutation.',
        NON_V600E: 'BRAF alteration other than V600E.',
        WILD_TYPE: 'BRAF wild-type.',
      }, class: 'biomarker' },
      metStatus: { kind: 'multi', label: 'MET status', options: ['EXON14_SKIPPING', 'AMPLIFIED', 'WILD_TYPE'], optionHelp: {
        EXON14_SKIPPING: 'MET exon 14 skipping mutation.',
        AMPLIFIED: 'MET gene amplification.',
        WILD_TYPE: 'No MET alteration.',
      }, class: 'biomarker' },
      retStatus: { kind: 'multi', label: 'RET status', options: ['REARRANGED', 'WILD_TYPE'], optionHelp: {
        REARRANGED: 'RET gene rearrangement / fusion.',
        WILD_TYPE: 'No RET rearrangement.',
      }, class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: ['MUTATED', 'AMPLIFIED', 'WILD_TYPE'], optionHelp: {
        MUTATED: 'HER2 (ERBB2) activating mutation.',
        AMPLIFIED: 'HER2 gene amplification.',
        WILD_TYPE: 'No HER2 alteration.',
      }, class: 'biomarker' },
      ntrkStatus: { kind: 'multi', label: 'NTRK status', options: ['FUSION', 'WILD_TYPE'], optionHelp: {
        FUSION: 'NTRK1/2/3 gene fusion.',
        WILD_TYPE: 'No NTRK fusion.',
      }, class: 'biomarker' },
      pdl1TpsCategory: { kind: 'multi', label: 'PD-L1 TPS category', options: ['HIGH_GE_50', 'INTERMEDIATE_1_49', 'NEGATIVE_LT_1'], optionHelp: {
        HIGH_GE_50: 'PD-L1 TPS ≥50% (Dako 22C3).',
        INTERMEDIATE_1_49: 'PD-L1 TPS 1–49%.',
        NEGATIVE_LT_1: 'PD-L1 TPS <1%.',
      }, helpText: 'PD-L1 tumor proportion score band (Dako 22C3). ≥50% → HIGH_GE_50. ≥1% → both HIGH_GE_50 and INTERMEDIATE_1_49.', class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const colorectal: BlockDef = (() => {
  const therapies = ['FLUOROPYRIMIDINE', 'OXALIPLATIN', 'IRINOTECAN', 'ANTI_EGFR', 'ANTI_VEGF', 'IMMUNOTHERAPY', 'BRAF_COMBINATION_THERAPY'];
  const therapyHelp: Record<string, string> = {
    FLUOROPYRIMIDINE: '5-FU or capecitabine.',
    OXALIPLATIN: 'Oxaliplatin (FOLFOX / CAPOX backbone).',
    IRINOTECAN: 'Irinotecan (FOLFIRI backbone).',
    ANTI_EGFR: 'Anti-EGFR monoclonal antibody (cetuximab, panitumumab).',
    ANTI_VEGF: 'Anti-VEGF / VEGFR (bevacizumab, aflibercept, ramucirumab).',
    IMMUNOTHERAPY: 'PD-1/PD-L1 inhibitor (pembrolizumab, nivolumab, dostarlimab).',
    BRAF_COMBINATION_THERAPY: 'BRAF + EGFR combination regimen (encorafenib + cetuximab).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'COLORECTAL',
    label: 'Colorectal',
    fields: {
      primarySiteSidedness: { kind: 'multi', label: 'Primary site / sidedness', options: ['RIGHT_COLON', 'LEFT_COLON', 'RECTUM'], optionHelp: {
        RIGHT_COLON: 'Cecum through transverse colon (proximal).',
        LEFT_COLON: 'Splenic flexure through sigmoid (distal).',
        RECTUM: 'Rectum / rectosigmoid.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        EARLY_STAGE: 'Stage I–III resectable disease.',
        LOCALLY_ADVANCED: 'Locally advanced, unresectable disease.',
        METASTATIC: 'Stage IV / metastatic disease.',
      }, class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['ADENOCARCINOMA', 'OTHER'], optionHelp: {
        ADENOCARCINOMA: 'Colorectal adenocarcinoma (includes mucinous and signet-ring variants).',
        OTHER: 'Other histology (neuroendocrine, squamous, etc.).',
      }, class: 'other' },
      liverLimitedDisease: { kind: 'bool', label: 'Liver-limited disease', helpText: 'true only for trials requiring liver-confined metastases (e.g., HAI / liver-directed).', class: 'other' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      rasStatus: { kind: 'multi', label: 'RAS status', options: ['KRAS_MUTATED', 'NRAS_MUTATED', 'WILD_TYPE'], optionHelp: {
        KRAS_MUTATED: 'KRAS mutation present at any codon.',
        NRAS_MUTATED: 'NRAS mutation present at any codon.',
        WILD_TYPE: 'Both KRAS and NRAS wild-type.',
      }, helpText: 'Anti-EGFR trials usually require RAS WT.', class: 'biomarker' },
      krasG12cStatus: { kind: 'multi', label: 'KRAS G12C status', options: MUT_WT, optionHelp: {
        MUTATED: 'KRAS G12C point mutation.',
        WILD_TYPE: 'No KRAS G12C mutation.',
      }, class: 'biomarker' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'NON_V600E', 'WILD_TYPE'], optionHelp: {
        V600E: 'BRAF V600E point mutation.',
        NON_V600E: 'BRAF alteration other than V600E.',
        WILD_TYPE: 'BRAF wild-type.',
      }, class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], optionHelp: {
        MSI_HIGH_DMMR: 'Microsatellite instability-high by PCR or deficient mismatch repair (dMMR) by IHC.',
        MSS_PMMR: 'Microsatellite stable / mismatch-repair proficient.',
      }, helpText: 'MSI-H by PCR and dMMR by IHC are treated as the same value.', class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: ['AMPLIFIED', 'OVEREXPRESSED', 'NEGATIVE'], optionHelp: {
        AMPLIFIED: 'HER2 gene amplification.',
        OVEREXPRESSED: 'HER2 IHC 3+ protein overexpression.',
        NEGATIVE: 'Neither amplified nor IHC 3+.',
      }, helpText: 'CRC-style: amplification or IHC 3+ (not breast-style "positive").', class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const head_and_neck: BlockDef = (() => {
  const therapies = ['RADIATION', 'PLATINUM', 'IMMUNOTHERAPY'];
  const therapyHelp: Record<string, string> = {
    RADIATION: 'Definitive or curative-intent radiotherapy.',
    PLATINUM: 'Platinum-based chemotherapy (eg, cisplatin or carboplatin).',
    IMMUNOTHERAPY: 'PD-1 inhibitor (eg, pembrolizumab, nivolumab).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'HEAD_AND_NECK',
    label: 'Head and neck',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['ORAL_CAVITY', 'OROPHARYNX', 'LARYNX', 'HYPOPHARYNX', 'NASOPHARYNX', 'SALIVARY_GLAND'], optionHelp: {
        ORAL_CAVITY: 'Oral cavity primary.',
        OROPHARYNX: 'Oropharynx primary.',
        LARYNX: 'Larynx primary.',
        HYPOPHARYNX: 'Hypopharynx primary.',
        NASOPHARYNX: 'Nasopharynx primary.',
        SALIVARY_GLAND: 'Major or minor salivary gland primary.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'], optionHelp: {
        LOCALLY_ADVANCED: 'Locally advanced disease (typically T3/T4 or N2/N3).',
        RECURRENT: 'Locoregionally recurrent disease.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      hpvP16Status: { kind: 'multi', label: 'HPV / p16 status', options: POS_NEG, optionHelp: {
        POSITIVE: 'HPV-positive or p16-positive (p16 IHC ≥70% in oropharynx is the standard surrogate).',
        NEGATIVE: 'HPV-negative / p16-negative.',
      }, helpText: 'p16 IHC is the standard surrogate for HPV in oropharyngeal cancer.', class: 'biomarker' },
      ebvStatus: { kind: 'multi', label: 'EBV status', options: POS_NEG, optionHelp: POS_NEG_HELP, helpText: 'Relevant for nasopharyngeal carcinoma; null for most other sites.', class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      pdl1CpsCategory: { kind: 'multi', label: 'PD-L1 CPS category', options: ['HIGH_GE_20', 'INTERMEDIATE_1_19', 'NEGATIVE_LT_1'], optionHelp: {
        HIGH_GE_20: 'PD-L1 CPS ≥20.',
        INTERMEDIATE_1_19: 'PD-L1 CPS 1–19.',
        NEGATIVE_LT_1: 'PD-L1 CPS <1.',
      }, class: 'biomarker' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const ovarian: BlockDef = (() => {
  const therapies = ['DEBULKING', 'PLATINUM', 'BEVACIZUMAB', 'PARPI'];
  const therapyHelp: Record<string, string> = {
    DEBULKING: 'Cytoreductive (debulking) surgery.',
    PLATINUM: 'Platinum-based chemotherapy (eg, -carboplatin or cisplatin).',
    BEVACIZUMAB: 'Bevacizumab — anti-VEGF.',
    PARPI: 'PARP inhibitor (eg, olaparib, niraparib, rucaparib).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'OVARIAN',
    label: 'Ovarian / fallopian / primary peritoneal',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['HIGH_GRADE_SEROUS', 'LOW_GRADE_SEROUS', 'MUCINOUS', 'CLEAR_CELL', 'ENDOMETRIOID'], optionHelp: {
        HIGH_GRADE_SEROUS: 'High-grade serous carcinoma — most common epithelial ovarian subtype.',
        LOW_GRADE_SEROUS: 'Low-grade serous carcinoma.',
        MUCINOUS: 'Mucinous carcinoma.',
        CLEAR_CELL: 'Clear-cell carcinoma.',
        ENDOMETRIOID: 'Endometrioid carcinoma.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NEWLY_DIAGNOSED', 'MAINTENANCE', 'RECURRENT'], optionHelp: {
        NEWLY_DIAGNOSED: 'Initial diagnosis / first-line setting.',
        MAINTENANCE: 'Maintenance after platinum-based therapy.',
        RECURRENT: 'Recurrent disease after prior therapy.',
      }, class: 'other' },
      platinumSensitivity: { kind: 'multi', label: 'Platinum sensitivity', options: ['SENSITIVE', 'RESISTANT', 'REFRACTORY'], optionHelp: {
        SENSITIVE: 'Platinum-sensitive — relapse ≥6 months from last platinum.',
        RESISTANT: 'Platinum-resistant — relapse <6 months from last platinum.',
        REFRACTORY: 'Platinum-refractory — progression on or within ~4 weeks of last platinum.',
      }, class: 'other' },
      brcaStatus: { kind: 'multi', label: 'BRCA status', options: ['GERMLINE', 'SOMATIC', 'NEGATIVE'], optionHelp: {
        GERMLINE: 'Germline BRCA1/2 pathogenic variant.',
        SOMATIC: 'Somatic (tumor-only) BRCA1/2 pathogenic variant.',
        NEGATIVE: 'No BRCA1/2 pathogenic variant.',
      }, class: 'biomarker' },
      hrdStatus: { kind: 'multi', label: 'HRD status', options: POS_NEG, optionHelp: {
        POSITIVE: 'Homologous-recombination-deficient tumor (by genomic instability score, e.g., Myriad MyChoice, or by BRCA mutation).',
        NEGATIVE: 'Homologous-recombination proficient.',
      }, helpText: 'BRCA is a subset of HRD. Populate brcaStatus only if the trial separately gates on BRCA.', class: 'biomarker' },
      measurableDiseaseRecist: { kind: 'bool', label: 'Measurable disease (RECIST 1.1)', class: 'other' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, optionHelp: CNS_METS_HELP, class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const uterine: BlockDef = (() => {
  const therapies = ['RADIATION', 'PLATINUM', 'IMMUNOTHERAPY'];
  const therapyHelp: Record<string, string> = {
    RADIATION: 'Pelvic radiotherapy (external-beam or brachytherapy).',
    PLATINUM: 'Platinum-based chemotherapy (eg, carboplatin / cisplatin).',
    IMMUNOTHERAPY: 'PD-1 inhibitor (eg, pembrolizumab, dostarlimab).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'UTERINE',
    label: 'Uterine',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['ENDOMETRIOID', 'SEROUS', 'CARCINOSARCOMA', 'CLEAR_CELL'], optionHelp: {
        ENDOMETRIOID: 'Endometrioid carcinoma — most common uterine subtype.',
        SEROUS: 'Serous carcinoma.',
        CARCINOSARCOMA: 'Uterine carcinosarcoma (MMMT).',
        CLEAR_CELL: 'Clear-cell carcinoma.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['EARLY_STAGE', 'LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'], optionHelp: {
        EARLY_STAGE: 'Stage I–II — disease confined to uterus.',
        LOCALLY_ADVANCED: 'Locally advanced disease (stage III).',
        RECURRENT: 'Recurrent disease after prior treatment.',
        METASTATIC: 'Distant metastatic disease (stage IV).',
      }, class: 'other' },
      tcgaMolecularClass: { kind: 'multi', label: 'TCGA molecular class', options: ['POLE_ULTRAMUTATED', 'MSI_HYPERMUTATED_DMMR', 'COPY_NUMBER_LOW_NSMP', 'COPY_NUMBER_HIGH_P53ABN'], optionHelp: {
        POLE_ULTRAMUTATED: 'POLE-ultramutated endometrial carcinoma.',
        MSI_HYPERMUTATED_DMMR: 'MSI-hypermutated / mismatch-repair-deficient.',
        COPY_NUMBER_LOW_NSMP: 'Copy-number low / no specific molecular profile (NSMP).',
        COPY_NUMBER_HIGH_P53ABN: 'Copy-number high / p53-abnormal.',
      }, class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], optionHelp: {
        MSI_HIGH_DMMR: 'MSI-high by PCR or mismatch-repair deficient (dMMR) by IHC.',
        MSS_PMMR: 'Microsatellite stable / mismatch-repair proficient.',
      }, class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    CHEMORADIATION: 'Concurrent cisplatin-based chemoradiation.',
    PLATINUM: 'Platinum-based chemotherapy.',
    IMMUNOTHERAPY: 'PD-1 inhibitor (pembrolizumab).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'CERVICAL',
    label: 'Cervical',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['SQUAMOUS', 'ADENOCARCINOMA', 'ADENOSQUAMOUS'], optionHelp: {
        SQUAMOUS: 'Squamous cell carcinoma — most common cervical subtype.',
        ADENOCARCINOMA: 'Cervical adenocarcinoma.',
        ADENOSQUAMOUS: 'Adenosquamous carcinoma.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['LOCALLY_ADVANCED', 'RECURRENT', 'METASTATIC'], optionHelp: {
        LOCALLY_ADVANCED: 'Locally advanced disease (typically FIGO IB3 / II–IVA).',
        RECURRENT: 'Recurrent disease after prior treatment.',
        METASTATIC: 'Distant metastatic disease (FIGO IVB).',
      }, class: 'other' },
      hpvStatus: { kind: 'multi', label: 'HPV status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
      pdl1CpsCategory: { kind: 'multi', label: 'PD-L1 CPS category', options: ['POSITIVE_GE_1', 'NEGATIVE_LT_1'], optionHelp: {
        POSITIVE_GE_1: 'PD-L1 CPS ≥1.',
        NEGATIVE_LT_1: 'PD-L1 CPS <1.',
      }, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    IMMUNOTHERAPY: 'Checkpoint inhibitor (anti-PD-1, anti-CTLA-4, or combination; relatlimab + nivolumab; etc.).',
    BRAF_MEK_INHIBITOR: 'BRAF + MEK inhibitor combination (dabrafenib + trametinib, vemurafenib + cobimetinib, encorafenib + binimetinib).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'MELANOMA',
    label: 'Melanoma',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['CUTANEOUS', 'MUCOSAL', 'UVEAL', 'ACRAL'], optionHelp: {
        CUTANEOUS: 'Cutaneous (skin) melanoma.',
        MUCOSAL: 'Mucosal melanoma.',
        UVEAL: 'Uveal (ocular) melanoma.',
        ACRAL: 'Acral lentiginous melanoma (palms, soles, nail beds).',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTED_ADJUVANT', 'UNRESECTABLE', 'METASTATIC'], optionHelp: {
        RESECTED_ADJUVANT: 'Resected disease in the adjuvant setting.',
        UNRESECTABLE: 'Unresectable but non-metastatic disease.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'V600K', 'NON_V600', 'WILD_TYPE'], optionHelp: {
        V600E: 'BRAF V600E point mutation.',
        V600K: 'BRAF V600K point mutation.',
        NON_V600: 'BRAF alteration outside the V600 codon.',
        WILD_TYPE: 'BRAF wild-type.',
      }, class: 'biomarker' },
      nrasStatus: { kind: 'multi', label: 'NRAS status', options: MUT_WT, optionHelp: MUT_WT_HELP, class: 'biomarker' },
      ldhCategory: { kind: 'multi', label: 'LDH category', options: ['NORMAL', 'ELEVATED_1_2X_ULN', 'ELEVATED_GT_2X_ULN'], optionHelp: {
        NORMAL: 'LDH within the upper limit of normal.',
        ELEVATED_1_2X_ULN: 'LDH 1–2× upper limit of normal.',
        ELEVATED_GT_2X_ULN: 'LDH greater than 2× upper limit of normal.',
      }, helpText: 'LDH level relative to ULN (used for M1 sub-staging).', class: 'lab_cutoff' },
      cnsMetastases: { kind: 'multi', label: 'CNS metastases', options: CNS_METS, optionHelp: CNS_METS_HELP, class: 'other' },
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
  const therapyHelp: Record<string, string> = {
    PLATINUM: 'Cisplatin or carboplatin.',
    PEMETREXED: 'Pemetrexed.',
    IMMUNOTHERAPY: 'Checkpoint inhibitor regimen (e.g., nivolumab + ipilimumab).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'MESOTHELIOMA',
    label: 'Mesothelioma',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['EPITHELIOID', 'SARCOMATOID', 'BIPHASIC'], optionHelp: {
        EPITHELIOID: 'Epithelioid mesothelioma.',
        SARCOMATOID: 'Sarcomatoid mesothelioma.',
        BIPHASIC: 'Biphasic (mixed epithelioid + sarcomatoid) mesothelioma.',
      }, class: 'other' },
      primarySite: { kind: 'multi', label: 'Primary site', options: ['PLEURAL', 'PERITONEAL'], optionHelp: {
        PLEURAL: 'Pleural primary.',
        PERITONEAL: 'Peritoneal primary.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTABLE', 'UNRESECTABLE', 'METASTATIC'], optionHelp: {
        RESECTABLE: 'Resectable disease.',
        UNRESECTABLE: 'Unresectable locoregional disease.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      bap1Status: { kind: 'multi', label: 'BAP1 status', options: ['LOST', 'INTACT'], optionHelp: {
        LOST: 'BAP1 loss on IHC.',
        INTACT: 'BAP1 expression intact on IHC.',
      }, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    FLUOROPYRIMIDINE: '5-FU or capecitabine.',
    PLATINUM: 'Cisplatin or oxaliplatin.',
    IMMUNOTHERAPY: 'PD-1 inhibitor (nivolumab, pembrolizumab, tislelizumab).',
    HER2_DIRECTED_THERAPY: 'HER2-targeted therapy (trastuzumab, trastuzumab deruxtecan).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'GASTROESOPHAGEAL',
    label: 'Gastroesophageal',
    fields: {
      primarySiteHistology: { kind: 'multi', label: 'Primary site + histology', options: ['ESOPHAGEAL_SQUAMOUS', 'ESOPHAGEAL_ADENOCARCINOMA', 'GEJ_ADENOCARCINOMA', 'GASTRIC_ADENOCARCINOMA', 'OTHER'], optionHelp: {
        ESOPHAGEAL_SQUAMOUS: 'Squamous-cell esophageal carcinoma (typically proximal / mid esophagus).',
        ESOPHAGEAL_ADENOCARCINOMA: 'Esophageal adenocarcinoma (typically distal esophagus).',
        GEJ_ADENOCARCINOMA: 'Gastroesophageal junction adenocarcinoma.',
        GASTRIC_ADENOCARCINOMA: 'Gastric adenocarcinoma.',
        OTHER: 'Other gastric / GEJ / esophageal histology.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['NEOADJUVANT', 'PERIOPERATIVE', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        NEOADJUVANT: 'Pre-operative therapy for operable disease.',
        PERIOPERATIVE: 'Combined neoadjuvant and adjuvant therapy (e.g., FLOT).',
        LOCALLY_ADVANCED: 'Locally advanced, unresectable disease.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, optionHelp: {
        POSITIVE: 'HER2-positive by gastric/GEJ criteria — IHC 3+ or IHC 2+/ISH amplified.',
        NEGATIVE: 'HER2-negative by gastric/GEJ criteria — IHC <3+ and not ISH-amplified.',
      }, class: 'biomarker' },
      pdl1CpsCategory: { kind: 'multi', label: 'PD-L1 CPS category', options: ['HIGH_GE_10', 'INTERMEDIATE_1_9', 'NEGATIVE_LT_1'], optionHelp: {
        HIGH_GE_10: 'PD-L1 CPS ≥10.',
        INTERMEDIATE_1_9: 'PD-L1 CPS 1–9.',
        NEGATIVE_LT_1: 'PD-L1 CPS <1.',
      }, class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], optionHelp: {
        MSI_HIGH_DMMR: 'MSI-high by PCR or mismatch-repair deficient (dMMR) by IHC.',
        MSS_PMMR: 'Microsatellite stable / mismatch-repair proficient.',
      }, class: 'biomarker' },
      claudin18_2Status: { kind: 'multi', label: 'Claudin 18.2 status', options: POS_NEG, optionHelp: {
        POSITIVE: 'Claudin 18.2 expression ≥75% strong (2+/3+) staining on IHC.',
        NEGATIVE: 'Claudin 18.2 expression below the ≥75% 2+/3+ threshold.',
      }, helpText: 'Zolbetuximab eligibility (≥75% 2+/3+ IHC).', class: 'biomarker' },
      fgfr2bStatus: { kind: 'multi', label: 'FGFR2b status', options: ['OVEREXPRESSED', 'NEGATIVE'], optionHelp: {
        OVEREXPRESSED: 'FGFR2b protein overexpression on IHC.',
        NEGATIVE: 'No FGFR2b overexpression.',
      }, helpText: 'Bemarituzumab eligibility.', class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    SOMATOSTATIN_ANALOG: 'Octreotide or lanreotide.',
    CHEMOTHERAPY: 'Cytotoxic chemotherapy (e.g., CAPTEM, FOLFOX, platinum-etoposide).',
    PRRT: 'Peptide receptor radionuclide therapy (Lu-177 DOTATATE).',
    EVEROLIMUS: 'Everolimus — mTOR inhibitor.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'NEUROENDOCRINE',
    label: 'Neuroendocrine',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['PANCREATIC', 'GI_MIDGUT', 'GI_HINDGUT', 'LUNG', 'OTHER'], optionHelp: {
        PANCREATIC: 'Pancreatic NET.',
        GI_MIDGUT: 'Midgut NET (jejunum, ileum, appendix, proximal colon).',
        GI_HINDGUT: 'Hindgut NET (distal colon, rectum).',
        LUNG: 'Pulmonary NET / carcinoid.',
        OTHER: 'Other primary site or unknown primary.',
      }, class: 'other' },
      differentiation: { kind: 'multi', label: 'Differentiation', options: ['WELL_DIFFERENTIATED', 'POORLY_DIFFERENTIATED'], optionHelp: {
        WELL_DIFFERENTIATED: 'Well-differentiated neuroendocrine tumor (NET).',
        POORLY_DIFFERENTIATED: 'Poorly-differentiated neuroendocrine carcinoma (NEC).',
      }, class: 'other' },
      grade: { kind: 'multi', label: 'WHO grade', options: ['G1', 'G2', 'G3'], optionHelp: {
        G1: 'WHO grade 1 — Ki-67 <3%.',
        G2: 'WHO grade 2 — Ki-67 3–20%.',
        G3: 'WHO grade 3 — Ki-67 >20%.',
      }, class: 'other' },
      ki67Percent: { kind: 'number', label: 'Ki-67 (%)', helpText: 'Proliferation index as a percentage.', class: 'lab_cutoff' },
      functionalStatus: { kind: 'multi', label: 'Functional status', options: ['FUNCTIONAL', 'NON_FUNCTIONAL'], optionHelp: {
        FUNCTIONAL: 'Hormone-secreting / symptomatic NET (carcinoid syndrome, insulinoma, gastrinoma, etc.).',
        NON_FUNCTIONAL: 'Non-hormone-secreting NET.',
      }, class: 'other' },
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
  const therapyHelp: Record<string, string> = {
    FOLFIRINOX: 'FOLFIRINOX or modified FOLFIRINOX (5-FU / oxaliplatin / irinotecan).',
    GEMCITABINE_NABPACLITAXEL: 'Gemcitabine + nab-paclitaxel.',
    IMMUNOTHERAPY: 'PD-1 / PD-L1 checkpoint inhibitor.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'PANCREATIC',
    label: 'Pancreatic',
    fields: {
      resectability: { kind: 'multi', label: 'Resectability', options: ['RESECTABLE', 'BORDERLINE', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        RESECTABLE: 'Clearly resectable at presentation.',
        BORDERLINE: 'Borderline resectable — abuts but does not encase major vessels.',
        LOCALLY_ADVANCED: 'Locally advanced / unresectable.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      histology: { kind: 'multi', label: 'Histology', options: ['ADENOCARCINOMA', 'OTHER'], optionHelp: {
        ADENOCARCINOMA: 'Pancreatic ductal adenocarcinoma (PDAC).',
        OTHER: 'Other histology (acinar, NEC, etc.).',
      }, helpText: 'Pancreatic NETs go in the neuroendocrine block.', class: 'other' },
      krasStatus: { kind: 'multi', label: 'KRAS status', options: ['G12C', 'G12D', 'OTHER_KRAS', 'WILD_TYPE'], optionHelp: {
        G12C: 'KRAS G12C point mutation.',
        G12D: 'KRAS G12D point mutation.',
        OTHER_KRAS: 'KRAS mutation other than G12C or G12D (G12V, G12R, Q61H, etc.).',
        WILD_TYPE: 'KRAS wild-type.',
      }, class: 'biomarker' },
      brcaStatus: { kind: 'multi', label: 'BRCA status', options: ['GERMLINE', 'SOMATIC', 'NEGATIVE'], optionHelp: {
        GERMLINE: 'Germline BRCA1/2 pathogenic variant.',
        SOMATIC: 'Somatic (tumor-only) BRCA1/2 pathogenic variant.',
        NEGATIVE: 'No BRCA1/2 pathogenic variant.',
      }, class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], optionHelp: {
        MSI_HIGH_DMMR: 'MSI-high by PCR or mismatch-repair deficient (dMMR) by IHC.',
        MSS_PMMR: 'Microsatellite stable / mismatch-repair proficient.',
      }, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    RADIOTHERAPY: 'Brain radiotherapy.',
    TEMOZOLOMIDE: 'Temozolomide chemotherapy.',
    BEVACIZUMAB: 'Bevacizumab — anti-VEGF antibody.',
    TTFIELDS: 'Tumor-treating fields (Optune) — alternating electric field therapy.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'CNS',
    label: 'CNS / glioma',
    fields: {
      histology: { kind: 'multi', label: 'Histology', options: ['GLIOBLASTOMA', 'ASTROCYTOMA', 'OLIGODENDROGLIOMA', 'EPENDYMOMA', 'MEDULLOBLASTOMA', 'MENINGIOMA', 'OTHER'], optionHelp: {
        GLIOBLASTOMA: 'Glioblastoma (IDH-wildtype, WHO grade 4).',
        ASTROCYTOMA: 'Astrocytoma (IDH-mutant, grades 2–4).',
        OLIGODENDROGLIOMA: 'Oligodendroglioma (IDH-mutant, 1p/19q-codeleted, grades 2–3).',
        EPENDYMOMA: 'Ependymoma.',
        MEDULLOBLASTOMA: 'Medulloblastoma.',
        MENINGIOMA: 'Meningioma.',
        OTHER: 'Other CNS tumor.',
      }, class: 'other' },
      whoGrade: { kind: 'multi', label: 'WHO grade', options: ['1', '2', '3', '4'], optionHelp: {
        '1': 'WHO grade 1 — slow-growing tumor.',
        '2': 'WHO grade 2 — low-grade tumor.',
        '3': 'WHO grade 3 — anaplastic / intermediate-grade tumor.',
        '4': 'WHO grade 4 — high-grade tumor (includes glioblastoma).',
      }, class: 'other' },
      diseaseStatus: { kind: 'multi', label: 'Disease status', options: ['NEWLY_DIAGNOSED', 'RECURRENT_PROGRESSIVE'], optionHelp: {
        NEWLY_DIAGNOSED: 'Newly diagnosed disease, post-operative and pre-systemic-treatment.',
        RECURRENT_PROGRESSIVE: 'Recurrent or progressive disease after prior treatment.',
      }, class: 'other' },
      idhStatus: { kind: 'multi', label: 'IDH status', options: ['MUTANT', 'WILD_TYPE'], optionHelp: {
        MUTANT: 'IDH1 or IDH2 mutant tumor (typically R132H in IDH1).',
        WILD_TYPE: 'IDH wild-type tumor.',
      }, class: 'biomarker' },
      codeletion1p19q: { kind: 'bool', label: '1p/19q co-deletion', class: 'biomarker' },
      mgmtMethylated: { kind: 'bool', label: 'MGMT methylated', class: 'biomarker' },
      egfrAmplified: { kind: 'bool', label: 'EGFR amplified / EGFRvIII', class: 'biomarker' },
      atrxLoss: { kind: 'bool', label: 'ATRX loss', class: 'biomarker' },
      braf600eMutated: { kind: 'bool', label: 'BRAF V600E mutated', class: 'biomarker' },
      measurableDiseaseRano: { kind: 'bool', label: 'Measurable disease (RANO)', class: 'other' },
      resectionExtent: { kind: 'multi', label: 'Resection extent', options: ['BIOPSY_ONLY', 'SUBTOTAL', 'GROSS_TOTAL'], optionHelp: {
        BIOPSY_ONLY: 'Biopsy only, no surgical resection.',
        SUBTOTAL: 'Subtotal resection with residual tumor on post-op imaging.',
        GROSS_TOTAL: 'Gross total resection with no residual tumor on post-op imaging.',
      }, class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

const hcc: BlockDef = (() => {
  const therapies = ['ATEZOLIZUMAB_BEVACIZUMAB', 'TKI', 'IMMUNOTHERAPY', 'TRANSARTERIAL_THERAPY'];
  const therapyHelp: Record<string, string> = {
    ATEZOLIZUMAB_BEVACIZUMAB: 'Atezolizumab + bevacizumab combination.',
    TKI: 'Multikinase tyrosine kinase inhibitor (sorafenib, lenvatinib, regorafenib, cabozantinib).',
    IMMUNOTHERAPY: 'Checkpoint inhibitor (nivolumab, pembrolizumab, durvalumab + tremelimumab).',
    TRANSARTERIAL_THERAPY: 'Transarterial therapy — TACE, TARE, or Y-90 radioembolization.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'HCC',
    label: 'Hepatocellular carcinoma',
    fields: {
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTABLE', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        RESECTABLE: 'Resectable or transplant-eligible disease.',
        LOCALLY_ADVANCED: 'Locally advanced / unresectable, non-metastatic disease.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      childPughClass: { kind: 'multi', label: 'Child-Pugh class', options: ['A', 'B', 'C'], optionHelp: {
        A: 'Child-Pugh A — preserved liver function (5–6 points).',
        B: 'Child-Pugh B — moderate liver impairment (7–9 points).',
        C: 'Child-Pugh C — severe liver impairment (10–15 points).',
      }, helpText: 'Key HCC eligibility gate.', class: 'lab_cutoff' },
      bclcStage: { kind: 'multi', label: 'BCLC stage', options: ['0', 'A', 'B', 'C', 'D'], optionHelp: {
        '0': 'BCLC 0 — very early stage (single tumor <2 cm, preserved liver function).',
        A: 'BCLC A — early stage (single tumor or up to 3 tumors ≤3 cm).',
        B: 'BCLC B — intermediate stage (multinodular, preserved liver function).',
        C: 'BCLC C — advanced stage (vascular invasion or extrahepatic spread).',
        D: 'BCLC D — terminal stage (decompensated cirrhosis, PS 3–4).',
      }, class: 'other' },
      viralHepatitisStatus: { kind: 'multi', label: 'Viral hepatitis status', options: ['HBV', 'HCV', 'NONE'], optionHelp: {
        HBV: 'Hepatitis B-associated.',
        HCV: 'Hepatitis C-associated.',
        NONE: 'Neither HBV nor HCV (NAFLD, alcohol, etc.).',
      }, class: 'other' },
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
  const therapyHelp: Record<string, string> = {
    GEMCITABINE_CISPLATIN: 'Gemcitabine + cisplatin combination.',
    IMMUNOTHERAPY: 'PD-1 / PD-L1 inhibitor (durvalumab, pembrolizumab).',
    FGFR_INHIBITOR: 'FGFR inhibitor (pemigatinib, futibatinib, infigratinib).',
    IDH1_INHIBITOR: 'IDH1 inhibitor (ivosidenib).',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'BILIARY',
    label: 'Biliary tract',
    fields: {
      primarySite: { kind: 'multi', label: 'Primary site', options: ['INTRAHEPATIC_CHOLANGIO', 'EXTRAHEPATIC_CHOLANGIO', 'GALLBLADDER', 'AMPULLARY'], optionHelp: {
        INTRAHEPATIC_CHOLANGIO: 'Intrahepatic cholangiocarcinoma.',
        EXTRAHEPATIC_CHOLANGIO: 'Extrahepatic cholangiocarcinoma (perihilar / Klatskin or distal).',
        GALLBLADDER: 'Gallbladder carcinoma.',
        AMPULLARY: 'Ampulla of Vater carcinoma.',
      }, class: 'other' },
      diseaseSetting: { kind: 'multi', label: 'Disease setting', options: ['RESECTABLE', 'LOCALLY_ADVANCED', 'METASTATIC'], optionHelp: {
        RESECTABLE: 'Resectable disease.',
        LOCALLY_ADVANCED: 'Locally advanced / unresectable.',
        METASTATIC: 'Distant metastatic disease.',
      }, class: 'other' },
      fgfr2Status: { kind: 'multi', label: 'FGFR2 status', options: ['FUSION', 'WILD_TYPE'], optionHelp: {
        FUSION: 'FGFR2 gene fusion present.',
        WILD_TYPE: 'No FGFR2 fusion.',
      }, class: 'biomarker' },
      idh1Status: { kind: 'multi', label: 'IDH1 status', options: ['MUTANT', 'WILD_TYPE'], optionHelp: {
        MUTANT: 'IDH1 mutation present.',
        WILD_TYPE: 'IDH1 wild-type.',
      }, class: 'biomarker' },
      her2Status: { kind: 'multi', label: 'HER2 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
      brafStatus: { kind: 'multi', label: 'BRAF status', options: ['V600E', 'WILD_TYPE'], optionHelp: {
        V600E: 'BRAF V600E point mutation.',
        WILD_TYPE: 'BRAF wild-type.',
      }, class: 'biomarker' },
      krasStatus: { kind: 'multi', label: 'KRAS status', options: ['G12C', 'OTHER_KRAS', 'WILD_TYPE'], optionHelp: {
        G12C: 'KRAS G12C point mutation.',
        OTHER_KRAS: 'KRAS mutation other than G12C.',
        WILD_TYPE: 'KRAS wild-type.',
      }, class: 'biomarker' },
      msiStatus: { kind: 'multi', label: 'MSI / MMR status', options: ['MSI_HIGH_DMMR', 'MSS_PMMR'], optionHelp: {
        MSI_HIGH_DMMR: 'MSI-high by PCR or mismatch-repair deficient (dMMR) by IHC.',
        MSS_PMMR: 'Microsatellite stable / mismatch-repair proficient.',
      }, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    ANTI_CD20: 'Anti-CD20 monoclonal antibody (rituximab, obinutuzumab, etc.).',
    ANTI_CD19: 'Anti-CD19 therapy (loncastuximab tesirine, tafasitamab — not CAR-T).',
    BTK_INHIBITOR: 'Bruton tyrosine kinase inhibitor (ibrutinib, acalabrutinib, zanubrutinib, pirtobrutinib).',
    BCL2_INHIBITOR: 'BCL2 inhibitor (venetoclax).',
    ANTHRACYCLINE: 'Anthracycline-containing combination (CHOP, R-CHOP, Pola-R-CHP, etc.).',
    BISPECIFIC: 'Bispecific T-cell engager (mosunetuzumab, glofitamab, epcoritamab).',
    CAR_T: 'CD19-directed CAR-T (axi-cel, tisa-cel, liso-cel, brexu-cel).',
    AUTO_TRANSPLANT: 'Autologous stem-cell transplant.',
    ALLO_TRANSPLANT: 'Allogeneic stem-cell transplant.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'MATURE_B_CELL',
    label: 'Mature B-cell lymphoma',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['DLBCL_NOS', 'HGBCL', 'HGBCL_DH_TH', 'PMBCL', 'DLBCL_LEG_TYPE', 'TCRBCL', 'TRANSFORMED_FL', 'TRANSFORMED_MZL', 'RICHTER', 'FL', 'MCL', 'MZL', 'CHL', 'CLL_SLL', 'WALDENSTROM', 'HCL', 'OTHER'], optionHelp: {
        DLBCL_NOS: 'Diffuse large B-cell lymphoma, NOS.',
        HGBCL: 'High-grade B-cell lymphoma.',
        HGBCL_DH_TH: 'High-grade B-cell lymphoma with MYC and BCL2 / BCL6 rearrangements (double / triple-hit).',
        PMBCL: 'Primary mediastinal B-cell lymphoma.',
        DLBCL_LEG_TYPE: 'Primary cutaneous DLBCL, leg type.',
        TCRBCL: 'T-cell / histiocyte-rich large B-cell lymphoma.',
        TRANSFORMED_FL: 'Transformed follicular lymphoma.',
        TRANSFORMED_MZL: 'Transformed marginal zone lymphoma.',
        RICHTER: 'Richter transformation (DLBCL arising from CLL/SLL).',
        FL: 'Follicular lymphoma.',
        MCL: 'Mantle cell lymphoma.',
        MZL: 'Marginal zone lymphoma (splenic, nodal, or extranodal / MALT).',
        CHL: 'Classical Hodgkin lymphoma.',
        CLL_SLL: 'Chronic lymphocytic leukemia / small lymphocytic lymphoma.',
        WALDENSTROM: 'Waldenström macroglobulinemia / lymphoplasmacytic lymphoma.',
        HCL: 'Hairy cell leukemia.',
        OTHER: 'Other mature B-cell neoplasm.',
      }, helpText: 'List every disease subtype the trial enrolls. High-consequence scoping field.', class: 'accepted_diseases' },
      cellOfOrigin: { kind: 'multi', label: 'Cell of origin (DLBCL)', options: ['GCB', 'NON_GCB_ABC'], optionHelp: {
        GCB: 'Germinal-center B-cell-like.',
        NON_GCB_ABC: 'Non-GCB / activated B-cell-like.',
      }, class: 'biomarker' },
      doubleOrTripleHit: { kind: 'bool', label: 'Double / triple hit', helpText: 'MYC + BCL2 or BCL6 rearrangement.', class: 'biomarker' },
      ighvStatus: { kind: 'multi', label: 'IGHV status (CLL)', options: ['MUTATED', 'UNMUTATED'], optionHelp: {
        MUTATED: 'IGHV gene somatically mutated.',
        UNMUTATED: 'IGHV gene unmutated (germline-configuration).',
      }, class: 'biomarker' },
      del17pOrTp53Mutated: { kind: 'bool', label: 'del(17p) or TP53 mutated', class: 'biomarker' },
      myd88Status: { kind: 'multi', label: 'MYD88 status', options: ['L265P', 'WILD_TYPE'], optionHelp: {
        L265P: 'MYD88 L265P point mutation.',
        WILD_TYPE: 'MYD88 wild-type.',
      }, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    BRENTUXIMAB: 'Brentuximab vedotin — anti-CD30 antibody-drug conjugate.',
    MOGAMULIZUMAB: 'Mogamulizumab — anti-CCR4 monoclonal antibody.',
    CHEMOTHERAPY: 'Combination chemotherapy (CHOP, CHOEP, BV-CHP, etc.).',
    AUTO_TRANSPLANT: 'Autologous stem-cell transplant.',
    ALLO_TRANSPLANT: 'Allogeneic stem-cell transplant.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'MATURE_T_NK_CELL',
    label: 'Mature T / NK-cell lymphoma',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['PTCL_NOS', 'AITL', 'ALCL_ALK_POS', 'ALCL_ALK_NEG', 'CTCL_MF', 'CTCL_SS', 'NK_T', 'HSTCL', 'MEITL', 'EATL', 'ATL', 'OTHER'], optionHelp: {
        PTCL_NOS: 'Peripheral T-cell lymphoma, NOS.',
        AITL: 'Angioimmunoblastic T-cell lymphoma.',
        ALCL_ALK_POS: 'Anaplastic large-cell lymphoma, ALK-positive.',
        ALCL_ALK_NEG: 'Anaplastic large-cell lymphoma, ALK-negative.',
        CTCL_MF: 'Cutaneous T-cell lymphoma — mycosis fungoides.',
        CTCL_SS: 'Cutaneous T-cell lymphoma — Sézary syndrome.',
        NK_T: 'Extranodal NK/T-cell lymphoma, nasal type.',
        HSTCL: 'Hepatosplenic T-cell lymphoma.',
        MEITL: 'Monomorphic epitheliotropic intestinal T-cell lymphoma.',
        EATL: 'Enteropathy-associated T-cell lymphoma.',
        ATL: 'Adult T-cell leukemia / lymphoma (HTLV-1 associated).',
        OTHER: 'Other mature T- or NK-cell neoplasm.',
      }, class: 'accepted_diseases' },
      atlSubtype: { kind: 'multi', label: 'ATL subtype', options: ['ACUTE', 'LYMPHOMATOUS', 'CHRONIC', 'SMOLDERING'], optionHelp: {
        ACUTE: 'Acute ATL — leukemic, aggressive course.',
        LYMPHOMATOUS: 'Lymphomatous ATL — predominantly nodal disease.',
        CHRONIC: 'Chronic ATL — indolent course.',
        SMOLDERING: 'Smoldering ATL — indolent, low tumor burden.',
      }, class: 'other' },
      htlv1Status: { kind: 'multi', label: 'HTLV-1 status', options: POS_NEG, optionHelp: POS_NEG_HELP, class: 'biomarker' },
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
  const therapyHelp: Record<string, string> = {
    HMA: 'Hypomethylating agent (azacitidine, decitabine, oral decitabine-cedazuridine).',
    VENETOCLAX: 'BCL2 inhibitor (venetoclax).',
    INTENSIVE_CHEMOTHERAPY: 'Intensive induction (7+3 daunorubicin/cytarabine, FLAG-Ida, etc.).',
    FLT3_INHIBITOR: 'FLT3 inhibitor (midostaurin, gilteritinib, quizartinib).',
    IDH_INHIBITOR: 'IDH1 inhibitor (ivosidenib) or IDH2 inhibitor (enasidenib).',
    MENIN_INHIBITOR: 'Menin inhibitor (revumenib, ziftomenib).',
    JAK_INHIBITOR: 'JAK inhibitor (ruxolitinib, fedratinib, momelotinib, pacritinib).',
    BCR_ABL_TKI: 'BCR-ABL TKI (imatinib, dasatinib, nilotinib, bosutinib, ponatinib, asciminib).',
    ALLO_TRANSPLANT: 'Allogeneic stem-cell transplant.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'MYELOID_NEOPLASM',
    label: 'Myeloid neoplasm',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['AML', 'MDS', 'CMML', 'MDS_MPN', 'MPN_PV', 'MPN_ET', 'MPN_MF', 'CML', 'OTHER'], optionHelp: {
        AML: 'Acute myeloid leukemia.',
        MDS: 'Myelodysplastic syndrome.',
        CMML: 'Chronic myelomonocytic leukemia.',
        MDS_MPN: 'MDS / MPN overlap syndrome.',
        MPN_PV: 'Polycythemia vera.',
        MPN_ET: 'Essential thrombocythemia.',
        MPN_MF: 'Myelofibrosis (primary or post-PV/ET).',
        CML: 'Chronic myeloid leukemia.',
        OTHER: 'Other myeloid neoplasm.',
      }, class: 'accepted_diseases' },
      amlClassification: { kind: 'multi', label: 'AML classification', options: ['DE_NOVO', 'SECONDARY', 'THERAPY_RELATED'], optionHelp: {
        DE_NOVO: 'De novo AML — no antecedent hematologic disorder or cytotoxic exposure.',
        SECONDARY: 'Secondary AML — arising from a prior MDS, MPN, or aplastic anemia.',
        THERAPY_RELATED: 'Therapy-related AML — arising after prior cytotoxic chemotherapy or radiation.',
      }, class: 'other' },
      elnRisk: { kind: 'multi', label: 'ELN 2022 risk', options: ['FAVORABLE', 'INTERMEDIATE', 'ADVERSE'], optionHelp: {
        FAVORABLE: 'ELN 2022 favorable risk.',
        INTERMEDIATE: 'ELN 2022 intermediate risk.',
        ADVERSE: 'ELN 2022 adverse risk.',
      }, class: 'other' },
      flt3Status: { kind: 'multi', label: 'FLT3 status', options: ['ITD', 'TKD', 'WILD_TYPE'], optionHelp: {
        ITD: 'FLT3 internal tandem duplication.',
        TKD: 'FLT3 tyrosine kinase domain mutation (e.g., D835).',
        WILD_TYPE: 'FLT3 wild-type.',
      }, class: 'biomarker' },
      npm1Mutated: { kind: 'bool', label: 'NPM1 mutated', class: 'biomarker' },
      idh1Mutated: { kind: 'bool', label: 'IDH1 mutated', class: 'biomarker' },
      idh2Mutated: { kind: 'bool', label: 'IDH2 mutated', class: 'biomarker' },
      kmt2aRearranged: { kind: 'bool', label: 'KMT2A (MLL) rearranged', class: 'biomarker' },
      ipssR: { kind: 'multi', label: 'IPSS-R (MDS)', options: ['VERY_LOW', 'LOW', 'INT', 'HIGH', 'VERY_HIGH'], optionHelp: {
        VERY_LOW: 'IPSS-R very low risk.',
        LOW: 'IPSS-R low risk.',
        INT: 'IPSS-R intermediate risk.',
        HIGH: 'IPSS-R high risk.',
        VERY_HIGH: 'IPSS-R very high risk.',
      }, class: 'other' },
      ipssM: { kind: 'multi', label: 'IPSS-M (MDS)', options: ['VERY_LOW', 'LOW', 'MODERATE_LOW', 'MODERATE_HIGH', 'HIGH', 'VERY_HIGH'], optionHelp: {
        VERY_LOW: 'IPSS-M very low risk.',
        LOW: 'IPSS-M low risk.',
        MODERATE_LOW: 'IPSS-M moderate-low risk.',
        MODERATE_HIGH: 'IPSS-M moderate-high risk.',
        HIGH: 'IPSS-M high risk.',
        VERY_HIGH: 'IPSS-M very high risk.',
      }, class: 'other' },
      minBlastsPercent: { kind: 'number', label: 'Min bone-marrow blasts (%)', class: 'lab_cutoff' },
      maxBlastsPercent: { kind: 'number', label: 'Max bone-marrow blasts (%)', class: 'lab_cutoff' },
      ringSideroblasts: { kind: 'bool', label: 'Ring sideroblasts', class: 'other' },
      sf3b1Mutated: { kind: 'bool', label: 'SF3B1 mutated', class: 'biomarker' },
      jak2Status: { kind: 'multi', label: 'JAK2 status', options: ['V617F', 'EXON12', 'WILD_TYPE'], optionHelp: {
        V617F: 'JAK2 V617F point mutation.',
        EXON12: 'JAK2 exon 12 mutation.',
        WILD_TYPE: 'JAK2 wild-type.',
      }, class: 'biomarker' },
      calrMutated: { kind: 'bool', label: 'CALR mutated', class: 'biomarker' },
      mplMutated: { kind: 'bool', label: 'MPL mutated', class: 'biomarker' },
      bcrAblStatus: { kind: 'multi', label: 'BCR-ABL status (CML)', options: POS_NEG, optionHelp: {
        POSITIVE: 'BCR-ABL1 fusion present (Philadelphia chromosome).',
        NEGATIVE: 'No BCR-ABL1 fusion.',
      }, class: 'biomarker' },
      cmlPhase: { kind: 'multi', label: 'CML phase', options: ['CHRONIC', 'ACCELERATED', 'BLAST'], optionHelp: {
        CHRONIC: 'Chronic phase CML.',
        ACCELERATED: 'Accelerated phase CML.',
        BLAST: 'Blast phase CML — myeloid or lymphoid.',
      }, class: 'other' },
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
  const therapyHelp: Record<string, string> = {
    BLINATUMOMAB: 'Blinatumomab — CD19/CD3 bispecific T-cell engager.',
    INOTUZUMAB: 'Inotuzumab ozogamicin — anti-CD22 antibody-drug conjugate.',
    CAR_T: 'CD19-directed CAR-T (tisagenlecleucel, brexucabtagene autoleucel).',
    BCR_ABL_TKI: 'BCR-ABL TKI (imatinib, dasatinib, nilotinib, ponatinib, asciminib).',
    ALLO_TRANSPLANT: 'Allogeneic stem-cell transplant.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'PRECURSOR_LYMPHOID',
    label: 'Precursor lymphoid (ALL / LBL)',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['B_ALL', 'T_ALL', 'LBL_B', 'LBL_T', 'OTHER'], optionHelp: {
        B_ALL: 'B-cell acute lymphoblastic leukemia.',
        T_ALL: 'T-cell acute lymphoblastic leukemia.',
        LBL_B: 'B-cell lymphoblastic lymphoma.',
        LBL_T: 'T-cell lymphoblastic lymphoma.',
        OTHER: 'Other precursor lymphoid neoplasm.',
      }, class: 'accepted_diseases' },
      philadelphiaStatus: { kind: 'multi', label: 'Philadelphia status', options: ['POSITIVE', 'PH_LIKE', 'NEGATIVE'], optionHelp: {
        POSITIVE: 'Philadelphia chromosome / BCR-ABL1 fusion present (Ph+ ALL).',
        PH_LIKE: 'Ph-like ALL — gene-expression signature similar to Ph+ but BCR-ABL1 negative.',
        NEGATIVE: 'Ph-negative ALL.',
      }, class: 'biomarker' },
      cd19Positive: { kind: 'bool', label: 'CD19+', class: 'biomarker' },
      cd22Positive: { kind: 'bool', label: 'CD22+', class: 'biomarker' },
      cd7Positive: { kind: 'bool', label: 'CD7+ (T-ALL)', class: 'biomarker' },
      mrdStatus: { kind: 'multi', label: 'MRD status', options: POS_NEG, optionHelp: {
        POSITIVE: 'Measurable residual disease detectable post-induction (typically by flow cytometry or NGS).',
        NEGATIVE: 'MRD undetectable.',
      }, class: 'biomarker' },
      cnsStatus: { kind: 'multi', label: 'CNS status', options: ['CNS1', 'CNS2', 'CNS3'], optionHelp: {
        CNS1: 'CNS1 — no blasts in CSF.',
        CNS2: 'CNS2 — blasts in CSF but <5 WBC/μL.',
        CNS3: 'CNS3 — ≥5 WBC/μL with blasts or cranial nerve palsy.',
      }, class: 'other' },
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
  const therapyHelp: Record<string, string> = {
    IMID: 'Immunomodulatory drug (lenalidomide, pomalidomide, thalidomide).',
    PROTEASOME_INHIBITOR: 'Proteasome inhibitor (bortezomib, carfilzomib, ixazomib).',
    ANTI_CD38: 'Anti-CD38 antibody (daratumumab, isatuximab).',
    BCMA_THERAPY: 'BCMA-directed therapy (belantamab mafodotin, ide-cel, cilta-cel).',
    BISPECIFIC: 'BCMA or GPRC5D bispecific (teclistamab, elranatamab, talquetamab).',
    AUTO_TRANSPLANT: 'Autologous stem-cell transplant.',
    ALLO_TRANSPLANT: 'Allogeneic stem-cell transplant.',
  };
  const pt = priorTherapyPair(therapies, therapyHelp);
  return {
    key: 'PLASMA_CELL',
    label: 'Plasma cell',
    fields: {
      acceptedDiseases: { kind: 'multi', label: 'Accepted diseases', options: ['MM', 'PCL', 'PLASMACYTOMA', 'AL_AMYLOIDOSIS', 'WALDENSTROM_LPL', 'POEMS', 'OTHER'], optionHelp: {
        MM: 'Multiple myeloma.',
        PCL: 'Plasma cell leukemia.',
        PLASMACYTOMA: 'Solitary plasmacytoma.',
        AL_AMYLOIDOSIS: 'AL (light-chain) amyloidosis.',
        WALDENSTROM_LPL: 'Waldenström macroglobulinemia / lymphoplasmacytic lymphoma.',
        POEMS: 'POEMS syndrome.',
        OTHER: 'Other plasma cell neoplasm.',
      }, class: 'accepted_diseases' },
      rissStage: { kind: 'multi', label: 'R-ISS stage (MM)', options: ['I', 'II', 'III'], optionHelp: {
        I: 'R-ISS stage I.',
        II: 'R-ISS stage II.',
        III: 'R-ISS stage III.',
      }, class: 'other' },
      highRiskCytogenetics: { kind: 'bool', label: 'High-risk cytogenetics', helpText: 'del(17p), t(4;14), t(14;16), gain 1q.', class: 'biomarker' },
      measurableDiseaseImwg: { kind: 'bool', label: 'Measurable disease (IMWG)', helpText: 'IMWG measurable disease — any one of: serum M-protein ≥1 g/dL; urine M-protein ≥200 mg/24h; or serum free light chain (FLC) ≥10 mg/dL with an abnormal κ/λ ratio (the difference between involved and uninvolved FLC levels must also be ≥10 mg/dL).', class: 'other' },
      extramedullaryDisease: { kind: 'bool', label: 'Extramedullary disease', class: 'other' },
      cnsInvolvement: { kind: 'bool', label: 'CNS involvement', class: 'other' },
      amyloidCardiacInvolvement: { kind: 'bool', label: 'Amyloid cardiac involvement', class: 'other' },
      amyloidMayoStage: { kind: 'multi', label: 'AL amyloid Mayo stage', options: ['I', 'II', 'III', 'IIIA', 'IIIB'], optionHelp: {
        I: 'Mayo stage I (2004 or 2012 system).',
        II: 'Mayo stage II.',
        III: 'Mayo stage III.',
        IIIA: 'Mayo stage IIIA (2012) — stage III without severe cardiac dysfunction.',
        IIIB: 'Mayo stage IIIB (2012) — NT-proBNP ≥8500 pg/mL.',
      }, class: 'other' },
      priorTherapyRequired: pt.required,
      priorTherapyExcluded: pt.excluded,
      minPriorSystemicLines: minLines(),
      maxPriorSystemicLines: maxLines(),
    },
  };
})();

// OTHER — basket catch-all. No descriptor fields. Still a valid value in
// cancerTypes[] and a valid key in cohort.applicableCancerTypes (mapped to
// {}). Inner field loops naturally yield zero iterations for OTHER.
const other: BlockDef = {
  key: 'OTHER',
  label: 'Other (basket)',
  fields: {},
};

// ──────────────────────────────────────────────────────────────────────────
// Registry
// ──────────────────────────────────────────────────────────────────────────

export const BLOCKS: Record<CancerType, BlockDef> = {
  PROSTATE: prostate, UROTHELIAL: urothelial, RCC: rcc, TESTICULAR: testicular,
  BREAST: breast, LUNG: lung, COLORECTAL: colorectal, HEAD_AND_NECK: head_and_neck,
  OVARIAN: ovarian, UTERINE: uterine, CERVICAL: cervical, MELANOMA: melanoma,
  MESOTHELIOMA: mesothelioma, GASTROESOPHAGEAL: gastroesophageal,
  NEUROENDOCRINE: neuroendocrine, PANCREATIC: pancreatic, CNS: cns, HCC: hcc, BILIARY: biliary,
  MATURE_B_CELL: mature_b_cell, MATURE_T_NK_CELL: mature_t_nk_cell,
  MYELOID_NEOPLASM: myeloid_neoplasm, PRECURSOR_LYMPHOID: precursor_lymphoid,
  PLASMA_CELL: plasma_cell, OTHER: other,
};

export const ALL_BLOCKS: BlockDef[] = Object.values(BLOCKS);

// Iterate every field in every block with stable identification.
export function* iterAllFields(): IterableIterator<{
  cancerType: CancerType;
  fieldKey: string;
  def: FieldDef;
}> {
  for (const block of ALL_BLOCKS) {
    for (const [fieldKey, def] of Object.entries(block.fields)) {
      yield { cancerType: block.key, fieldKey, def };
    }
  }
}

export function fieldsByClass(klass: FieldClass): Array<{ cancerType: CancerType; fieldKey: string }> {
  const out: Array<{ cancerType: CancerType; fieldKey: string }> = [];
  for (const { cancerType, fieldKey, def } of iterAllFields()) {
    if (def.class === klass) out.push({ cancerType, fieldKey });
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
