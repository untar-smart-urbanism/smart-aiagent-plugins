---
name: review-before-release
description: Run the pre-release review checklist from data/review-checklist.json against the current project and record evidence in PROJECT.md Review Evidence. Use when a tool is about to be shared, merged, pushed, or released to others; when the user asks "is this ready to share" or "review before release"; or via /release-review. For Medium and High risk the reviewer must not be the builder — concretely, neither the Project Owner nor the Support Contact recorded for the project; capture the reviewer's name; never self-certify.
---

# Review before release

Runs the playbook's Section 5 checklist, risk-tiered. Read `data/review-checklist.json` and `data/never-log.json` (relative to the installed `golive-gate` plugin).

## When to use

1. A tool is about to be used by anyone other than the builder
2. Before merge, push to main, or release
3. The user asks "is this ready", "review this before I share it", or runs `/release-review`
4. `check-golive-readiness` found no review evidence for a Medium/High tool

## Steps

1. **Read the risk tier** from PROJECT.md `## Risk Level`. If empty, run `assess-risk-level` first. If it is marked **Provisional (intent-based)** — the tool was classified before code existed — re-run `assess-risk-level` now: code exists at review time, so every answer must be verified against it and the classification finalized (evidence may raise the tier) before the checklist runs.
2. **Load** `data/review-checklist.json`; select items whose `appliesTo` includes the tier.
3. **Independence rule** (Medium and High): ask who is performing the review and record their name. The reviewer must not be the builder — operationally, they must be neither the **Project Owner** nor the **Support Contact** recorded for the project (`review-proof.json` `independence`; the machine check runs in `seal-review-proof`). Having committed to this repo does **not** disqualify a reviewer. You (the agent) gather evidence and pre-check items — a human signs off. Never self-certify.
4. **Verify agent-checkable items** (`verify: agent` or `human+agent`) against the repository, marking each **PASS / FAIL / NEEDS-HUMAN** with one line of evidence:
   - `no-sensitive-in-ai` / `no-secrets`: grep source, sample data, docs, and log statements for `never-log.json` `scanHints`; flag real values, not variable names alone.
   - `approved-storage`: `git remote -v` must point to `github.com/acme-org-ops`.
   - `rollback-possible`: a previous working version exists as a git tag, release, or saved branch.
   - `support-defined`: PROJECT.md `## Project Owner` and `## Support Contact` are filled **and** in the required formats — a GitHub username and an email respectively (`golive-gate.json` item `ownership-support-contacts`, `fields`). Report a format violation as a FAIL with what fixes it; `/vibe-check` owns the ask-and-rewrite.
5. **Record evidence**: append a dated results table to PROJECT.md `## Review Evidence` — reviewer name, tier, item results, outstanding items. Append only; never delete or rewrite earlier entries.

## Output

- **PASS** — all applicable items pass (human items confirmed by the named reviewer), or
- **FAIL** — list each blocking item with its evidence and what fixes it.

Remind the user: for High risk, formal Architecture/Tech R&D, SRE, and Information Security reviews are still required before go-live (`check-golive-readiness` verifies they are recorded).
