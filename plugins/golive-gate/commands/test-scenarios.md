---
name: test-scenarios
description: Generate or refresh docs/TEST-SCENARIO.md — the reviewer-facing test-case dossier aligned to docs/DESIGN.md — and the test code that backs it. Idempotent: keeps history, never re-runs a scenario that already passed unless its covered code or test file changed. Auto-runs hermetic suites, fix-loops High-severity failures (max 3 attempts), asks before looping Medium/Low.
---

# Test scenarios

Run the `generate-test-scenarios` skill from the `golive-gate` plugin. It scans the codebase and `docs/DESIGN.md`, writes/reconciles `docs/TEST-SCENARIO.md` (marker v2; a v1 dossier is upgraded in place), generates the backing test code, runs it, and fix-loops High-severity failures.

`/vibe-check` runs this automatically (chained after `design-document`). Use `/test-scenarios` to regenerate or re-verify on demand — e.g. after changing code or test files that a PASSED scenario covers (it will show as STALE until re-verified).

## Steps

1. Ensure prerequisites: PROJECT.md `## Risk Level` is final (else `/assess-risk`) and `docs/DESIGN.md` is current (else run the `project-scaffold` plugin's `design-document` skill).
2. Run `generate-test-scenarios`: derive candidates from DESIGN.md flows + a codebase scan (routes/roles, access boundaries, financial/transaction ops, `never-log.json` data), assign severity (sensitive→High, important→Medium, core→Low per `data/test-policy.json`), reconcile against the existing dossier (never renumber, never delete, keep PASSED-and-unchanged as-is — freshness covers `Covers` ∪ `Test-file` — flip PASSED-but-changed to STALE), generate the backing test code (unit/integration/security/performance per `testTypeExpectations`, TS-ID-prefixed titles), and write `docs/TEST-SCENARIO.md`.
3. Auto-run the hermetic generated suites (no ask); list live/external or manual checks and ask once, as a batch, before running them. Record PASSED/FAILED with date + commit. Run the bounded High-severity fix loop (max 3 diagnose→fix→re-run attempts per finding, then FAILED + NEEDS-HUMAN, still blocking); batch-ask which Medium/Low failures get the same loop. Leave `verify: human` scenarios for the reviewer at `/vibe-review`.

## Report

- Totals by status (PASSED / FAILED / PENDING / STALE) and severity (High / Medium / Low), the tests generated and run this session with their results, the fix-loop summary (resolved, attempts used, NEEDS-HUMAN list by TS-ID), and what remains for the human reviewer.
- Every product or test file the fix loop modified, so the user can review the diff.
- If this run's changes staled a sealed `docs/REVIEW-PROOF.md`, say so — an independent reviewer must re-run `/vibe-review` at Medium/High.
- The path `docs/TEST-SCENARIO.md` and a reminder to commit it together with the generated tests and fixes so the reviewer and `/vibe-check` gate can read it.
