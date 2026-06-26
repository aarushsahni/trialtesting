# Eligibility Labeling — standalone

Self-contained tool for hand-labeling clinical-trial cohorts and their
per-cancer-type clinical descriptors against the live ClinicalTrials.gov API.
Drop the entire `eligibility-labeling/` folder into any environment, install
two dev deps, and run it — no database, no env vars, no other files from the
parent project required.

## What's in the box

```
eligibility-labeling/
├── server.ts             — Node http server (port 4322). Standalone.
├── index.html            — Vanilla HTML/CSS/JS UI. No framework.
├── schemas.ts            — Per-cancer-type descriptor schemas + cancer-type labels.
├── field-descriptions.json — Tooltip prose for each schema field.
├── package.json          — Two dev deps: tsx, typescript.
├── tsconfig.json         — Strict TS config (noEmit).
├── .gitignore            — Excludes node_modules + the labels output dir.
└── README.md             — This file.
```

The `eligibility-labels/` directory is created lazily inside this folder on
first save and holds one `<NCT>.json` per labeled trial.

## Run

```bash
cd eligibility-labeling
npm install
npm start          # tsx server.ts
```

Then open http://localhost:4322. Override the port with `PORT=5555 npm start`.

Node 18+ is required (the server uses the global `fetch`). No environment
variables are needed.

## Flow

Labeling is purely structural — cohorts and their applicable cancer types,
age / ECOG / LOT bounds, and per-cancer-type clinical descriptors. Individual
inclusion / exclusion criterion strings are not labeled. Trial-level fields
are derived on save: `cancerTypes` is the union of cohort applicable types
(in registry order); `eligibilityScope` is `MULTI_COHORT` when there are 2+
cohorts and `SINGLE_CANCER` otherwise.

1. Type or paste an `NCT########` and click **Load**. The server fetches the
   study JSON directly from `clinicaltrials.gov/api/v2/studies/<NCT>` and
   the raw eligibility text appears on the left for reference.
2. In the right panel, click **+ Add cohort** to create a cohort. For each
   cohort, set the `cohortKey` (uppercase slug), display name, applicable
   cancer types, and any age / ECOG / LOT bounds.
3. For each applicable cancer type per cohort, fill the clinical-descriptor
   form. `OTHER` has no descriptor schema.
4. Need a near-duplicate? Use the **Duplicate cohort…** select beside
   *+ Add cohort* to deep-clone an existing cohort (descriptors and all)
   under a fresh `COHORT_N` key.
5. Click **Save**. The label is written to
   `eligibility-labeling/eligibility-labels/<NCT>.json`. At least one cohort
   is required.

Reopening the same NCT later loads the saved label and rehydrates the form.

## Save shape

```jsonc
{
  "schemaVersion": 1,
  "nctId": "NCT01234567",
  "labeledAt": "2026-06-22T14:33:00.000Z",
  "labelerNote": "optional free text",
  "structuredEligibility": {
    "cancerTypes": ["BREAST"],
    "eligibilityScope": "SINGLE_CANCER",
    "inclusionCriteria": [],
    "exclusionCriteria": [],
    "cohorts": [
      {
        "cohortKey": "HER2_POS",
        "displayName": "HER2-positive arm",
        "applicableCancerTypes": ["BREAST"],
        "inclusionCriteria": [],
        "exclusionCriteria": [],
        "minAge": null, "maxAge": null,
        "ecogMin": null, "ecogMax": null,
        "lineOfTherapyMin": null, "lineOfTherapyMax": null
      }
    ]
  },
  "cohortDescriptors": {
    "HER2_POS": { "BREAST": { "her2Status": ["POSITIVE"] } }
  }
}
```

Per-cohort `inclusionCriteria` / `exclusionCriteria` are intentionally kept
in the shape (always empty) so the JSON can still be diffed against any
pipeline output that uses the same `StructuredEligibilityFields` /
`TrialClinicalDescriptors` schema.

## Embedding this in another app

The recipient who wants to recreate the feature inside their own stack
should pull from this folder in order of importance:

1. **`schemas.ts`** — the source of truth for what fields each cancer type
   can be labeled with. Copy verbatim or translate to another language. Edit
   the field sets freely; the UI is fully driven by these schemas. Companion
   prose lives in `field-descriptions.json`.
2. **`index.html`** — the labeling UI is ~600 lines of vanilla JS, no
   build step. The render functions (`renderCohortCard`,
   `renderDescriptorsForCohort`, `renderDescriptorField`) read the schemas
   over HTTP from `/api/descriptor-schemas` and emit native form controls
   based on each field's `kind`.
3. **`server.ts`** — a thin HTTP shim (~150 lines). Re-implementing it in
   another language/framework is straightforward; just preserve the five
   endpoints:
   - `GET /api/trial/<NCT>` — fetch trial info (proxy to CT.gov or your own DB)
   - `GET /api/descriptor-schemas` — return `{ cancerTypes, schemas, fieldDescriptions }`
   - `GET /api/label/<NCT>` — return saved label JSON or 404
   - `POST /api/label/<NCT>` — write label JSON to disk (or DB)
   - `GET /api/labels` — list of `<NCT>` ids that have been labeled
