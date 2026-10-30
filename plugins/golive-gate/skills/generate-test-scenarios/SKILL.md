---
name: generate-test-scenarios
description: >-
  Scan the codebase and the design-review document (docs/DESIGN.md) to generate a reviewer-facing test-case dossier at docs/TEST-SCENARIO.md — the important, sensitive, and core scenarios that must be verified before go-live. Idempotent and history-preserving: it reconciles against the existing dossier, never regenerates a scenario that already PASSED unless the code it covers or its generated test file changed, assigns stable TS- IDs, and keeps every status transition. Also generates the backing test code — unit, integration, security, and performance tests per data/test-policy.json — runs hermetic suites automatically via the project's own runner, maps results back to TS-IDs with a deterministic severity (sensitive→High, important→Medium, core→Low), runs a bounded diagnose→fix→re-run loop on High-severity failures (max 3 attempts, then FAILED + NEEDS-HUMAN, still blocking), and asks before looping Medium/Low failures. Checks touching live/external systems still require the user's go-ahead. Use via /test-scenarios, or automatically as part of /vibe-check (chained after design-document, before the review); human-judgment scenarios are left for the independent reviewer at /vibe-review.
---

# Generate test scenarios

Produce and maintain `docs/TEST-SCENARIO.md` — the structured, persisted list of test-case scenarios a reviewer verifies before a tool goes live — together with the test code that backs its agent-checkable scenarios. It is the concrete, per-scenario backing for the `main-function-tested` review-checklist item, aligned to the flows documented in `docs/DESIGN.md`.

Read the template and rules in `references/test-scenario-template.md` (relative to this skill), `data/never-log.json` (relative to the installed `golive-gate` plugin) for the sensitive-data catalogue, and `data/test-policy.json` (same location) for the severity mapping, test-type expectations, run policy, and fix-loop bounds.

## When to use

1. The user runs `/test-scenarios`.
2. `/vibe-check` chains it automatically — after `design-document` (so scenarios align to a current DESIGN.md) and before the reviewer seals the proof, so `docs/TEST-SCENARIO.md` is committed and available to the reviewer.
3. Before asking an independent reviewer to review a Medium/High tool.

## Prerequisites (chain — do not skip)

1. PROJECT.md `## Risk Level` is filled and not Provisional. Empty → run `assess-risk-level`; Provisional → re-run it to finalize against the code.
2. `docs/DESIGN.md` exists and is current. Missing or stale → run the `project-scaffold` plugin's `design-document` skill first — the scenarios are derived from its use-case flows.

## Steps

1. **Discover the dossier.** Look for `docs/TEST-SCENARIO.md`. Identify it by its first-line marker `<!-- managed-by: golive-gate test-scenario v2 -->`. A v1 marker identifies the file as ours from a previous plugin version — upgrade it in place per the template's v1 → v2 upgrade rules (fields added, Severity derived from Category, IDs/statuses/history untouched, one History line) before reconciling. A same-named file whose first line is not a marker → **do not clobber**; ask the user what it is and use an alternate from the template's `collisionAlternates`. No file → create mode.
2. **Derive candidate scenarios.** From two sources, kept aligned:
   - **docs/DESIGN.md** — one candidate per major use-case / flow in its "Sequence Diagrams & System Boundaries" section, plus any transaction flow and each Financial-Risks concern (race condition, failure/retry/idempotency, duplicate-transaction) as sensitive scenarios.
   - **Codebase scan** — routes/endpoints and their role/permission boundaries; auth/access-control checks; money/transaction operations; and any handling of `never-log.json` data (sensitive scenarios). Record the `file:line` locations each candidate **Covers**.
   - Categorize each: `core` (main happy-path functionality), `important` (significant secondary behavior), `sensitive` (auth, access boundary, financial, or sensitive-data handling). Mark `verify: agent` when a scenario can be checked by running code/inspection, `verify: human` when it needs human judgment (UX correctness, business-rule intent, real-data correctness).
   - Assign each scenario its `Severity` from `test-policy.json` `severityByCategory` (`sensitive → High`, `important → Medium`, `core → Low`) and its required `Test-type`s from `testTypeExpectations`. `Covers` plus the scenario's `Test-file`(s) form the **freshness set**.
3. **Reconcile against existing scenarios** (idempotent — never renumber, never delete; full rules in the template):
   - Match each candidate to an existing scenario by flow + normalized `Covers` location.
   - Existing **PASSED** and its freshness set (`Covers` ∪ `Test-file`) unchanged since `Last-verified-commit` (`git diff --name-only <Last-verified-commit>..HEAD` shares no path with it) → **keep PASSED, skip** — do not regenerate and do not re-run it.
   - Existing **PASSED** but the freshness set intersects the diff (product code **or** generated test file changed) → flip to **STALE**, reset `Fix-attempts`, and append a `## History` line.
   - New candidate with no match → new scenario, next `TS-NNN` ID, status **PENDING**.
   - Existing scenario no longer present in DESIGN.md/code → keep it, add a note "no longer in design (kept for history)"; never delete.
4. **Detect the project's test infrastructure.** Read package.json (`scripts.test`, devDependencies) and existing test directories to find the runner and conventions. No runner? Resolve approved tooling from `allowedStack` in `data/build-contract.json` (`bun test` for the hermetic suite, Playwright for browser journeys), using tech-radar `query-tech-stack` only for gaps the stack does not cover and place files per the code-structure plugin's conventions. Never introduce a framework the project or the radar does not already sanction.
5. **Generate test code.** For every PENDING or STALE `verify: agent` scenario, write the test file(s) that assert its Expected outcome — the `Test-type`s required by `test-policy.json` (unit, integration, security, performance as applicable). Prefix each test title with its TS-ID (e.g. `describe('TS-007: checkout idempotency', …)`) so runner output maps back to scenarios deterministically. Record `Test-file` and set `Run-policy: auto` when the suite is hermetic per `runPolicy.hermeticTest`; scenarios needing live/external systems or manual steps keep `Run-policy: ask`. Quality rules per `test-policy.json` `qualityRules`: every test asserts behavior — never assertion-free tests, never a weakened assertion to force a pass.
6. **Run.** Run all `Run-policy: auto` suites now, automatically, via the project's own runner — no approval ask. Then list the `Run-policy: ask` checks (what each touches) and ask for the go-ahead once, as a batch, before running any of them — the pre-existing approval rule survives for exactly this class. Map results to TS-IDs; record `PASSED (<date>, <commit>, agent)` or `FAILED (<date>, <note>)`, set `Last-verified-commit`, and append `## History` lines. `verify: human` scenarios stay PENDING for the independent reviewer to verify at `/vibe-review`.
7. **High-severity fix loop (bounded).** For each FAILED High-severity finding, loop per `test-policy.json` `fixLoop`, at most `maxAttempts` (default 3) attempts: **diagnose the root cause first** (reproduce, isolate — never fix before the cause is understood), **classify** product-bug vs test-bug, **apply the minimal fix to the correct side** (product code for product bugs, test code for test bugs — never weaken or delete the assertion), **re-run** the finding's tests plus any suite whose freshness set intersects the changed files, and append a `## History` line per attempt: `<date> · TS-NNN · fix attempt <n>/<max> — <root cause> → <fix summary> → <PASSED|FAILED>`, updating `Fix-attempts`. Success → PASSED. Attempts exhausted → record `FAILED (<date>, <root-cause note>, NEEDS-HUMAN)` and stop — the finding still blocks the gate; never loop past the bound, never downgrade.
8. **Medium/Low failures — ask, never auto-loop.** Present one compact batch ask listing every Medium/Low failure (TS-ID, title, severity, one-line failure) and let the user choose which get the same bounded loop. Run it only for the selected findings; unselected ones stay FAILED with their notes — recorded honestly, no nagging repeats.
9. **Warn when fixes invalidate a sealed review.** If this run modified tracked source (product fixes or new/changed test files) and a sealed `docs/REVIEW-PROOF.md` exists, say plainly: the proof is now stale — `git diff --name-only <reviewed-commit>..HEAD` lists more than the allowlisted files (`docs/REVIEW-PROOF.md`, `PROJECT.md`, `vibe-release.json`) — so the `review-proof-sealed` gate item will FAIL at Medium/High until an independent reviewer re-runs `/vibe-review`. Sequencing rule: at Medium/High, run this test phase and commit its fixes **before** requesting the review.
10. **Write `docs/TEST-SCENARIO.md`** per `references/test-scenario-template.md`: refresh `## Summary` counts (including the NEEDS-HUMAN and High-severity-not-PASSED rows) and the generated date, write all scenarios under `## Scenarios` (stable IDs, v2 fields), and append any status transitions to `## History`. Preserve every existing entry and its history.
11. **Record honestly on a dirty tree; do not auto-commit.** Fixes and generated tests dirty the working tree, and this skill never auto-commits (unless invoked inside another skill's own commit flow). When `git status --porcelain` is non-empty at verification time, record `Last-verified-commit: <HEAD> (dirty)` and `PASSED (<date>, <HEAD> (dirty), agent)` — the pass is real, the anchor is approximate, and the note says so. Then prompt the user to commit the fixes + test files + dossier now. If they commit in this same session with no further edits after the passing run, update the stamp to the new commit and drop `(dirty)`, with a History line `<date> · TS-NNN · re-stamped to <commit> (same tree that passed)`. If they don't, the `(dirty)` stamp stays; on the next run the normal freshness diff applies — a re-verify of a dirty-stamped scenario whose files landed in a later commit is honest, not redundant.

## Output

- A summary: totals by status (PASSED / FAILED / PENDING / STALE) **and by severity** (High / Medium / Low), how many tests were generated and run this session (files and test types), and which scenarios remain for the human reviewer.
- Fix-loop summary: findings resolved, attempts used per finding, and the `NEEDS-HUMAN` list (TS-IDs a person must take over).
- Every product or test file the fix loop modified, so the user can review the diff before committing.
- The review-proof staleness warning (step 9) when this run's changes triggered it.
- The path `docs/TEST-SCENARIO.md` and a reminder to commit it together with the generated test files and any fixes.

## Hard rules

- Never renumber or delete a scenario; IDs and history are permanent. Status only moves forward with a dated `## History` entry.
- Never regenerate or re-run a scenario that is PASSED and whose freshness set (covered code and generated test file) is unchanged — that is the "no unnecessary re-test" guarantee.
- A PASSED scenario whose covered code or test file changed is STALE, not PASSED — it must be re-verified.
- Never run a `Run-policy: ask` check before the user approves the run; never fabricate a PASSED result. Generated hermetic test suites run automatically; anything touching a live/external system, mutating shared state, or requiring manual steps still needs the user's explicit go-ahead first.
- Severity is derived from Category via `data/test-policy.json` (`sensitive → High`, `important → Medium`, `core → Low`) — never assigned or changed ad hoc; changing the mapping means editing the policy file.
- The High-severity fix loop is bounded: at most `fixLoop.maxAttempts` (default 3) diagnose→fix→re-run attempts per finding, then `FAILED (…, NEEDS-HUMAN)` and stop — NEEDS-HUMAN routes the finding to a person, it never waives it and it still blocks.
- Fix the right side: product bugs in product code, test bugs in test code — never weaken, delete, or skip a failing assertion to force a pass, and never add assertion-free tests.
- A pass on a dirty tree is recorded with a `(dirty)` anchor, never as a clean commit; the skill never auto-commits.
- This skill does not grant approvals and does not write `vibe-release.json`; `check-golive-readiness` reads `docs/TEST-SCENARIO.md` for the `test-scenario-complete` gate item.
