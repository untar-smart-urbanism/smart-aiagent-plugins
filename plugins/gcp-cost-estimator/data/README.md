# GCP cost estimator data

Machine-readable catalog for the `gcp-cost-estimator` plugin. The skill reads this file instead of estimating GCP usage from memory (unit prices and SKU labels drift; a data file is the source of truth).

## Files

| File | Contents | Consumed by |
|------|----------|-------------|
| `cost-components.json` | The company GCP billing SKU catalog (22 components across GKE, Cloud SQL PostgreSQL, Cloud Load Balancing, Cloud KMS, Artifact Registry, Cloud Storage), the shared traffic/usage model, estimation conventions, per-environment defaults, and per-component formulas + `codebaseSignals`. | Skill `estimate-gcp-cost`, command `/estimate-gcp-cost` |

Validated against `schemas/gcp-cost-components.schema.json` (repo root `schemas/`).

## Key rules encoded

- **Quantities only, never prices** — the plugin estimates usage quantities (vCPU-hours, GiB-month, operations, …). Finance owns unit prices and multiplies them against these quantities in their own sheet. Producing a money figure would require inventing rates.
- **Verbatim SKU strings** — every `skuDescription` is a verbatim billing-export label. Never reword, abbreviate, or localize; the emitted CSV must match character-for-character so finance can VLOOKUP against the billing export.
- **Evidence wins for resource facts** — replica counts, cpu/memory requests, PVC sizes, dependencies, and Service type come from the code; interview claims that contradict the code lose. Traffic, growth, and sizing are owner-confirmed; code signals only sanity-check magnitude.
- **Region is a company fact** — compute is Jakarta (asia-southeast2); the GCS SKU is Bangkok. Do not infer a different region from code. Cross-region egress between the two is not a SKU in this catalog — flag it, do not invent it.
- **Uncertain units are flagged, never invented** — components whose billing unit needs confirmation carry `unitConfidence: "verify-with-billing-export"` (or `"medium"`) plus a `unitNote`; the skill surfaces that note verbatim rather than guessing.

## Record of truth

Estimates are written to the target project's `docs/COST-ESTIMATE.md` + `docs/COST-ESTIMATE.csv`, and a one-line summary is recorded in the project's `PROJECT.md` under `## Cost Estimate` when a `PROJECT.md` exists. The plugin never fabricates a `PROJECT.md`.

## Updating

Edit `cost-components.json` (add/adjust SKUs, formulas, or traffic vars), bump `plugin.manifest.json` version, and run `npm run validate` from the repo root. When the company billing catalog changes (new SKU, renamed label, new region), update the verbatim `skuDescription` strings here first.
