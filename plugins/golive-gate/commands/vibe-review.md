---
name: vibe-review
description: Perform a reviewer-driven review and seal a commit-bound docs/REVIEW-PROOF.md, then append a summary to PROJECT.md Review Evidence. Run this as the reviewer, in your own checkout.
---

# Vibe review (reviewer-sealed proof)

Run the `seal-review-proof` skill from the `golive-gate` plugin. The **reviewer** runs this in their own checkout — their git identity is the anchor and they author the sealing commit.

**Independence up front:** for Medium and High risk the reviewer must **not** be the **project owner** or the **support contact** stated for the project (from `vibe-release.json`, else PROJECT.md `## Project Owner` / `## Support Contact`). Anyone else may review — **including someone who has committed to this repo**: prior authorship does not disqualify a reviewer. If you are the owner or the support contact, the skill refuses to seal. For Low risk, self-review is allowed (and `/vibe-check` runs this automatically).

## Steps

1. Read the tier from PROJECT.md `## Risk Level` (empty → run `/assess-risk` first; Provisional → re-run `/assess-risk` to finalize against the code).
2. Confirm the working tree is clean — the proof binds to a commit; refuse a dirty tree.
3. Establish reviewer identity from `git config user.name` / `user.email`. For Medium/High, verify the reviewer is neither the project owner nor the support contact — resolved from `vibe-release.json` when it exists, else PROJECT.md. Both empty → INCOMPLETE, never a default pass. Never ask the reviewer for those values.
4. Load `plugins/golive-gate/data/review-checklist.json`; select items for the tier. Auto-verify agent-checkable items (never-log/secrets scan, `git remote` = github.com/acme-org-ops, rollback point, owner/support). Ask the reviewer the human-judgment items one at a time.
5. Write `docs/REVIEW-PROOF.md` (per `plugins/golive-gate/data/review-proof.json`), append a dated summary to PROJECT.md `## Review Evidence`, and seal by committing as the reviewer's identity (do not push).
6. Chain `check-golive-readiness` against the sealed commit to regenerate `vibe-release.json` — the sealed review now populates `review-verdict` / `review-proof` / `reviewed-at`, with a consistent `release-gate-status` and `target-commit-hash`, so no separate `/vibe-check` re-run is needed. `/vibe-review` then commits `vibe-release.json` as a **second** reviewer commit (on top of the seal), so the handoff always ends fully committed. Push both commits (e.g. `/push-github`) so the sealed review and the app's cost labels / owner reach the repo.

## Report

- **PASS** — proof sealed for the reviewed commit (commit 1); `vibe-release.json` regenerated (`review-verdict: PASS`, `release-gate-status`, `target-commit-hash`) and committed (commit 2); reviewer-approved. Push both commits.
- **FAIL / INCOMPLETE** — blocking items listed with what fixes each; `vibe-release.json` regenerated as NOT-READY and committed; not approved.
- **Refused** — Medium/High and the reviewer is the project owner or the support contact; nothing sealed, no commits, `vibe-release.json` untouched; someone else must run this.
