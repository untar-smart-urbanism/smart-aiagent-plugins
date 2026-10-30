---
name: migrate-repo
description: Migrate an existing repository whose origin lives outside the approved company org (e.g. personal GitHub) into a new private repo under the approved org, preserving all branches and tags and keeping the old remote as backup-origin. Use when onboarding a pre-existing project (/adopt-vibe), when git remote origin points outside the approved org, or when the user asks to move a repo to the company org. Never deletes or modifies the old repository.
---

# Migrate repository to the approved org

Requires **GitHub CLI** (`gh`) authenticated: `gh auth status`

Policy: `data/github-policy.json` (`defaultOrg`, `repoNamePattern`)

## When to use

- `git remote get-url origin` succeeds but the URL is **not** under `github.com/<defaultOrg>/`
- Onboarding an existing project via project-scaffold's `/adopt-vibe`
- The user asks to move a personal repo into the company org

Not a migration case: no origin at all → for uncommitted code run project-scaffold's `new-repo-init` (git init), then `create-github-repo`.

## Workflow

### 1. Preconditions

- `gh auth status` succeeds.
- `git remote get-url origin` succeeds. Read `defaultOrg` from `data/github-policy.json`.
- Origin already under `github.com/<defaultOrg>/` → report "already homed in the approved org" and stop.

### 2. Confirm with the user (mandatory — even when invoked from /adopt-vibe)

Show verbatim before doing anything:

- Current origin URL and the target org
- What will happen: new **private** repo created in the org, all local branches and tags pushed, `origin` re-pointed
- What will NOT happen: the old remote is kept as `backup-origin`; the old GitHub repo is **never deleted or modified**

No confirmation → stop.

### 3. Snapshot state

- `git remote -v`, current branch, `git status --porcelain` (uncommitted changes are warned about — they won't be pushed — but do not block)
- Local branch count and tag count (`git branch | wc -l`, `git tag | wc -l`) for post-push verification
- If `git branch -r` shows old-origin branches with no local counterpart, offer `git fetch backup-origin '+refs/heads/*:refs/remotes/backup-origin/*'` after the rename and creating local branches, so remote-only branches are not left behind.

### 4. Repository name

Default to the current directory/repo name, validated against the policy `repoNamePattern` (lowercase kebab-case). Check availability:

```bash
node plugins/ops-github/scripts/check-repo-name.js <defaultOrg> <repo-name>
```

**REJECTED** (name taken) → ask for a different name. Never proceed with a taken name.

### 5. Rename the old remote first

```bash
git remote rename origin backup-origin
```

(`create-repo.js` claims the `origin` name, so the rename must happen before creation.)

### 6. Create the org repo

```bash
node plugins/ops-github/scripts/create-repo.js --owner <defaultOrg> --name <repo-name> --description "<description>"
```

Private visibility, sets fresh `origin`. Also grants default org teams from `data/github-policy.json` (`ACME OPS - READ-ONLY` = read, `ACME OPS - VIBECODERS` = write). **Rollback rule:** if creation fails for any reason, immediately `git remote rename backup-origin origin` to restore the original state, report the failure, and stop.

### 7. Push everything

```bash
git push origin --all
git push origin --tags
```

Never `--force`. Never `--mirror` (mirror prunes and would propagate deletions).

### 8. Verify

Compare branch and tag counts on the new remote against the snapshot:

```bash
git ls-remote --heads origin | wc -l
git ls-remote --tags origin | wc -l
```

Mismatch → report exactly which branches/tags are missing; do **not** declare success.

### 9. Report + aftercare

- New repo URL; note that `backup-origin` is retained.
- Tell the user: "After you verify the org repo, archive (do not delete) the old personal repo yourself. Ask me to remove the `backup-origin` remote when you're ready." The skill never removes the old remote or repo without an explicit later request.
- If the project has a remediation backlog with a hardcoded-secret finding, remind: secrets in history are already exposed wherever the repo lives today — rotation is mandatory regardless of this move.

## Guardrails

- Never delete or modify the old remote repository
- Never force-push; never use `--mirror`
- Never migrate to a public repo
- Confirmation is required even when invoked from an orchestrator command
