---
name: apply-secure-coding
description: Apply OWASP Secure Coding Practices while writing code. Use eagerly on every implementation task and user prompt involving code — before and during coding, not only at review time. Read data/owasp-checklist.json rather than relying on memory.
---

# Apply secure coding

**Source of truth** for secure coding during implementation. Agents must apply this skill on every coding task automatically.

## Source

- Full checklist: `data/owasp-checklist.json` (312 items, 25 sections)
- Origin: [OWASP SCP Checklist](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist)

## When to use (do not wait for the user to ask)

Activate when **any** of the following is true:

1. User asks to build, create, fix, or modify any application code
2. You are writing API endpoints (Elysia), Svelte components, auth, DB queries, or config
3. User did **not** mention security — **still apply** OWASP by default
4. Before committing or declaring a task done
5. After fixing a bug — verify the fix does not introduce new vulnerabilities

Use eagerly rather than treating security as optional.

## Workflow

1. Identify what you're changing: API, UI, auth, DB, config, files.
2. Load relevant sections from `owasp-checklist.json`:
   - API/backend → input validation, access control, database security, error handling, api security
   - Svelte UI → output encoding, data protection, communication security
   - Auth flows → authentication, session management, cryptography
   - Payment/card flows → PAN and card data protection
   - AI-assisted coding → AI-assisted development safety
3. For each applicable checklist item, confirm the code satisfies it or fix the gap.
4. Pay special attention to:
   - User input → validation + parameterized queries
   - User output → encoding/sanitization
   - Secrets → never in client or logs
   - Authorization → server-side on every route

## Stack-specific shortcuts (Bun + Elysia + Drizzle + Svelte + PostgreSQL)

| Risk | Required practice |
|------|-------------------|
| SQL injection | Drizzle query builder or sql`` template with bound values only; never string concatenation |
| XSS | Svelte default escaping; no `{@html}` with untrusted data, sanitize HTML if needed |
| Auth bypass | Elysia plugin/guard (derive + onBeforeHandle) + per-route checks; TypeBox validation on every route |
| IDOR | Verify resource ownership in service layer |
| Secret leak | env vars, no `console.log` of tokens |
| Weak crypto | `Bun.password` (argon2id/bcrypt), `crypto.getRandomValues` for tokens |

Legacy projects (Vibe Start before 2026-10-07) keep their existing stack: React default escaping / avoid `dangerouslySetInnerHTML`, Prisma/pg parameterized queries, Express middleware + per-route checks. Apply the same controls; do not require conversion.

## Output (when asked to review)

List sections checked, any fixes applied, and remaining risks.
