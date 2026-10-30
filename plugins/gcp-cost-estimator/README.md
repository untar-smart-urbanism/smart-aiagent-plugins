# GCP Cost Estimator

Estimates GCP cost-component **usage quantities** for an application repo against the company billing SKU catalog — GKE, Cloud SQL PostgreSQL, Cloud Load Balancing, Cloud KMS, Artifact Registry, and Cloud Storage.

## Purpose

Give finance a defensible **usage-quantity** sheet (vCPU-hours, GiB-month, operations, …) for any app, split into **Staging** and **Production** columns. The skill reverse-engineers the codebase for resource signals, interviews the owner for the traffic/growth/sizing that code cannot reveal, verifies every answer against the code, and writes `docs/COST-ESTIMATE.md` + `docs/COST-ESTIMATE.csv`.

**Quantities only — never prices.** Finance owns unit prices and multiplies them against these quantities in their own costing sheet. Memorized GCP rates are stale the moment they are written, so this plugin never produces a money figure.

## How it works

The `estimate-gcp-cost` skill runs in phases (mirroring `golive-gate`'s assess-risk and `project-scaffold`'s design-document):

1. **Load** the catalog `data/cost-components.json` and the repo's existing docs/manifests.
2. **Reverse-engineer** resource signals with `file:line` evidence — replicas, cpu/memory requests, HPA, PVCs, DB deps, Ingress vs LoadBalancer, KMS patterns, image build/push, GCS usage.
3. **Interview** the owner for the traffic model (requests, payload sizes, growth, deploys, image sizes, KMS ops/request, retention), one compact batch per section.
4. **Verify** every answer against the code — CONFIRMED / CONTRADICTED (cite `file:line`) / UNVERIFIABLE. Evidence wins for resource facts; the owner's number governs for traffic/sizing.
5. **Compute** per-SKU Staging + Production quantities, showing the formula with substituted numbers, and emit the two `docs/` files. Record a one-line summary in `PROJECT.md` `## Cost Estimate`.

## Components

| Component | Purpose |
|-----------|---------|
| `data/cost-components.json` | The 22-SKU billing catalog (verbatim labels), the shared traffic/usage model, estimation conventions, per-environment defaults, and per-component formulas + `codebaseSignals` |
| Skill `estimate-gcp-cost` | Reverse-engineer → interview → verify against code → write `docs/COST-ESTIMATE.md` + `.csv` |
| Command `/estimate-gcp-cost` | Manual entry point |

Data is validated against `schemas/gcp-cost-components.schema.json` (repo root).

## SKU catalog

| Service | Components |
|---------|-----------|
| **GKE** | Zonal + Regional clusters, E2 custom Core, E2 custom RAM, Balanced PD (all Jakarta) |
| **Cloud SQL PostgreSQL** | Regional vCPU, RAM, Standard storage (Jakarta) |
| **Cloud Load Balancing** | External ALB inbound + outbound data processing, proxy-NLB forwarding-rule minimum (Jakarta / asia-southeast2) |
| **Cloud KMS** | Active MAC / symmetric / asymmetric key versions, symmetric / MAC / asymmetric operations, single-tenant HSM, Key ACL service subscription |
| **Artifact Registry** | Storage, carrier-peering network egress (Asia-Pacific) |
| **Cloud Storage** | Standard Storage (Bangkok) |

Compute is Jakarta (asia-southeast2); the object-storage SKU is Bangkok. Cross-region egress between the two is not a SKU in this catalog — the skill flags it rather than inventing one. Units it cannot confirm (HA Cloud SQL doubling, NLB rule minimum, single-tenant HSM, KMS ACL subscription) are flagged **verify-with-billing-export**, never guessed.

## Install

```text
# Cursor
/add-plugin gcp-cost-estimator

# Claude Code
/plugin install gcp-cost-estimator@smart-aiagent-plugins
```

## Usage

```text
/estimate-gcp-cost   # reverse-engineer + interview → docs/COST-ESTIMATE.md + .csv (Staging + Production)
```

The output CSV has one row per catalog SKU in catalog order, with a verbatim SKU label so finance can match it against the billing export. A one-line summary is recorded in `PROJECT.md` `## Cost Estimate` when a `PROJECT.md` exists (created by the `project-scaffold` plugin's `new-repo-init`).
