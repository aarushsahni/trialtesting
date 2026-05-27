// Markdown source of the annotation guide. Imported by /guide.
// The per-block field tables live in 2_annotation_guide.md (750 lines);
// paste the remainder here when ready — anchors below already exist in
// BLOCKS so the sidebar nav will scroll cleanly to each.

export const ANNOTATION_GUIDE_MD = String.raw`# TEMPO — Physician Annotation Guide

**Purpose.** This guide is for trained physician annotators performing **manual structured extraction** of trial eligibility criteria from ClinicalTrials.gov, to serve as the reference standard against which TEMPO's automated extraction is compared.

**Scope.** One section per cancer type. For each trial, annotate only the cancer-type block(s) the trial is eligible for. A trial may be eligible for more than one cancer type (e.g., a basket trial) — annotate each applicable block independently.

---

## General annotation rules

These rules apply to **every** field unless a field-specific note overrides them.

1. **Source of truth.** Annotate from the ClinicalTrials.gov record: the *Eligibility Criteria* section primarily, supplemented by *Conditions*, *Brief Summary*, *Detailed Description*, *Arms/Interventions*, and *Official Title* where the criteria are ambiguous. Do not infer from external knowledge of the drug or sponsor beyond what is needed to interpret the trial's own language.

2. **\`null\` means the trial does not constrain the field.** If the eligibility criteria neither require nor exclude any value of a field, leave it \`null\` (record as blank / NA on the annotation form). \`null\` is **not** "unknown to the annotator" — it is an affirmative judgment that the trial places no constraint on this variable.

3. **Categorical fields are multi-select.** Record **every** value the trial would accept, not just the most prominent. If a trial enrolls both locally advanced and metastatic disease, record both \`LOCALLY_ADVANCED\` and \`METASTATIC\`. If the trial accepts essentially all values of the field (no constraint), record \`null\`, not the full list.

4. **Inclusion vs. exclusion logic.** A value belongs in a categorical field if the trial *permits* a patient with that value to enroll. If an exclusion criterion removes a value, do not list it. Example: trial states histology adenocarcinoma with neuroendocrine differentiation excluded -> histology = ADENOCARCINOMA only, not both.

5. **Booleans encode a trial requirement, not patient status.** \`true\` = the trial *requires* the condition to be present. \`false\` = the trial *requires* it to be absent (an explicit exclusion). \`null\` = the trial does not mention it. Example: an exclusion of active brain metastases -> categorical \`cnsMetastases\` = ABSENT and TREATED_STABLE (active excluded); a boolean like \`leptomeningealDisease\` with LMD excluded -> \`false\`.

6. **Numeric fields capture the trial's stated threshold.** \`minPriorSystemicLines = 2\` means the trial requires at least 2 prior lines. \`maxPriorSystemicLines = 1\` means no more than 1 prior line. If the trial says "treatment-naive," set \`maxPriorSystemicLines = 0\`. If only one bound is stated, leave the other \`null\`.

7. **Prior therapy: required vs. excluded.** \`priorTherapyRequired\` lists therapies a patient *must have received* to be eligible. \`priorTherapyExcluded\` lists therapies that *disqualify* a patient if previously received. A therapy mentioned in neither array is unconstrained. A single therapy must not appear in both arrays for the same trial — if the criteria appear to both require and exclude the same therapy, flag the trial for adjudication rather than guessing.

8. **Setting-qualified criteria.** When a criterion is qualified by treatment setting ("prior platinum **in the metastatic setting**"), the current schema cannot encode the setting qualifier. Annotate the therapy as required/excluded per the criterion and **flag the trial** in the adjudication notes so the loss of the setting qualifier is recorded.

9. **Disagreement handling.** If the trial language is genuinely ambiguous after reviewing all sections, do not guess to match expected AI behavior. Record your best single interpretation and add a free-text adjudication note. Blinded single-expert adjudication resolves annotator–AI disagreements; consistent annotator notes are essential for that step.

10. **Do not normalize toward the AI.** Annotators must not view the AI extraction before completing their own. The comparison is only valid if manual extraction is independent.

---

## Field-type quick reference

| Type in schema | How to record | \`null\` when |
|---|---|---|
| array (e.g. \`["A" \| "B"]\`) | All accepted values (multi-select chips) | Trial places no constraint on the field |
| boolean | \`true\` (trial requires present) / \`false\` (trial requires absent) / null | Trial does not mention it |
| number | The trial's stated numeric threshold | No threshold stated |

---

> **Per-block annotation notes**
>
> The per-block field tables (24 cancer types, each with field-level annotation
> notes — castration status, BCG status, HRD vs BRCA logic, HER2-low banding,
> etc.) come from the full \`2_annotation_guide.md\`. Paste them at the bottom of
> \`src/lib/annotation-guide-content.ts\` to make them appear here. Each block heading
> should use the schema key as an HTML id so the sidebar nav scrolls to it
> (e.g. \`## Prostate {#prostate}\`).
>
> Until then, refer to the standalone \`2_annotation_guide.md\` for per-block detail.
`;
