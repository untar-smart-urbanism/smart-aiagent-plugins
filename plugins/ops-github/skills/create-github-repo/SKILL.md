---
name: create-github-repo
description: Create a new private GitHub repository for a greenfield project. Ask repo name and owner, verify name is available, set description, and configure origin. Use when starting a new project without an existing GitHub remote.
---

# Create GitHub repository

Requires **GitHub CLI** (`gh`) authenticated: `gh auth login`

Policy: `data/github-policy.json`

## When to use

- New project with no `origin` remote
- User asks to publish or initialize on GitHub

## Workflow

### 1. Confirm new project

If `git remote get-url origin` succeeds → **do not** create a new repo:

- Origin already under `github.com/<defaultOrg>/` (see `data/github-policy.json`) → use `push-to-github` instead.
- Origin outside the approved org (e.g. personal GitHub) → use the `migrate-repo` skill (`/migrate-github-repo`) instead.

### 2. Ask repository name

- Format: lowercase kebab-case (`my-service-api`)
- Check availability:

```bash
node plugins/ops-github/scripts/check-repo-name.js <owner> <repo-name>
```

If **REJECTED** (repo exists) → tell the user the name is taken and ask for a **different name**. Do not proceed until available.

### 3. Ask owner (individual or organization)

List options the user can access:

```bash
node plugins/ops-github/scripts/list-owners.js
```

Present `[user]` and `[org]` entries. Ask which owner to use.

### 4. Description

- If user provided a description → use it
- If not → generate:

```bash
node plugins/ops-github/scripts/generate-description.js
```

### 5. Create private repository

```bash
node plugins/ops-github/scripts/create-repo.js \
  --owner <login> \
  --name <repo-name> \
  --description "<description>"
```

Defaults: **private** visibility, `origin` remote set.

When the owner is an **organization**, `create-repo.js` also grants teams from `data/github-policy.json` → `defaultTeams`:

| Team | Access |
|------|--------|
| `ACME OPS - READ-ONLY` | read (`pull`) |
| `ACME OPS - VIBECODERS` | write (`push`) |

Personal-user owners skip team grants (org teams only). Use `--skip-teams` only if the user explicitly opts out.

### 6. Initial push

After first commit:

```bash
git add -A
git commit -m "Initial commit"
node plugins/ops-github/scripts/push-github.js
```

## Guardrails

- Never create public repos unless user explicitly overrides policy
- Never force-push to `main`/`master`
- Do not commit secrets (.env, credentials)
- **Never create a `deployment-*` repository.** `deployment-<app>` is the deployment platform's GitOps repo,
  created by the platform at onboarding under `acme-org-ops` (`data/github-policy.json` `deploymentRepo`). It is SRE/platform-only: `gh` returns 404 to us, which is not proof it is absent — never infer onboarding state from it; confirm with the platform team or SRE. If a
  user asks for one, explain that onboarding the app to the platform creates it — and that
  pre-creating it causes drift — then stop.
