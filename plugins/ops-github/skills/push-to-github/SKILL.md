---
name: push-to-github
description: Bump versions (SemVer) and push commits to GitHub after every commit. Use after git commit or when user asks to sync/push code.
---

# Push to GitHub

## Policy

**Every commit must be pushed** to `origin` unless the user explicitly says not to push. **Versions are checked and bumped automatically** before push per `manage-versions` skill.

## Prerequisites

- `gh auth login` completed
- `git remote get-url origin` configured
- Commits use Conventional Commit format for correct SemVer bumps

## After every commit

```bash
node plugins/ops-github/scripts/push-github.js
```

This will:
1. Analyze unpushed commits and changed paths
2. Bump `apps/`, `packages/`, `plugins/` versions if needed (SemVer)
3. Auto-commit version changes (`chore(release): bump ...`)
4. Push to `origin`

Or manually:

```bash
git push -u origin HEAD
```

## If push fails

| Error | Action |
|-------|--------|
| No remote | Run `create-github-repo` workflow first |
| Auth failed | `gh auth login` |
| Rejected (non-fast-forward) | `git pull --rebase origin <branch>` then push — never force-push main |
| Repo not found | Verify owner/repo name with user |

## With new commits you create

Always sequence:

1. `git add` (relevant files only)
2. `git commit -m "feat: ..."` or `fix: ...` (Conventional Commits — only when user asked to commit)
3. `node plugins/ops-github/scripts/push-github.js` (bumps versions + pushes)

Do not leave commits only on local machine.

## Manual version check

```bash
node plugins/ops-github/scripts/bump-versions.js --dry-run
```

Or user command `/bump-versions`.

## The deployment repo is not ours to push to

An app onboarded to the deployment platform has a **second** repository — `deployment-<app>` under `acme-org-ops`, holding
GitOps manifests at `apps/<app>/<env>/`, which Argo CD always syncs from (`data/github-policy.json`
`deploymentRepo`). It is created by the platform at onboarding, not by us.

**Visibility — the deployment repo is accessible only to the SRE/platform team. `gh` returns 404 to us, and that means no access as often as absence — it is NOT evidence the repo is missing. Never infer onboarding state from it; confirm with the platform team or SRE.**

- **Never push to it from this skill.** Manifest changes go through the platform team, or a reviewed
  PR by whoever owns deployments. A push from here would race Argo CD's source of truth.
- **If it exists, Kubernetes manifest changes belong there** — not in the application repo. A manifest
  appearing in the app repo is worth questioning rather than pushing.
- **Its absence is not a problem.** A project that has not been onboarded correctly has none, and
  `create-github-repo` must never be pointed at a `deployment-*` name — if the user asks, explain that
  onboarding creates it and stop.
