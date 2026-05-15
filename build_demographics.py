"""
Build demographics.json — age + education breakdowns per (MSA × NAICS sector)
for Low Wage, Underemployed, and All Stranded cohorts.

Output shape:
{
  "<msa>|<sector>": {
    "age": {
      "low_wage":      {"25-34": n, "35-44": n, ...},
      "underemployed": {...},
      "stranded":      {...}
    },
    "education": {
      "low_wage":      {"1": n, "2": n, ...},   # keys are education_level (1-7)
      "underemployed": {...},
      "stranded":      {...}
    }
  },
  ...
}

The app's "All" geography key for MSA is "All" — we additionally precompute
a roll-up entry keyed "All|<sector>" that sums across all MSAs.

Stalled cohort age/edu is not in this CSV (it's longitudinal in stall_duration);
the app will continue to show its occupational mix + duration histogram only.
"""

import csv
import json
import os
from collections import defaultdict

HERE = os.path.dirname(__file__)
CSV_PATH = os.path.join(HERE, "src", "data", "cross_tabulated_data_cleaned_correct.csv")
OUT_PATH = os.path.join(HERE, "src", "data", "demographics.json")


def num(v):
    if v in (None, "", "NA"):
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def main():
    # nested: out[msa][sector][dim][cohort][bucket] = weight
    out = defaultdict(lambda: defaultdict(lambda: {
        "age": {"low_wage": defaultdict(float), "underemployed": defaultdict(float), "stranded": defaultdict(float)},
        "education": {"low_wage": defaultdict(float), "underemployed": defaultdict(float), "stranded": defaultdict(float)},
    }))

    # Also a roll-up across MSAs for the app's "All" view
    rollup = defaultdict(lambda: {
        "age": {"low_wage": defaultdict(float), "underemployed": defaultdict(float), "stranded": defaultdict(float)},
        "education": {"low_wage": defaultdict(float), "underemployed": defaultdict(float), "stranded": defaultdict(float)},
    })

    edu_labels = {}

    with open(CSV_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            msa = row.get("msa_category")
            sector = row.get("naics2_title")
            if not msa or not sector or sector in ("Other", "NA"):
                continue

            age = row.get("age_group") or None
            edu = row.get("education_level") or None
            edu_label = row.get("education_level_label")
            if edu_label and edu:
                edu_labels[edu] = edu_label

            lw = num(row.get("n_low_wage_weighted"))
            ue = num(row.get("n_underemployed_weighted"))
            st = num(row.get("n_stranded_weighted"))

            for dim, bucket in (("age", age), ("education", edu)):
                if not bucket:
                    continue
                out[msa][sector][dim]["low_wage"][bucket] += lw
                out[msa][sector][dim]["underemployed"][bucket] += ue
                out[msa][sector][dim]["stranded"][bucket] += st
                rollup[sector][dim]["low_wage"][bucket] += lw
                rollup[sector][dim]["underemployed"][bucket] += ue
                rollup[sector][dim]["stranded"][bucket] += st

    # Materialize defaultdicts and round
    def materialize(d):
        return {
            "age": {k: {b: round(v) for b, v in sorted(d["age"][k].items())} for k in d["age"]},
            "education": {k: {b: round(v) for b, v in sorted(d["education"][k].items())} for k in d["education"]},
        }

    payload = {"edu_labels": edu_labels, "data": {}}
    for msa, sectors in out.items():
        for sector, dims in sectors.items():
            payload["data"][f"{msa}|{sector}"] = materialize(dims)
    for sector, dims in rollup.items():
        payload["data"][f"All|{sector}"] = materialize(dims)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    keys = sorted(payload["data"].keys())
    print(f"Wrote {OUT_PATH}")
    print(f"  {len(keys)} (msa|sector) keys")
    print(f"  edu_labels: {edu_labels}")
    # Sanity sample
    sample = next(iter(payload["data"].values()))
    print(f"  sample keys: dims={list(sample.keys())}")
    print(f"  sample age cohorts: {list(sample['age'].keys())}")


if __name__ == "__main__":
    main()
