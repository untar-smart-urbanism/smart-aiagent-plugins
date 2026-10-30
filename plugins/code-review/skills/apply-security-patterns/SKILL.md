---
name: apply-security-patterns
description: Apply proven, GRC-informed security architecture patterns when building or reviewing features that handle sensitive data, identity, authentication, secrets, or bulk data access. Use in addition to apply-secure-coding — that skill covers line-level OWASP coding; this one covers the design-level patterns (encryption at rest, PII exposure, session/token lifecycle, CSRF, secrets, audit logging, rate limiting). Read references/security-patterns.md rather than relying on memory.
---

# Apply security patterns

`apply-secure-coding` handles **line-level** OWASP coding (validate input, encode output, parameterize queries). This skill handles the **design-level** decisions that a per-line checklist misses — the patterns that recur every time a feature touches sensitive data, identity, secrets, or bulk access, and that a governance/risk/compliance (GRC) review will ask about.

Use the two together: `apply-secure-coding` while writing every line, this skill when the **shape** of the feature involves protected data.

## Source of truth

- Patterns playbook: `references/security-patterns.md` — 9 patterns, each with problem → pattern → requirements → residual risk → how to verify.
- Verifiable checklist items: the **security-pattern sections** of `data/owasp-checklist.json`
  (*Envelope encryption at rest* through *Container and Pod hardening*) — the same 9 patterns as
  pass/fail items, alongside the OWASP core and the org's API/PAN/AI sections.

These are **stack-agnostic** (Bun + Elysia backend, Svelte frontend, PostgreSQL via Drizzle; legacy projects map them onto their existing stack). They describe the pattern, not one vendor — pick the concrete KMS/secrets-manager/ORM/rate-limiter your project already uses.

## When to use (do not wait for the user to ask)

Activate — **in addition** to `apply-secure-coding` — when the task involves **any** of:

1. Storing or reading sensitive fields at rest — identity numbers, financial/salary figures, health, contact details, free-text HR/case notes.
2. Looking up, deduplicating, or checking existence of a sensitive value.
3. List / detail / export / report endpoints that carry personal or financial data.
4. Authentication, sessions, tokens, logout, password/credential change, or secret handling.
5. Any endpoint that could be scripted for enumeration or bulk pull.
6. Adding a secret, connection string, or key of any kind.
7. Authoring or changing a **`Dockerfile`**, or reviewing a container/Kubernetes finding from the
   platform's Trivy scan.

If none of these apply (e.g. a purely presentational UI change), this skill is not needed — `apply-secure-coding` alone covers it.

## Workflow

1. **Classify the data** the feature touches using the company levels — Confidential (credentials and secrets, PII, payroll, personal financial data, UU PDP specific personal data), Restricted (customer transaction history, complaints, feedback, access-rights lists), Internal, Public (golive-gate `risk-criteria.json` `dataClassification`). Confidential: encrypt at rest and in transit, and redact before external sharing; Restricted: encrypt, mask, or hash. The classification drives which patterns apply.
2. **Read `references/security-patterns.md`** and pick the applicable patterns:

   | If the feature… | Apply pattern |
   |---|---|
   | stores a sensitive field | 1 — Envelope encryption at rest |
   | must look up / dedupe an encrypted value | 2 — Blind index |
   | reads/lists/exports personal or financial data | 3 — Minimize sensitive-data exposure |
   | issues or checks sessions/tokens | 4 — Session/token lifecycle & revocation |
   | authenticates via a cookie | 5 — CSRF defense-in-depth |
   | introduces a secret/key/credential | 6 — Secrets management |
   | touches auth, exports, or bulk mutations | 7 — Security audit logging |
   | exposes an abusable/enumerable surface | 8 — Abuse-resistant rate limiting |
   | ships a `Dockerfile`, or has a Trivy image/config finding | 9 — Container and Pod hardening |

3. **Apply each pattern's Requirements while building** — not as an afterthought.
4. **Before finishing**, run the applicable security-pattern sections of `data/owasp-checklist.json` (alongside the OWASP core sections) and confirm each item passes or is a documented, accepted residual.
5. **Disclose residual risk** rather than hiding it: if a control has a known limitation (e.g. length leak on free-text ciphertext, offline brute-force of a blind index over a low-entropy identifier), write it down with its mitigation. GRC accepts documented residuals; it does not accept silent ones.

## Non-negotiables

- Sensitive data at rest is encrypted with a **KEK→DEK envelope**, never a single flat app-held key.
- The **server** is the boundary — client-side masking, guards, and validation are UX only.
- Secrets never live in source, committed config, logs, or error responses.
- Every sensitive export, bulk mutation, and auth event is **audit-logged** (who / what / when) with no sensitive payload in the log.
- A control's **residual risk is documented**, never silently accepted.
- A container image ends with an explicit **non-root `USER`** and never a floating base tag; the
  platform's Pod manifests are **reviewed and remediated, never authored by us**, and their absence
  before onboarding is not a finding.

## Escalation

If a pattern cannot be fully met (e.g. a field used in a DB-side aggregation can't take random-IV encryption), state the trade-off, propose the compensating control, and document the residual — do not silently drop the pattern.
