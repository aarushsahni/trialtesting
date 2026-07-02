"""Sample random cancer-related interventional trials from ClinicalTrials.gov.

Current criteria:
  - Recruiting or not-yet-recruiting
  - Interventional study type
  - Primary purpose: Treatment
  - Intervention type: Drug or Biological
  - Phase: Early Phase 1, Phase 1, Phase 2, or Phase 3
  - Adults only (StdAge ADULT or OLDER_ADULT, no CHILD)
  - At least one US site
  - Cancer/neoplasm/carcinoma/etc condition

Queries the ClinicalTrials.gov v2 API, does a two-pass fetch:
  1) all matching NCT IDs (cheap)
  2) full detail for the sampled subset

Emits sample_ctgov_trials.csv in the repo `data/` dir.
"""
from __future__ import annotations

import csv
import itertools
import random
import sys
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API = "https://clinicaltrials.gov/api/v2/studies"

CONDITION = (
    "cancer OR neoplasm OR carcinoma OR solid tumor OR malignancy "
    "OR sarcoma OR lymphoma OR melanoma OR leukemia OR myeloma"
)
STATUS = "RECRUITING,NOT_YET_RECRUITING"
ADVANCED = (
    "AREA[StudyType]INTERVENTIONAL "
    "AND AREA[LocationCountry]United States "
    "AND AREA[DesignPrimaryPurpose]TREATMENT "
    "AND AREA[InterventionType](DRUG OR BIOLOGICAL) "
    "AND AREA[Phase](EARLY_PHASE1 OR PHASE1 OR PHASE2 OR PHASE3) "
    "AND AREA[StdAge](ADULT OR OLDER_ADULT) "
    "AND NOT AREA[StdAge]CHILD"
)

SAMPLE_SIZE = 120
SEED = 42  # deterministic sample for reproducibility
NUM_ANNOTATORS = 5  # annotators labelled 1..NUM_ANNOTATORS
LABELS_PER_TRIAL = 2  # each trial is annotated by this many annotators


def fetch(params: dict) -> dict:
    url = f"{API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "sample-ctgov/1.0"})
    with urlopen(req, timeout=60) as r:
        import json

        return json.load(r)


def fetch_all_ids() -> list[str]:
    """Page through all matching trials, collecting NCT IDs only."""
    ids: list[str] = []
    token: str | None = None
    page = 0
    while True:
        page += 1
        params = {
            "query.cond": CONDITION,
            "filter.overallStatus": STATUS,
            "filter.advanced": ADVANCED,
            "fields": "NCTId",
            "pageSize": 1000,
            "format": "json",
        }
        if token:
            params["pageToken"] = token
        data = fetch(params)
        for s in data.get("studies", []):
            nct = (
                s.get("protocolSection", {})
                .get("identificationModule", {})
                .get("nctId")
            )
            if nct:
                ids.append(nct)
        print(f"  page {page}: cumulative {len(ids)} ids", file=sys.stderr)
        token = data.get("nextPageToken")
        if not token:
            break
    return ids


def fetch_details(nct: str) -> dict:
    """Fetch full study record via the /studies/{nctId} endpoint."""
    url = f"{API}/{nct}?format=json"
    req = Request(url, headers={"User-Agent": "sample-ctgov/1.0"})
    with urlopen(req, timeout=60) as r:
        import json

        return json.load(r)


def flatten(study: dict) -> dict:
    p = study.get("protocolSection", {})
    ident = p.get("identificationModule", {})
    status = p.get("statusModule", {})
    design = p.get("designModule", {})
    desc = p.get("descriptionModule", {})
    spons = p.get("sponsorCollaboratorsModule", {})
    arms = p.get("armsInterventionsModule", {})
    outcomes = p.get("outcomesModule", {})
    elig = p.get("eligibilityModule", {})
    locs = p.get("contactsLocationsModule", {})
    cond = p.get("conditionsModule", {})

    interventions = arms.get("interventions", []) or []
    intervention_names = "; ".join(i.get("name", "") for i in interventions if i.get("name"))
    intervention_types = "; ".join(i.get("type", "") for i in interventions if i.get("type"))

    primary_out = outcomes.get("primaryOutcomes", []) or []
    primary_measures = "; ".join(o.get("measure", "") for o in primary_out if o.get("measure"))
    primary_timeframes = "; ".join(o.get("timeFrame", "") for o in primary_out if o.get("timeFrame"))

    secondary_out = outcomes.get("secondaryOutcomes", []) or []
    secondary_measures = "; ".join(o.get("measure", "") for o in secondary_out if o.get("measure"))

    collaborators = spons.get("collaborators", []) or []
    collab_names = "; ".join(c.get("name", "") for c in collaborators if c.get("name"))

    all_locs = locs.get("locations", []) or []
    us_locs = [l for l in all_locs if l.get("country") == "United States"]
    us_states = sorted({l.get("state", "") for l in us_locs if l.get("state")})
    us_cities = sorted({l.get("city", "") for l in us_locs if l.get("city")})

    conditions = cond.get("conditions", []) or []

    nct = ident.get("nctId", "")
    return {
        "nct_id": nct,
        "url": f"https://clinicaltrials.gov/study/{nct}" if nct else "",
        "brief_title": ident.get("briefTitle", ""),
        "official_title": ident.get("officialTitle", ""),
        "overall_status": status.get("overallStatus", ""),
        "study_type": design.get("studyType", ""),
        "phases": "; ".join(design.get("phases", []) or []),
        "primary_purpose": design.get("designInfo", {}).get("primaryPurpose", ""),
        "allocation": design.get("designInfo", {}).get("allocation", ""),
        "intervention_model": design.get("designInfo", {}).get("interventionModel", ""),
        "masking": design.get("designInfo", {}).get("maskingInfo", {}).get("masking", ""),
        "enrollment_count": design.get("enrollmentInfo", {}).get("count", ""),
        "enrollment_type": design.get("enrollmentInfo", {}).get("type", ""),
        "start_date": status.get("startDateStruct", {}).get("date", ""),
        "primary_completion_date": status.get("primaryCompletionDateStruct", {}).get("date", ""),
        "completion_date": status.get("completionDateStruct", {}).get("date", ""),
        "lead_sponsor": spons.get("leadSponsor", {}).get("name", ""),
        "lead_sponsor_class": spons.get("leadSponsor", {}).get("class", ""),
        "collaborators": collab_names,
        "responsible_party_type": spons.get("responsibleParty", {}).get("type", ""),
        "responsible_party_investigator": spons.get("responsibleParty", {})
        .get("investigatorFullName", ""),
        "conditions": "; ".join(conditions),
        "intervention_names": intervention_names,
        "intervention_types": intervention_types,
        "primary_outcome_measures": primary_measures,
        "primary_outcome_timeframes": primary_timeframes,
        "secondary_outcome_measures": secondary_measures,
        "eligibility_sex": elig.get("sex", ""),
        "minimum_age": elig.get("minimumAge", ""),
        "maximum_age": elig.get("maximumAge", ""),
        "healthy_volunteers": elig.get("healthyVolunteers", ""),
        "eligibility_criteria": elig.get("eligibilityCriteria", ""),
        "brief_summary": desc.get("briefSummary", ""),
        "us_states": "; ".join(us_states),
        "us_cities": "; ".join(us_cities),
        "us_site_count": len(us_locs),
        "total_site_count": len(all_locs),
        "has_results": study.get("hasResults", False),
    }


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "data"
    out_dir.mkdir(exist_ok=True)
    csv_path = out_dir / "sample_ctgov_trials.csv"
    ids_cache = out_dir / "sample_ctgov_ids.txt"

    if ids_cache.exists():
        ids = [line.strip() for line in ids_cache.read_text().splitlines() if line.strip()]
        print(f"Loaded {len(ids)} cached NCT IDs from {ids_cache}", file=sys.stderr)
    else:
        print("Fetching all matching NCT IDs...", file=sys.stderr)
        ids = fetch_all_ids()
        ids_cache.write_text("\n".join(ids))
    # sort so the random sample is deterministic regardless of API result order
    ids = sorted(set(ids))
    print(f"Total matching trials (unique): {len(ids)}", file=sys.stderr)

    rng = random.Random(SEED)
    sample_size = min(SAMPLE_SIZE, len(ids))
    sample_ids = rng.sample(ids, sample_size)
    print(
        f"Sampling {sample_size} trials (seed={SEED}). Fetching details...",
        file=sys.stderr,
    )

    assignments = build_annotator_pairs(sample_size, rng)

    rows: list[dict] = []
    for i, (nct, (a1, a2)) in enumerate(zip(sample_ids, assignments), 1):
        try:
            study = fetch_details(nct)
            if study:
                row = flatten(study)
                row["annotator_1"] = a1
                row["annotator_2"] = a2
                rows.append(row)
            else:
                print(f"  [{i}/{sample_size}] {nct}: no data", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{sample_size}] {nct}: ERROR {e}", file=sys.stderr)
        if i % 25 == 0:
            print(f"  fetched {i}/{sample_size}", file=sys.stderr)
        time.sleep(0.05)  # be nice to the API

    if not rows:
        print("No rows fetched", file=sys.stderr)
        sys.exit(1)

    fieldnames = list(rows[0].keys())
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    # per-annotator load report
    load: dict[int, int] = {i: 0 for i in range(1, NUM_ANNOTATORS + 1)}
    for r in rows:
        load[r["annotator_1"]] += 1
        load[r["annotator_2"]] += 1
    print(
        f"Wrote {len(rows)} rows to {csv_path}. Load per annotator: {load}",
        file=sys.stderr,
    )


def build_annotator_pairs(n: int, rng: random.Random) -> list[tuple[int, int]]:
    """Assign each of n trials a pair of annotators, balanced across annotators.

    Strategy: use each of the C(NUM_ANNOTATORS, LABELS_PER_TRIAL) unique pairs
    equally often. When n divides evenly by the pair count, load per annotator
    is exactly (n * LABELS_PER_TRIAL / NUM_ANNOTATORS); otherwise a residual
    handful of pairs get one extra assignment.
    """
    pairs = list(itertools.combinations(range(1, NUM_ANNOTATORS + 1), LABELS_PER_TRIAL))
    per_pair, remainder = divmod(n, len(pairs))
    bag: list[tuple[int, int]] = []
    for p in pairs:
        bag.extend([p] * per_pair)
    if remainder:
        # distribute the residual across a random subset of pairs
        bag.extend(rng.sample(pairs, remainder))
    rng.shuffle(bag)
    return bag


if __name__ == "__main__":
    main()
