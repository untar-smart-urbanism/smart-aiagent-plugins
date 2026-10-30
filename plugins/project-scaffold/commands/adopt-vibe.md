---
name: adopt-vibe
description: Onboard an existing project into the Non-Tech Change Management playbook — scaffold missing governance files, re-home the repo into the company org, run baseline audits into a tiered remediation backlog, and classify risk from code evidence. Safe to re-run anytime; it reconciles instead of duplicating.
---

# Adopt vibe (brownfield onboarding)

The single entry point for a project that existed **before** the governance plugins. Thin orchestrator: it invokes existing skills/commands and persists their findings — it contains no audit logic of its own and **changes no source files**. The only files it may create or update: the scaffold files (via `new-repo-init`), the remediation backlog, one pointer line in PROJECT.md, and the PROJECT.md dossier fields the owner confirms in the Phase 1 and Phase 5 interviews (Label, Risk Level, Access Status, Login Method, support contact, Access Approval Process, Review Evidence).

Every phase starts with an "already done?" check and reports `SKIPPED` instead of redoing work — a project that previously ran `/start-vibe` resumes cleanly.

## Phase 0 — Preflight (read-only)

Detect and print a status table before touching anything:

| Check | How | Drives |
|---|---|---|
| Git repo | `.git` exists | missing → Phase 1 `git init`s |
| Origin | `git remote get-url origin`; compare against `defaultOrg` in `plugins/ops-github/data/github-policy.json` | none → create path; in org → repo phase SKIPPED; outside org → migration path |
| Scaffold files | CLAUDE.md / AGENTS.md / CONTEXT.md / PROJECT.md / .gitignore | all present → Phase 1 SKIPPED |
| PROJECT.md layout | dossier vs old living-state layout | old layout → new-repo-init's rename row handles it |
| Label | PROJECT.md `## Label` holds all three GCP labels — Company + Division from the controlled lists (`gcp-label-set.labels` in `plugins/golive-gate/data/golive-gate.json`) and a non-empty free-text Department recorded in lowercase | any missing/invalid → ask in Phase 1 |
| Vibe Start | PROJECT.md `## Vibe Start` holds a date | empty → Phase 1 stamps the first git commit date |
| Risk Level | empty / Provisional / final | drives Phase 5 |
| Backlog | pointer line in PROJECT.md Security Notes → default path with marker (`plugins/golive-gate/data/remediation-tiers.json` → `backlogFile`) | found → reconcile mode; same-name file **without** marker → collision protocol |
| Audit plugins installed | code-review, scan-dependency, tech-radar, code-structure | missing → coverage gaps, never hard failures. BLUE UI audits come from the separate company BLUE marketplace when installed. |

## Phase 1 — Scaffold

Run this plugin's `new-repo-init` skill (already additive and confirm-gated: writes only missing files, never silently overwrites, skips `git init` when `.git` exists). All artifacts already present → `SKIPPED (already scaffolded)`.

Then, if PROJECT.md `## Vibe Start` is empty: record the project's **first git commit date** there (`git log --reverse --date=short --format=%ad | head -1`) — a brownfield project predates adoption, so its start is its earliest commit, not today. This stamp decides legacy status for the stack policy (Vibe Start before 2026-10-07 = legacy; major improvements still need tech-architect approval). Idempotent: never overwrite an existing value. No git history yet → leave it blank (`/vibe-check` applies the same first-commit fallback).

Then, for any of the three PROJECT.md `## Label` values that is empty or invalid, ask the owner and record it under the Company / Division / Department lines — **Company** exactly one of **acme, acme-pay, acme-pa, acme-ventures, acme-retail, acme-travel, acme-an, acme-us, acme-intl, acme-rise, acme-gem**; **Division** exactly one of **operations, finance, marketing, commercial**; **Department** free text (non-empty), recorded in lowercase. Authoritative lists: `gcp-label-set.labels` in `plugins/golive-gate/data/golive-gate.json`. Owner input — never guess them; you must **ask**, not skip. The owner may **explicitly defer** a value — then leave that line pending and note that `/vibe-check` will hold it; silence is not a deferral.

## Phase 2 — Baseline audits (read-only — explicitly do not fix)

Run in order, capturing findings for Phase 3. A missing plugin is recorded as an audit coverage gap ("install X and re-run /adopt-vibe to close the gap"), never a hard failure.

1. `code-review` → `/audit-security` (full-project OWASP; must-fix / should-fix). **Read-only mode — report, do not fix.**
2. `scan-dependency` → `/scan-deps` (OSV vulnerabilities + license policy)
3. `tech-radar` → `/check-stack` (context: the allowed stack is `allowedStack` in golive-gate `build-contract.json`; deviations belong in PROJECT.md `## Stack Exceptions`. Report them; do not add exception rows automatically)
4. `code-structure` → `/check-structure` (never `/fix-structure` here)
5. BLUE UI audit — runs for any detected frontend when the separate company BLUE / `blu-design-system` marketplace plugin is installed: BLUE DLS token/design conformance always; `@acme/rnd-svelte.*` components for Svelte; BLUE DLS Vue components for legacy Vue. Otherwise record "N/A — BLUE marketplace not installed or no frontend"

## Phase 3 — Persist findings to the remediation backlog

1. Load `plugins/golive-gate/data/remediation-tiers.json` and assign each finding a tier via its `sources[].map`. Unmapped finding type → `defaultTier` (BLOCKING). golive-gate not installed → put **all** findings under Blocking with a banner "tier policy unavailable — install golive-gate and re-run to re-tier"; never silently downgrade.
2. Seed **GLG** findings from cheap checks this command already performed: origin outside the org → `non-company-storage`; auth code not matching `golive-gate.json` `sso-login-only.allowed` → `non-approved-auth`; `never-log.json` scanHints matched in log statements → `never-log-data`.
3. Write or reconcile the backlog file (spec below), then write/refresh the single pointer line in PROJECT.md `## Security Notes`:
   `Remediation backlog: <path> — <n> BLOCKING open / <m> ADVISORY open (last audited <date>).`
   Update that one line in place; touch nothing else in the section.

### Backlog file spec

- Path: `backlogFile.defaultPath` (`docs/REMEDIATION.md`; create `docs/` if missing). **Collision protocol**: a same-name file whose first line is not the marker → never clobber; ask the user what it is and use an alternate from `backlogFile.collisionAlternates`. The chosen path goes into the PROJECT.md pointer — the authoritative lookup for every future run and for `/vibe-check`.
- Line 1 is the marker: `<!-- managed-by: adopt-vibe remediation-backlog v1 -->`
- Header states: BLOCKING must reach FIXED before `/vibe-check` can return READY; the agent never waives BLOCKING (waiver = named InfoSec sign-off on the item + PROJECT.md Review Evidence entry); ADVISORY = legacy-only migration notes, fixed during normal work, **new or modified code must comply immediately**; statuses may be edited by humans, but IDs, waiver notes, and FIXED entries are never deleted. Then `Last audited: <date>`.
- Sections: `## Audit Coverage` (table: audit / plugin / last run / RUN | NOT AUDITED — plugin missing | N/A), `## Blocking`, `## Advisory`.
- Each finding: `### <ID> — <title>  [STATUS]` with fields: Source (audit + original severity), Tier rule matched, Location (`file:line`), Why blocking/advisory, Suggested fix / migration note, Status `OPEN | FIXED (date) | WAIVED (approver, reason, date)`. IDs use the source's `idPrefix` + zero-padded counter (`SEC-001`), assigned once, **never renumbered**.
- Normalize prose audit output into these fields — one finding per distinct issue, not per report paragraph.

### Reconcile semantics (backlog already exists)

1. Parse existing entries by ID; match fresh findings by source + tier rule + normalized location (file moved but same rule+symbol → same entry, update location).
2. OPEN entry no longer detected → `FIXED (<date>, verified by re-audit)` — never delete entries.
3. New finding → next ID in its prefix series.
4. FIXED and WAIVED entries are never removed and their notes never edited. A WAIVED finding reappearing at higher severity (or re-tiered to BLOCKING) → status back to OPEN, waiver note preserved inline as history, and flag it in the run report.
5. A human-edited FIXED that the audit still detects → revert to OPEN and say so.
6. Update only `Last audited` and the coverage table; never rewrite the header rules.

## Phase 4 — Repo homing (after audits, so the user decides informed)

- Origin in the approved org → `SKIPPED (already in org)`.
- No origin → run `ops-github` `create-github-repo` (`/init-github-repo`).
- Origin outside the org → run `ops-github` `migrate-repo` (`/migrate-github-repo`). If Phase 2 found hardcoded secrets, warn first: "secrets exist in this history and are already exposed wherever the repo lives today — moving to a private company repo is still an improvement, but rotation is mandatory regardless (see SEC item)". Ask migrate-now vs rotate-first; recommend migrate now.
- `ops-github` not installed → tell the user to create the private repo in the approved org manually and record a BLOCKING `GLG non-company-storage` finding so `/vibe-check` holds it.

## Phase 5 — Risk classification and owner interview (evidence-verified)

Run `golive-gate` `assess-risk-level` (`/assess-risk`). Code exists, so this is a **full, evidence-verified classification — never Provisional**. "Evidence-verified" means every owner answer is cross-checked against the code (CONFIRMED / CONTRADICTED / UNVERIFIABLE with file paths) — it does **not** mean skipping the interview. **Run the interview**: assess-risk-level asks the owner its questions, and the owner-confirmed items (internet/public exposure, criticality, data sensitivity) must be **answered by the owner**, not inferred from code.

- Risk Level already filled and final → `SKIPPED`; offer a re-run only if the owner reports a material change (escalation triggers).
- Marked Provisional → re-run to finalize (the skill does this).
- golive-gate not installed → leave the `⚠️ classify before building` placeholder and say so.

**Confirm missing info (mandatory interview).** After classifying, ask the owner for any still-missing human-only dossier facts the tier needs — Access Status (public / internet-facing vs company-only), Login Method, support contact, Access Approval Process, and Review Evidence. Ask as one compact batch and **keep asking until each is answered or the owner explicitly defers it** — do not silently leave fields pending. Record confirmed answers in the matching PROJECT.md sections; for an explicit deferral, leave the `⚠️` placeholder and note `/vibe-check` will hold it. Recorded approvals / sign-offs cannot be supplied here — they need the real review record.

## Phase 6 — Report (fixed format)

```
== /adopt-vibe report — <project> ==
Scaffold      DONE (wrote ...) | SKIPPED (already scaffolded)
Label         <label> | PENDING (owner to choose — /vibe-check will hold it)
Repo          MIGRATED <old> → <org>/<name> (backup-origin kept) | CREATED | SKIPPED | ACTION NEEDED
Audits        <n>/5 run (missing: ...)
Backlog       <path> — <n> BLOCKING open, <m> ADVISORY open (<k> fixed since last run)
Risk Level    <tier> (evidence-verified, <date>) | UNCHANGED
Dossier       <n> fields confirmed via interview, <m> deferred (⚠️ /vibe-check will hold)

BLOCKING (must be FIXED before /vibe-check can pass):
  <ID> <title> <location> — <fix>
ADVISORY: documented in the backlog with migration notes. They do not block go-live —
but NEW OR MODIFIED code must comply immediately; the always-on guardian rules enforce
this. Legacy status is not a license for new violations.

Next: fix BLOCKING items → run /vibe-check. Re-run /adopt-vibe anytime to re-audit
and reconcile the backlog.
```
