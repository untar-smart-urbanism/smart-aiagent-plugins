---
name: init-github-repo
description: Initialize a new private GitHub repository for this project — ask name, owner, description, create repo, and set origin.
---

# Initialize GitHub repository

Set up GitHub for this project using the `ops-github` plugin.

## Steps

1. Verify this is a **new project** (no `origin` remote). If remote exists, stop and offer push-only workflow.
2. Ask user for **repository name** (kebab-case).
3. Run `node plugins/ops-github/scripts/list-owners.js` — ask user to pick owner (user or org).
4. Run `node plugins/ops-github/scripts/check-repo-name.js <owner> <name>`.
   - If taken → tell user and ask for a different name.
5. Description: use user input if provided; else `node plugins/ops-github/scripts/generate-description.js`.
6. Create private repo:

```bash
node plugins/ops-github/scripts/create-repo.js --owner <owner> --name <name> --description "<desc>"
```

   For **org** owners this also grants default teams (read: `ACME OPS - READ-ONLY`, write: `ACME OPS - VIBECODERS`).

7. Summarize: repo URL, visibility (private), teams granted, and next steps for commit + push.
