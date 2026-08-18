# Tennessee Stranded Talent Interactive Explorer

A policy dashboard for analyzing workforce stratification in Tennessee. Identifies
"stranded workers" — low-wage, underemployed and career-stalled — and provides
career pathway analysis with skill gap and credential data.

Static single-page app: React + TypeScript, bundled by Vite. There is no backend
and no database; all data is compiled into the bundle at build time.

## Run locally

**Prerequisites:** Node.js 20+

```
npm install
npm run dev
```

No API keys or environment variables are required.

## Refreshing the data

All data lives in `src/data/` as JSON, generated from BGI analytic files (CSV and
XLSX) by the Python scripts in the repository root. Requires Python 3 and
`openpyxl`.

```
python convert_new_data.py
python build_demographics.py
python build_overlap.py
npm run build
```

Then redeploy the contents of `dist/`.

Note: `convert_new_data.py` currently hard-codes its source folder in the
`DATA_DIR` constant at the top of the file, and must be edited before it will run
on another machine. `build_overlap.py` takes `--csv` and `--out` instead.

`build_overlap.py` must run after any refresh of
`cross_tabulated_data_cleaned_correct.csv`. It derives the Low Wage ×
Underemployed intersection used to de-duplicate the stranded headline — see
"Counting rules" below. If the source file's cohort definitions ever change such
that the intersection can no longer be derived, the script fails loudly rather
than emitting a silently wrong rate.

## Counting rules

The three stranded categories are **not** mutually exclusive, and the dashboard
accounts for this explicitly:

| Category | Overlap treatment |
|---|---|
| Low Wage | Overlaps with Underemployed |
| Underemployed | Overlaps with Low Wage |
| Career Stalled | Shown net — the crosstab's `estimated_stalled_only` column already excludes stalled workers who are also low-wage or underemployed |

The headline stranded count is the de-duplicated union:

```
stranded = low_wage + underemployed + career_stalled_only - (low_wage n underemployed)
```

The intersection term is not present in the OEWS-calibrated crosstab, so it is
estimated from the ACS-weighted microdata file (whose `n_stranded_weighted`
column *is* a de-duplicated union) and applied as a rate. See the docstring in
`build_overlap.py` for the derivation and its assumptions.

Category counts and the stranded total are reconciled on screen beneath the
cohort cards, so the arithmetic is always visible to the reader.

## Known data issue

`cross_tabulated_data.json` and `cross_tabulated_data_cleaned_correct.csv`
disagree substantially on the split between low-wage and underemployed workers.
Statewide the OEWS-calibrated crosstab reports 153,790 low-wage against 392,766
underemployed, while the ACS-weighted file reports 359,966 against 167,106 — and
the pattern is implausible at occupation level (the crosstab shows Cashiers and
Retail Salespersons as more underemployed than low-wage, and Registered Nurses as
underemployed at nearly three times their low-wage count).

The ACS file's totals are consistent with the published report; the crosstab's
are not. This is upstream of the dashboard and has not been altered here. It
should be resolved with whoever produces `2026.03.31_stall_crosstab.csv` before
the dashboard's headline figures are reconciled against the report.

## Layout

```
index.tsx                        main App component, state, data orchestration
src/components/TennesseeMap.tsx  interactive D3 map of TN MSA regions
src/data/                        bundled JSON data
convert_new_data.py              CSV/XLSX -> JSON for the main datasets
build_demographics.py            age + education breakdowns
build_overlap.py                 Low Wage x Underemployed intersection rates
```
