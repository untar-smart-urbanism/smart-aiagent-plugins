---
name: estimate-gcp-cost
description: Estimate GCP cost-component usage quantities (never prices) for this app and write docs/COST-ESTIMATE.md + docs/COST-ESTIMATE.csv with Staging and Production columns.
---

# Estimate GCP cost quantities

Run the `estimate-gcp-cost` skill from the `gcp-cost-estimator` plugin.

## Steps

1. Read `plugins/gcp-cost-estimator/data/cost-components.json` (or installed plugin path) — the SKU catalog, traffic model, conventions, and per-component formulas + `codebaseSignals`.
2. **Reverse-engineer resource signals** with `file:line` evidence: k8s manifests/overlays (requests, replicas, HPA, PVC), Dockerfile + CI push to `*-docker.pkg.dev`, PostgreSQL deps + `DATABASE_URL`, Ingress vs `Service type: LoadBalancer`, `@google-cloud/kms` patterns, `@google-cloud/storage` + `GCS_*`. A component with no signal is `N/A — <reason>`.
3. **Interview the owner** for the traffic model (requests, payload sizes, growth, deploys, image sizes, KMS ops/request, retention) — one compact batch per section. **Verify each answer against the code**: CONFIRMED / CONTRADICTED (cite `file:line`) / UNVERIFIABLE. Evidence wins for resource facts; the owner's number governs for traffic/sizing.
4. **Compute** per-SKU monthly quantities for **Staging** and **Production**, showing the formula with substituted numbers (730 h/month; rounding + bin-packing from the JSON `conventions`). Inapplicable SKUs are `0` + "N/A — reason"; flag any `unitConfidence` that is not `high` with its `unitNote` verbatim.
5. **Write** `docs/COST-ESTIMATE.md` (from the skill's `references/cost-estimate-template.md`) and `docs/COST-ESTIMATE.csv` (one row per catalog SKU, in catalog order, exact header). Record a one-line summary in `PROJECT.md` `## Cost Estimate` if a PROJECT.md exists.

## Report

- **Quantities only** — remind the user prices are finance's; if they asked for money, deliver quantities and say why.
- Summary table: Staging vs Production per SKU, with N/A rows and their reasons.
- Per-answer verification result, calling out any contradiction explicitly.
- Open ⚠️ gaps and the "verify with billing export" unit flags.
