---
name: migrate-github-repo
description: Migrate this repository from a personal or non-approved origin into a new private repo under the approved company org, preserving branches and tags.
---

# Migrate GitHub repository

Run the `migrate-repo` skill from the `ops-github` plugin.

## Steps

1. Check `gh auth status` and `git remote get-url origin`; read `defaultOrg` from `plugins/ops-github/data/github-policy.json`. Already in the org → report and stop. No origin → route to `/init-github-repo` instead.
2. **Confirm with the user**: current origin, target org, "old remote kept as `backup-origin`, old repo never deleted or modified".
3. Snapshot remotes/branches/tags → validate name via `check-repo-name.js` → `git remote rename origin backup-origin` → `create-repo.js` (private + default org teams; on failure, roll the rename back and stop) → `git push origin --all` + `--tags` (never --force/--mirror).
4. Verify branch/tag counts via `git ls-remote` match the snapshot.

## Report

- New org repo URL, branches/tags pushed, `backup-origin` retained
- Aftercare: user archives the old repo themselves; the `backup-origin` remote is removed only on explicit request
