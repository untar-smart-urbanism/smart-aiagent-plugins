---
name: vibe-check
description: Run the final go-live gate — approvals, access, SSO login, platform, logging, recovery, ownership — and report READY / NOT READY / CONDITIONAL.
---

# Vibe check (go-live gate)

Run the `check-golive-readiness` skill from the `golive-gate` plugin. This is the single "I want to ship" entry point — it chains missing prerequisites automatically:

1. PROJECT.md `## Risk Level` empty → run `/assess-risk` first. Marked **Provisional** (classified before code existed) → re-run `/assess-risk` to verify against the actual codebase and finalize the tier.
2. Dossier incomplete (owner, data used, login method, hosting missing) → run the `project-scaffold` plugin's `project-documenter` skill to complete PROJECT.md. A missing SRE backup method is recorded as follow-up, not a reason to stop this chain.
3. `docs/DESIGN.md` missing or stale → run the `project-scaffold` plugin's `design-document` skill (after `project-documenter`) to generate/refresh the design-review document (diagrams, transaction flow, database schema, external connections, financial-risk analysis). Produced for every tier; the `design-document-complete` gate item blocks only at Medium/High.
4. `docs/TEST-SCENARIO.md` → run the `generate-test-scenarios` skill (after `design-document`) to generate/reconcile the test-case dossier (marker v2; a v1 dossier is upgraded in place), generate the backing test code (unit/integration/security/performance per `data/test-policy.json`), auto-run the hermetic suites, run the bounded High-severity fix loop (max 3 diagnose→fix→re-run attempts per finding, then FAILED + NEEDS-HUMAN, still blocking), and ask before running live/manual checks or looping Medium/Low failures. Idempotent (PASSED-and-unchanged kept — freshness covers the generated test files too — PASSED-but-changed → STALE); history preserved. Produced for every tier; the `test-scenario-complete` gate item blocks only at Medium/High. Runs **before** step 5 deliberately: the fix loop can change product code, which makes an existing sealed `docs/REVIEW-PROOF.md` stale — commit the fixes, tests, and dossier before requesting the Medium/High review, where the reviewer verifies the human-judgment scenarios.
5. Reviewer-sealed proof (`docs/REVIEW-PROOF.md`): **Low** → run `seal-review-proof` automatically (self-certify) as part of this gate; **Medium/High** → the proof must already exist, sealed by an independent reviewer. Missing at Medium/High → NOT READY: "an independent reviewer must run `/vibe-review`."

Run this chain to completion **before** the gate verifies and records (Steps below). The gate reads the tool's current on-disk state, so any file the chain creates or refreshes this run — `docs/DESIGN.md`, `docs/TEST-SCENARIO.md`, `docs/REVIEW-PROOF.md`, and the PROJECT.md dossier — is reflected in the recorded result, never reported as missing right after it was created.

## Steps

1. Load `plugins/golive-gate/data/golive-gate.json`, `data/never-log.json`, and `data/remediation-tiers.json`; select items for the tier.
2. Verify approvals per tier: Low = owner check; Medium = independent review recorded; High = named Tech R&D/Architecture, SRE, InfoSec, GRC sign-offs recorded.
3. Verify each gate item against its PROJECT.md section (Login Method must be Apps Gateway SSO or Company Google OAuth; SRE-owned backup status is an advisory follow-up; no never-log data in logs; `docs/TEST-SCENARIO.md` has no FAILED or STALE important/sensitive scenario for Medium/High; `## Label` must hold all three GCP labels — Company (one approved sister-company code) and Division (operations/finance/marketing/commercial) from the allowed lists, plus a non-empty free-text Department recorded in lowercase; if any is missing/invalid, ask the owner for that value and record it). For any other empty blocking human-only field the owner can supply on the spot (Access Status, Login Method, support contact), ask the owner and record it before marking the item failed; only recorded approvals / Review Evidence require the real record and cannot be filled by asking.
4. If a remediation backlog exists (brownfield-adopted project — locate via remediation-tiers.json rules): open BLOCKING findings force **NOT READY** and are listed by ID; ADVISORY findings are recorded in the gate record but never block. No backlog → N/A.
5. Append a dated gate record to PROJECT.md `## Review Evidence`, reflecting the post-chain state — an artifact the chain created this run is recorded as present, never as missing.
6. Generate `vibe-release.json` at the project root per `data/release-doc.json` — a **flat, single-level** doc, every run, all verdicts (`review-gate` from risk tier; `review-verdict`/`review-proof`/`reviewed-at` from the sealed `docs/REVIEW-PROOF.md`, else `null`; `release-gate-status` = verdict; `target-commit-hash` = HEAD; `start-vibe` from PROJECT.md `## Vibe Start`, else the first git commit date; the flat project fields from PROJECT.md/git/package.json). Then prompt the user to commit + push it.

## Report

- **READY** / **NOT READY** (blocking list, including open BLOCKING backlog findings by ID) / **CONDITIONAL** (human approvals pending — name the approvers)
- Release doc: `vibe-release.json` (flat, single-level) — `review-gate`, `review-verdict`, `review-proof`, `release-gate-status`, `target-commit-hash`, `start-vibe` — with the reminder to commit + push. `target-commit-hash` records the commit this gate evaluated, so commit more code and the verdict no longer describes what you are shipping: re-run the gate.
- Be accurate about reach: this verdict is our playbook's, enforced by people. The deployment platform's own production gate is separate.
- Test dossier: `docs/TEST-SCENARIO.md` — scenario totals by status and severity; STALE or FAILED High/Medium-severity (important/sensitive) scenarios block Medium/High; `NEEDS-HUMAN` findings are listed by TS-ID for a person to take over. If the fix loop modified code this run, the report says an existing sealed proof is now stale.
- The agent verifies approvals are recorded; it never grants them.
