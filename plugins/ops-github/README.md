# OPS GitHub

GitHub repository lifecycle for OPS projects — create private repos, manage SemVer versions, and push after every commit.

## Requirements

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated:

```bash
gh auth login
```

## Features

| Feature | Behavior |
|---------|----------|
| New project | Create private GitHub repo + set `origin` |
| **Existing repo migration** | Re-home an origin outside the approved org into a new private org repo — all branches/tags pushed, old remote kept as `backup-origin`, old repo never deleted |
| Repo name | Ask user; reject if name already exists |
| Description | User-provided or auto-generated from project |
| Owner | User picks individual account or organization |
| Visibility | **Private** by default |
| **Default teams** (org repos) | After create: `ACME OPS - READ-ONLY` (read) + `ACME OPS - VIBECODERS` (write) |
| **Versions** | **SemVer bump before every push** (Conventional Commits) |
| Commits | Push to GitHub after every commit |

## Version management

Uses [Semantic Versioning](https://semver.org/) + [Conventional Commits](https://www.conventionalcommits.org/):

| Commit | Bump |
|--------|------|
| `feat!:` or `BREAKING CHANGE` | MAJOR |
| `feat:` | MINOR |
| `fix:`, `perf:`, `refactor:` | PATCH |

Bumps per app/package based on changed paths:

- `apps/frontend/package.json`
- `apps/backend/package.json`
- `packages/*/package.json`
- `plugins/*/plugin.manifest.json` (+ platform manifests synced)

## Scripts

```bash
# Preview version bumps
node plugins/ops-github/scripts/bump-versions.js --dry-run

# Bump + commit versions
node plugins/ops-github/scripts/bump-versions.js --auto-commit

# Bump versions then push (default workflow)
node plugins/ops-github/scripts/push-github.js

# Push without version bump
node plugins/ops-github/scripts/push-github.js --skip-bump

# List owners, check name, create repo (unchanged)
node plugins/ops-github/scripts/list-owners.js
node plugins/ops-github/scripts/check-repo-name.js acme-org-ops my-app
node plugins/ops-github/scripts/create-repo.js --owner acme-org-ops --name my-app
```

## Install

```text
/add-plugin ops-github
/plugin install ops-github@smart-aiagent-plugins
```

## Commands

```text
/init-github-repo      # greenfield: create private org repo
/migrate-github-repo   # brownfield: re-home an existing repo into the approved org
/push-github
/bump-versions
```

## Policy

See `data/github-policy.json` and `data/versioning-policy.json`.

## The two-repository model

An app onboarded to the deployment platform has **two** repositories:

| Repo | Holds | Created by |
|---|---|---|
| The application repo | Source code, `Dockerfile`, `vibe-release.json` | Us — `/init-github-repo` |
| `deployment-<app>` (in `acme-org-ops`) | GitOps manifests at `apps/<app>/<env>/`, which Argo CD always syncs from | **The deployment platform, at onboarding** |

This plugin only ever touches the first one. It never creates `deployment-*`, never pushes to it, and
never treats its absence as a problem — a project that has not been onboarded correctly has none. If it
does exist, Kubernetes manifest changes belong there, not in the application repo. Full contract:
`data/github-policy.json` `deploymentRepo`.
