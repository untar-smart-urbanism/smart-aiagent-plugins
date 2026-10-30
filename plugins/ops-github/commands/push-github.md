---
name: push-github
description: Bump app versions (SemVer) then push the current branch to GitHub origin.
---

# Push to GitHub

Bump versions and push this project to GitHub.

## Steps

1. Verify `git remote get-url origin` exists
2. Run `node plugins/ops-github/scripts/push-github.js`
   - Auto-runs `bump-versions.js` (SemVer from Conventional Commits)
   - Creates `chore(release): bump ...` commit if versions changed
   - Pushes to `origin`
3. Report branch name, remote URL, and any version bumps applied

If no remote, run `/init-github-repo` first.

Use `--skip-bump` only when user opts out of version management. For version audit without push, use `/bump-versions`.
