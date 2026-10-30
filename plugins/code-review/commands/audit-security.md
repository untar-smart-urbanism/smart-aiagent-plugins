---
name: audit-security
description: Full OWASP secure coding audit of an existing project — scan entire codebase, not only changed files.
---

# Audit security (existing projects)

Full **manual** OWASP audit of this project using the `code-review` plugin. Use when onboarding a legacy repo or before a major release.

## Steps

1. Read skill `owasp-code-review`.
2. Load `data/owasp-checklist.json`.
3. Determine scope: `backend`, `frontend`, or `fullstack`.
4. Scan **entire** codebase under `apps/` (and `packages/` if shared security-sensitive code):
   - `apps/backend/src/` — APIs, auth, DB, middleware, config
   - `apps/frontend/src/` — components, services, store
   - `infrastructure/` — TLS, secrets, deployment config
5. Committer provenance: load `data/trusted-automation.json`; classify every identity in
   `git log --all` as human, registered automation, or unregistered automation (see
   `owasp-code-review` skill). Registered automation within its authorized activity and paths
   → informational note, not a finding. Unregistered automation, or registered automation out
   of scope, → must-fix. Never skip content checks based on committer identity.
6. Map all security-relevant files to the 17 OWASP sections.
7. Evaluate each applicable checklist item — pass or fail.
8. Prioritize findings: **must-fix** (exploitable) → **should-fix** → **pass**.
9. Cross-check `package.json` dependencies with `scan-dependency` plugin if available.

## Report format

```markdown
## OWASP security audit — <project>

### Summary
- Scope: backend | frontend | fullstack
- Files reviewed: N
- Must-fix: N | Should-fix: N | Pass: N
- Committer provenance: N human / N registered automation / N unregistered

### Must-fix (exploitable or high risk)
1. [Section] file:line — issue — remediation

### Should-fix
- ...

### Provenance notes (informational — not findings)
- <identity> — expected automation within authorized scope (`data/trusted-automation.json`)

### Section coverage
| Section | Status | Notes |
|---------|--------|-------|

### Recommended next steps
- Run `/review-code` on active PRs for ongoing checks
- Apply `apply-secure-coding` on all new code going forward
```

## Fix policy

**Read-only by default** — report findings first. Fix issues only if the user confirms remediation (or said "fix security issues").

Do not approve production deployment with open must-fix items.
