# Go-Live Gate

> **Version note.** `/vibe-conform`, the `check-build-contract` skill, and the contract checks chained
> into `/vibe-check` and `/vibe-ship` require **golive-gate ≥ 1.18.0**. An older installed copy has
> none of them and fails silently by simply not running — if `/vibe-conform` is not a command, update
> the plugin rather than assuming the checks passed.


Risk classification and go-live gating for AI-assisted company tools, per the **Non-Tech Change Management with AI Assistance Playbook**.

## Purpose

Ensure every tool built with AI assistance is **risk-classified** before it is shared, **independently reviewed** before release (Medium/High), and passes a **go-live gate** (approvals, access, SSO login, safe logging, recovery, ownership) before production use.

All results are recorded in the project's `PROJECT.md` go-live dossier (scaffolded by the `project-scaffold` plugin) — this plugin never creates a parallel governance file.

## Agent behavior (automatic)

When an agent detects intent to share, deploy, release, or open access to a tool:

1. Check PROJECT.md `## Risk Level` — empty → run skill `assess-risk-level`
2. Before release-like actions → run skill `review-before-release` (Medium+: the reviewer must be neither the Project Owner nor the Support Contact)
3. At go-live → run skill `check-golive-readiness` → **READY / NOT READY / CONDITIONAL**
4. On material change (new data source, external access, payments, new user group) → re-classify

The `golive-gate-enforcement` rule (`alwaysApply: true`) enforces this on every session when the plugin is installed, including the never-log constraint for secrets, individual customer/seller PII, regulated identifiers, payroll, personal financial accounts, and confidential data. Use synthetic examples; daily order items and values are internal operational data.

## Components

| Component | Purpose |
|-----------|---------|
| `data/risk-criteria.json` | Playbook §1 — risk tiers, interview questions, escalation triggers |
| `data/review-checklist.json` | Playbook §5 — risk-tiered release review items |
| `data/golive-gate.json` | Playbook §6 — go-live gate items mapped to PROJECT.md sections |
| `data/never-log.json` | Forbidden data list + scan hints |
| `data/remediation-tiers.json` | Brownfield adoption — BLOCKING vs ADVISORY tier policy for the remediation backlog (shared with `/adopt-vibe`) |
| `data/release-doc.json` | Spec for `vibe-release.json` — our governance and registry record (gate verdict, cost labels, app owner) |
| `data/review-proof.json` | Spec for `docs/REVIEW-PROOF.md` — the reviewer-sealed, commit-bound review proof. Independence = the reviewer is neither the Project Owner nor the Support Contact; prior commit authorship does **not** disqualify a reviewer |
| `data/test-policy.json` | Test generation policy — severity map (category → High/Medium/Low), test-type expectations, hermetic auto-run policy, bounded High-severity fix loop |
| Skill `assess-risk-level` | Interview → **verify answers against the codebase** → classify Low/Medium/High → record in PROJECT.md |
| Skill `review-before-release` | Run the §5 checklist, append evidence to Review Evidence (builder-side) |
| Skill `seal-review-proof` | **Reviewer-driven** §5 review → seal `docs/REVIEW-PROOF.md` bound to the commit + reviewer git identity, then chain `check-golive-readiness` to regenerate `vibe-release.json` with the sealed review |
| Skill `generate-test-scenarios` | Scan code + `docs/DESIGN.md` → generate/reconcile `docs/TEST-SCENARIO.md` (idempotent, history-preserving) plus the backing test code; auto-runs hermetic suites, fix-loops High-severity failures (bounded), asks before looping Medium/Low |
| Skill `check-golive-readiness` | Final gate verdict; verifies approvals are recorded |
| Skill `check-build-contract` | **Repo conformance** (`/vibe-conform`) — the pipeline's build contract checked mechanically: fixed command names in the root `package.json`, the `## Build and run` section in CLAUDE.md/AGENTS.md and whether it is still true at HEAD, a coverage path resolving to a *tracked* file, a Dockerfile that patches its base and installs production-only dependencies, the platform's injected CommonJS stubs, the allowed stack (`stack-allowed`: dependencies outside `allowedStack` need a tech-architect row in PROJECT.md `## Stack Exceptions`; legacy projects get a note, major improvements always need the row), and a gate record naming HEAD. Read-only; entry criterion for `/vibe-check` |
| Rule `golive-gate-enforcement` | Always-on constraint |
| Rule `project-dossier` | PROJECT.md-scoped editing rules (append-only evidence) |
| Skill `vibe-code-and-deploy` | **Delivery orchestrator** — requirement/ticket → approved stack → repo + dossier → build with gateway identity → tests a person could have run → deployment assets → gate → platform handoff → post-deploy verification. Invokes the owning skill for each phase; carries `references/field-notes.md` (component-CSS gaps, runner accommodations, container and Sonar traps, triage discipline) |
| Agent `golive-gatekeeper` | Gate enforcement subagent |
| Commands `/vibe-ship`, `/assess-risk`, `/release-review`, `/vibe-review`, `/test-scenarios`, `/vibe-conform`, `/vibe-check` | Manual entry points |

## Risk tiers (playbook §1)

| Tier | Trigger (any) | Required |
|------|---------------|----------|
| **Low** | Small personal tool, no sensitive data, no company systems | Owner check + test |
| **Medium** | Team use, company systems, internal or Restricted data, automates work, affects decisions | Independent review, testing, saved previous version, recovery steps |
| **High** | External/internet-facing, payments, sensitive data (Confidential or UU PDP specific personal data), customer-facing, affects other services (e.g. BSC), critical process | Formal Tech R&D/Architecture + SRE + InfoSec (+ GRC) review concluded by a formal approval task (one of the formal approvers), DPIA for specific personal data, monitoring, application rollback plan; SRE backup method tracked as follow-up |

**Triage** (`triage`): any of inbound, outbound (calls the web/external APIs) or mass deployment → a Tech & InfoSec review is required on any tier; none → the owner and their manager own the risk, so the agent explains the risks and how to mitigate them (`triage.noneRisks`) — it never asks who the manager is. **BPT confirms the final level** after staging (`bptConfirmation`, one confirmer is enough) and may raise or lower it; the agent never lowers its own assessment. Start the required review at least **2 weeks** before the planned production date.

> A tool is not automatically Low risk just because it is small.

**Data classification** (`data/risk-criteria.json`; four levels — Confidential, Restricted, Internal, Public — per `dataClassification`, plus UU PDP 27/2022 rules in `pdpRules`; distinguish the 2026-07-29 GRC confirmation and the 2026-09-26 owner update from the October 2026 procedure):

- An individual **customer or seller's name, direct email, or phone** is PII even alone. A legal-entity name or generic company channel is business data. A named business-partner person is still identifiable; a blanket exemption needs a documented GRC/InfoSec decision.
- An **internal email used only for credential or role/access management** does not automatically make the app High by itself; still limit disclosure and assess combinations.
- **Position data** linked to no person is not personal data and never High on its own; coordinates linked to an identified person are that person's personal data (UU PDP).
- **Company legal identifiers** (company NPWP, NIB) are business data; a personal NPWP is sensitive.
- **Specific personal data** under UU PDP (health, biometric, genetic, criminal, children's, personal financial, political, sexual life, organization membership, device/browsing, education) makes a tool High and needs a DPIA.
- **Customer transaction history, complaints, and feedback** are Restricted — encrypt, mask, or hash.
- **Daily purchase/sales order items and values** not linked to a customer, and operational reports, are internal data, including when stored in a database. They are not sensitive financial data solely because they contain monetary values. Payment, settlement, payout, commission, invoicing, GL posting, personal financial accounts, exposure, and criticality are separate High triggers.

The backup pipeline or method is owned by SRE. Record a missing status as **NEEDS FOLLOW-UP** in `PROJECT.md`; `backup-recovery` is advisory and does not block the gate by itself. Keep application rollback steps where known.

## Install

```text
# Cursor
/add-plugin golive-gate

# Claude Code
/plugin install golive-gate@smart-aiagent-plugins
```

## Usage

```text
/vibe-ship         # the whole pipeline: requirement or ticket → built, tested, gated, handed to the platform
/assess-risk       # classify the tool, record in PROJECT.md
/release-review    # risk-tiered pre-release checklist + evidence (builder-side)
/vibe-review       # reviewer seals docs/REVIEW-PROOF.md (commit + their git identity), then regenerates vibe-release.json with the sealed review
/test-scenarios    # generate/reconcile docs/TEST-SCENARIO.md + test code; auto-run hermetic suites, fix-loop High-severity failures
/vibe-conform      # ad-hoc contract check — normally unnecessary, it is chained at phases 2, 5 and 7
/vibe-check        # the "I want to ship" button — chains everything below, then gates
```

`/vibe-ship` is the outer loop — it runs the build and test phases that come *before* the gate, then calls `/vibe-check` and the platform handoff. Use it for a new tool; use the individual commands when only one phase is missing.

`/vibe-check` chains missing prerequisites automatically: provisional or missing risk level → `assess-risk-level`; incomplete dossier → `project-documenter` (project-scaffold); missing or stale `docs/DESIGN.md` → `design-document` (project-scaffold); test-case dossier → `generate-test-scenarios` (after `design-document`) writes/reconciles `docs/TEST-SCENARIO.md`, generates the backing test code, auto-runs the hermetic suites, and runs the bounded High-severity fix loop (max 3 attempts per finding per `data/test-policy.json`, then FAILED + NEEDS-HUMAN — still blocking; Medium/Low failures are looped only on the user's say-so); reviewer-sealed proof → for **Low** it runs `seal-review-proof` (self-certify), for **Medium/High** it requires an existing `docs/REVIEW-PROOF.md` sealed by an independent reviewer (`/vibe-review`) and NOT READY without one. Because the fix loop can modify product code, the test phase runs before the review step — commit its fixes before requesting the Medium/High review, or an already-sealed proof goes stale. The design document and test scenarios are produced for every tier; their `design-document-complete` and `test-scenario-complete` gate items block only at Medium/High. A scenario that already PASSED is not re-run unless the code it covers — or its generated test file — changed (then it is STALE until re-verified), and Medium/High cannot pass while a High/Medium-severity (important/sensitive) scenario is FAILED or STALE.

### `/vibe-conform` — the contract, checked

Every rule in `data/build-contract.json` is already stated in prose in `vibe-code-and-deploy`, and every one of them was missed by at least one app delivered on that skill. Four apps built on the identical stack produced four different script vocabularies (`itest` vs `test:integration`, `check` vs `typecheck`, one with no coverage script at all), two reported **0.0% Sonar coverage on passing suites** because the declared lcov path resolved to nothing tracked, one shipped an image scanning **CRITICAL=3, HIGH=35** because its Dockerfile never patched the base, and **all four** left a gate record naming a commit they had already shipped past.

A rule an agent agrees with and does not follow needs a check, not a stronger paragraph.

**It is chained, not typed.** `vibe-code-and-deploy` runs it at the exit of **phase 2** (the commands and the `## Build and run` section — the only things that exist yet) and again at the exit of **phase 5** (plus the Dockerfile, the coverage report and the platform's injected stubs); `check-golive-readiness` runs the full set as **prerequisite 0**; and the `golive-gatekeeper` agent runs it before any release-like action and again after the platform's onboarding commit lands, since that commit edits application source. `data/build-contract.json` `stages` defines each subset and why the rest are held back — reporting a missing Dockerfile at phase 2 would only teach the caller to ignore the output. `/vibe-conform` is the ad-hoc entry point for a repo nobody is currently shipping.

The check is read-only and reports a verdict: any High-severity failure is **FAIL** (phase 7 is not entered), Low/Medium only is **CONDITIONAL**, clean is **PASS**. It never fixes a finding by weakening the check — renaming the contract to match what a repo happens to have is silencing the control, not satisfying it.

**Brownfield-adopted projects** (onboarded via project-scaffold's `/adopt-vibe`) additionally carry a remediation backlog (default `docs/REMEDIATION.md`, tier policy in `data/remediation-tiers.json`): open **BLOCKING** findings force NOT READY; **ADVISORY** findings are legacy migration notes that never block — but new or modified code must comply immediately.

## Deployment handoff

Every `/vibe-check` run writes **`vibe-release.json`** at the project root (spec: `data/release-doc.json`); the vibe coder commits + pushes it. For a Medium/High tool the independent reviewer's `/vibe-review` also regenerates it: after sealing `docs/REVIEW-PROOF.md`, `seal-review-proof` chains the same gate against the sealed commit, so `review-verdict` / `review-proof` / `reviewed-at` and a consistent `release-gate-status` / `target-commit-hash` land in `vibe-release.json` without a separate `/vibe-check` re-run — and `/vibe-review` commits it automatically as a second reviewer commit, so the reviewer only pushes.

`vibe-release.json` is **our** governance record plus Vibe Code Project Registry data — `release-gate-status`, `target-commit-hash`, `review-verdict`, `risk-level`, the cost labels, and the rest. Our gate is a governance control enforced by people and process; it is not the deployment platform's own production gate, so never describe it as something the platform enforces.

`vibe-release.json` is a **flat, single-level** document — every field is a top-level key, no nested objects.

`project-owner` and `support-contact` are **typed identities**, not free text: a GitHub username (existing, acme-org-ops member) and a single email (no public webmail, no shared lab/group account). `/vibe-check` validates both and asks the owner to fix anything that doesn't conform — including rewriting legacy free-text values — so the registry can key on them reliably.

**No code yet?** A classification made at project start (e.g. via `/start-vibe`) has no evidence to verify — it is recorded as **Provisional (intent-based)** and re-verified against the actual codebase at review and gate time. Evidence may raise the tier, never lower it; only a BPT confirmation can lower it. `/start-vibe` also writes `docs/REGISTRATION.json` (`data/registration-doc.json`) for the Alpha Projects Registry form.

Requires a `PROJECT.md` dossier — create one with the `project-scaffold` plugin's `new-repo-init` skill (or `/start-vibe`).

## Scripts

| Script | What it does |
|---|---|
| `scripts/check-build-contract.js` | Executable build-contract check. `--repo <path> --stage <phase-2\|phase-5\|phase-7\|post-onboarding> [--json]`. Exit 0 PASS, 2 CONDITIONAL, 1 FAIL, 3 not applicable. Read-only |
| `scripts/selftest-check-build-contract.js` | Proves the checker fails: builds a conforming fixture, breaks one rule at a time, asserts each finding fires at its stated severity |
