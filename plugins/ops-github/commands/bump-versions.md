---
name: bump-versions
description: Check or bump app/package versions using SemVer and Conventional Commits — manual run for existing projects without pushing.
---

# Bump versions (manual)

Audit and update versions in this project using the `ops-github` plugin SemVer policy.

## Steps

1. Read skill `manage-versions` and `data/versioning-policy.json`.
2. Preview changes:
   ```bash
   node plugins/ops-github/scripts/bump-versions.js --dry-run
   ```
3. Report which apps/packages would be bumped and why (commit types + changed paths).
4. If user confirms (or said "bump versions"):
   ```bash
   node plugins/ops-github/scripts/bump-versions.js --auto-commit
   ```
5. For plugin marketplace repos, run `npm run sync-marketplace` after plugin manifest bumps if needed.

## Options

| Flag | Purpose |
|------|---------|
| `--dry-run` | Report only — no file changes |
| `--auto-commit` | Write versions + create `chore(release): bump ...` commit |
| `--since <ref>` | Analyze commits since tag/branch (default: upstream or last tag) |

## Without push

This command does **not** push to GitHub. Use `/push-github` after bumping if sync is needed.
