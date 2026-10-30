---
name: owasp-code-review
description: Perform a structured OWASP secure coding review on changed files, a PR, or an entire existing project. Use when user runs /review-code or /audit-security, after implementation, or before merge.
---

# OWASP code review

Manual review skill. Use for **existing projects** via `/review-code` (diff scope) or `/audit-security` (full repo scope).

## Inputs

- Changed files, diff, or feature description
- Scope: backend, frontend, or fullstack

## Process

1. Read `data/owasp-checklist.json`
2. Map changed files to checklist sections (see table below)
3. For each section with touched code, evaluate **every** item — mark pass/fail
4. Report failures as **must-fix** with file:line and remediation
5. Full-repo scope (`/audit-security`) — also run the committer provenance check below

## Section → file mapping

| Section | Typical files |
|---------|----------------|
| Input validation | Elysia route schemas (TypeBox), plugins, forms (legacy: controllers, Express middleware) |
| Output encoding | Svelte components (`{@html}` uses), API serializers (legacy: React/Vue components) |
| Authentication | auth modules, login handlers |
| Session management | session/cookie config, auth middleware |
| Access control | guards, policies, service authorization |
| Cryptographic practices | auth utils, token generation |
| Error handling & logging | error middleware, logger config |
| Data protection | DTOs, caches, env handling |
| Communication security | TLS config, HTTP clients |
| System configuration | Docker, env, deployment configs |
| Database security | repositories, migrations, raw SQL |
| File management | upload handlers, storage services |
| Memory management | streams, buffers, native addons |
| General coding practices | exec calls, eval, third-party imports |
| API security | REST/GraphQL routes, API gateways, rate limiters |
| PAN and card data protection | payment handlers, card forms, messaging integrations |
| AI-assisted development safety | prompts, generated code, AI tool usage, git committer identities |
| Container and Pod hardening | `Dockerfile`, `.dockerignore` (always); `apps/<app>/<env>/*.yaml` **only** when a `deployment-<app>` checkout is in scope |

## Committer provenance (full-repo scope only)

When the review scope includes git history or repo-wide scans, classify every committer identity — do not judge trust from memory.

1. Load `data/trusted-automation.json`.
2. List identities: `git log --all --format='%an <%ae> | %cn <%ce>' | sort -u`.
3. For each registered identity, list its commits and touched paths: `git log --all --author=<email> --name-only --format='%H %s'`.
4. Classify per the registry's `scopeRule` and `classification`:

| Committer | Rule | Outcome |
|-----------|------|---------|
| Human | No automation indicators | Not a provenance finding |
| Registered automation, in scope | Emails match a registry entry; every touched file matches `authorizedPaths`; none matches `neverAuthorized`; change matches an `authorizedActivity` entry | Expected automation — informational note in Summary, **not a finding** |
| Registered, in scope, anomalous churn | As above, but repeated add/remove cycles of the same change | **should-fix** (hygiene) |
| Registered automation, out of scope | Any touched file outside `authorizedPaths` or matching `neverAuthorized`, or activity mismatch | **must-fix** — possible misconfiguration or identity misuse; quote commits and paths |
| Unregistered automation | Non-human indicators (bot/ai/ci naming, machine messages, direct-push pattern) and no registry entry | **must-fix** |

Deployment commits are environment-conditional: staging config changes are routine (staging auto-syncs); production config changes should correlate with an approved promotion. Do **not** spot-check `vibe-release.json` for a READY status as the authorization — the deployment platform does not read that field, and a commit can be a legitimate production promotion with our governance record saying anything at all. The platform's actual authorization is its own production gate (quality gate, security scans, RBAC, an approved human approval task) plus the GitOps commit trail in `deployment-<app>`. Ambiguous environment → apply the production condition. On the platform's two-repo model, manifest commits belong in `deployment-<app>`, so the same change appearing in an application repo is worth questioning.

The registry scopes **identity** findings only. Git identity is spoofable (attestation-grade evidence), so registry membership never exempts commit **content** — code committed by registered automation is evaluated against the checklist like any other code.

## Report format

```markdown
## OWASP review — <scope>

### Summary
- Sections reviewed: N
- Must-fix: N | Should-fix: N | Pass: N

### Must-fix
1. [Section] file:line — issue — fix

### Checklist coverage
| Section | Status |
|---------|--------|
| Input validation | PASS/FAIL |
...
```

Reference: [OWASP checklist](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist)
