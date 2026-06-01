# TEMPO — Physician Annotation Guide

**Purpose.** This guide is for trained physician reviewers performing **manual structured extraction** of trial eligibility criteria from ClinicalTrials.gov, to serve as the reference standard against which TEMPO's automated extraction is compared.

**Scope.** One section per cancer type. For each trial, annotate only the cancer-type block(s) the trial is eligible for. A trial may be eligible for more than one cancer type (e.g., a basket trial) — annotate each applicable block independently.

---

## General annotation rules

These rules apply to **every** field unless a field-specific note overrides them.

1. **Source of truth.** Annotate from the ClinicalTrials.gov record: the *Eligibility Criteria* section primarily, supplemented by *Conditions*, *Brief Summary*, *Detailed Description*, *Arms/Interventions*, and *Official Title* where the criteria are ambiguous. Do not infer from external knowledge of the drug or sponsor beyond what is needed to interpret the trial's own language.

2. **`null` means the trial does not constrain the field.** If the eligibility criteria neither require nor exclude any value of a field, leave it `null` (record as blank / NA on the annotation form). `null` is **not** "unknown to the reviewer" — it is an affirmative judgment that the trial places no constraint on this variable.

3. **Categorical fields are multi-select.** Record **every** value the trial would accept, not just the most prominent. If a trial enrolls both locally advanced and metastatic disease, record both `LOCALLY_ADVANCED` and `METASTATIC`. If the trial accepts essentially all values of the field (no constraint), record `null`, not the full list.

4. **Inclusion vs. exclusion logic.** A value belongs in a categorical field if the trial *permits* a patient with that value to enroll. If an exclusion criterion removes a value, do not list it. Example: trial states histology adenocarcinoma with neuroendocrine differentiation excluded -> histology = ADENOCARCINOMA only, not both.

5. **Booleans encode a trial requirement, not patient status.** `true` = the trial *requires* the condition to be present. `false` = the trial *requires* it to be absent (an explicit exclusion). `null` = the trial does not mention it. Example: an exclusion of active brain metastases -> categorical `cnsMetastases` = ABSENT and TREATED_STABLE (active excluded); a boolean like `leptomeningealDisease` with LMD excluded -> `false`.

6. **Numeric fields capture the trial's stated threshold.** `minPriorSystemicLines = 2` means the trial requires at least 2 prior lines. `maxPriorSystemicLines = 1` means no more than 1 prior line. If the trial says "treatment-naive," set `maxPriorSystemicLines = 0`. If only one bound is stated, leave the other `null`.

7. **Prior therapy: required vs. excluded.** `priorTherapyRequired` lists therapies a patient *must have received* to be eligible. `priorTherapyExcluded` lists therapies that *disqualify* a patient if previously received. A therapy mentioned in neither array is unconstrained. A single therapy must not appear in both arrays for the same trial — if the criteria appear to both require and exclude the same therapy, flag the trial for adjudication rather than guessing.

8. **Setting-qualified criteria.** When a criterion is qualified by treatment setting ("prior platinum **in the metastatic setting**"), the current schema cannot encode the setting qualifier. Annotate the therapy as required/excluded per the criterion and **flag the trial** in the adjudication notes so the loss of the setting qualifier is recorded.

9. **Disagreement handling.** If the trial language is genuinely ambiguous after reviewing all sections, do not guess to match expected AI behavior. Record your best single interpretation and add a free-text adjudication note. Blinded single-expert adjudication resolves reviewer–AI disagreements; consistent reviewer notes are essential for that step.

10. **Do not normalize toward the AI.** Reviewers must not view the AI extraction before completing their own. The comparison is only valid if manual extraction is independent.

---

## Field-type quick reference

| Type in schema | How to record | `null` when |
|---|---|---|
| `["A" | "B" | ...] | null` | All accepted values (multi-select) | Trial places no constraint on the field |
| `boolean | null` | `true` (trial requires present) / `false` (trial requires absent) | Trial does not mention it |
| `number | null` | The trial's stated numeric threshold | No threshold stated |

---

## Prostate

Schema key: `prostate` &nbsp;|&nbsp; Block: `"prostate"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `castrationStatus` | multi-select: `SENSITIVE`, `RESISTANT` | Castration sensitivity to ADT (CSPC vs CRPC) | List every value the trial accepts; `null` if unrestricted. |
| `metastaticStatus` | multi-select: `METASTATIC`, `NON_METASTATIC` | Presence of radiographic metastatic disease | List every value the trial accepts; `null` if unrestricted. |
| `histology` | multi-select: `ADENOCARCINOMA`, `NEUROENDOCRINE_SMALL_CELL` | Adenocarcinoma vs neuroendocrine/small-cell (de novo or treatment-emergent) | List every value the trial accepts; `null` if unrestricted. |
| `visceralMetastases` | boolean | Visceral (non-bone, non-LN) metastases — liver, lung, etc. | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `psmaPetPositive` | boolean | PSMA PET positive (eligibility for PSMA-targeted radioligand therapy) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `hrrStatus` | multi-select: `BRCA1`, `BRCA2`, `OTHER_HRR`, `NEGATIVE` | Homologous recombination repair gene alteration status | List every value the trial accepts; `null` if unrestricted. |
| `msiStatus` | multi-select: `MSI_HIGH`, `MSS` | Microsatellite instability / mismatch repair status | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `ARPI`, `TAXANE`, `PSMA_RADIOLIGAND`, `PARPI` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `ARPI`, `TAXANE`, `PSMA_RADIOLIGAND`, `PARPI` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `castrationStatus`: a trial enrolling 'mCRPC' implies `RESISTANT`; 'mHSPC'/'mCSPC' implies `SENSITIVE`. If the trial spans both castration states (rare), list both.
- `metastaticStatus`: 'M0' / 'non-metastatic CRPC' -> `NON_METASTATIC`. Biochemical recurrence without radiographic disease is `NON_METASTATIC`.
- `hrrStatus`: distinguish BRCA1/BRCA2 from other HRR genes (ATM, PALB2, CHEK2, etc.). 'HRR-positive' without gene specification -> list `BRCA1`, `BRCA2`, `OTHER_HRR`. 'BRCA-mutated' only -> `BRCA1`, `BRCA2`.
- `psmaPetPositive`: only `true` if PSMA-PET positivity is an explicit eligibility requirement (typical for radioligand trials), not merely because PSMA imaging is performed.

---

## Urothelial / Bladder

Schema key: `urothelial` &nbsp;|&nbsp; Block: `"urothelial"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `diseaseSetting` | multi-select: `NMIBC`, `MIBC`, `LOCALLY_ADVANCED`, `METASTATIC` | Disease extent (NMIBC, MIBC, advanced) | List every value the trial accepts; `null` if unrestricted. |
| `site` | multi-select: `BLADDER`, `UPPER_TRACT`, `URETHRAL` | Anatomic primary site within the urinary tract | List every value the trial accepts; `null` if unrestricted. |
| `histology` | multi-select: `PURE_UROTHELIAL`, `VARIANT_HISTOLOGY`, `PURE_SQUAMOUS`, `PURE_NEUROENDOCRINE` | Pure urothelial vs variant histology vs pure non-urothelial subtypes | List every value the trial accepts; `null` if unrestricted. |
| `cisPresent` | boolean | Carcinoma in situ component present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `bcgStatus` | multi-select: `NAIVE`, `EXPOSED`, `UNRESPONSIVE` | Prior intravesical BCG exposure and response | List every value the trial accepts; `null` if unrestricted. |
| `cisplatinEligible` | boolean | Meets cisplatin eligibility (renal function, ECOG, hearing, neuropathy) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `fgfr3Status` | multi-select: `ALTERED`, `WILD_TYPE` | FGFR3 activating alteration (mutation or fusion) | List every value the trial accepts; `null` if unrestricted. |
| `pdl1Status` | multi-select: `POSITIVE`, `NEGATIVE` | PD-L1 expression status | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `POSITIVE`, `NEGATIVE` | HER2 expression status | List every value the trial accepts; `null` if unrestricted. |
| `nectin4Status` | multi-select: `POSITIVE`, `NEGATIVE` | Nectin-4 expression (target for enfortumab vedotin) | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `PLATINUM`, `IMMUNOTHERAPY`, `ENFORTUMAB_VEDOTIN`, `FGFR3_INHIBITOR`, `RADICAL_CYSTECTOMY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `PLATINUM`, `IMMUNOTHERAPY`, `ENFORTUMAB_VEDOTIN`, `FGFR3_INHIBITOR`, `RADICAL_CYSTECTOMY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `diseaseSetting`: NMIBC, MIBC, and locally advanced/metastatic are distinct. A cystectomy-eligible MIBC neoadjuvant trial is `MIBC`. 'Locally advanced or metastatic' -> both `LOCALLY_ADVANCED` and `METASTATIC`.
- `bcgStatus`: 'BCG-unresponsive' is a specific regulatory definition — record `UNRESPONSIVE` only when the trial uses that term or its definition. 'BCG-naive' -> `NAIVE`.
- `cisplatinEligible`: record per the trial's stated cisplatin-eligibility criteria (renal function, ECOG, neuropathy, hearing). 'Cisplatin-ineligible' trial -> `false`.
- `histology`: 'urothelial carcinoma with variant histology allowed' -> include `PURE_UROTHELIAL` and `VARIANT_HISTOLOGY`. Pure squamous or pure small-cell are separate values.

---

## Renal Cell Carcinoma (RCC)

Schema key: `rcc` &nbsp;|&nbsp; Block: `"rcc"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histologySubtype` | multi-select: `CLEAR_CELL`, `PAPILLARY`, `CHROMOPHOBE`, `OTHER_NON_CLEAR_CELL` | Major histologic subtype | List every value the trial accepts; `null` if unrestricted. |
| `sarcomatoidFeatures` | boolean | Sarcomatoid differentiation present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `diseaseSetting` | multi-select: `LOCALIZED`, `LOCALLY_ADVANCED`, `METASTATIC` | Disease extent at enrollment | List every value the trial accepts; `null` if unrestricted. |
| `imdcRisk` | multi-select: `FAVORABLE`, `INTERMEDIATE`, `POOR` | IMDC prognostic risk category | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cnsMetastases` | multi-select: `ABSENT`, `TREATED_STABLE`, `ACTIVE` | CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `NEPHRECTOMY`, `VEGF_TKI`, `IMMUNOTHERAPY_METASTATIC`, `IMMUNOTHERAPY_ADJUVANT`, `HIF2A_INHIBITOR`, `MTOR_INHIBITOR` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `NEPHRECTOMY`, `VEGF_TKI`, `IMMUNOTHERAPY_METASTATIC`, `IMMUNOTHERAPY_ADJUVANT`, `HIF2A_INHIBITOR`, `MTOR_INHIBITOR` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `histologySubtype`: 'clear cell RCC' -> `CLEAR_CELL`. 'Non-clear-cell RCC' -> the relevant non-clear values; if any non-clear histology qualifies, list `PAPILLARY`, `CHROMOPHOBE`, `OTHER_NON_CLEAR_CELL`.
- `diseaseSetting`: adjuvant/post-nephrectomy trials with no measurable disease -> `LOCALIZED`. Use `LOCALLY_ADVANCED` and/or `METASTATIC` for advanced-disease trials.
- `imdcRisk`: list every risk category the trial enrolls. 'Intermediate/poor risk' -> `INTERMEDIATE`, `POOR`.

---

## Testicular / Germ Cell

Schema key: `testicular` &nbsp;|&nbsp; Block: `"testicular"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `SEMINOMA`, `NON_SEMINOMA` | Pure seminoma vs non-seminomatous germ cell tumor | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `STAGE_I`, `METASTATIC_INITIAL`, `RELAPSED_REFRACTORY` | Stage and treatment phase | List every value the trial accepts; `null` if unrestricted. |
| `igcccgRisk` | multi-select: `GOOD`, `INTERMEDIATE`, `POOR` | IGCCCG prognostic risk classification | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `PLATINUM_CHEMOTHERAPY`, `HDCT_ASCT` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `PLATINUM_CHEMOTHERAPY`, `HDCT_ASCT` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `diseaseSetting`: most testicular trials are relapsed/refractory -> `RELAPSED_REFRACTORY`. First-line metastatic -> `METASTATIC_INITIAL`. Stage I surveillance/adjuvant -> `STAGE_I`.
- `igcccgRisk`: record only if the trial gates on IGCCCG risk; many do not.

---

## Breast

Schema key: `breast` &nbsp;|&nbsp; Block: `"breast"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `hrStatus` | multi-select: `POSITIVE`, `NEGATIVE` | Hormone receptor status; positive if ER and/or PR positive (≥1% threshold) | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `POSITIVE`, `NEGATIVE` | HER2 status; positive = IHC 3+ or ISH amplified | List every value the trial accepts; `null` if unrestricted. |
| `her2LowOrUltralowStatus` | multi-select: `NEGATIVE`, `ULTRA_LOW`, `LOW` | HER2 expression sub-categorization within HER2-negative disease | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `NEOADJUVANT`, `ADJUVANT`, `LOCALLY_ADVANCED`, `METASTATIC` | Treatment setting | List every value the trial accepts; `null` if unrestricted. |
| `cnsMetastases` | multi-select: `ABSENT`, `TREATED_STABLE`, `ACTIVE` | CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `menopausalStatus` | multi-select: `PRE`, `PERI`, `POST` | Menopausal state | List every value the trial accepts; `null` if unrestricted. |
| `brcaStatus` | multi-select: `GERMLINE`, `SOMATIC`, `NEGATIVE` | BRCA1/2 mutation source (germline only, somatic only, or both possible) | List every value the trial accepts; `null` if unrestricted. |
| `pi3kAktPathwayStatus` | multi-select: `ALTERED`, `WILD_TYPE` | PIK3CA / AKT1 / PTEN pathway alteration (capivasertib eligibility) | List every value the trial accepts; `null` if unrestricted. |
| `esr1Status` | multi-select: `MUTATED`, `WILD_TYPE` | ESR1 ligand-binding-domain mutation (elacestrant eligibility) | List every value the trial accepts; `null` if unrestricted. |
| `pdl1Status` | multi-select: `POSITIVE`, `NEGATIVE` | PD-L1 expression status (typically IC for TNBC) | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `ENDOCRINE_THERAPY`, `CDK46_INHIBITOR`, `CHEMOTHERAPY_ADVANCED`, `HER2_DIRECTED_THERAPY`, `ANTIBODY_DRUG_CONJUGATE` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `ENDOCRINE_THERAPY`, `CDK46_INHIBITOR`, `CHEMOTHERAPY_ADVANCED`, `HER2_DIRECTED_THERAPY`, `ANTIBODY_DRUG_CONJUGATE` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `hrStatus`: 'HR-positive' / 'ER and/or PR positive' -> record POSITIVE. 'HR-negative' or triple-negative -> record NEGATIVE. If the trial enrolls regardless of HR (e.g., a HER2+ trial agnostic to HR) -> null.
- `her2Status`: IHC 3+ or ISH-amplified = POSITIVE. IHC 0/1+/2+-non-amplified = NEGATIVE. For HER2-low/ultralow trials, `her2Status` is NEGATIVE and the detail goes in `her2LowOrUltralowStatus`.
- `her2LowOrUltralowStatus`: only populate for trials that gate on the HER2-low/ultralow distinction (e.g., T-DXd). LOW = IHC 1+ or 2+/ISH-. ULTRA_LOW = IHC >0 to <1+. NEGATIVE = IHC 0.
- `brcaStatus`: 'germline BRCA' -> GERMLINE. 'germline or somatic BRCA' -> both. tBRCA / somatic only -> SOMATIC.
- `diseaseSetting`: neoadjuvant and adjuvant are separate values; list both if the trial spans them. Early-stage curative trials are not METASTATIC.

---

## Lung

Schema key: `lung` &nbsp;|&nbsp; Block: `"lung"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `NSCLC_NONSQUAMOUS`, `NSCLC_SQUAMOUS`, `SCLC` | Major histologic class (NSCLC subtype or SCLC) | List every value the trial accepts; `null` if unrestricted. |
| `metastaticStatus` | multi-select: `EARLY_STAGE`, `LOCALLY_ADVANCED`, `METASTATIC` | Stage of NSCLC at enrollment | List every value the trial accepts; `null` if unrestricted. |
| `sclcExtent` | multi-select: `LIMITED`, `EXTENSIVE` | SCLC stage (limited vs extensive); applies only if histology is SCLC | List every value the trial accepts; `null` if unrestricted. |
| `cnsMetastases` | multi-select: `ABSENT`, `TREATED_STABLE`, `ACTIVE` | CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression | List every value the trial accepts; `null` if unrestricted. |
| `leptomeningealDisease` | boolean | Leptomeningeal disease present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `egfrStatus` | multi-select: `CLASSICAL_DEL19_L858R`, `EXON20_INS`, `UNCOMMON`, `WILD_TYPE` | EGFR alteration type | List every value the trial accepts; `null` if unrestricted. |
| `alkStatus` | multi-select: `REARRANGED`, `WILD_TYPE` | ALK rearrangement status | List every value the trial accepts; `null` if unrestricted. |
| `ros1Status` | multi-select: `REARRANGED`, `WILD_TYPE` | ROS1 rearrangement status | List every value the trial accepts; `null` if unrestricted. |
| `krasStatus` | multi-select: `G12C`, `NON_G12C`, `WILD_TYPE` | KRAS mutation type | List every value the trial accepts; `null` if unrestricted. |
| `brafStatus` | multi-select: `V600E`, `NON_V600E`, `WILD_TYPE` | BRAF mutation type | List every value the trial accepts; `null` if unrestricted. |
| `metStatus` | multi-select: `EXON14_SKIPPING`, `AMPLIFIED`, `WILD_TYPE` | MET alteration type (exon 14 skipping vs amplification) | List every value the trial accepts; `null` if unrestricted. |
| `retStatus` | multi-select: `REARRANGED`, `WILD_TYPE` | RET rearrangement status | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `MUTATED`, `AMPLIFIED`, `WILD_TYPE` | HER2 status | List every value the trial accepts; `null` if unrestricted. |
| `ntrkStatus` | multi-select: `FUSION`, `WILD_TYPE` | NTRK gene fusion status | List every value the trial accepts; `null` if unrestricted. |
| `pdl1TpsCategory` | multi-select: `HIGH_GE_50`, `INTERMEDIATE_1_49`, `NEGATIVE_LT_1` | PD-L1 tumor proportion score band (Dako 22C3) | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `PLATINUM_CHEMOTHERAPY`, `IMMUNOTHERAPY`, `TARGETED_THERAPY`, `OSIMERTINIB` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `PLATINUM_CHEMOTHERAPY`, `IMMUNOTHERAPY`, `TARGETED_THERAPY`, `OSIMERTINIB` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `histology`: NSCLC non-squamous vs squamous matters for pemetrexed/bevacizumab-class trials. 'NSCLC' without subtype and no histology-specific drug -> list both NSCLC values. SCLC is separate.
- `metastaticStatus` vs `sclcExtent`: for NSCLC use `metastaticStatus`; for SCLC use `sclcExtent` (limited/extensive). They are not interchangeable. Populate whichever applies to the trial's histology.
- Driver alterations (`egfrStatus`, `alkStatus`, etc.): a trial requiring a specific driver -> that value only. A trial *excluding* known drivers (common in IO trials) -> record the wild-type/negative value and flag in notes.
- `egfrStatus`: classical = exon 19 del / L858R. Exon 20 insertion is a distinct value. 'EGFR-mutant' unspecified -> list all mutant values.
- `pdl1TpsCategory`: map the trial's cut-point to the bands. 'PD-L1 >=50%' -> `HIGH_GE_50`. '>=1%' -> `HIGH_GE_50` and `INTERMEDIATE_1_49`. No PD-L1 requirement -> `null`.

---

## Colorectal

Schema key: `colorectal` &nbsp;|&nbsp; Block: `"colorectal"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `primarySiteSidedness` | multi-select: `RIGHT_COLON`, `LEFT_COLON`, `RECTUM` | Anatomic primary site combining colon side and rectum | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `EARLY_STAGE`, `LOCALLY_ADVANCED`, `METASTATIC` | Disease extent / stage | List every value the trial accepts; `null` if unrestricted. |
| `histology` | multi-select: `ADENOCARCINOMA`, `OTHER` | Adenocarcinoma vs other (e.g., signet-ring, neuroendocrine) | List every value the trial accepts; `null` if unrestricted. |
| `liverLimitedDisease` | boolean | Metastatic disease confined to the liver | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `rasStatus` | multi-select: `KRAS_MUTATED`, `NRAS_MUTATED`, `WILD_TYPE` | KRAS or NRAS mutation status (pan-RAS) | List every value the trial accepts; `null` if unrestricted. |
| `krasG12cStatus` | multi-select: `MUTATED`, `WILD_TYPE` | KRAS G12C specifically (sotorasib/adagrasib eligibility) | List every value the trial accepts; `null` if unrestricted. |
| `brafStatus` | multi-select: `V600E`, `NON_V600E`, `WILD_TYPE` | BRAF mutation type (V600E is the actionable variant) | List every value the trial accepts; `null` if unrestricted. |
| `msiStatus` | multi-select: `MSI_HIGH_DMMR`, `MSS_PMMR` | Microsatellite instability / mismatch repair status | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `AMPLIFIED`, `OVEREXPRESSED`, `NEGATIVE` | HER2 amplification or overexpression (3+ IHC) | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `FLUOROPYRIMIDINE`, `OXALIPLATIN`, `IRINOTECAN`, `ANTI_EGFR`, `ANTI_VEGF`, `IMMUNOTHERAPY`, `BRAF_COMBINATION_THERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `FLUOROPYRIMIDINE`, `OXALIPLATIN`, `IRINOTECAN`, `ANTI_EGFR`, `ANTI_VEGF`, `IMMUNOTHERAPY`, `BRAF_COMBINATION_THERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `rasStatus`: 'RAS wild-type' (required for anti-EGFR) -> `WILD_TYPE`. 'KRAS or NRAS mutant' -> `KRAS_MUTATED`, `NRAS_MUTATED`. 'KRAS G12C' -> use `krasG12cStatus` in addition.
- `brafStatus`: V600E is the actionable variant. 'BRAF V600E-mutant' -> `V600E`. 'BRAF wild-type' -> `WILD_TYPE`.
- `msiStatus`: MSI-H by PCR and dMMR by IHC are treated as the same value (`MSI_HIGH_DMMR`). Do not split by assay.
- `her2Status`: requires amplification or IHC 3+ (`AMPLIFIED` / `OVEREXPRESSED`), not breast-style 'positive.'
- `liverLimitedDisease`: `true` only for trials specifically requiring liver-confined metastases (e.g., HAI / liver-directed). Otherwise `null`.

---

## Head & Neck

Schema key: `head_and_neck` &nbsp;|&nbsp; Block: `"headAndNeck"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `primarySite` | multi-select: `ORAL_CAVITY`, `OROPHARYNX`, `LARYNX`, `HYPOPHARYNX`, `NASOPHARYNX`, `SALIVARY_GLAND` | Anatomic primary site within head and neck | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `LOCALLY_ADVANCED`, `RECURRENT`, `METASTATIC` | Disease extent / treatment intent | List every value the trial accepts; `null` if unrestricted. |
| `hpvP16Status` | multi-select: `POSITIVE`, `NEGATIVE` | HPV/p16 status (especially oropharyngeal) | List every value the trial accepts; `null` if unrestricted. |
| `ebvStatus` | multi-select: `POSITIVE`, `NEGATIVE` | EBV status (relevant for nasopharyngeal carcinoma) | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `pdl1CpsCategory` | multi-select: `HIGH_GE_20`, `INTERMEDIATE_1_19`, `NEGATIVE_LT_1` | PD-L1 combined positive score band | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `RADIATION`, `PLATINUM`, `IMMUNOTHERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `RADIATION`, `PLATINUM`, `IMMUNOTHERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `diseaseSetting`: locally advanced (curative-intent chemoradiation) is deliberately kept separate from recurrent/metastatic. Do **not** merge them even though some trials use 'locally advanced or metastatic' phrasing — record both values explicitly in that case but treat them as distinct settings.
- `hpvP16Status`: p16 IHC is the standard surrogate for HPV in oropharyngeal cancer; treat 'p16-positive' and 'HPV-positive' as the same value here. Non-oropharyngeal sites: HPV status often `null`.
- `ebvStatus`: relevant for nasopharyngeal carcinoma; `null` for most other sites unless the trial specifies.

---

## Ovarian / Fallopian / Primary Peritoneal

Schema key: `ovarian` &nbsp;|&nbsp; Block: `"ovarian"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `HIGH_GRADE_SEROUS`, `LOW_GRADE_SEROUS`, `MUCINOUS`, `CLEAR_CELL`, `ENDOMETRIOID` | Histologic subtype | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `NEWLY_DIAGNOSED`, `MAINTENANCE`, `RECURRENT` | Treatment phase (newly diagnosed, maintenance, recurrent) | List every value the trial accepts; `null` if unrestricted. |
| `platinumSensitivity` | multi-select: `SENSITIVE`, `RESISTANT`, `REFRACTORY` | Platinum sensitivity status | List every value the trial accepts; `null` if unrestricted. |
| `brcaStatus` | multi-select: `GERMLINE`, `SOMATIC`, `NEGATIVE` | BRCA1/2 mutation source (germline only, somatic only, or both possible) | List every value the trial accepts; `null` if unrestricted. |
| `hrdStatus` | multi-select: `POSITIVE`, `NEGATIVE` | Homologous recombination deficiency status (Myriad MyChoice or equivalent) | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cnsMetastases` | multi-select: `ABSENT`, `TREATED_STABLE`, `ACTIVE` | CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `DEBULKING`, `PLATINUM`, `BEVACIZUMAB`, `PARPI` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `DEBULKING`, `PLATINUM`, `BEVACIZUMAB`, `PARPI` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `platinumSensitivity`: platinum-sensitive (>=6 mo), platinum-resistant (<6 mo), refractory (progression on platinum) are distinct. List all the trial enrolls.
- `brcaStatus` / `hrdStatus`: BRCA mutation is a subset of HRD. A trial requiring HRD-positive-including-BRCA -> set hrdStatus to POSITIVE; populate `brcaStatus` only if the trial separately gates on BRCA.
- `diseaseSetting`: maintenance trials (post-platinum, no progression) are `MAINTENANCE`, distinct from `RECURRENT`.

---

## Uterine / Endometrial

Schema key: `uterine` &nbsp;|&nbsp; Block: `"uterine"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `ENDOMETRIOID`, `SEROUS`, `CARCINOSARCOMA`, `CLEAR_CELL` | Histologic subtype | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `EARLY_STAGE`, `LOCALLY_ADVANCED`, `RECURRENT`, `METASTATIC` | Disease extent | List every value the trial accepts; `null` if unrestricted. |
| `tcgaMolecularClass` | multi-select: `POLE_ULTRAMUTATED`, `MSI_HYPERMUTATED_DMMR`, `COPY_NUMBER_LOW_NSMP`, `COPY_NUMBER_HIGH_P53ABN` | TCGA molecular classification | List every value the trial accepts; `null` if unrestricted. |
| `msiStatus` | multi-select: `MSI_HIGH_DMMR`, `MSS_PMMR` | MSI / MMR status | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `POSITIVE`, `NEGATIVE` | HER2 expression status | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `RADIATION`, `PLATINUM`, `IMMUNOTHERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `RADIATION`, `PLATINUM`, `IMMUNOTHERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `tcgaMolecularClass`: populate only when the trial uses TCGA/ProMisE classification. Otherwise use `msiStatus` and leave TCGA class `null`.
- `msiStatus`: dMMR/MSI-H endometrial trials -> `MSI_HIGH_DMMR`. pMMR/MSS -> `MSS_PMMR`.
- Carcinosarcoma is a distinct histology value — do not fold into serous or endometrioid.

---

## Cervical

Schema key: `cervical` &nbsp;|&nbsp; Block: `"cervical"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `SQUAMOUS`, `ADENOCARCINOMA`, `ADENOSQUAMOUS` | Histologic subtype | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `LOCALLY_ADVANCED`, `RECURRENT`, `METASTATIC` | Disease extent | List every value the trial accepts; `null` if unrestricted. |
| `hpvStatus` | multi-select: `POSITIVE`, `NEGATIVE` | HPV positivity | List every value the trial accepts; `null` if unrestricted. |
| `pdl1CpsCategory` | multi-select: `POSITIVE_GE_1`, `NEGATIVE_LT_1` | PD-L1 combined positive score band | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `CHEMORADIATION`, `PLATINUM`, `IMMUNOTHERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `CHEMORADIATION`, `PLATINUM`, `IMMUNOTHERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `diseaseSetting`: as with head & neck, locally advanced (definitive chemoradiation) is kept separate from recurrent/metastatic.
- `pdl1CpsCategory`: cervical trials typically gate on CPS >=1; map accordingly.

---

## Melanoma

Schema key: `melanoma` &nbsp;|&nbsp; Block: `"melanoma"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `primarySite` | multi-select: `CUTANEOUS`, `MUCOSAL`, `UVEAL`, `ACRAL` | Anatomic origin of primary melanoma | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `RESECTED_ADJUVANT`, `UNRESECTABLE`, `METASTATIC` | Treatment setting | List every value the trial accepts; `null` if unrestricted. |
| `brafStatus` | multi-select: `V600E`, `V600K`, `NON_V600`, `WILD_TYPE` | BRAF mutation type | List every value the trial accepts; `null` if unrestricted. |
| `nrasStatus` | multi-select: `MUTATED`, `WILD_TYPE` | NRAS mutation status | List every value the trial accepts; `null` if unrestricted. |
| `ldhCategory` | multi-select: `NORMAL`, `ELEVATED_1_2X_ULN`, `ELEVATED_GT_2X_ULN` | LDH level relative to ULN (used for M1 sub-staging) | List every value the trial accepts; `null` if unrestricted. |
| `cnsMetastases` | multi-select: `ABSENT`, `TREATED_STABLE`, `ACTIVE` | CNS/brain metastases; TREATED_STABLE = prior local therapy with no progression | List every value the trial accepts; `null` if unrestricted. |
| `leptomeningealDisease` | boolean | Leptomeningeal disease present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `IMMUNOTHERAPY`, `BRAF_MEK_INHIBITOR` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `IMMUNOTHERAPY`, `BRAF_MEK_INHIBITOR` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `primarySite`: cutaneous vs mucosal vs uveal vs acral drive very different trials. Uveal melanoma trials should not be annotated as cutaneous.
- `brafStatus`: V600E and V600K are separate values (both BRAF/MEK-targetable). 'BRAF V600' unspecified -> list `V600E` and `V600K`.
- `diseaseSetting`: resected adjuvant (stage III/IV NED) is distinct from unresectable/metastatic.
- `ldhCategory`: only populate if the trial gates on LDH (some IO and uveal trials do). Map to the trial's ULN multiples.

---

## Mesothelioma

Schema key: `mesothelioma` &nbsp;|&nbsp; Block: `"mesothelioma"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `EPITHELIOID`, `SARCOMATOID`, `BIPHASIC` | Histologic subtype | List every value the trial accepts; `null` if unrestricted. |
| `primarySite` | multi-select: `PLEURAL`, `PERITONEAL` | Pleural or peritoneal origin | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `RESECTABLE`, `UNRESECTABLE`, `METASTATIC` | Disease extent / resectability | List every value the trial accepts; `null` if unrestricted. |
| `bap1Status` | multi-select: `LOST`, `INTACT` | BAP1 expression status (germline or tumor) | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseModifiedRecist` | boolean | Measurable disease per modified RECIST for mesothelioma | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `PLATINUM`, `PEMETREXED`, `IMMUNOTHERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `PLATINUM`, `PEMETREXED`, `IMMUNOTHERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `histology`: epithelioid vs sarcomatoid vs biphasic — prognostically and therapeutically distinct; list all the trial enrolls.
- `measurableDiseaseModifiedRecist`: mesothelioma uses **modified** RECIST; `true` only if measurable disease by mRECIST is required.

---

## Gastroesophageal (Gastric / GEJ / Esophageal)

Schema key: `gastroesophageal` &nbsp;|&nbsp; Block: `"gastroesophageal"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `primarySiteHistology` | multi-select: `ESOPHAGEAL_SQUAMOUS`, `ESOPHAGEAL_ADENOCARCINOMA`, `GEJ_ADENOCARCINOMA`, `GASTRIC_ADENOCARCINOMA`, `OTHER` | Combined anatomic site and histology | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `NEOADJUVANT`, `PERIOPERATIVE`, `LOCALLY_ADVANCED`, `METASTATIC` | Treatment setting / disease extent | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `POSITIVE`, `NEGATIVE` | HER2 status (IHC 3+ or ISH amplified is positive) | List every value the trial accepts; `null` if unrestricted. |
| `pdl1CpsCategory` | multi-select: `HIGH_GE_10`, `INTERMEDIATE_1_9`, `NEGATIVE_LT_1` | PD-L1 combined positive score band | List every value the trial accepts; `null` if unrestricted. |
| `msiStatus` | multi-select: `MSI_HIGH_DMMR`, `MSS_PMMR` | MSI / MMR status | List every value the trial accepts; `null` if unrestricted. |
| `claudin18_2Status` | multi-select: `POSITIVE`, `NEGATIVE` | Claudin 18.2 expression (zolbetuximab eligibility, ≥75% 2+/3+ IHC) | List every value the trial accepts; `null` if unrestricted. |
| `fgfr2bStatus` | multi-select: `OVEREXPRESSED`, `NEGATIVE` | FGFR2b overexpression (bemarituzumab eligibility) | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `FLUOROPYRIMIDINE`, `PLATINUM`, `IMMUNOTHERAPY`, `HER2_DIRECTED_THERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `FLUOROPYRIMIDINE`, `PLATINUM`, `IMMUNOTHERAPY`, `HER2_DIRECTED_THERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `primarySiteHistology`: esophageal squamous vs adenocarcinoma is a hard split (different drug labels). GEJ and gastric adenocarcinoma are separate values.
- `her2Status`: gastric HER2 positivity = IHC 3+ or IHC 2+/ISH+. Record `POSITIVE` per the trial's stated definition.
- `claudin18_2Status`: zolbetuximab trials typically require CLDN18.2 >=75% of tumor cells 2+/3+; record `POSITIVE` when the trial requires it.
- `pdl1CpsCategory`: map the trial's CPS cut-point (often >=5 or >=10) to the bands.

---

## Neuroendocrine Tumors

Schema key: `neuroendocrine` &nbsp;|&nbsp; Block: `"neuroendocrine"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `primarySite` | multi-select: `PANCREATIC`, `GI_MIDGUT`, `GI_HINDGUT`, `LUNG`, `OTHER` | Anatomic origin | List every value the trial accepts; `null` if unrestricted. |
| `differentiation` | multi-select: `WELL_DIFFERENTIATED`, `POORLY_DIFFERENTIATED` | Well-differentiated NET vs poorly-differentiated NEC | List every value the trial accepts; `null` if unrestricted. |
| `grade` | multi-select: `G1`, `G2`, `G3` | WHO grade based on Ki-67 and mitotic count | List every value the trial accepts; `null` if unrestricted. |
| `ki67Percent` | number | Ki-67 proliferation index as a percentage | Record the trial's stated numeric threshold; `null` if none stated. |
| `functionalStatus` | multi-select: `FUNCTIONAL`, `NON_FUNCTIONAL` | Hormone-secreting (functional) vs non-functional tumor | List every value the trial accepts; `null` if unrestricted. |
| `somatostatinReceptorImagingPositive` | boolean | SSR-imaging positive (Ga-68 DOTATATE PET or octreotide scan) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `SOMATOSTATIN_ANALOG`, `CHEMOTHERAPY`, `PRRT`, `EVEROLIMUS` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `SOMATOSTATIN_ANALOG`, `CHEMOTHERAPY`, `PRRT`, `EVEROLIMUS` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `differentiation` vs `grade`: well-differentiated NET and poorly-differentiated NEC are biologically distinct; `grade` (G1/G2/G3) is separate and can co-exist (e.g., well-differentiated G3 NET).
- `ki67Percent`: record the numeric threshold the trial states (e.g., 'Ki-67 <20%' -> capture as the relevant bound). If only grade is given, leave `ki67Percent` `null` and use `grade`.
- `somatostatinReceptorImagingPositive`: `true` only if SSR-imaging positivity (Ga-68 DOTATATE, etc.) is an eligibility requirement (typical for PRRT trials).

---

## Pancreatic

Schema key: `pancreatic` &nbsp;|&nbsp; Block: `"pancreatic"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `resectability` | multi-select: `RESECTABLE`, `BORDERLINE`, `LOCALLY_ADVANCED`, `METASTATIC` | Surgical resectability category | List every value the trial accepts; `null` if unrestricted. |
| `histology` | multi-select: `ADENOCARCINOMA`, `OTHER` | Adenocarcinoma vs other (NETs handled in neuroendocrine block) | List every value the trial accepts; `null` if unrestricted. |
| `krasStatus` | multi-select: `G12C`, `G12D`, `OTHER_KRAS`, `WILD_TYPE` | KRAS mutation variant | List every value the trial accepts; `null` if unrestricted. |
| `brcaStatus` | multi-select: `GERMLINE`, `SOMATIC`, `NEGATIVE` | BRCA1/2 mutation source (germline only, somatic only, or both possible) | List every value the trial accepts; `null` if unrestricted. |
| `msiStatus` | multi-select: `MSI_HIGH_DMMR`, `MSS_PMMR` | MSI / MMR status | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `ca199Elevated` | boolean | CA 19-9 elevated above laboratory ULN | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `FOLFIRINOX`, `GEMCITABINE_NABPACLITAXEL`, `IMMUNOTHERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `FOLFIRINOX`, `GEMCITABINE_NABPACLITAXEL`, `IMMUNOTHERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `resectability`: resectable / borderline / locally advanced / metastatic are a key gate. Neoadjuvant trials are usually `RESECTABLE` or `BORDERLINE`.
- `krasStatus`: G12C and G12D are now separately targetable — record the specific variant if the trial gates on it; otherwise `OTHER_KRAS` for unspecified KRAS-mutant.
- `brcaStatus`: germline BRCA (POLO-style maintenance) vs somatic; record per the trial.

---

## CNS / Glioma

Schema key: `cns` &nbsp;|&nbsp; Block: `"cns"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `histology` | multi-select: `GLIOBLASTOMA`, `ASTROCYTOMA`, `OLIGODENDROGLIOMA`, `EPENDYMOMA`, `MEDULLOBLASTOMA`, `MENINGIOMA`, `PRIMARY_CNS_LYMPHOMA`, `OTHER` | WHO CNS tumor histology | List every value the trial accepts; `null` if unrestricted. |
| `whoGrade` | multi-select: `1`, `2`, `3`, `4` | WHO CNS grade | List every value the trial accepts; `null` if unrestricted. |
| `diseaseStatus` | multi-select: `NEWLY_DIAGNOSED`, `RECURRENT_PROGRESSIVE` | Newly diagnosed vs recurrent/progressive after first-line | List every value the trial accepts; `null` if unrestricted. |
| `idhStatus` | multi-select: `MUTANT`, `WILD_TYPE` | IDH1/2 mutation status (defining for adult diffuse gliomas) | List every value the trial accepts; `null` if unrestricted. |
| `codeletion1p19q` | boolean | 1p/19q co-deletion (oligodendroglioma-defining) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `mgmtMethylated` | boolean | MGMT promoter methylation (temozolomide benefit predictor) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `egfrAmplified` | boolean | EGFR amplification / EGFRvIII present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `atrxLoss` | boolean | ATRX loss of expression | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `braf600eMutated` | boolean | BRAF V600E mutation present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRano` | boolean | Measurable disease per RANO criteria | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `resectionExtent` | multi-select: `BIOPSY_ONLY`, `SUBTOTAL`, `GROSS_TOTAL` | Extent of surgical resection | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `RADIOTHERAPY`, `TEMOZOLOMIDE`, `BEVACIZUMAB`, `TTFIELDS` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `RADIOTHERAPY`, `TEMOZOLOMIDE`, `BEVACIZUMAB`, `TTFIELDS` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `histology` and `whoGrade` follow the WHO CNS classification. Adult-type diffuse gliomas are the common case: glioblastoma is by definition IDH-wild-type WHO grade 4; IDH-mutant astrocytomas are grade 2-4; oligodendroglioma requires IDH-mutant and 1p/19q co-deleted.
- `idhStatus`: defining for adult diffuse glioma trials. 'IDH-mutant glioma' -> `MUTANT`; 'glioblastoma, IDH-wildtype' -> `WILD_TYPE`. Many newer trials gate hard on this.
- `codeletion1p19q`: `true` only when 1p/19q co-deletion is required (oligodendroglioma trials) or used as an inclusion; `false` if explicitly excluded; `null` if not addressed.
- `mgmtMethylated`: record only if the trial gates on or stratifies by MGMT promoter methylation. Many newly-diagnosed GBM trials stratify by this; record per the trial's stated requirement, not as a universal.
- `braf600eMutated`: relevant for pediatric-type and rare adult gliomas / epithelioid GBM (dabrafenib-trametinib trials).
- `diseaseStatus`: newly diagnosed (pre- or peri-chemoradiation) vs recurrent/progressive after first-line are distinct trial populations; do not conflate.
- `measurableDiseaseRano`: CNS trials use RANO, not RECIST. `true` only if measurable disease per RANO is required (note some GBM trials enroll non-measurable post-resection disease).
- `resectionExtent`: gross-total vs subtotal vs biopsy-only is a real eligibility gate in some trials; record per the operative criterion.
- Primary CNS lymphoma is included in the `histology` enum but is biologically a lymphoma; if a trial is clearly a PCNSL lymphoma-directed trial it may also map to `mature_b_cell` — annotate both applicable blocks.

---

## Hepatocellular Carcinoma (HCC)

Schema key: `hcc` &nbsp;|&nbsp; Block: `"hcc"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `diseaseSetting` | multi-select: `RESECTABLE`, `LOCALLY_ADVANCED`, `METASTATIC` | Resectability / disease extent | List every value the trial accepts; `null` if unrestricted. |
| `childPughClass` | multi-select: `A`, `B`, `C` | Child-Pugh liver function class (key HCC eligibility gate) | List every value the trial accepts; `null` if unrestricted. |
| `bclcStage` | multi-select: `0`, `A`, `B`, `C`, `D` | Barcelona Clinic Liver Cancer stage | List every value the trial accepts; `null` if unrestricted. |
| `viralHepatitisStatus` | multi-select: `HBV`, `HCV`, `NONE` | Underlying viral hepatitis etiology (eligibility / stratification) | List every value the trial accepts; `null` if unrestricted. |
| `portalVeinInvasion` | boolean | Macrovascular / portal vein tumor invasion present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `extrahepaticSpread` | boolean | Extrahepatic spread present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `afpElevated` | boolean | Alpha-fetoprotein elevated above trial threshold (ramucirumab-type gate) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorLocoregionalTherapy` | boolean | Prior TACE / TARE / ablation / SBRT to liver | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 or mRECIST | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `ATEZOLIZUMAB_BEVACIZUMAB`, `TKI`, `IMMUNOTHERAPY`, `TRANSARTERIAL_THERAPY` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `ATEZOLIZUMAB_BEVACIZUMAB`, `TKI`, `IMMUNOTHERAPY`, `TRANSARTERIAL_THERAPY` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `childPughClass`: the single most common HCC eligibility gate. 'Child-Pugh A only' -> `A`. 'Child-Pugh A or B7' -> `A`, `B` (note the trial's B sub-threshold in the adjudication note if it restricts to B7). Record exactly what the trial permits.
- `bclcStage`: Barcelona Clinic Liver Cancer stage; list every stage the trial enrolls. Advanced-HCC systemic-therapy trials are typically BCLC `C` (and sometimes `B` refractory to locoregional therapy).
- `viralHepatitisStatus`: record HBV / HCV / NONE per the trial's etiology criteria or stratification. Many IO trials stratify by viral vs non-viral; `null` if the trial places no etiology constraint.
- `portalVeinInvasion` / `extrahepaticSpread`: `true` only if required for inclusion; `false` if explicitly excluded; `null` if unaddressed. These often distinguish locoregional-therapy trials from systemic ones.
- `afpElevated`: `true` only when an AFP threshold is an explicit eligibility criterion (e.g. ramucirumab-class AFP >=400). Do not infer from the disease.
- `priorLocoregionalTherapy`: `true` if prior TACE/TARE/ablation/SBRT is required; `false` if it is an exclusion; `null` if unaddressed.
- `measurableDiseaseRecist`: HCC trials may use RECIST 1.1 or mRECIST; record `true` if either is required and note which in the adjudication note if the trial specifies.

---

## Biliary Tract (Cholangiocarcinoma / Gallbladder)

Schema key: `biliary` &nbsp;|&nbsp; Block: `"biliary"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `primarySite` | multi-select: `INTRAHEPATIC_CHOLANGIO`, `EXTRAHEPATIC_CHOLANGIO`, `GALLBLADDER`, `AMPULLARY` | Anatomic primary site within the biliary tract | List every value the trial accepts; `null` if unrestricted. |
| `diseaseSetting` | multi-select: `RESECTABLE`, `LOCALLY_ADVANCED`, `METASTATIC` | Resectability / disease extent | List every value the trial accepts; `null` if unrestricted. |
| `fgfr2Status` | multi-select: `FUSION`, `WILD_TYPE` | FGFR2 fusion/rearrangement (pemigatinib/futibatinib eligibility) | List every value the trial accepts; `null` if unrestricted. |
| `idh1Status` | multi-select: `MUTANT`, `WILD_TYPE` | IDH1 mutation (ivosidenib eligibility) | List every value the trial accepts; `null` if unrestricted. |
| `her2Status` | multi-select: `POSITIVE`, `NEGATIVE` | HER2 amplification/overexpression | List every value the trial accepts; `null` if unrestricted. |
| `brafStatus` | multi-select: `V600E`, `WILD_TYPE` | BRAF V600E mutation | List every value the trial accepts; `null` if unrestricted. |
| `krasStatus` | multi-select: `G12C`, `OTHER_KRAS`, `WILD_TYPE` | KRAS mutation status | List every value the trial accepts; `null` if unrestricted. |
| `msiStatus` | multi-select: `MSI_HIGH_DMMR`, `MSS_PMMR` | MSI / MMR status | List every value the trial accepts; `null` if unrestricted. |
| `measurableDiseaseRecist` | boolean | Measurable disease per RECIST 1.1 | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `GEMCITABINE_CISPLATIN`, `IMMUNOTHERAPY`, `FGFR_INHIBITOR`, `IDH1_INHIBITOR` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `GEMCITABINE_CISPLATIN`, `IMMUNOTHERAPY`, `FGFR_INHIBITOR`, `IDH1_INHIBITOR` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `primarySite`: intrahepatic vs extrahepatic cholangiocarcinoma vs gallbladder vs ampullary are distinct and some trials enroll only one. List every site the trial accepts.
- `fgfr2Status`: FGFR2 fusion/rearrangement is a hard gate for pemigatinib/futibatinib-class trials and is largely confined to intrahepatic cholangiocarcinoma. 'FGFR2 fusion-positive' -> `FUSION`.
- `idh1Status`: IDH1 mutation gates ivosidenib-class trials. Record `MUTANT` only when required/positive per the trial.
- `her2Status`: HER2-amplified/overexpressed biliary trials (zanidatamab, T-DXd basket). Record `POSITIVE` per the trial's stated definition (IHC/ISH).
- `brafStatus`: BRAF V600E (dabrafenib-trametinib basket).
- `krasStatus`: record G12C specifically if the trial gates on it; `OTHER_KRAS` for unspecified KRAS-mutant; otherwise per the trial.
- `msiStatus`: MSI-H/dMMR biliary qualifies for pembrolizumab-type basket trials; record `MSI_HIGH_DMMR` when required.
- Gallbladder and ampullary carcinomas are included here; if a trial is an ampullary trial explicitly framed as pancreaticobiliary, annotate `biliary` and flag in the adjudication note if site mapping is ambiguous.

---

## Mature B-Cell Lymphoma

Schema key: `mature_b_cell` &nbsp;|&nbsp; Block: `"matureBCell"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `acceptedDiseases` | multi-select: `DLBCL_NOS`, `HGBCL`, `HGBCL_DH_TH`, `PMBCL`, `DLBCL_LEG_TYPE`, `TCRBCL`, `TRANSFORMED_FL`, `TRANSFORMED_MZL`, `RICHTER`, `FL`, `MCL`, `MZL`, `CHL`, `CLL_SLL`, `WALDENSTROM`, `HCL`, `OTHER` | Disease subtypes the trial enrolls within this lineage | List every value the trial accepts; `null` if unrestricted. |
| `cellOfOrigin` | multi-select: `GCB`, `NON_GCB_ABC` | DLBCL cell-of-origin classification | List every value the trial accepts; `null` if unrestricted. |
| `doubleOrTripleHit` | boolean | Double-hit (MYC + BCL2 or BCL6) or triple-hit cytogenetics | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `ighvStatus` | multi-select: `MUTATED`, `UNMUTATED` | IGHV mutation status (CLL prognostic marker) | List every value the trial accepts; `null` if unrestricted. |
| `del17pOrTp53Mutated` | boolean | 17p deletion or TP53 mutation (CLL high-risk) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `myd88Status` | multi-select: `L265P`, `WILD_TYPE` | MYD88 L265P mutation (Waldenstrom marker) | List every value the trial accepts; `null` if unrestricted. |
| `cnsInvolvement` | boolean | CNS involvement by the underlying hematologic malignancy | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cd19Positive` | boolean | CD19 expression on tumor cells | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cd20Positive` | boolean | CD20 expression on tumor cells | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cd22Positive` | boolean | CD22 expression on tumor cells | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cd79bPositive` | boolean | CD79b expression (polatuzumab eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `transplantEligible` | boolean | Eligible for autologous stem cell transplant | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `ANTI_CD20`, `ANTI_CD19`, `BTK_INHIBITOR`, `BCL2_INHIBITOR`, `ANTHRACYCLINE`, `BISPECIFIC`, `CAR_T`, `AUTO_TRANSPLANT`, `ALLO_TRANSPLANT` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `ANTI_CD20`, `ANTI_CD19`, `BTK_INHIBITOR`, `BCL2_INHIBITOR`, `ANTHRACYCLINE`, `BISPECIFIC`, `CAR_T`, `AUTO_TRANSPLANT`, `ALLO_TRANSPLANT` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `acceptedDiseases`: this is the primary scoping field. List every lymphoma subtype the trial enrolls. A DLBCL-only trial -> DLBCL_NOS (plus HGBCL/transformed variants only if explicitly included).
- `cellOfOrigin`: GCB vs non-GCB/ABC (Hans algorithm or GEP). Populate only if the trial gates on COO.
- `del17pOrTp53Mutated`: CLL high-risk marker; `true` if the trial requires it, `false` if excluded, `null` if not addressed.
- CD-marker booleans (`cd19Positive`, etc.): `true` only if the trial requires antigen positivity (e.g., CD19+ for CAR-T / bispecific).

---

## Mature T/NK-Cell Lymphoma

Schema key: `mature_t_nk_cell` &nbsp;|&nbsp; Block: `"matureTnk"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `acceptedDiseases` | multi-select: `PTCL_NOS`, `AITL`, `ALCL_ALK_POS`, `ALCL_ALK_NEG`, `CTCL_MF`, `CTCL_SS`, `NK_T`, `HSTCL`, `MEITL`, `EATL`, `ATL`, `OTHER` | Disease subtypes the trial enrolls within this lineage | List every value the trial accepts; `null` if unrestricted. |
| `atlSubtype` | multi-select: `ACUTE`, `LYMPHOMATOUS`, `CHRONIC`, `SMOLDERING` | ATL clinical subtype (Shimoyama classification) | List every value the trial accepts; `null` if unrestricted. |
| `htlv1Status` | multi-select: `POSITIVE`, `NEGATIVE` | HTLV-1 serology status | List every value the trial accepts; `null` if unrestricted. |
| `cd30Positive` | boolean | CD30 expression (brentuximab eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `ccr4Positive` | boolean | CCR4 expression (mogamulizumab eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cnsInvolvement` | boolean | CNS involvement by the underlying hematologic malignancy | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `ctclStageAdvanced` | boolean | Advanced CTCL stage (IIB or higher) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `BRENTUXIMAB`, `MOGAMULIZUMAB`, `CHEMOTHERAPY`, `AUTO_TRANSPLANT`, `ALLO_TRANSPLANT` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `BRENTUXIMAB`, `MOGAMULIZUMAB`, `CHEMOTHERAPY`, `AUTO_TRANSPLANT`, `ALLO_TRANSPLANT` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `acceptedDiseases`: primary scoping field — PTCL-NOS, AITL, ALCL (ALK+/-), CTCL (MF/SS), NK/T, etc. are distinct. List all enrolled.
- `cd30Positive`: brentuximab-vedotin trials typically require CD30 expression; record per the trial's threshold.
- `htlv1Status`: relevant for ATL; `null` for most non-ATL trials.

---

## Myeloid Neoplasms (AML / MDS / MPN / CML)

Schema key: `myeloid_neoplasm` &nbsp;|&nbsp; Block: `"myeloid"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `acceptedDiseases` | multi-select: `AML`, `MDS`, `CMML`, `MDS_MPN`, `MPN_PV`, `MPN_ET`, `MPN_MF`, `CML`, `OTHER` | Disease subtypes the trial enrolls within this lineage | List every value the trial accepts; `null` if unrestricted. |
| `amlClassification` | multi-select: `DE_NOVO`, `SECONDARY`, `THERAPY_RELATED` | AML etiology (de novo, secondary from prior MDS/MPN, therapy-related) | List every value the trial accepts; `null` if unrestricted. |
| `elnRisk` | multi-select: `FAVORABLE`, `INTERMEDIATE`, `ADVERSE` | ELN 2022 risk category | List every value the trial accepts; `null` if unrestricted. |
| `flt3Status` | multi-select: `ITD`, `TKD`, `WILD_TYPE` | FLT3 mutation type | List every value the trial accepts; `null` if unrestricted. |
| `npm1Mutated` | boolean | NPM1 mutation status | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `idh1Mutated` | boolean | IDH1 mutation status (ivosidenib eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `idh2Mutated` | boolean | IDH2 mutation status (enasidenib eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `kmt2aRearranged` | boolean | KMT2A (MLL) rearrangement (revumenib eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `ipssR` | multi-select: `VERY_LOW`, `LOW`, `INT`, `HIGH`, `VERY_HIGH` | IPSS-R risk score (MDS) | List every value the trial accepts; `null` if unrestricted. |
| `ipssM` | multi-select: `VERY_LOW`, `LOW`, `MODERATE_LOW`, `MODERATE_HIGH`, `HIGH`, `VERY_HIGH` | IPSS-M risk score (MDS, molecular-integrated) | List every value the trial accepts; `null` if unrestricted. |
| `minBlastsPercent` | number | Minimum bone marrow blast percentage required | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxBlastsPercent` | number | Maximum bone marrow blast percentage allowed | Record the trial's stated numeric threshold; `null` if none stated. |
| `ringSideroblasts` | boolean | Ring sideroblasts present (MDS-RS) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `sf3b1Mutated` | boolean | SF3B1 mutation status (MDS-RS / luspatercept eligibility) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `jak2Status` | multi-select: `V617F`, `EXON12`, `WILD_TYPE` | JAK2 mutation type (MPN driver) | List every value the trial accepts; `null` if unrestricted. |
| `calrMutated` | boolean | CALR mutation status (MPN driver) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `mplMutated` | boolean | MPL mutation status (MPN driver) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `bcrAblStatus` | multi-select: `POSITIVE`, `NEGATIVE` | BCR-ABL fusion status (CML) | List every value the trial accepts; `null` if unrestricted. |
| `cmlPhase` | multi-select: `CHRONIC`, `ACCELERATED`, `BLAST` | CML phase | List every value the trial accepts; `null` if unrestricted. |
| `complexKaryotype` | boolean | Complex karyotype (≥3 abnormalities) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `monosomy7OrDel7q` | boolean | Monosomy 7 or 7q deletion | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `tp53Mutated` | boolean | TP53 mutation status | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cnsInvolvement` | boolean | CNS involvement by the underlying hematologic malignancy | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `priorTherapyRequired` | multi-select: `HMA`, `VENETOCLAX`, `INTENSIVE_CHEMOTHERAPY`, `FLT3_INHIBITOR`, `IDH_INHIBITOR`, `MENIN_INHIBITOR`, `JAK_INHIBITOR`, `BCR_ABL_TKI`, `ALLO_TRANSPLANT` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `HMA`, `VENETOCLAX`, `INTENSIVE_CHEMOTHERAPY`, `FLT3_INHIBITOR`, `IDH_INHIBITOR`, `MENIN_INHIBITOR`, `JAK_INHIBITOR`, `BCR_ABL_TKI`, `ALLO_TRANSPLANT` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `acceptedDiseases`: AML, MDS, CMML, MPN subtypes, CML are distinct. This field scopes the trial.
- `flt3Status`, `idh1Mutated`, `idh2Mutated`, `npm1Mutated`, `kmt2aRearranged`: populate the specific mutation only if the trial gates on it (targeted-therapy trials). General AML trials -> `null`.
- `ipssR` / `ipssM`: MDS risk scores; list all categories the trial enrolls. 'Higher-risk MDS' -> the relevant HIGH/VERY_HIGH (and INT depending on the trial's definition).
- `minBlastsPercent` / `maxBlastsPercent`: record the marrow blast bounds the trial states (e.g., MDS '<5% blasts', AML '>=20% blasts').

---

## Precursor Lymphoid (ALL / LBL)

Schema key: `precursor_lymphoid` &nbsp;|&nbsp; Block: `"precursorLymphoid"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `acceptedDiseases` | multi-select: `B_ALL`, `T_ALL`, `LBL_B`, `LBL_T`, `OTHER` | Disease subtypes the trial enrolls within this lineage | List every value the trial accepts; `null` if unrestricted. |
| `philadelphiaStatus` | multi-select: `POSITIVE`, `PH_LIKE`, `NEGATIVE` | Ph chromosome / BCR-ABL status (including Ph-like) | List every value the trial accepts; `null` if unrestricted. |
| `cd19Positive` | boolean | CD19 expression on tumor cells | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cd22Positive` | boolean | CD22 expression on tumor cells | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cd7Positive` | boolean | CD7 expression (T-ALL) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `mrdStatus` | multi-select: `POSITIVE`, `NEGATIVE` | Minimal residual disease status | List every value the trial accepts; `null` if unrestricted. |
| `cnsStatus` | multi-select: `CNS1`, `CNS2`, `CNS3` | CNS leukemia status (CNS1/2/3) | List every value the trial accepts; `null` if unrestricted. |
| `minRelapseNumber` | number | Minimum number of prior relapses | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxRelapseNumber` | number | Maximum number of prior relapses | Record the trial's stated numeric threshold; `null` if none stated. |
| `priorTherapyRequired` | multi-select: `BLINATUMOMAB`, `INOTUZUMAB`, `CAR_T`, `BCR_ABL_TKI`, `ALLO_TRANSPLANT` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `BLINATUMOMAB`, `INOTUZUMAB`, `CAR_T`, `BCR_ABL_TKI`, `ALLO_TRANSPLANT` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `philadelphiaStatus`: Ph+ (BCR-ABL+), Ph-like, and Ph- are distinct and drive TKI eligibility. List all enrolled.
- `mrdStatus`: MRD+ vs MRD- trials are distinct (e.g., blinatumomab MRD trials). Record per the trial.
- `minRelapseNumber` / `maxRelapseNumber`: record relapse-count bounds if the trial states them.

---

## Plasma Cell (Myeloma / Amyloidosis)

Schema key: `plasma_cell` &nbsp;|&nbsp; Block: `"plasmaCell"`

| Field | Type | What it captures | How to annotate from the CT.gov record |
|---|---|---|---|
| `acceptedDiseases` | multi-select: `MM`, `PCL`, `PLASMACYTOMA`, `AL_AMYLOIDOSIS`, `WALDENSTROM_LPL`, `POEMS`, `OTHER` | Disease subtypes the trial enrolls within this lineage | List every value the trial accepts; `null` if unrestricted. |
| `rissStage` | multi-select: `I`, `II`, `III` | R-ISS stage (multiple myeloma) | List every value the trial accepts; `null` if unrestricted. |
| `highRiskCytogenetics` | boolean | High-risk FISH cytogenetics (del 17p, t(4;14), t(14;16), gain 1q) | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `measurableDiseaseImwg` | boolean | Measurable disease per IMWG criteria | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `extramedullaryDisease` | boolean | Extramedullary disease present | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `cnsInvolvement` | boolean | CNS involvement by the underlying hematologic malignancy | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `amyloidCardiacInvolvement` | boolean | Cardiac involvement in AL amyloidosis | `true` = trial requires present; `false` = explicit exclusion; `null` = unmentioned. |
| `amyloidMayoStage` | multi-select: `I`, `II`, `III`, `IIIA`, `IIIB` | Mayo Clinic AL amyloidosis stage | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyRequired` | multi-select: `IMID`, `PROTEASOME_INHIBITOR`, `ANTI_CD38`, `BCMA_THERAPY`, `BISPECIFIC`, `AUTO_TRANSPLANT`, `ALLO_TRANSPLANT` | Therapies trial requires patient to have received | List every value the trial accepts; `null` if unrestricted. |
| `priorTherapyExcluded` | multi-select: `IMID`, `PROTEASOME_INHIBITOR`, `ANTI_CD38`, `BCMA_THERAPY`, `BISPECIFIC`, `AUTO_TRANSPLANT`, `ALLO_TRANSPLANT` | Therapies trial excludes prior exposure to | List every value the trial accepts; `null` if unrestricted. |
| `minPriorSystemicLines` | number | Minimum prior lines of systemic therapy | Record the trial's stated numeric threshold; `null` if none stated. |
| `maxPriorSystemicLines` | number | Maximum prior lines of systemic therapy allowed | Record the trial's stated numeric threshold; `null` if none stated. |

**Annotation notes:**

- `acceptedDiseases`: multiple myeloma vs AL amyloidosis vs plasmacytoma vs Waldenstrom — distinct. Scope the trial here.
- `highRiskCytogenetics`: `true` if the trial requires high-risk FISH (del17p, t(4;14), t(14;16), gain 1q); `false` if excluded.
- `measurableDiseaseImwg`: myeloma trials require IMWG-measurable disease (serum/urine M-protein or involved FLC thresholds). `true` if required.
- `amyloidCardiacInvolvement` / `amyloidMayoStage`: populate for AL amyloidosis trials only.

---

## Adjudication note template

For any trial flagged during annotation, record:

```
NCT ID:
Cancer block:
Field(s) in question:
Trial language (verbatim quote, <15 words):
Reviewer interpretation:
Reason for flag (ambiguous / setting-qualifier lost / both-required-and-excluded / other):
```

These notes feed the blinded single-expert adjudication step that resolves reviewer–AI disagreements and produces the gold-standard label set.