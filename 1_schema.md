# TEMPO Cancer-Type Schema

Structured eligibility-variable schema extracted per cancer type from ClinicalTrials.gov
trial participation criteria. Each cancer type is keyed in `SCHEMA_SECTIONS`.

## Conventions

- **Categorical fields**: `["A" | "B" | ...] | null` — `null` = trial does not constrain this field; a populated array lists all values the trial accepts.
- **Boolean fields**: `boolean | null` — `null` = not specified by the trial.
- **Numeric fields**: `number | null` — `null` = not specified.
- **Prior therapy**: paired `priorTherapyRequired` / `priorTherapyExcluded` arrays drawn from a shared per-cancer therapy enum. A therapy absent from both arrays is unconstrained.
- Inline `//` comments describe each field's clinical meaning.

```typescript
const SCHEMA_SECTIONS: Record<string, string> = {
  prostate: `  "prostate": {
    "castrationStatus": ["SENSITIVE" | "RESISTANT"] | null, // Castration sensitivity to ADT (CSPC vs CRPC)
    "metastaticStatus": ["METASTATIC" | "NON_METASTATIC"] | null, // Presence of radiographic metastatic disease
    "histology": ["ADENOCARCINOMA" | "NEUROENDOCRINE_SMALL_CELL"] | null, // Adenocarcinoma vs neuroendocrine/small-cell (de novo or treatment-emergent)
    "visceralMetastases": boolean | null, // Visceral (non-bone, non-LN) metastases — liver, lung, etc.
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "psmaPetPositive": boolean | null, // PSMA PET positive (eligibility for PSMA-targeted radioligand therapy)
    "hrrStatus": ["BRCA1" | "BRCA2" | "OTHER_HRR" | "NEGATIVE"] | null, // Homologous recombination repair gene alteration status
    "msiStatus": ["MSI_HIGH" | "MSS"] | null, // Microsatellite instability / mismatch repair status
    "priorTherapyRequired": ["ARPI" | "TAXANE" | "PSMA_RADIOLIGAND" | "PARPI"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["ARPI" | "TAXANE" | "PSMA_RADIOLIGAND" | "PARPI"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  urothelial: `  "urothelial": {
    "diseaseSetting": ["NMIBC" | "MIBC" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Disease extent (NMIBC, MIBC, advanced)
    "site": ["BLADDER" | "UPPER_TRACT" | "URETHRAL"] | null, // Anatomic primary site within the urinary tract
    "histology": ["PURE_UROTHELIAL" | "VARIANT_HISTOLOGY" | "PURE_SQUAMOUS" | "PURE_NEUROENDOCRINE"] | null, // Pure urothelial vs variant histology vs pure non-urothelial subtypes
    "cisPresent": boolean | null, // Carcinoma in situ component present
    "bcgStatus": ["NAIVE" | "EXPOSED" | "UNRESPONSIVE"] | null, // Prior intravesical BCG exposure and response
    "cisplatinEligible": boolean | null, // Meets cisplatin eligibility (renal function, ECOG, hearing, neuropathy)
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "fgfr3Status": ["ALTERED" | "WILD_TYPE"] | null, // FGFR3 activating alteration (mutation or fusion)
    "pdl1Status": ["POSITIVE" | "NEGATIVE"] | null, // PD-L1 expression status
    "her2Status": ["POSITIVE" | "NEGATIVE"] | null, // HER2 expression status
    "nectin4Status": ["POSITIVE" | "NEGATIVE"] | null, // Nectin-4 expression (target for enfortumab vedotin)
    "priorTherapyRequired": ["PLATINUM" | "IMMUNOTHERAPY" | "ENFORTUMAB_VEDOTIN" | "FGFR3_INHIBITOR" | "RADICAL_CYSTECTOMY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["PLATINUM" | "IMMUNOTHERAPY" | "ENFORTUMAB_VEDOTIN" | "FGFR3_INHIBITOR" | "RADICAL_CYSTECTOMY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  rcc: `  "rcc": {
    "histologySubtype": ["CLEAR_CELL" | "PAPILLARY" | "CHROMOPHOBE" | "OTHER_NON_CLEAR_CELL"] | null, // Major histologic subtype
    "sarcomatoidFeatures": boolean | null, // Sarcomatoid differentiation present
    "diseaseSetting": ["LOCALIZED" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Disease extent at enrollment
    "imdcRisk": ["FAVORABLE" | "INTERMEDIATE" | "POOR"] | null, // IMDC prognostic risk category
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "cnsMetastases": ["ABSENT" | "TREATED_STABLE" | "ACTIVE"] | null, // CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression
    "priorTherapyRequired": ["NEPHRECTOMY" | "VEGF_TKI" | "IMMUNOTHERAPY_METASTATIC" | "IMMUNOTHERAPY_ADJUVANT" | "HIF2A_INHIBITOR" | "MTOR_INHIBITOR"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["NEPHRECTOMY" | "VEGF_TKI" | "IMMUNOTHERAPY_METASTATIC" | "IMMUNOTHERAPY_ADJUVANT" | "HIF2A_INHIBITOR" | "MTOR_INHIBITOR"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  testicular: `  "testicular": {
    "histology": ["SEMINOMA" | "NON_SEMINOMA"] | null, // Pure seminoma vs non-seminomatous germ cell tumor
    "diseaseSetting": ["STAGE_I" | "METASTATIC_INITIAL" | "RELAPSED_REFRACTORY"] | null, // Stage and treatment phase
    "igcccgRisk": ["GOOD" | "INTERMEDIATE" | "POOR"] | null, // IGCCCG prognostic risk classification
    "priorTherapyRequired": ["PLATINUM_CHEMOTHERAPY" | "HDCT_ASCT"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["PLATINUM_CHEMOTHERAPY" | "HDCT_ASCT"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  breast: `  "breast": {
    "hrStatus": ["POSITIVE" | "NEGATIVE"] | null, // Hormone receptor status; positive if ER and/or PR positive (≥1% threshold)
    "her2Status": ["POSITIVE" | "NEGATIVE"] | null, // HER2 status; positive = IHC 3+ or ISH amplified
    "her2LowOrUltralowStatus": ["NEGATIVE" | "ULTRA_LOW" | "LOW"] | null, // HER2 expression sub-categorization within HER2-negative disease
    "diseaseSetting": ["NEOADJUVANT" | "ADJUVANT" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Treatment setting
    "cnsMetastases": ["ABSENT" | "TREATED_STABLE" | "ACTIVE"] | null, // CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "menopausalStatus": ["PRE" | "PERI" | "POST"] | null, // Menopausal state
    "brcaStatus": ["GERMLINE" | "SOMATIC" | "NEGATIVE"] | null, // BRCA1/2 mutation source (germline only, somatic only, or both possible)
    "pi3kAktPathwayStatus": ["ALTERED" | "WILD_TYPE"] | null, // PIK3CA / AKT1 / PTEN pathway alteration (capivasertib eligibility)
    "esr1Status": ["MUTATED" | "WILD_TYPE"] | null, // ESR1 ligand-binding-domain mutation (elacestrant eligibility)
    "pdl1Status": ["POSITIVE" | "NEGATIVE"] | null, // PD-L1 expression status (typically IC for TNBC)
    "priorTherapyRequired": ["ENDOCRINE_THERAPY" | "CDK46_INHIBITOR" | "HER2_DIRECTED_THERAPY" | "ANTIBODY_DRUG_CONJUGATE" | "TAXANE" | "ANTHRACYCLINE" | "PLATINUM" | "CYCLOPHOSPHAMIDE"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["ENDOCRINE_THERAPY" | "CDK46_INHIBITOR" | "HER2_DIRECTED_THERAPY" | "ANTIBODY_DRUG_CONJUGATE" | "TAXANE" | "ANTHRACYCLINE" | "PLATINUM" | "CYCLOPHOSPHAMIDE"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  lung: `  "lung": {
    "histology": ["NSCLC_NONSQUAMOUS" | "NSCLC_SQUAMOUS" | "SCLC"] | null, // Major histologic class (NSCLC subtype or SCLC)
    "metastaticStatus": ["EARLY_STAGE" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Stage of NSCLC at enrollment
    "sclcExtent": ["LIMITED" | "EXTENSIVE"] | null, // SCLC stage (limited vs extensive); applies only if histology is SCLC
    "cnsMetastases": ["ABSENT" | "TREATED_STABLE" | "ACTIVE"] | null, // CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression
    "leptomeningealDisease": boolean | null, // Leptomeningeal disease present
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "egfrStatus": ["CLASSICAL_DEL19_L858R" | "EXON20_INS" | "UNCOMMON" | "WILD_TYPE"] | null, // EGFR alteration type
    "alkStatus": ["REARRANGED" | "WILD_TYPE"] | null, // ALK rearrangement status
    "ros1Status": ["REARRANGED" | "WILD_TYPE"] | null, // ROS1 rearrangement status
    "krasStatus": ["G12C" | "NON_G12C" | "WILD_TYPE"] | null, // KRAS mutation type
    "brafStatus": ["V600E" | "NON_V600E" | "WILD_TYPE"] | null, // BRAF mutation type
    "metStatus": ["EXON14_SKIPPING" | "AMPLIFIED" | "WILD_TYPE"] | null, // MET alteration type (exon 14 skipping vs amplification)
    "retStatus": ["REARRANGED" | "WILD_TYPE"] | null, // RET rearrangement status
    "her2Status": ["MUTATED" | "AMPLIFIED" | "WILD_TYPE"] | null, // HER2 status
    "ntrkStatus": ["FUSION" | "WILD_TYPE"] | null, // NTRK gene fusion status
    "pdl1TpsCategory": ["HIGH_GE_50" | "INTERMEDIATE_1_49" | "NEGATIVE_LT_1"] | null, // PD-L1 tumor proportion score band (Dako 22C3)
    "priorTherapyRequired": ["PLATINUM_CHEMOTHERAPY" | "IMMUNOTHERAPY" | "TARGETED_THERAPY" | "OSIMERTINIB"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["PLATINUM_CHEMOTHERAPY" | "IMMUNOTHERAPY" | "TARGETED_THERAPY" | "OSIMERTINIB"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  colorectal: `  "colorectal": {
    "primarySiteSidedness": ["RIGHT_COLON" | "LEFT_COLON" | "RECTUM"] | null, // Anatomic primary site combining colon side and rectum
    "diseaseSetting": ["EARLY_STAGE" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Disease extent / stage
    "histology": ["ADENOCARCINOMA" | "OTHER"] | null, // Adenocarcinoma vs other (e.g., signet-ring, neuroendocrine)
    "liverLimitedDisease": boolean | null, // Metastatic disease confined to the liver
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "rasStatus": ["KRAS_MUTATED" | "NRAS_MUTATED" | "WILD_TYPE"] | null, // KRAS or NRAS mutation status (pan-RAS)
    "krasG12cStatus": ["MUTATED" | "WILD_TYPE"] | null, // KRAS G12C specifically (sotorasib/adagrasib eligibility)
    "brafStatus": ["V600E" | "NON_V600E" | "WILD_TYPE"] | null, // BRAF mutation type (V600E is the actionable variant)
    "msiStatus": ["MSI_HIGH_DMMR" | "MSS_PMMR"] | null, // Microsatellite instability / mismatch repair status
    "her2Status": ["AMPLIFIED" | "OVEREXPRESSED" | "NEGATIVE"] | null, // HER2 amplification or overexpression (3+ IHC)
    "priorTherapyRequired": ["FLUOROPYRIMIDINE" | "OXALIPLATIN" | "IRINOTECAN" | "ANTI_EGFR" | "ANTI_VEGF" | "IMMUNOTHERAPY" | "BRAF_COMBINATION_THERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["FLUOROPYRIMIDINE" | "OXALIPLATIN" | "IRINOTECAN" | "ANTI_EGFR" | "ANTI_VEGF" | "IMMUNOTHERAPY" | "BRAF_COMBINATION_THERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  head_and_neck: `  "headAndNeck": {
    "primarySite": ["ORAL_CAVITY" | "OROPHARYNX" | "LARYNX" | "HYPOPHARYNX" | "NASOPHARYNX" | "SALIVARY_GLAND"] | null, // Anatomic primary site within head and neck
    "diseaseSetting": ["LOCALLY_ADVANCED" | "RECURRENT" | "METASTATIC"] | null, // Disease extent / treatment intent
    "hpvP16Status": ["POSITIVE" | "NEGATIVE"] | null, // HPV/p16 status (especially oropharyngeal)
    "ebvStatus": ["POSITIVE" | "NEGATIVE"] | null, // EBV status (relevant for nasopharyngeal carcinoma)
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "pdl1CpsCategory": ["HIGH_GE_20" | "INTERMEDIATE_1_19" | "NEGATIVE_LT_1"] | null, // PD-L1 combined positive score band
    "priorTherapyRequired": ["RADIATION" | "PLATINUM" | "IMMUNOTHERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["RADIATION" | "PLATINUM" | "IMMUNOTHERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  ovarian: `  "ovarian": {
    "histology": ["HIGH_GRADE_SEROUS" | "LOW_GRADE_SEROUS" | "MUCINOUS" | "CLEAR_CELL" | "ENDOMETRIOID"] | null, // Histologic subtype
    "diseaseSetting": ["NEWLY_DIAGNOSED" | "MAINTENANCE" | "RECURRENT"] | null, // Treatment phase (newly diagnosed, maintenance, recurrent)
    "platinumSensitivity": ["SENSITIVE" | "RESISTANT" | "REFRACTORY"] | null, // Platinum sensitivity status
    "brcaStatus": ["GERMLINE" | "SOMATIC" | "NEGATIVE"] | null, // BRCA1/2 mutation source (germline only, somatic only, or both possible)
    "hrdStatus": ["POSITIVE" | "NEGATIVE"] | null, // Homologous recombination deficiency status (Myriad MyChoice or equivalent)
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "cnsMetastases": ["ABSENT" | "TREATED_STABLE" | "ACTIVE"] | null, // CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression
    "priorTherapyRequired": ["DEBULKING" | "PLATINUM" | "BEVACIZUMAB" | "PARPI"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["DEBULKING" | "PLATINUM" | "BEVACIZUMAB" | "PARPI"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  uterine: `  "uterine": {
    "histology": ["ENDOMETRIOID" | "SEROUS" | "CARCINOSARCOMA" | "CLEAR_CELL"] | null, // Histologic subtype
    "diseaseSetting": ["EARLY_STAGE" | "LOCALLY_ADVANCED" | "RECURRENT" | "METASTATIC"] | null, // Disease extent
    "tcgaMolecularClass": ["POLE_ULTRAMUTATED" | "MSI_HYPERMUTATED_DMMR" | "COPY_NUMBER_LOW_NSMP" | "COPY_NUMBER_HIGH_P53ABN"] | null, // TCGA molecular classification
    "msiStatus": ["MSI_HIGH_DMMR" | "MSS_PMMR"] | null, // MSI / MMR status
    "her2Status": ["POSITIVE" | "NEGATIVE"] | null, // HER2 expression status
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "priorTherapyRequired": ["RADIATION" | "PLATINUM" | "IMMUNOTHERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["RADIATION" | "PLATINUM" | "IMMUNOTHERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  cervical: `  "cervical": {
    "histology": ["SQUAMOUS" | "ADENOCARCINOMA" | "ADENOSQUAMOUS"] | null, // Histologic subtype
    "diseaseSetting": ["LOCALLY_ADVANCED" | "RECURRENT" | "METASTATIC"] | null, // Disease extent
    "hpvStatus": ["POSITIVE" | "NEGATIVE"] | null, // HPV positivity
    "pdl1CpsCategory": ["POSITIVE_GE_1" | "NEGATIVE_LT_1"] | null, // PD-L1 combined positive score band
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "priorTherapyRequired": ["CHEMORADIATION" | "PLATINUM" | "IMMUNOTHERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["CHEMORADIATION" | "PLATINUM" | "IMMUNOTHERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  melanoma: `  "melanoma": {
    "primarySite": ["CUTANEOUS" | "MUCOSAL" | "UVEAL" | "ACRAL"] | null, // Anatomic origin of primary melanoma
    "diseaseSetting": ["RESECTED_ADJUVANT" | "UNRESECTABLE" | "METASTATIC"] | null, // Treatment setting
    "brafStatus": ["V600E" | "V600K" | "NON_V600" | "WILD_TYPE"] | null, // BRAF mutation type
    "nrasStatus": ["MUTATED" | "WILD_TYPE"] | null, // NRAS mutation status
    "ldhCategory": ["NORMAL" | "ELEVATED_1_2X_ULN" | "ELEVATED_GT_2X_ULN"] | null, // LDH level relative to ULN (used for M1 sub-staging)
    "cnsMetastases": ["ABSENT" | "TREATED_STABLE" | "ACTIVE"] | null, // CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression
    "leptomeningealDisease": boolean | null, // Leptomeningeal disease present
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "priorTherapyRequired": ["IMMUNOTHERAPY" | "BRAF_MEK_INHIBITOR"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["IMMUNOTHERAPY" | "BRAF_MEK_INHIBITOR"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  mesothelioma: `  "mesothelioma": {
    "histology": ["EPITHELIOID" | "SARCOMATOID" | "BIPHASIC"] | null, // Histologic subtype
    "primarySite": ["PLEURAL" | "PERITONEAL"] | null, // Pleural or peritoneal origin
    "diseaseSetting": ["RESECTABLE" | "UNRESECTABLE" | "METASTATIC"] | null, // Disease extent / resectability
    "bap1Status": ["LOST" | "INTACT"] | null, // BAP1 expression status (germline or tumor)
    "measurableDiseaseModifiedRecist": boolean | null, // Measurable disease per modified RECIST for mesothelioma
    "priorTherapyRequired": ["PLATINUM" | "PEMETREXED" | "IMMUNOTHERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["PLATINUM" | "PEMETREXED" | "IMMUNOTHERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  gastroesophageal: `  "gastroesophageal": {
    "primarySiteHistology": ["ESOPHAGEAL_SQUAMOUS" | "ESOPHAGEAL_ADENOCARCINOMA" | "GEJ_ADENOCARCINOMA" | "GASTRIC_ADENOCARCINOMA" | "OTHER"] | null, // Combined anatomic site and histology
    "diseaseSetting": ["NEOADJUVANT" | "PERIOPERATIVE" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Treatment setting / disease extent
    "her2Status": ["POSITIVE" | "NEGATIVE"] | null, // HER2 status (IHC 3+ or ISH amplified is positive)
    "pdl1CpsCategory": ["HIGH_GE_10" | "INTERMEDIATE_1_9" | "NEGATIVE_LT_1"] | null, // PD-L1 combined positive score band
    "msiStatus": ["MSI_HIGH_DMMR" | "MSS_PMMR"] | null, // MSI / MMR status
    "claudin18_2Status": ["POSITIVE" | "NEGATIVE"] | null, // Claudin 18.2 expression (zolbetuximab eligibility, ≥75% 2+/3+ IHC)
    "fgfr2bStatus": ["OVEREXPRESSED" | "NEGATIVE"] | null, // FGFR2b overexpression (bemarituzumab eligibility)
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "priorTherapyRequired": ["FLUOROPYRIMIDINE" | "PLATINUM" | "IMMUNOTHERAPY" | "HER2_DIRECTED_THERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["FLUOROPYRIMIDINE" | "PLATINUM" | "IMMUNOTHERAPY" | "HER2_DIRECTED_THERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  neuroendocrine: `  "neuroendocrine": {
    "primarySite": ["PANCREATIC" | "GI_MIDGUT" | "GI_HINDGUT" | "LUNG" | "OTHER"] | null, // Anatomic origin
    "differentiation": ["WELL_DIFFERENTIATED" | "POORLY_DIFFERENTIATED"] | null, // Well-differentiated NET vs poorly-differentiated NEC
    "grade": ["G1" | "G2" | "G3"] | null, // WHO grade based on Ki-67 and mitotic count
    "ki67Percent": number | null, // Ki-67 proliferation index as a percentage
    "functionalStatus": ["FUNCTIONAL" | "NON_FUNCTIONAL"] | null, // Hormone-secreting (functional) vs non-functional tumor
    "somatostatinReceptorImagingPositive": boolean | null, // SSR-imaging positive (Ga-68 DOTATATE PET or octreotide scan)
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "priorTherapyRequired": ["SOMATOSTATIN_ANALOG" | "CHEMOTHERAPY" | "PRRT" | "EVEROLIMUS"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["SOMATOSTATIN_ANALOG" | "CHEMOTHERAPY" | "PRRT" | "EVEROLIMUS"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  pancreatic: `  "pancreatic": {
    "resectability": ["RESECTABLE" | "BORDERLINE" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Surgical resectability category
    "histology": ["ADENOCARCINOMA" | "OTHER"] | null, // Adenocarcinoma vs other (NETs handled in neuroendocrine block)
    "krasStatus": ["G12C" | "G12D" | "OTHER_KRAS" | "WILD_TYPE"] | null, // KRAS mutation variant
    "brcaStatus": ["GERMLINE" | "SOMATIC" | "NEGATIVE"] | null, // BRCA1/2 mutation source (germline only, somatic only, or both possible)
    "msiStatus": ["MSI_HIGH_DMMR" | "MSS_PMMR"] | null, // MSI / MMR status
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "ca199Elevated": boolean | null, // CA 19-9 elevated above laboratory ULN
    "priorTherapyRequired": ["FOLFIRINOX" | "GEMCITABINE_NABPACLITAXEL" | "IMMUNOTHERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["FOLFIRINOX" | "GEMCITABINE_NABPACLITAXEL" | "IMMUNOTHERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  cns: `  "cns": {
    "histology": ["GLIOBLASTOMA" | "ASTROCYTOMA" | "OLIGODENDROGLIOMA" | "EPENDYMOMA" | "MEDULLOBLASTOMA" | "MENINGIOMA" | "OTHER"] | null, // WHO CNS tumor histology
    "whoGrade": ["1" | "2" | "3" | "4"] | null, // WHO CNS grade
    "diseaseStatus": ["NEWLY_DIAGNOSED" | "RECURRENT_PROGRESSIVE"] | null, // Newly diagnosed vs recurrent/progressive after first-line
    "idhStatus": ["MUTANT" | "WILD_TYPE"] | null, // IDH1/2 mutation status (defining for adult diffuse gliomas)
    "codeletion1p19q": boolean | null, // 1p/19q co-deletion (oligodendroglioma-defining)
    "mgmtMethylated": boolean | null, // MGMT promoter methylation (temozolomide benefit predictor)
    "egfrAmplified": boolean | null, // EGFR amplification / EGFRvIII present
    "atrxLoss": boolean | null, // ATRX loss of expression
    "braf600eMutated": boolean | null, // BRAF V600E mutation present
    "measurableDiseaseRano": boolean | null, // Measurable disease per RANO criteria
    "resectionExtent": ["BIOPSY_ONLY" | "SUBTOTAL" | "GROSS_TOTAL"] | null, // Extent of surgical resection
    "priorTherapyRequired": ["RADIOTHERAPY" | "TEMOZOLOMIDE" | "BEVACIZUMAB" | "TTFIELDS"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["RADIOTHERAPY" | "TEMOZOLOMIDE" | "BEVACIZUMAB" | "TTFIELDS"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  hcc: `  "hcc": {
    "diseaseSetting": ["RESECTABLE" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Resectability / disease extent
    "childPughClass": ["A" | "B" | "C"] | null, // Child-Pugh liver function class (key HCC eligibility gate)
    "bclcStage": ["0" | "A" | "B" | "C" | "D"] | null, // Barcelona Clinic Liver Cancer stage
    "viralHepatitisStatus": ["HBV" | "HCV" | "NONE"] | null, // Underlying viral hepatitis etiology (eligibility / stratification)
    "portalVeinInvasion": boolean | null, // Macrovascular / portal vein tumor invasion present
    "extrahepaticSpread": boolean | null, // Extrahepatic spread present
    "afpElevated": boolean | null, // Alpha-fetoprotein elevated above trial threshold (ramucirumab-type gate)
    "priorLocoregionalTherapy": boolean | null, // Prior TACE / TARE / ablation / SBRT to liver
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1 or mRECIST
    "priorTherapyRequired": ["ATEZOLIZUMAB_BEVACIZUMAB" | "TKI" | "IMMUNOTHERAPY" | "TRANSARTERIAL_THERAPY"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["ATEZOLIZUMAB_BEVACIZUMAB" | "TKI" | "IMMUNOTHERAPY" | "TRANSARTERIAL_THERAPY"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  biliary: `  "biliary": {
    "primarySite": ["INTRAHEPATIC_CHOLANGIO" | "EXTRAHEPATIC_CHOLANGIO" | "GALLBLADDER" | "AMPULLARY"] | null, // Anatomic primary site within the biliary tract
    "diseaseSetting": ["RESECTABLE" | "LOCALLY_ADVANCED" | "METASTATIC"] | null, // Resectability / disease extent
    "fgfr2Status": ["FUSION" | "WILD_TYPE"] | null, // FGFR2 fusion/rearrangement (pemigatinib/futibatinib eligibility)
    "idh1Status": ["MUTANT" | "WILD_TYPE"] | null, // IDH1 mutation (ivosidenib eligibility)
    "her2Status": ["POSITIVE" | "NEGATIVE"] | null, // HER2 amplification/overexpression
    "brafStatus": ["V600E" | "WILD_TYPE"] | null, // BRAF V600E mutation
    "krasStatus": ["G12C" | "OTHER_KRAS" | "WILD_TYPE"] | null, // KRAS mutation status
    "msiStatus": ["MSI_HIGH_DMMR" | "MSS_PMMR"] | null, // MSI / MMR status
    "measurableDiseaseRecist": boolean | null, // Measurable disease per RECIST 1.1
    "priorTherapyRequired": ["GEMCITABINE_CISPLATIN" | "IMMUNOTHERAPY" | "FGFR_INHIBITOR" | "IDH1_INHIBITOR"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["GEMCITABINE_CISPLATIN" | "IMMUNOTHERAPY" | "FGFR_INHIBITOR" | "IDH1_INHIBITOR"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  // ============================================
  // Hematologic lineages — acceptedDiseases scopes by disease; null/absent = any in lineage.
  // ============================================
  mature_b_cell: `  "matureBCell": {
    "acceptedDiseases": ["DLBCL_NOS" | "HGBCL" | "HGBCL_DH_TH" | "PMBCL" | "DLBCL_LEG_TYPE" | "TCRBCL" | "TRANSFORMED_FL" | "TRANSFORMED_MZL" | "RICHTER" | "FL" | "MCL" | "MZL" | "CHL" | "CLL_SLL" | "WALDENSTROM" | "HCL" | "OTHER"] | null, // Disease subtypes the trial enrolls within this lineage
    "cellOfOrigin": ["GCB" | "NON_GCB_ABC"] | null, // DLBCL cell-of-origin classification
    "doubleOrTripleHit": boolean | null, // Double-hit (MYC + BCL2 or BCL6) or triple-hit cytogenetics
    "ighvStatus": ["MUTATED" | "UNMUTATED"] | null, // IGHV mutation status (CLL prognostic marker)
    "del17pOrTp53Mutated": boolean | null, // 17p deletion or TP53 mutation (CLL high-risk)
    "myd88Status": ["L265P" | "WILD_TYPE"] | null, // MYD88 L265P mutation (Waldenstrom marker)
    "cnsInvolvement": boolean | null, // CNS involvement by the underlying hematologic malignancy
    "cd19Positive": boolean | null, // CD19 expression on tumor cells
    "cd20Positive": boolean | null, // CD20 expression on tumor cells
    "cd22Positive": boolean | null, // CD22 expression on tumor cells
    "cd79bPositive": boolean | null, // CD79b expression (polatuzumab eligibility)
    "transplantEligible": boolean | null, // Eligible for autologous stem cell transplant
    "priorTherapyRequired": ["ANTI_CD20" | "ANTI_CD19" | "BTK_INHIBITOR" | "BCL2_INHIBITOR" | "ANTHRACYCLINE" | "BISPECIFIC" | "CAR_T" | "AUTO_TRANSPLANT" | "ALLO_TRANSPLANT"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["ANTI_CD20" | "ANTI_CD19" | "BTK_INHIBITOR" | "BCL2_INHIBITOR" | "ANTHRACYCLINE" | "BISPECIFIC" | "CAR_T" | "AUTO_TRANSPLANT" | "ALLO_TRANSPLANT"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  mature_t_nk_cell: `  "matureTnk": {
    "acceptedDiseases": ["PTCL_NOS" | "AITL" | "ALCL_ALK_POS" | "ALCL_ALK_NEG" | "CTCL_MF" | "CTCL_SS" | "NK_T" | "HSTCL" | "MEITL" | "EATL" | "ATL" | "OTHER"] | null, // Disease subtypes the trial enrolls within this lineage
    "atlSubtype": ["ACUTE" | "LYMPHOMATOUS" | "CHRONIC" | "SMOLDERING"] | null, // ATL clinical subtype (Shimoyama classification)
    "htlv1Status": ["POSITIVE" | "NEGATIVE"] | null, // HTLV-1 serology status
    "cd30Positive": boolean | null, // CD30 expression (brentuximab eligibility)
    "ccr4Positive": boolean | null, // CCR4 expression (mogamulizumab eligibility)
    "cnsInvolvement": boolean | null, // CNS involvement by the underlying hematologic malignancy
    "ctclStageAdvanced": boolean | null, // Advanced CTCL stage (IIB or higher)
    "priorTherapyRequired": ["BRENTUXIMAB" | "MOGAMULIZUMAB" | "CHEMOTHERAPY" | "AUTO_TRANSPLANT" | "ALLO_TRANSPLANT"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["BRENTUXIMAB" | "MOGAMULIZUMAB" | "CHEMOTHERAPY" | "AUTO_TRANSPLANT" | "ALLO_TRANSPLANT"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  myeloid_neoplasm: `  "myeloid": {
    "acceptedDiseases": ["AML" | "MDS" | "CMML" | "MDS_MPN" | "MPN_PV" | "MPN_ET" | "MPN_MF" | "CML" | "OTHER"] | null, // Disease subtypes the trial enrolls within this lineage
    "amlClassification": ["DE_NOVO" | "SECONDARY" | "THERAPY_RELATED"] | null, // AML etiology (de novo, secondary from prior MDS/MPN, therapy-related)
    "elnRisk": ["FAVORABLE" | "INTERMEDIATE" | "ADVERSE"] | null, // ELN 2022 risk category
    "flt3Status": ["ITD" | "TKD" | "WILD_TYPE"] | null, // FLT3 mutation type
    "npm1Mutated": boolean | null, // NPM1 mutation status
    "idh1Mutated": boolean | null, // IDH1 mutation status (ivosidenib eligibility)
    "idh2Mutated": boolean | null, // IDH2 mutation status (enasidenib eligibility)
    "kmt2aRearranged": boolean | null, // KMT2A (MLL) rearrangement (revumenib eligibility)
    "ipssR": ["VERY_LOW" | "LOW" | "INT" | "HIGH" | "VERY_HIGH"] | null, // IPSS-R risk score (MDS)
    "ipssM": ["VERY_LOW" | "LOW" | "MODERATE_LOW" | "MODERATE_HIGH" | "HIGH" | "VERY_HIGH"] | null, // IPSS-M risk score (MDS, molecular-integrated)
    "minBlastsPercent": number | null, // Minimum bone marrow blast percentage required
    "maxBlastsPercent": number | null, // Maximum bone marrow blast percentage allowed
    "ringSideroblasts": boolean | null, // Ring sideroblasts present (MDS-RS)
    "sf3b1Mutated": boolean | null, // SF3B1 mutation status (MDS-RS / luspatercept eligibility)
    "jak2Status": ["V617F" | "EXON12" | "WILD_TYPE"] | null, // JAK2 mutation type (MPN driver)
    "calrMutated": boolean | null, // CALR mutation status (MPN driver)
    "mplMutated": boolean | null, // MPL mutation status (MPN driver)
    "bcrAblStatus": ["POSITIVE" | "NEGATIVE"] | null, // BCR-ABL fusion status (CML)
    "cmlPhase": ["CHRONIC" | "ACCELERATED" | "BLAST"] | null, // CML phase
    "complexKaryotype": boolean | null, // Complex karyotype (≥3 abnormalities)
    "monosomy7OrDel7q": boolean | null, // Monosomy 7 or 7q deletion
    "tp53Mutated": boolean | null, // TP53 mutation status
    "cnsInvolvement": boolean | null, // CNS involvement by the underlying hematologic malignancy
    "priorTherapyRequired": ["HMA" | "VENETOCLAX" | "INTENSIVE_CHEMOTHERAPY" | "FLT3_INHIBITOR" | "IDH_INHIBITOR" | "MENIN_INHIBITOR" | "JAK_INHIBITOR" | "BCR_ABL_TKI" | "ALLO_TRANSPLANT"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["HMA" | "VENETOCLAX" | "INTENSIVE_CHEMOTHERAPY" | "FLT3_INHIBITOR" | "IDH_INHIBITOR" | "MENIN_INHIBITOR" | "JAK_INHIBITOR" | "BCR_ABL_TKI" | "ALLO_TRANSPLANT"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  precursor_lymphoid: `  "precursorLymphoid": {
    "acceptedDiseases": ["B_ALL" | "T_ALL" | "LBL_B" | "LBL_T" | "OTHER"] | null, // Disease subtypes the trial enrolls within this lineage
    "philadelphiaStatus": ["POSITIVE" | "PH_LIKE" | "NEGATIVE"] | null, // Ph chromosome / BCR-ABL status (including Ph-like)
    "cd19Positive": boolean | null, // CD19 expression on tumor cells
    "cd22Positive": boolean | null, // CD22 expression on tumor cells
    "cd7Positive": boolean | null, // CD7 expression (T-ALL)
    "mrdStatus": ["POSITIVE" | "NEGATIVE"] | null, // Minimal residual disease status
    "cnsStatus": ["CNS1" | "CNS2" | "CNS3"] | null, // CNS leukemia status (CNS1/2/3)
    "minRelapseNumber": number | null, // Minimum number of prior relapses
    "maxRelapseNumber": number | null, // Maximum number of prior relapses
    "priorTherapyRequired": ["BLINATUMOMAB" | "INOTUZUMAB" | "CAR_T" | "BCR_ABL_TKI" | "ALLO_TRANSPLANT"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["BLINATUMOMAB" | "INOTUZUMAB" | "CAR_T" | "BCR_ABL_TKI" | "ALLO_TRANSPLANT"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,

  plasma_cell: `  "plasmaCell": {
    "acceptedDiseases": ["MM" | "PCL" | "PLASMACYTOMA" | "AL_AMYLOIDOSIS" | "WALDENSTROM_LPL" | "POEMS" | "OTHER"] | null, // Disease subtypes the trial enrolls within this lineage
    "rissStage": ["I" | "II" | "III"] | null, // R-ISS stage (multiple myeloma)
    "highRiskCytogenetics": boolean | null, // High-risk FISH cytogenetics (del 17p, t(4;14), t(14;16), gain 1q)
    "measurableDiseaseImwg": boolean | null, // Measurable disease per IMWG criteria
    "extramedullaryDisease": boolean | null, // Extramedullary disease present
    "cnsInvolvement": boolean | null, // CNS involvement by the underlying hematologic malignancy
    "amyloidCardiacInvolvement": boolean | null, // Cardiac involvement in AL amyloidosis
    "amyloidMayoStage": ["I" | "II" | "III" | "IIIA" | "IIIB"] | null, // Mayo Clinic AL amyloidosis stage
    "priorTherapyRequired": ["IMID" | "PROTEASOME_INHIBITOR" | "ANTI_CD38" | "BCMA_THERAPY" | "BISPECIFIC" | "AUTO_TRANSPLANT" | "ALLO_TRANSPLANT"] | null, // Therapies trial requires patient to have received
    "priorTherapyExcluded": ["IMID" | "PROTEASOME_INHIBITOR" | "ANTI_CD38" | "BCMA_THERAPY" | "BISPECIFIC" | "AUTO_TRANSPLANT" | "ALLO_TRANSPLANT"] | null, // Therapies trial excludes prior exposure to
    "minPriorSystemicLines": number | null, // Minimum prior lines of systemic therapy
    "maxPriorSystemicLines": number | null // Maximum prior lines of systemic therapy allowed
  } | null`,
};
```
