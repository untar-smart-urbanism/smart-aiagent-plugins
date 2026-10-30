# docs/TEST-SCENARIO.md — template and reconcile rules

`docs/TEST-SCENARIO.md` is a **managed, history-preserving** document (same discipline as the
adopt-vibe remediation backlog): stable IDs, append-only history, never clobbered, never
renumbered. The `generate-test-scenarios` skill owns it.

## Location & discovery

- Default path: `docs/TEST-SCENARIO.md` (create `docs/` if missing).
- **Line 1 is the marker** (identifies the managed file): `<!-- managed-by: golive-gate test-scenario v2 -->`
- **A v1 marker (`<!-- managed-by: golive-gate test-scenario v1 -->`) also identifies the file as
  ours** — upgrade it in place per the v1 → v2 upgrade rules below before reconciling.
- **Collision protocol:** a file at the default path whose first line is not a marker is NOT
  ours — never overwrite it. Ask the user, then use a `collisionAlternates` path:
  `docs/TEST-SCENARIOS.md`, then `docs/VIBE-TEST-SCENARIO.md`. The chosen path is authoritative
  for every future run.

## Status values

- `PENDING` — generated, not yet verified.
- `PASSED (<date>, <commit>, <agent|reviewer name>)` — verified against `<commit>`.
- `FAILED (<date>, <note>[, NEEDS-HUMAN])` — verified and failed; note what broke. `NEEDS-HUMAN`
  marks an exhausted High-severity fix loop: a person must take over; it blocks exactly like any
  FAILED and is never a waiver.
- `STALE` — was PASSED, but its freshness set (code it Covers or its Test-file) changed since
  `Last-verified-commit`; must be re-verified.
- `WAIVED (<approver>, <reason>, <date>)` — accepted without passing; approver named.

## Categories & verification

- Category: `core` (main happy path) | `important` (significant secondary behavior) |
  `sensitive` (auth, access boundary, financial/transaction, or `never-log.json` data handling).
- Verify: `agent` (checkable by running code/inspection — backed by generated test code) |
  `human` (needs human judgment — the reviewer verifies at `/vibe-review`).

## Severity, test types & run policy

- Severity: `High` | `Medium` | `Low` — derived from Category via `data/test-policy.json`
  `severityByCategory` (`sensitive → High`, `important → Medium`, `core → Low`). Recorded per
  scenario; the policy file is authoritative — never assign severity ad hoc.
- Test-type: one or more of `unit`, `integration`, `security`, `performance`, `manual` per
  `test-policy.json` `testTypeExpectations`.
- Test-file: repo-relative path(s) of the generated test file(s), or `—` when no code backs the
  scenario (manual/human checks).
- Run-policy: `auto` (hermetic generated suite — runs without asking) | `ask` (touches
  live/external systems, mutates shared state, or needs manual steps — runs only on the user's
  go-ahead).
- Fix-attempts: `<used>/<max>` for the current failure cycle (`max` = `fixLoop.maxAttempts`,
  default 3); reset to `0/<max>` when the scenario returns to PENDING or STALE via reconcile.

## File structure

```markdown
<!-- managed-by: golive-gate test-scenario v2 -->
# Test Scenarios — <tool / repo name>

Managed by golive-gate:generate-test-scenarios. Rules: scenarios that already PASSED are not
regenerated or re-run unless the code they cover — or their generated test file — changed
(then STALE → re-verify); IDs are assigned once and never renumbered; entries and history are
never deleted. Severity derives from Category (sensitive → High, important → Medium,
core → Low; policy: golive-gate data/test-policy.json). Generated hermetic test suites run
automatically; checks touching live/external systems or needing manual steps run only on the
user's go-ahead; human-judgment scenarios are verified by the independent reviewer at
/vibe-review. High-severity failures get a bounded diagnose→fix→re-run loop (max attempts per
test-policy.json); an exhausted loop is recorded FAILED (…, NEEDS-HUMAN) and still blocks.
Blocking rule: /vibe-check will not return READY at Medium/High while a High- or
Medium-severity (sensitive/important) scenario is FAILED or STALE.

Last generated: <YYYY-MM-DD> · Aligned to docs/DESIGN.md

## Summary

| Metric | Count |
|---|---|
| Total | <n> |
| Passed | <n> |
| Failed | <n> |
| Failed — NEEDS-HUMAN | <n> |
| Pending | <n> |
| Stale | <n> |
| High severity not PASSED | <n> |

## Scenarios

### TS-001 — <short title>  [PASSED (2026-07-14, 3f9c2e1, agent)]
- Feature / flow: <DESIGN.md section or code path>
- Category: sensitive
- Severity: High
- Verify: agent
- Test-type: unit, security
- Test-file: `tests/pay/checkout.spec.ts`
- Run-policy: auto
- Preconditions: <state / fixtures>
- Steps: <ordered steps>
- Expected: <expected result>
- Covers: `src/pay/checkout.ts:40-92`, `src/pay/idempotency.ts:12`
- Fix-attempts: 0/3
- Last-verified-commit: 3f9c2e1

### TS-002 — <short title>  [PENDING]
- Feature / flow: ...
- Category: important
- Severity: Medium
- Verify: human
- Test-type: manual
- Test-file: —
- Run-policy: ask
- Preconditions: ...
- Steps: ...
- Expected: ...
- Covers: `src/orders/list.ts:10-60`
- Fix-attempts: 0/3
- Last-verified-commit: —

## History

- 2026-07-14 · TS-001 · PENDING → PASSED (agent, commit 3f9c2e1)
- 2026-07-14 · TS-002 · created (PENDING)
```

## Reconcile semantics (dossier already exists)

1. Parse existing entries by ID. Match fresh candidates to them by flow + normalized `Covers`
   location (a file moved but same flow/symbol → same entry, update `Covers`).
2. **PASSED + unchanged** — `git diff --name-only <Last-verified-commit>..HEAD` shares no path
   with the scenario's **freshness set — the union of its `Covers` paths and its `Test-file`
   paths** → keep PASSED, do not regenerate, do not re-run.
3. **PASSED + changed** — the diff intersects the freshness set (product code **or** generated
   test file) → set `STALE`, reset `Fix-attempts` to `0/<max>`, append a `## History` line.
4. **New candidate** — no match → next `TS-NNN` ID (zero-padded, never reused), status `PENDING`.
5. **No longer in design/code** — keep the entry; add a note "no longer in design (kept for
   history)"; never delete.
6. **FAILED / WAIVED** entries and all `## History` lines are never edited or removed. A WAIVED
   scenario that reappears as sensitive → back to PENDING, waiver preserved inline as history.
7. Update only `## Summary`, `Last generated`, per-scenario `Status`/`Severity`/`Test-type`/
   `Test-file`/`Run-policy`/`Fix-attempts`/`Last-verified-commit`, and append to `## History`.
   Never rewrite the header rules (the one exception: the v1 → v2 upgrade replaces the v1
   paragraph with the v2 paragraph, once).

## v1 → v2 upgrade (in place, once)

1. A discovered file whose line 1 is the v1 marker is ours: upgrade it before reconciling.
2. Rewrite line 1 to the v2 marker; replace the header rules paragraph with the v2 paragraph
   (the sanctioned exception to "never rewrite the header rules").
3. Add to every scenario: `Severity` derived from its existing `Category` via test-policy.json;
   `Test-type: —`; `Test-file: —`; `Run-policy: ask` (flips to `auto` only when a hermetic suite
   is generated for it); `Fix-attempts: 0/<maxAttempts>`.
4. Never change IDs, statuses, `Covers`, `Last-verified-commit`, or `## History` during the
   upgrade — adding fields is not a code change, so PASSED stays PASSED.
5. Append one `## History` line:
   `<date> · dossier · upgraded marker v1 → v2 (severity + test fields added; statuses preserved)`.

## IDs

`TS-` + zero-padded counter (`TS-001`), assigned once at creation, **never renumbered or reused**.
