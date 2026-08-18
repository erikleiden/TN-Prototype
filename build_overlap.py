"""
Build lw_ue_overlap.json — the Low Wage x Underemployed intersection rate.

WHY THIS EXISTS
---------------
The dashboard's headline "stranded" count used to be computed as:

    low_wage + underemployed + stalled_only

`estimated_stalled_only` already nets out career-stalled workers who are also
low-wage or underemployed, so the Career Stalled category never double-counted.
But nothing removed the Low Wage n Underemployed intersection, and the two
definitions can both bind on the same worker:

    Low Wage       annual wage < $30,493
    Underemployed  education exceeds job requirements by 2+ levels
                   (associate's or below) or 1+ level (bachelor's or above),
                   AND annual wage <= $45,739

A worker earning $27,000 with a bachelor's degree in a role requiring high
school satisfies both. The published report counts that worker once (its
statewide figure of ~452,000 is a de-duplicated union); the dashboard counted
them twice.

By inclusion-exclusion over the three cohorts, and using the fact that the
crosstab's stalled columns partition the stalled population exactly
(stalled = stalled_only + stalled_low_wage + stalled_underempl + stalled_both),
the whole correction reduces to a single missing term:

    union = low_wage + underemployed + stalled_only - |low_wage n underemployed|

THE PROBLEM
-----------
`cross_tabulated_data.json` (the OEWS-calibrated crosstab that drives every
headline count) has no low_wage x underemployed intersection column. The
ACS-weighted microdata file does, implicitly: its `n_stranded_weighted` column
is the de-duplicated union of the two, so

    overlap = n_low_wage_weighted + n_underemployed_weighted - n_stranded_weighted

holds at every row. (Verified: zero of 13,462 rows violate this.)

THE APPROACH
------------
Derive the overlap as a *rate* relative to (low_wage + underemployed) from the
ACS file, then apply that rate to the OEWS-calibrated counts. Rates are emitted
at three levels of granularity so the app can fall back when a slice is absent:

    occ     msa|sector|occupation   most precise, ~57% of lw+ue mass
    sector  msa|sector              covers nearly every crosstab row
    msa     msa                     fallback
    overall single statewide rate   last resort

This is a proportional correction, not an exact per-worker de-duplication --
the two files have different bases (OEWS-calibrated vs ACS-weighted), so an
exact join is not available. The rate is stable enough across slices for the
correction to be sound, and the alternative (leaving a known double-count in
the headline) is worse. Documented here so the assumption is visible.

Run after any data refresh, alongside build_demographics.py:

    python build_overlap.py
"""

import argparse
import csv
import json
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CSV = os.path.join(HERE, "src", "data", "cross_tabulated_data_cleaned_correct.csv")
DEFAULT_OUT = os.path.join(HERE, "src", "data", "lw_ue_overlap.json")
DEFAULT_CROSSTAB = os.path.join(HERE, "src", "data", "cross_tabulated_data.json")

# Same normalisation build_demographics.py applies: the ACS file uses the full
# BLS sector label and splits out "Rural", the crosstab JSON does neither.
SECTOR_REMAP = {
    "Administrative and Support and Waste Management and Remediation Services":
        "Administrative and Support and Waste Management",
}
MSA_REMAP = {"Rural": "Other MSA"}

# Below this much weight a slice's rate is too thin to trust; the app falls
# through to the next level up instead.
MIN_WEIGHT = 50.0


def num(v):
    if v in (None, "", "NA"):
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def crosstab_convention(path):
    """Is `underemployed` in the OEWS crosstab INCLUSIVE of low-wage workers?

    This matters because the overlap rate is derived from the ACS file but
    APPLIED to the crosstab. If the crosstab already reports underemployed as a
    low-wage-exclusive residual, the overlap has been removed upstream and
    subtracting it again understates the stranded population.

    That is not hypothetical. The March 2026 vintage of this file used the
    exclusive convention (its low_wage + underemployed summed exactly to its
    stranded column, and to the report's ~452,000); the April vintage switched
    to the inclusive convention. A future delivery could switch back.

    Two schema-dependent signals, checked in order:
      - a union column (`n_stranded_weighted`): exclusive iff low_wage +
        underemployed equals it
      - `estimated_stalled_both` (stalled AND low-wage AND underemployed): any
        non-zero value is only possible if low-wage and underemployed overlap

    Returns 'inclusive', 'exclusive', or 'unknown'.
    """
    try:
        with open(path, encoding="utf-8") as f:
            rows = json.load(f)
    except (OSError, ValueError):
        return "unknown"
    if not rows:
        return "unknown"
    keys = set(rows[0].keys())

    if {"n_low_wage_weighted", "n_underemployed_weighted", "n_stranded_weighted"} <= keys:
        lw = sum(num(r.get("n_low_wage_weighted")) for r in rows)
        ue = sum(num(r.get("n_underemployed_weighted")) for r in rows)
        union = sum(num(r.get("n_stranded_weighted")) for r in rows)
        if union <= 0:
            return "unknown"
        # Exclusive iff the two categories sum to the union with no slack.
        return "exclusive" if abs((lw + ue) - union) / union < 1e-6 else "inclusive"

    if "estimated_stalled_both" in keys:
        both = sum(num(r.get("estimated_stalled_both")) for r in rows)
        return "inclusive" if both > 0 else "exclusive"

    return "unknown"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default=DEFAULT_CSV,
                    help="ACS-weighted crosstab CSV (default: src/data/cross_tabulated_data_cleaned_correct.csv)")
    ap.add_argument("--out", default=DEFAULT_OUT,
                    help="output JSON path (default: src/data/lw_ue_overlap.json)")
    ap.add_argument("--crosstab", default=DEFAULT_CROSSTAB,
                    help="OEWS crosstab the rates will be applied to; checked for "
                         "overlap convention (default: src/data/cross_tabulated_data.json)")
    args = ap.parse_args()

    convention = crosstab_convention(args.crosstab)
    if convention == "exclusive":
        raise SystemExit(
            f"ERROR: {args.crosstab} reports `underemployed` EXCLUSIVE of low-wage "
            f"workers -- its categories are already de-duplicated upstream.\n"
            f"Applying an overlap correction to it would subtract the same workers "
            f"twice and understate the stranded population.\n"
            f"The app's headline should read low_wage + underemployed + stalled_only "
            f"directly for this vintage; remove the overlap term rather than running "
            f"this script. See the docstring above."
        )
    if convention == "unknown":
        print(f"WARNING: could not determine the overlap convention of {args.crosstab}.\n"
              f"         Verify that its `underemployed` column INCLUDES workers who are\n"
              f"         also low-wage before trusting the corrected headline.\n")

    # key -> [sum(lw + ue), sum(overlap)]
    occ = defaultdict(lambda: [0.0, 0.0])
    sector = defaultdict(lambda: [0.0, 0.0])
    msa = defaultdict(lambda: [0.0, 0.0])
    overall = [0.0, 0.0]

    inconsistent = 0
    n_rows = 0

    with open(args.csv, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m = row.get("msa_category")
            s = row.get("naics2_title")
            o = row.get("SOC_2019_5_ACS_NAME")
            if not m or not s or s in ("Other", "NA"):
                continue
            m = MSA_REMAP.get(m, m)
            s = SECTOR_REMAP.get(s, s)
            n_rows += 1

            lw = num(row.get("n_low_wage_weighted"))
            ue = num(row.get("n_underemployed_weighted"))
            st = num(row.get("n_stranded_weighted"))

            both = lw + ue
            overlap = both - st
            if overlap < -0.5:
                # n_stranded_weighted should never exceed the simple sum. If it
                # does, the file's cohort definitions have changed -- surface it
                # rather than silently clamping a broken assumption.
                inconsistent += 1
            overlap = max(overlap, 0.0)

            for bucket, key in ((occ, f"{m}|{s}|{o}"), (sector, f"{m}|{s}"), (msa, m)):
                bucket[key][0] += both
                bucket[key][1] += overlap
            overall[0] += both
            overall[1] += overlap

    if inconsistent:
        raise SystemExit(
            f"ERROR: {inconsistent} rows have n_stranded_weighted greater than "
            f"n_low_wage_weighted + n_underemployed_weighted. The overlap cannot be "
            f"derived this way -- the cohort definitions in {args.csv} have changed. "
            f"Fix the source or revisit this script before rebuilding."
        )

    def rates(bucket):
        return {
            k: round(v[1] / v[0], 6)
            for k, v in bucket.items()
            if v[0] >= MIN_WEIGHT and v[1] > 0
        }

    overall_rate = round(overall[1] / overall[0], 6) if overall[0] else 0.0

    payload = {
        "meta": {
            "description": "Low Wage x Underemployed intersection as a share of "
                           "(low_wage + underemployed), for de-duplicating the "
                           "dashboard's stranded headline.",
            "source": os.path.basename(args.csv),
            "min_weight": MIN_WEIGHT,
            "lookup_order": ["occ", "sector", "msa", "overall"],
            "rows_read": n_rows,
        },
        "occ": rates(occ),
        "sector": rates(sector),
        "msa": rates(msa),
        "overall": overall_rate,
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    print(f"Wrote {args.out}")
    print(f"  rows read           {n_rows:,}")
    print(f"  statewide overlap   {overall[1]:,.0f} of {overall[0]:,.0f} "
          f"({overall_rate * 100:.2f}% of low-wage + underemployed)")
    print(f"  occupation rates    {len(payload['occ']):,}")
    print(f"  sector rates        {len(payload['sector']):,}")
    print(f"  msa rates           {len(payload['msa']):,}")


if __name__ == "__main__":
    main()
