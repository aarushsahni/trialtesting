# Annotation & Evaluation Synopsis
## Evaluating AI Extraction of Structured Eligibility Criteria from ClinicalTrials.gov

*Scope: the upstream extraction component only — converting free-text eligibility criteria into the structured schema. Methodologically distinct from end-to-end patient–trial matching validation, which uses a separate RECTIFIER-style adjudication against historical enrollment data.*

---

### 1. Objective

Establish an expert-adjudicated gold-standard corpus of structured eligibility criteria across all cancer-type blocks, and use it to quantify how accurately the AI system extracts those criteria from ClinicalTrials.gov free text, with reporting granular enough to isolate performance on the field classes that drive hard-exclusion logic.

---

### 2. Scope of cancer types

The schema covers **24 cancer-type blocks**:

- **Solid tumors (19):** prostate, urothelial, RCC, testicular, breast, lung, colorectal, head & neck, ovarian, uterine, cervical, melanoma, mesothelioma, gastroesophageal, neuroendocrine, pancreatic, CNS/glioma, HCC, biliary tract.
- **Hematologic lineages (5):** mature B-cell, mature T/NK-cell, myeloid neoplasm, precursor lymphoid, plasma cell. These are lineage blocks scoped internally by an `acceptedDiseases` array rather than one block per disease.

Stratification is per block. A trial enrolling DLBCL is annotated under `mature_b_cell` with `acceptedDiseases` capturing the subtype; within hematologic blocks, performance on the `acceptedDiseases` field is reported separately, since mis-scoping the lineage is a high-consequence error analogous to a biomarker miss. Block allocation is equal (25 trials per block, §3), not proportional to block volume, so per-block performance is estimable for every block; blocks with fewer than 25 eligible trials in the window are reported as small-sample strata.

---

### 3. Corpus composition & size

#### 3.1 Eligibility filter

A trial enters the sampling frame if it meets all of:

- **Status:** completed.
- **Primary completion date** between 1 January 2021 and 31 December 2025.
- **Study type:** interventional.
- **Location:** at least one study site in the United States.
- Maps to at least one of the 24 cancer-type blocks.

Completed trials are used because their eligibility text is final and stable, providing a fixed ground-truth target rather than a moving one. The US-site restriction aligns the frame with the regulatory and standard-of-care context the system operates in, since eligibility phrasing (e.g. line-of-therapy conventions, approved comparators) is jurisdiction-dependent. The window is restricted to 2021–2025 so the corpus reflects the contemporary biomarker and disease-classification landscape the schema encodes (e.g. KRAS G12C, HER2-low/ultralow, claudin 18.2, FGFR3-specific logic, the TCGA endometrial classes, MET exon 14), which is sparsely represented in older completed trials.

#### 3.2 Allocation

**Equal allocation: 25 trials per cancer-type block, drawn by simple random sampling from the block’s frame (§3.1).** Target N = 600 (24 blocks × 25). Allocation is balanced across blocks, not proportional to block volume, so that per-block performance is estimable for every block rather than concentrated in high-volume blocks.

#### 3.3 Block-size handling

Equal allocation requires each block to have at least 25 eligible trials in the frame. For any block with fewer than 25 eligible trials in the frame (US-sited completed interventional trials, 2021–2025):

- Take all available trials for that block.
- Report it as a small-sample stratum with explicitly wide confidence intervals.
- Do not pool it into a clinically adjacent block, and do not backfill from outside the window or eligibility filter.

The realized per-block counts are reported as a fixed property of the sample. Blocks falling short of 25 are identified before annotation begins, not reclassified post hoc.

#### 3.4 Other sampling rules

- **Calibration/training set, held out.** Before drawing the 525, reserve a separate set of trials from the same frame (≈3–5 per block, ≈75–100 total) for guideline iteration and annotator training. These are excluded from the frame before the evaluation sample is drawn.
- **No enrichment.** The sample is a pure stratified random draw within each block. Biomarker, prior-therapy, and lab-cutoff trials are represented at their natural frequency in the frame; there is no oversampling of hard-exclude-relevant trials. Field-class metrics (§8) are reported on whatever counts the random sample yields, with confidence intervals reflecting that.
- **Annotation unit.** The reported denominator is the field-level annotation, not the trial. Each block has 7–27 fields (median ~12). A 600-trial corpus yields roughly 7,000–9,000 field-level judgments; that count drives statistical power.
- **Realized-corpus reporting.** The per-block count table and the primary-completion-year distribution are reported as fixed properties of the realized sample, computed once after the frame is counted and not revised thereafter.

---

### 4. Annotation workforce & roles

A three-role structure: a pool of resident annotators (every trial double-annotated by two of them, which two varying across the corpus), plus subspecialty adjudicators.

- **Primary annotator pool (≈8–12 residents).** Oncology-grounded residents drawn from a common pool. Every trial is independently annotated by two of them, blinded to each other; the assigned pair rotates across the corpus by a fixed rule. The pool is treated as exchangeable — same guideline, same training, same competency bar, agreement stabilized on a shared calibration set before any production annotation — because the multi-rater agreement statistics assume interchangeable raters.
- **Adjudicators (attending or senior fellow, subspecialty-matched by block).** Resolve all disagreements and perform the targeted audit of agreed annotations (§6). Matched to block domain (GU for prostate/urothelial/RCC/testicular; thoracic for lung/mesothelioma; neuro-oncology for CNS/glioma; hepatology/GI for HCC and biliary tract; heme for the five hematologic lineages; gyn-onc for ovarian/uterine/cervical; etc.). Multiple domain-matched adjudicators are required; cross-domain adjudication is not permitted.
- **Exclusions.** No one adjudicates a trial they annotated. If a project lead is in the annotator pool, that is disclosed and the adjudication layer kept fully independent.

**Pair-assignment rule.** Pairings are assigned by a rule (round-robin or balanced incomplete block), not self-selected, so that agreement is not confounded with item difficulty. Assignment is balanced across annotator pairs and across cancer-type block. The assigned pair is logged for every trial; this log is required for the agreement computations in §7.

**Agreement-statistics consequence.** Because the pair varies, a single Cohen's κ is not definable for the corpus. Reliability is reported with multi-rater statistics (Krippendorff's α / Fleiss' κ) plus a fully-crossed anchor set that all annotators label in common (§7).

---

### 5. Annotation procedure & qualification gate

A written guideline plus a one-time qualification test each annotator must pass before joining production. No ongoing calibration program.

#### 5.1 Guideline

A written per-cancer, per-field guideline with worked examples and ten general annotation rules, covering every field in the schema and giving example-backed decision rules for the categories where non-subspecialists predictably diverge:

- **Biomarker logic** — which statuses open/close which arms (MSS/pMMR excludes checkpoint-inhibitor arms; KRAS/NRAS excludes anti-EGFR; BRAF V600E opens targeted-combination arms). These are multi-select categorical fields; the guideline specifies how to read trial language into the value set.
- **Prior-therapy structure** — paired `priorTherapyRequired` / `priorTherapyExcluded` arrays drawn from a per-block therapy enum. A therapy in neither array is unconstrained. A therapy the trial both requires and excludes is invalid and is flagged, not guessed.
- **Setting-qualified prior therapy** — the schema cannot encode "prior platinum in the metastatic setting." Annotators record the therapy and flag the trial so the lost qualifier is logged. Flag frequency is a reported schema-limitation metric (§8d).
- **Relative lab cutoffs** — ULN multiples vs. absolute values; Cockcroft-Gault vs. CKD-EPI for renal eligibility.
- **`null` semantics** — `null` means the trial does not constrain the field, an affirmative judgment, distinct from "the annotator could not determine it." This is the most error-prone rule for new annotators; the qualification key stresses it.

#### 5.2 Qualification set

A fixed set of ~15–20 trials spanning a representative range of the 24 blocks (every domain group represented, solid and heme both represented, deliberately including biomarker / prior-therapy / lab-cutoff / multi-block-basket cases), pre-annotated and adjudicated by the subspecialty expert(s) to create a reference key. Held out — never part of the evaluation corpus.

#### 5.3 Qualification procedure

1. Each prospective annotator reads the guideline, then independently annotates the qualification set.
2. Annotations are scored against the reference key: F1 against the key, reported overall, for the hard-exclude classes (biomarker / prior-therapy / lab-cutoff), and for the `null`-vs-value decision specifically.
3. **Pass bar (pre-specified):** overall F1 ≥ 0.75 and F1 ≥ 0.80 on the hard-exclude classes. The higher bar on hard-exclude classes is deliberate — a wrong label there is the most clinically consequential error and the §6.3 audit is the only downstream catch.
4. **On a miss:** review errors against the key, give one targeted re-read of the relevant guideline sections, allow one re-attempt on a fresh half-set. A second miss → not admitted to the pool.
5. Once passed, the annotator is cleared for production. Later joiners take the same qualification test before starting.

Corpus-level reliability statistics (§7) and the audit of agreed annotations (§6.3) are the production-phase safeguards; qualification is not re-run continuously.

#### 5.4 Production annotation

Independent dual annotation of all corpus trials by the rule-assigned pair against the guideline, until the corpus is complete. For basket/multi-block trials, each applicable block is annotated independently and counts as a separate annotation unit.

---

### 6. Gold-standard determination (three tiers)

The gold standard is the adjudicated label, not inter-annotator agreement. Agreement is a separate, reported process-quality measure (§7).

1. **Independent dual annotation** yields the agreement statistics.
2. **Adjudication of all disagreements.** A domain-matched adjudicator resolves every discordant item, blinded to annotator identity and to the AI system's output (this blinding prevents circular evaluation). The adjudicated call is the gold label. Each resolution is logged with a structured reason code: *value-set disagreement / null-vs-value disagreement / source-text ambiguity / schema-limitation flag / clinical error*. This log becomes a publishable disagreement analysis and feeds guideline updates.
3. **Targeted audit of agreed annotations.** Because the system enforces biomarker conflicts as hard excludes, a single correlated annotator error in a biomarker field can flip a correct model output into an apparent failure. The adjudicator reviews a stratified random sample of agreed annotations, with a higher sampling rate for biomarker / prior-therapy / lab-cutoff / `acceptedDiseases`-scoping fields than for low-stakes fields. Pre-specify before annotation starts: per-class sampling rates, an error-rate threshold, and the escalation rule (if observed error rate in a class exceeds threshold, expand the audit of that class).

Once adjudicated, freeze and version the gold standard. Any guideline or schema change forcing re-annotation creates a new version; every reported model result states which schema version and which gold-standard version it ran against.

---

### 7. Process-quality metrics (annotation reliability)

Reported to demonstrate the task is well-defined and the pool calibrated. Not the evaluation of the AI. With a rotating pool, a single Cohen's κ is not definable; multi-rater statistics plus a fully-crossed anchor set are used instead.

- **Krippendorff's α (or Fleiss' κ)** over the full double-annotated corpus, computed across all annotator pairs using the pair-assignment log. Agreement is computed at the field level. Multi-select categorical fields are scored two ways: (a) exact set match, and (b) per-value binary agreement (each enum value as a present/absent decision), since exact-set match is harsh and per-value agreement localizes which values cause disagreement. Gwet's AC1 is reported alongside, since field values are prevalence-skewed (most fields `null` for any given trial), which can deflate κ/α.
- **Qualification-set agreement (fully crossed).** Every annotator labels the common qualification set, so it doubles as a fully-crossed reliability probe: every annotator vs. every other on identical items, plus each annotator's F1 vs. the expert reference key. This is the most defensible single reliability estimate and the per-annotator quality signal.
- **Per-annotator agreement with the adjudicated gold standard** — computed post hoc over each annotator's production trials; the realistic human performance ceiling and the signal that surfaces a weak or drifting annotator after the fact.
- **`null`-vs-value sub-agreement** — reported separately: how often annotators agree on whether a field is constrained at all, independent of which values. Isolates the most error-prone rule and is the most useful diagnostic for guideline iteration.
- **Pairwise-overlap reporting.** Number of annotator pairs represented and the distribution of items per pair, so reviewers can judge whether the multi-rater estimate is well-supported; sparse, lopsided overlap weakens α.
- **Disagreement categorization** from the §6 reason-code log.

---

### 8. AI system evaluation metrics

Computed against the frozen gold standard. Two reporting axes throughout: stratified by cancer-type block and stratified by field class, never only pooled.

**8a. Field detection.**
For each field, treat "system populated this field vs. left it `null`" against the gold standard as a binary detection problem. Precision, recall, F1 — overall, per block, and per field class. Biomarker, prior-therapy, lab-cutoff, and hematologic `acceptedDiseases` fields reported separately with their own confidence intervals; because the sample is not enriched (§3.4), these intervals reflect the natural frequency of such fields in the frame and may be wide for rarer markers.

**8b. Field-value accuracy (nested strictness).**
Reported at progressively stricter levels so the reader sees where structuring breaks down:

1. **Field constrained correctly** — system and gold agree the field is non-`null` (or both `null`).
2. **+ value-set overlap** — at least one correct value, measured by Jaccard between system and gold value sets.
3. **+ exact value-set match** — system value set identical to gold (no missing, no extra values).
4. **+ correct across all fields in the block** — the entire block extraction is exactly right (end-to-end bar).

Numeric fields (line counts, Ki-67) are scored as exact-match at level 3 with a pre-specified tolerance band reported separately. Boolean fields collapse levels 2–3.

**8c. Hard-exclude logic correctness.**
Because biomarker conflicts are enforced multiplicatively as hard excludes, evaluate the exclusionary decision itself, not just the field. Report sensitivity/specificity and MCC (robust to class imbalance) for "does the extracted structure correctly trigger the hard exclude," with trial-clustered bootstrap confidence intervals. For hematologic blocks, mis-scoping `acceptedDiseases` is evaluated here as well, since enrolling-disease mismatch is functionally a hard exclude.

**8d. Schema-limitation flag rate.**
The fraction of trials where annotators flagged a criterion the schema cannot represent (setting-qualified prior therapy, both-required-and-excluded, other). This is not an AI error; it bounds the ceiling any extractor could achieve against the schema and identifies the next schema-revision priorities. Reported overall and per block.

**8e. "Unassessed vs. not met" calibration.**
Standard detection F1 cannot capture this. For fields the gold standard marks `null` because the trial genuinely does not constrain them, report how often the system correctly assigns `null` rather than hallucinating a constraint. A calibration/abstention evaluation, reported separately, rewarding correct abstention instead of penalizing it.

**8f. Confidence intervals.**
Bootstrap CIs resampled at the trial level to respect clustering of fields within trials, and respecting that basket trials contribute to multiple blocks, for all headline metrics.

---

### 9. Comparison & validation framing

- **Human ceiling.** The per-annotator-vs-gold F1 (§7) is the realistic upper bound; AI metrics are reported against it, not against a hypothetical 100%.
- **Comparator arm (recommended).** Where feasible, trained-but-non-expert reviewers (or the residents' pre-adjudication labels) perform the same extraction; AI is compared vs. that human baseline against the expert gold standard.
- **Per-class deltas.** AI−human deltas per field class; the clinically meaningful claim is parity-or-better on biomarker/prior-therapy/`acceptedDiseases` classes specifically, not on the aggregate.
- **Per-block deltas.** The block-level distribution of AI−gold F1, not just the mean.
- **External-validity caveats.** Stated as scope limitations rather than corrected: (a) ClinicalTrials.gov text differs from full protocol documents — performance is conditional on registry text as input; (b) the corpus is completed trials (primary completion 2021–2025), so it still lags the currently recruiting trials the system runs on in production, though the 2021–2025 window keeps the gap small relative to a wider window; (c) blocks with fewer than 25 eligible trials in the window are small-sample strata with wide intervals (§3.3). The §8d flag rate quantifies a further schema-side ceiling.

---

### 10. Operational risks & mitigations

| Risk | Mitigation |
|---|---|
| Correlated annotator error in biomarker / `acceptedDiseases` labels silently entering gold | Stratified audit of agreed annotations, oversampling hard-exclude and lineage-scoping classes (§6.3) |
| Circular evaluation (adjudicator influenced by AI output) | Adjudicator blinded to system output and to annotator identity |
| Pool heterogeneity — annotators not actually exchangeable | Qualification gate (§5.3): overall F1 ≥ 0.75 and ≥ 0.80 on hard-exclude classes before joining |
| 24-block schema exceeds single-adjudicator subspecialty competence | Multiple domain-matched adjudicators; cross-domain adjudication prohibited (§4) |
| A block has fewer than 25 eligible trials in the window | Take all available; report as a small-sample stratum with wide CIs; no pooling into neighbors, no backfill outside the window; shortfall identified before annotation (§3.3) |
| Completed-trial corpus lags recruiting trials | Window restricted to 2021–2025 to track the contemporary biomarker landscape; residual lag stated as an external-validity limitation (§3.1, §9); completion-year distribution reported |
| Pool drift over a multi-month timeline | Corpus-level α/κ and per-annotator-vs-gold (§7) surface a drifting annotator post hoc; the §6.3 audit is the substantive safeguard |
| Mid-study annotator turnover introducing uncalibrated labels | Later joiners take the same qualification test (§5.3) before starting |
| Sparse/lopsided pairwise overlap weakening multi-rater α | Rule-based balanced pair assignment; pairwise-overlap distribution reported and checked for stability (§7) |
| Silent gold-standard, guideline, or schema change mid-study | Versioned schema, guideline, and gold standard; every annotation stores schema and guideline version; gold standard frozen and version-tied to every result |
| Annotation bandwidth vs. corpus size (~600 trials) | Larger pool increases throughput; corpus fixed at 25 trials/block (~600) to keep dual annotation plus adjudication within capacity — authoritative labels over volume |
| `null` treated as a gap rather than a label | First-class concept in schema and guideline; stressed in qualification key; evaluated directly (§8e) and tracked in agreement (§7) |
| Schema cannot represent a real criterion | Annotators flag rather than guess; flag rate reported as a schema-ceiling metric (§8d), not charged as AI error |

---

### 11. Headline recommendation

A pool of ≈8–12 oncology residents, every trial independently double-annotated by a rule-assigned pair (rotating across the corpus, balanced by pair and cancer-type block), blinded to each other; an equally allocated stratified random sample of 25 completed interventional trials per cancer-type block (~600 total; primary completion 2021–2025), with blocks short of 25 eligible trials reported as small-sample strata; no enrichment — a pure random draw within each block; subspecialty attending/fellow adjudicators, domain-matched per block, resolving all disagreements and auditing a stratified sample of agreements with hard-exclude and lineage-scoping classes oversampled; schema, guideline, and gold standard frozen and co-versioned.

Before production, each annotator passes a one-time qualification test: independently annotate a fixed ~15–20-trial set (representative across the 24 blocks, biomarker/prior-therapy/lab/basket cases included) scored against an expert reference key, clearing overall F1 ≥ 0.75 and ≥ 0.80 on the hard-exclude classes; one targeted re-attempt allowed on a miss. Later joiners take the same test. No ongoing calibration program.

Process quality is reported as field-level Krippendorff's α / Fleiss' κ (exact-set and per-value, plus fully-crossed anchor-set agreement, `null`-vs-value sub-agreement, and per-annotator-vs-gold). System performance is reported as field-detection F1, the nested-strictness value-accuracy ladder, standalone hard-exclude sensitivity/specificity/MCC, schema-limitation flag rate, and unassessed-calibration — every metric stratified by cancer-type block and field class, with trial-clustered bootstrap CIs and a human-baseline comparator.
