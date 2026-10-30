---
name: release-review
description: Run the risk-tiered review-before-release checklist and record evidence in PROJECT.md Review Evidence.
---

# Release review

Run the `review-before-release` skill from the `golive-gate` plugin.

**Independence rule up front:** for Medium and High risk, the reviewer must not be the builder — concretely, neither the **Project Owner** nor the **Support Contact** recorded for the project. Having committed to this repo does not disqualify a reviewer. Ask who is reviewing and record their name — the agent gathers evidence; it never self-certifies.

## Steps

1. Read the tier from PROJECT.md `## Risk Level` (empty → run `/assess-risk` first).
2. Load `plugins/golive-gate/data/review-checklist.json`; select items for the tier.
3. Verify agent-checkable items: scan for `never-log.json` items and secrets in source/sample data/logs; check `git remote -v` is `github.com/acme-org-ops`; confirm a previous working version is saved; confirm Project Owner (a GitHub username) and Support Contact (an email) are filled and correctly formatted.
4. Mark each item PASS / FAIL / NEEDS-HUMAN with one-line evidence.
5. Append a dated results table to PROJECT.md `## Review Evidence`.

## Report

- PASS or FAIL verdict
- Blocking items with what fixes each
- Human items still awaiting the named reviewer
