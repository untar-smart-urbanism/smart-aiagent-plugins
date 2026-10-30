---
name: estimate-gcp-cost
description: Estimate GCP cost-component usage QUANTITIES (never prices) for an application repo against the company billing SKU catalog in data/cost-components.json — reverse-engineer k8s manifests, Dockerfile, and dependencies for resource signals, interview the owner for the traffic/growth/sizing that code cannot reveal, verify every answer against the code, then write docs/COST-ESTIMATE.md plus a paste-friendly docs/COST-ESTIMATE.csv with Staging and Production columns for finance. Use when the user asks to estimate GCP cost or usage, size GKE/Cloud SQL/KMS/GCS/Load-Balancing/Artifact-Registry consumption, prepare a cost sheet for finance, budget a new service before provisioning, or fill COST-ESTIMATE. Trigger on "estimate cost", "GCP cost", "how much will this cost", "cost estimate", "usage quantities", "capacity for finance". Read the data file rather than estimating from memory; quantities only — prices belong to finance.
---

# Estimate GCP cost quantities

**Source of truth** for cost-component estimation. Read `data/cost-components.json` (relative to the installed `gcp-cost-estimator` plugin) — never estimate SKUs, units, or formulas from memory. GCP prices and SKU labels drift; the catalog is the authority.

## Hard rule — quantities only

This skill estimates **usage quantities** (cluster-hours, vCPU-hours, GiB-month, operations, …) — **never prices, rates, currency, or a monthly bill total**. Finance owns unit prices and multiplies them against your quantities in their own costing sheet.

If the user asks "how much will this cost" *in money*, say plainly that pricing is finance's job (per the catalog's `quantitiesOnlyRule`) and that you will produce the **quantities** they can price. Then do exactly that — do not refuse the whole task, and do not invent a rate to produce a number. A money figure built on a memorized rate is wrong the moment it is written.

## When to use (do not wait for the user to ask)

1. A new service is being planned or provisioned and someone needs a usage/capacity figure
2. Finance asks for a cost or usage sheet for an app
3. Before a go-live capacity sign-off, or as a companion to a design review
4. A material infrastructure change lands (new GKE workload, a database, KMS encryption, a new bucket, an added load balancer)
5. The user says "estimate cost", "GCP cost", "how much will this cost", or asks to fill `docs/COST-ESTIMATE.md`

## What it produces

- **`docs/COST-ESTIMATE.md`** — the readable estimate: traffic/usage model, per-service sections with the **formula and the substituted arithmetic shown**, a summary table, and an assumptions/gaps list. Built from `references/cost-estimate-template.md`.
- **`docs/COST-ESTIMATE.csv`** — one row per catalog SKU **in catalog order**, with Staging and Production quantity columns, for finance to paste into their pricing sheet. Exact contract is in the template.

Both carry a **Staging** and a **Production** column for every SKU.

## Relationship to other skills — reuse, do not duplicate

| Need | Where it comes from — do not re-derive |
|------|----------------------------------------|
| GCP cost labels (Company / Division / Department) | `PROJECT.md` `## Label` (owned by `golive-gate` / `project-scaffold`). Surface them in the doc header; do not invent them. |
| GCS env model (`GCS_PROJECT_ID` / `GCS_BUCKET` / `GCS_FOLDER`) | `gcs-implementations`. Confirms a bucket exists for the `gcs-standard` SKU. |
| Allowed stack (Bun, TS, Elysia, Drizzle, PostgreSQL, Svelte + Vite) and PostgreSQL/GKE + WIF as the standard platform | `allowedStack` in `plugins/golive-gate/data/build-contract.json` (canonical); `tech-radar` for gaps. Assume these unless the repo shows otherwise. |
| Vendor/SaaS subscription tiers and their costs | `docs/DEPENDENCIES.md` (project-documenter). This skill covers GCP infra quantities only, not SaaS tiers. |

## Phase 0 — Load

1. Read `data/cost-components.json` — the SKU catalog, `trafficModel`, `conventions`, `environments`, and per-component `formula` + `codebaseSignals`.
2. Read what the repo already states: `PROJECT.md` (labels, access), `README.md`, `docs/ARCHITECTURE.md`, `.env.example`.
3. Locate the deployment surface: Kubernetes manifests (`k8s/`, `deploy/`, `charts/`), kustomize overlays (`overlays/staging`, `overlays/production`), Helm `values-*.yaml`, Terraform (`*.tf`), and CI workflows (`.github/workflows`, `Jenkinsfile`, `cloudbuild.yaml`).
4. If `docs/COST-ESTIMATE.md` already exists, **update it in place** — never blow away owner-provided numbers; refresh what the code now shows and re-open gaps that changed.

## Phase 1 — Reverse-engineer resource signals

For each component, scan for its `codebaseSignals` and capture **evidence with `file:line`**. This is the half the code can settle:

- **GKE compute** — Deployment/StatefulSet `resources.requests.cpu/memory` and `replicas`, HPA `min/maxReplicas`, per-overlay values; pinned node pools in Terraform (`machine_type`, `node_count`).
- **Persistent Disk** — PVC `resources.requests.storage`, StatefulSet `volumeClaimTemplates`, node boot disk size.
- **Cloud SQL** — a PostgreSQL client dep (`drizzle-orm` with `pg`/`postgres`/`bun:sql`, `pg`, `prisma`, `typeorm`, `sequelize`, `knex`; `@electric-sql/pglite` is an in-process test-only database and is NOT a Cloud SQL signal) + `DATABASE_URL`/`PG*` in `.env.example`; instance tier in Terraform if present.
- **Load Balancing** — Ingress/Gateway (→ Application LB) vs `Service type: LoadBalancer` / a proxy-NLB forwarding rule (→ proxy Network LB).
- **KMS** — `@google-cloud/kms` and the pattern: envelope encryption, per-column DEKs, blind-index/HMAC (`macSign`/`macVerify`), asymmetric sign; a DEK cache (drives `dek_cache_hit_pct`).
- **Artifact Registry** — a `Dockerfile` + a CI push to `*-docker.pkg.dev`; any cleanup policy.
- **Cloud Storage** — `@google-cloud/storage` usage + `GCS_BUCKET`/`GCS_FOLDER`.

Rules for this phase:
- A component with **no signal** → mark it `N/A — <reason> (confirm with owner)`. Do not fabricate a component to fill the table.
- Everything the code **cannot** reveal (traffic, growth, instance sizes, image sizes) stays a **⚠️ gap** for Phase 3 — do not guess it now.
- Reconcile per environment: a `overlays/staging` or `values-staging.yaml` is **evidence** for staging and beats the generic staging default in the catalog.

## Phase 2 — Generate the document

Create `docs/COST-ESTIMATE.md` from `references/cost-estimate-template.md`. Fill the resource facts you proved in Phase 1. Seed the Traffic & Usage Model table with the `trafficModel` variables as **⚠️ rows** awaiting the interview. Fill the header: project, date, estimated-by, horizon month, region note (compute Jakarta / GCS Bangkok), and the GCP labels from `PROJECT.md ## Label` (⚠️ if missing).

## Phase 3 — Interview the owner, one compact batch per section

The interview is **required** — the traffic and sizing inputs are exactly what the code cannot reveal, and the whole estimate rests on them. Ask **one compact batch per section**, starting with the shared traffic model, then per-service specifics. Do not drip one question at a time, and do not dump all thirty at once.

Use the `question` text from each `trafficModel.vars` item and each component's `interviewQuestions`. Surface the relevant `codebaseSignals` you found as part of the question, so the owner is confirming against evidence, not answering blind.

**Verify every answer against the codebase** (the catalog's `evidenceRule`):
- Mark each answer **CONFIRMED** (evidence agrees), **CONTRADICTED** (evidence disagrees — cite `file:line`), or **UNVERIFIABLE** (traffic/sizing the code cannot settle).
- **Evidence wins for resource facts.** If the owner says "2 replicas" but `overlays/production/deployment.yaml:12` says 6, estimate from 6 and record the conflict.
- **Owner's number governs for traffic/growth/sizing.** Code signals only sanity-check magnitude — an HPA `maxReplicas` caps plausible throughput, a rate-limit config bounds requests. A code signal never replaces the owner's figure.
- An input the owner cannot give keeps its **⚠️** gap, uses the catalog `defaultHint` (state the default in the doc), and is marked **UNVERIFIABLE**.

## Phase 4 — Compute and show the math

For each component, substitute the `$`-tokens in its `formula` with the real numbers and apply `conventions`:
- **730 hours/month** for every per-hour SKU; state it once.
- **GiB** = 1024³ bytes; convert payload KB→GiB by `/1048576`.
- **Round vCPU/node counts up**; GiB to 2 decimals; operations up to the nearest 1000; never round demand down.
- **Headroom**: when node pools are not pinned, billed node capacity = pod requests / `binPackingUtilization` (default 0.70) — state the factor. When pinned, use the pinned shape and cite it.

Then:
- Fill the **Staging** and **Production** columns for every SKU. A SKU that does not run in an environment gets quantity **0** with an `N/A — <reason>` note — never a blank.
- **Show the arithmetic** in each per-service section (e.g. `E2 core = ceil((2×0.5 + 3×0.25)/0.70) × 730 = ceil(2.5) × 730 = 3 × 730 = 2190 vCPU-hours`). The reviewer must be able to check every number.
- For any component whose `unitConfidence` is not `high`, surface its `unitNote` **verbatim** in the assumptions — flag the unit, never silently pick one.
- Emit `docs/COST-ESTIMATE.csv` per the template's contract (one row per SKU, catalog order, exact header).
- Tick the template's checklist.

## Phase 5 — Record in PROJECT.md

If `PROJECT.md` exists, append or update a `## Cost Estimate` section with one line:

`Estimated <YYYY-MM-DD> by <who> — docs/COST-ESTIMATE.md (horizon: month <N>; <X> ⚠️ gaps open, <Y> units to verify with billing export)`

This mirrors how `assess-risk-level` records into `PROJECT.md`. If there is **no** `PROJECT.md`, do not invent one — point the user at `project-scaffold`'s `new-repo-init`, and still deliver the two `docs/` files.

## Scaling rule — always the full catalog, never padded

Every one of the 22 SKUs appears in the output exactly once. Inapplicable ones are `N/A — <reason>`, not omitted and not invented:
- No database → the three `sql-*` rows are N/A.
- No `@google-cloud/kms` → all KMS rows (versions **and** operations) are N/A.
- No Ingress/LB → the `lb-*` rows are N/A.
- Single-tenant HSM and the KMS ACL subscription default to N/A unless the owner confirms them.

## Hard rules

- **Quantities only** — prices are finance's; decline money figures and deliver quantities.
- **Verbatim SKU strings** — copy `skuDescription` exactly; the CSV must match the billing export character-for-character.
- **Read the data file** — never estimate units or formulas from memory.
- **Evidence wins** for resource facts; the owner's number governs for traffic/sizing.
- **N/A over fiction** — a considered `N/A — <reason>` beats a fabricated quantity.
- **Show every formula** with substituted numbers in the doc.
- **Flag uncertain units** verbatim from `unitNote`; never invent a billing unit.

## Reference files

- `references/cost-estimate-template.md` — the `docs/COST-ESTIMATE.md` scaffold and the exact `docs/COST-ESTIMATE.csv` contract.
