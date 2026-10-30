---
name: project-documenter
description: >
  Generates comprehensive, production-grade documentation for any codebase — especially
  messy, vibe-coded, or undocumented projects. Use this skill whenever the user wants to
  document a project, generate a README, write up an architecture overview, create API
  docs, complete or update the PROJECT.md go-live review dossier, prepare go-live or
  review documentation, or produce any kind of technical documentation from source code.
  Trigger on phrases like "document my project", "write docs for this", "generate a
  README", "I need documentation", "explain this codebase", "document this repo",
  "fill in PROJECT.md", "prepare this for review/go-live", or any time the user points
  Claude at a folder and wants to understand or explain what's in it. When in doubt,
  use this skill — underdocumented code is everywhere and this skill handles it well.
---

# Project Documenter Skill

Generates deep, comprehensive documentation for any codebase by exploring files on disk.
Handles vibe-coded, legacy, and undocumented projects gracefully. Outputs a full `docs/`
folder with multiple targeted documents, plus the root `PROJECT.md` go-live review dossier
required before pushing to GitHub or releasing a tool to others.

---

## Phase 1: Explore the Project

Before writing a single word of documentation, build a thorough mental model of the project.

### 1.1 — Map the structure

```bash
find <project_root> -type f | grep -v node_modules | grep -v .git | grep -v __pycache__ | grep -v ".pyc" | sort
```

Then view the top-level directory:
```bash
ls -la <project_root>
```

### 1.2 — Read key files first (in this order)

1. `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` — dependencies, scripts, entry points
2. `.env.example` / `.env.sample` — environment variables needed
3. `docker-compose.yml` / `Dockerfile` — deployment/runtime config
4. Any existing `README.md` — even partial ones have useful context
5. `CONTEXT.md` (living project state) and `PROJECT.md` (go-live dossier), if present — CONTEXT.md gives you the project's own account of its structure, plan, and decisions; an existing PROJECT.md tells you which dossier fields are already confirmed. Read both as context. Never overwrite CONTEXT.md from this skill; it is agent-maintained live state.
6. Main entry point(s): `index.js`, `main.py`, `app.py`, `server.js`, `src/main.*`, etc.
7. Config files: `*.config.js`, `config/`, `settings.py`, etc.

### 1.3 — Deep code read

Read ALL source files systematically. For each file, extract:
- **Purpose**: what does this file/module do?
- **Exports / public API**: functions, classes, routes, components exposed
- **Dependencies**: what it imports and why
- **Side effects**: DB connections, file writes, API calls, global state mutations
- **Notable patterns**: auth, caching, error handling, background jobs

For large files (>300 lines), focus on:
- The top of the file (imports, constants, class/function signatures)
- Any routing definitions
- Public-facing functions and their signatures
- Bottom of file (exports, initialization)

### 1.4 — Infer the "vibe"

Vibe-coded projects often have:
- Inconsistent naming conventions → note them, don't judge
- Logic scattered across files with no clear separation → map it anyway
- No error handling → document what _does_ happen, note gaps
- Magic numbers and undocumented constants → explain what they appear to do
- Dead code → mention it exists, don't document it as active

### 1.5 — Determine the audience & access scope

Who is this project actually *for*? This drives the security posture, the README framing, and
data-handling expectations, so figure it out early. The audience falls into one of three buckets:

- **Internal only** — used by employees of the owning org
- **Internal + 3rd-party business partner** — internal staff plus named external partners (vendors, clients, agencies)
- **Open / public** — anyone can sign up or access it

This is partly inferable from the code, but the final classification usually needs the owner to
confirm — so gather *signals* and state your confidence rather than asserting. Look for:

- **Email-domain restrictions in auth logic** — e.g. a check that an email `endsWith("@company.com")`, an `ALLOWED_DOMAINS` / `allowedEmailDomains` config, or a hosted-domain (`hd`) parameter in Google OAuth. This is the strongest signal of "internal only" and directly answers whether users must be **registered under the internal email domain**.
- **SSO / IdP config** — Apps Gateway (the approved company SSO), Okta, Azure AD/Entra, Google Workspace, SAML. Internal SSO ⇒ internal audience; "log in with Google/GitHub" with no domain filter ⇒ likely public.
- **Open self-signup** — a public registration route with no allow-list ⇒ public or partner.
- **Partner/tenant constructs** — `partnerId`, `tenantId`, `organizationId`, B2B API keys, or per-partner config ⇒ internal + partner.
- **Public surface area** — a marketing landing page, `robots.txt` allowing crawl, public docs, an unauthenticated API ⇒ public.

Record three things for the docs: (1) which bucket the evidence points to, (2) **whether users must be
registered under the internal email domain** (yes / no / partner-scoped / unknown), and (3) **the file
path(s) behind each signal** (e.g. `src/auth/google.ts` hosted-domain check, `config/allowed-domains.json`)
— a claim without a file path is an assertion, not evidence. If the code doesn't settle it, mark it as
needing owner confirmation rather than guessing.

While here, also note the **login method** against the two approved options: Apps Gateway (company SSO,
the default) or Company Google OAuth login (external users without a company account, or fallback while
Apps Gateway is not yet configured). If the code authenticates any other way, flag it in SECURITY.md and
in the PROJECT.md dossier as a compliance gap.

### 1.6 — Inventory third-party tools and where they're used

As you read the code (1.3), keep a running list of every external tool, service, SDK, or API the
project depends on, and — critically — *which modules or features actually use each one*. Sources:

- Dependency manifests (`package.json`, `requirements.txt`, etc.) for SDKs/clients
- Import statements and client initialisation (`new Stripe(...)`, `createClient(...)`, `OpenAI(...)`)
- Env vars that name a service (`STRIPE_SECRET_KEY`, `SENDGRID_API_KEY`, `OPENAI_API_KEY`)
- Outbound HTTP calls to known vendor hostnames

For each tool, note the **call sites** — the specific files, modules, or features that invoke it (e.g.
"Stripe → billing module checkout + webhook handler"). This utilization mapping *is* inferable from code
and is the valuable, verifiable part of the dependency inventory.

What is **not** inferable from code: the **subscription tier/plan** the org actually pays for and the
**cost**. You cannot read a billing plan out of source. Capture these as owner-input fields (see 2.6) —
never invent a price or assume a tier.

### 1.7 — Gather governance inputs for the PROJECT.md dossier

The root `PROJECT.md` (see 2.9) mixes fields inferable from code with fields only the owner can supply.
Before Phase 2, check what you already have (an existing PROJECT.md, CONTEXT.md, or the conversation)
and ask the user for whatever owner-input fields remain unknown. Ask as one compact set of
questions — do not drip-feed — and **keep asking until each field is answered or the owner explicitly
defers it**; do not settle for silence:

- **Project owner** — the **GitHub username** of the person responsible for the tool: one login, no leading
  `@`, no URL, not a team name. Resolve the running user's own login first with `gh api user --jq .login`
  and ask directly — **"Is the project owner you (`<login>`)?"** — recording that login on yes and asking
  for the owner's GitHub username on no. Validate it: the login must exist and be a `User` not an
  `Organization` (`gh api users/<login> --jq .type`), and must be a member of **acme-org-ops**
  (`gh api -i orgs/acme-org-ops/members/<login>` → 204). An inconclusive membership check is UNVERIFIED —
  warn, do not block. **Never guess a login from a person's name**; if the value already recorded is legacy
  free text (e.g. `Merchant Ops team (A. Owner)`), show it to the owner and ask which username it is.
  Authoritative format + validation rules: the `ownership-support-contacts` item's `fields` in
  `plugins/golive-gate/data/golive-gate.json`.
- **Support contact** — a single **email address** for who is contacted when issues occur (may be the
  owner's own mailbox). Reject public webmail (gmail, yahoo, hotmail, outlook, …) and shared lab/group
  accounts (`alpha.lab01@…`, `sandbox@…`) — those leave nobody accountable. A role or queue mailbox
  (`ops-helpdesk@…`) is accepted with a warning that a named individual is preferred. Same authoritative
  rules as above (`deniedDomains`, `deniedLocalPatterns`, `warnLocalPatterns`).
- **Label** — the three GCP cost/budget labels, recorded under PROJECT.md `## Label` (Company /
  Division / Department lines). **Company**: exactly one of acme, acme-pay, acme-pa, acme-ventures, acme-retail, acme-travel, acme-an,
  acme-us, acme-intl, acme-rise, acme-gem. **Division**: exactly one of operations, finance, marketing, commercial.
  **Department**: free text (the owning department, non-empty), recorded in lowercase. Authoritative lists:
  `gcp-label-set.labels` in `plugins/golive-gate/data/golive-gate.json`. Not inferable from code —
  never guess them.
- **Risk level** — Low / Medium / High. **If the `golive-gate` plugin is installed, delegate to its
  `assess-risk-level` skill** — it is the source of truth for risk policy: it interviews the owner,
  verifies every answer against the codebase using the `codebaseSignals` in
  `plugins/golive-gate/data/risk-criteria.json`, and records the result (with per-answer verification)
  in PROJECT.md. Do not re-implement its policy or re-ask what it already recorded — just carry its
  result into the dossier.

  Fallback only (golive-gate not installed): propose a classification from the evidence and ask the
  owner to confirm rather than asking cold. Use this table:

  | Risk | Signals |
  |------|---------|
  | Low | Small personal tool, no sensitive data, single user |
  | Medium | Used by a team, connects to company systems, uses internal company data, automates regular work, or affects team decisions |
  | High | Accessible outside the company / internet-facing, handles payments or money, uses sensitive personal or company data, or supports critical business processes |

  Either way: a tool is not automatically Low just because it is small, and owner answers are claims,
  not facts. Verify each claim against the code and record the evidence **with file paths** (see 2.9).
  If the evidence and the owner's answer disagree (e.g. `src/hr/report.ts` reads payroll data but the
  owner says Low), the evidence wins: state the conflict explicitly and classify from the higher-risk
  signals; do not silently accept the lower classification.
- **Access approval process** — who approves access requests and how.
- **Review evidence** — whether a review has already happened and where the sign-off record lives. For a
  first documentation pass this is usually empty; leave a clear placeholder, never fabricate an approval.

If the owner **explicitly defers** a field, write a `⚠️ confirm with owner` placeholder and list it in the
Phase 4 checklist. A placeholder is only for an explicit deferral — never a substitute for asking.

---

## Phase 2: Generate the Docs

Output all files into `<project_root>/docs/` (create if it doesn't exist).
Also write/overwrite `<project_root>/README.md`, and write/update the root `<project_root>/PROJECT.md`
dossier (2.9). Never write to `CONTEXT.md`.

Generate documents in this order:

### 2.1 — README.md  *(always — write to project root)*

```markdown
# <Project Name>

> One-sentence tagline describing what this project does.

## What is this?
2-3 paragraph explanation written for someone encountering the project fresh.
Explain the problem it solves, who it's for, and what it actually does.

## Audience & Access
- **Audience**: Internal only / Internal + 3rd-party business partner / Open (public)  *(state which, with a one-line basis; mark ⚠️ if inferred and unconfirmed)*
- **Internal email domain required?**: Yes (`@company.com`) / Partner-scoped / No / ⚠️ Unconfirmed
- **How access is granted**: SSO / invite-only / open signup / API key

## Quick Start
Minimal steps to get it running (clone → install → configure → run).

## Features
Bulleted list of what the project does (inferred from code).

## Tech Stack
| Layer | Technology |
|-------|-----------|
| ...   | ...       |

## Project Structure
Annotated directory tree — explain what each folder/file is for.

## Documentation
Links to the docs/ folder files generated by this skill, plus PROJECT.md (go-live dossier).

## License
```

---

### 2.2 — docs/ARCHITECTURE.md  *(always)*

Cover:
- **System overview**: what the system does end-to-end, in plain English
- **Component map**: major modules/services and their responsibilities
- **Data flow diagram** (ASCII or markdown table): how data moves through the system
- **Key design decisions**: patterns used (MVC, event-driven, REST, etc.) — infer from code
- **External dependencies**: third-party services, APIs, databases — how they fit the system (the cost/subscription/utilization inventory lives in `docs/DEPENDENCIES.md`)
- **Known quirks**: anything unusual, hacky, or worth flagging for future maintainers

---

### 2.3 — docs/SETUP.md  *(always)*

Cover:
- Prerequisites (Node version, Python version, Docker, etc. — infer from config files)
- Installation steps (exact commands)
- All environment variables (extracted from `.env.example`, config files, or `process.env` / `os.environ` usage in code)
  - For each var: name, purpose, example value, whether required or optional
- Database setup (migrations, seeds — if applicable)
- Running in development
- Running in production
- Common setup errors (infer from error handling in code)

---

### 2.4 — docs/API.md  *(if the project has routes, endpoints, or a public interface)*

Detection heuristic: look for Express routes, FastAPI/Flask/Django routes, GraphQL schemas,
REST controllers, tRPC routers, or similar.

For each endpoint, document:
```
### METHOD /path/to/endpoint

**Description**: What this endpoint does.

**Auth required**: Yes/No (and what kind, if inferrable)

**Request**
- Params: ...
- Query: ...
- Body: { field: type — description }

**Response**
- 200: { shape of success response }
- 4xx/5xx: known error cases

**Notes**: Edge cases, side effects, rate limits, etc.
```

---

### 2.5 — docs/SECURITY.md  *(always)*

Cover:
- **Access scope** (from 1.5): is this internal-only, internal + partner, or public — and does access require an account under the internal email domain? State the basis and flag if unconfirmed. This is a security boundary, not just metadata.
- Authentication mechanism (JWT, sessions, OAuth, API keys — infer from code), checked against the two approved company methods: Apps Gateway (company SSO) or Company Google OAuth login. Flag anything else as a compliance gap.
- Authorization model (roles, permissions — if present)
- Third-party tools and services used, **from a security angle only**: what data each one receives and any security notes. The full inventory with subscription/cost/utilization lives in `docs/DEPENDENCIES.md` — cross-reference it here rather than duplicating the table.
- Environment variables that are secrets (flag them clearly)
- Known security gaps or TODOs found in the code (be honest — vibe-coded projects often have these)
- Recommendations for hardening (brief, practical)

---

### 2.6 — docs/DEPENDENCIES.md  *(generate whenever the project uses any third-party tool/service/SDK)*

A single source of truth for every external tool the project depends on, framed for cost and vendor
governance rather than security. Build it from the inventory you gathered in 1.6.

For each tool, capture:

| Field | Source | Notes |
|-------|--------|-------|
| Tool / service | code (imports, env vars, manifests) | inferable |
| Purpose | code | inferable |
| Utilized in (modules/features) | code (call sites) | inferable — be specific, e.g. "auth module + admin invite flow" |
| Subscription type / tier | **owner input** | NOT readable from code |
| Cost (per month / year / unit) | **owner input** | NOT readable from code |
| Owner / account | **owner input** | NOT readable from code |

**The single most important rule for this document: never invent subscription tiers or costs.** A
codebase tells you that Stripe is wired into the checkout flow; it does not tell you whether the org is
on Stripe's standard pricing or a negotiated enterprise rate, and it never tells you the monthly bill.
Filling those cells with plausible-looking numbers produces a governance document that is confidently
wrong — worse than a blank. So:

- Fill the **inferable** columns (tool, purpose, utilization) from the code.
- For **subscription type** and **cost**, write a clear placeholder like `⚠️ confirm with owner` (and, where a service has a single obvious free tier with no paid usage detected, you may note "appears to use free tier — confirm").
- Where you can see a *usage signal* that hints at tier (e.g. a paginated API call pattern, a webhook that only exists on paid plans, model names like `gpt-4o` that imply paid API usage), note it as a hint for the owner — but still mark the tier/cost as needing confirmation.
- List every unconfirmed cost/tier in the Phase 4 review checklist so the owner knows exactly what to fill in.

Use the template in `references/doc-templates.md`.

---

### 2.7 — docs/CONTRIBUTING.md  *(generate if project has >1 contributor signal OR if user requested)*

Signals: multiple authors in git blame, a `CONTRIBUTORS` file, PR templates, or CI evidence. For apps onboarded to the deployment platform, the platform's CI pipeline is the CI path; GitHub Actions workflows are not required and their absence is not a finding.

Cover:
- How to set up a dev environment
- Branch naming / commit message conventions (infer or suggest standard ones)
- How to run tests (if tests exist)
- PR process
- Code style notes (infer from `.eslintrc`, `prettier`, `ruff`, etc.)

---

### 2.8 — docs/CHANGELOG.md  *(generate if git history is available OR if user requested)*

If git log is accessible:
```bash
git -C <project_root> log --oneline --no-merges -50
```

Group commits into an [Unreleased] section using Keep a Changelog format.
If no git history: generate a template with a note to fill in manually.

---

### 2.9 — PROJECT.md  *(always — write/update at project root; this is the go-live review dossier)*

`PROJECT.md` is the document reviewers and approvers read before the tool is released to others,
required by the Non-Tech Change Management standard. It is distinct from `CONTEXT.md` (agent-maintained
living state — never touched by this skill). If a `PROJECT.md` skeleton exists (scaffolded by
`new-repo-init`), fill it in place, preserving any fields already confirmed. If none exists, create it
with the sections below.

| Section | Source |
|---------|--------|
| Problem Being Solved | code + README + conversation |
| Project Owner | **owner input** (1.7) — a GitHub username, existing and a acme-org-ops member; ask "is the project owner you (`<gh login>`)?"; never guess a login from a name |
| Support Contact | **owner input** (1.7) — a single email; no public webmail, no shared lab/group account; role mailboxes allowed with a warning |
| Change Triage | **owner input** — inbound / outbound / mass-deployment yes/no (golive-gate `risk-criteria.json` `triage`) and, when all are no, the applicable `triage.noneRisks` with their mitigations (never ask for the manager's identity); never answer the triage questions for the owner |
| Label | **owner input** (1.7) — three GCP labels (Company + Division from the controlled lists, free-text Department); `⚠️ confirm with owner` for any unknown, never guessed |
| Design Overview | code — a reviewer-readable summary; deep detail stays in docs/ARCHITECTURE.md |
| Risk Level | **owner input, verified against code** (1.7) — record the classification plus a per-claim evidence table: each owner answer marked CONFIRMED / CONTRADICTED / UNVERIFIABLE with the file path(s) proving it (e.g. `package.json: midtrans-client dependency`, `src/hr/report.ts: payroll fields`). When golive-gate's `assess-risk-level` ran, its recorded verification table is this evidence |
| Access Status | inferred (1.5) — cite the evidence file(s) (auth code, domain allow-list, deploy config); flagged ⚠️ if unconfirmed |
| Data Used | code — classify Confidential / Restricted / Internal / Public (golive-gate `risk-criteria.json` `dataClassification`), flag any UU PDP specific personal data (DPIA), list actual datasets/systems with the file(s) where each is read or written |
| Data That Must Not Be Entered | individual customer/seller PII, KTP/NPWP, payroll, personal financial accounts, passwords, access codes, confidential information, and anything project-specific; daily order items/values are internal operational data, not sensitive financial data merely due to monetary values or database storage |
| Login Method | code (1.5) — cite the auth file(s); must be Apps Gateway or Company Google OAuth; flag anything else as a compliance gap |
| Access Levels | code (roles/permissions) — note least-privilege gaps such as everyone-is-admin |
| Access Approval Process | **owner input** (1.7) |
| Go-Live Steps | deployment route from code/config + the approvals required for the recorded risk level (Low: owner check; Medium: independent review; High: Architecture, SRE, InfoSec approval) |
| AI Usage Record | conversation + owner input — AI tool, what it did, who checked it, what was fixed; only company-approved AI tools; never invent a checker |
| Review Evidence | **owner input** — placeholder if no review yet; **never fabricate an approval** |
| Security Notes | cross-reference docs/SECURITY.md; surface only the reviewer-critical items |
| Hosting Location | deploy config — flag personal/public platforms as needing formal approval |
| Recovery Procedures | Record application rollback/restore steps from code and the platform's GitOps repo where known. SRE owns the backup pipeline or method; if its status is unknown, write "SRE follow-up" and a tracking reference if available. Missing backup details alone are advisory, not a go-live blocker. |

Rules:
- Owner-input fields come from the owner. Placeholders are honest; invented values are not.
- Every inferred governance claim (risk level, access status, login method, data used) must cite the
  file path(s) it was inferred from — a claim without a file path is an assertion, not evidence.
- If the recorded risk level and the code evidence conflict, the evidence wins: classify from the code,
  and state the conflict with its file paths in the Risk Level section — never silently accept the
  lower classification.
- A completed dossier with empty Review Evidence is normal pre-review. A dossier claiming review
  evidence that the user did not provide is a fabricated approval — never do this.

---

### 2.10 — docs/DESIGN.md  *(always — the design-review document; produced by the `design-document` skill)*

`docs/DESIGN.md` is the Tech Architecture Group's design-review document: product overview & objectives, a
business-workflow diagram, component + deployment (access/trust boundary) diagrams, per-use-case sequence
diagrams, the transaction data-flow, a database schema (field types & descriptions), an external-connections
inventory, a financial-risk analysis (race conditions, idempotency/retry/compensation, duplicate detection),
and a review checklist. It is a **standard deliverable for every project** and
reuses the docs generated above (ARCHITECTURE, API, SECURITY, DEPENDENCIES) plus PROJECT.md rather than
duplicating them — the API-security section cross-references `docs/SECURITY.md`; the external-connections
inventory cross-references `docs/DEPENDENCIES.md`. Approvals are handled by the go-live gate / Teams approval
flow (recorded in PROJECT.md Review Evidence), not in DESIGN.md.

Do not hand-write it here. **Hand off to the `design-document` skill** (this same plugin): it
reverse-engineers what the code and these docs prove, writes diagrams **inline as Mermaid** (rendered on
GitHub; never a hosted renderer), interviews the owner to close gaps, and — once finalized — exports a
distributable `docs/DESIGN.pdf`. `/vibe-check` chains it too, so producing it here keeps the design document
current ahead of the go-live gate.

---

## Phase 3: Inline Code Comments

After generating the docs folder, go back through source files and add inline comments
**directly into the code files** for:

- Every function/method: JSDoc / Python docstring explaining purpose, params, return value
- Complex logic blocks: a plain-English comment above them
- Magic numbers / constants: what they represent
- Non-obvious side effects: a warning comment

**Rules for inline comments:**
- Be descriptive, not redundant. Don't write `// increments counter` above `i++`
- For vibe-coded logic: explain what it *appears* to do, and flag uncertainty with `// NOTE:`
- Use the language's idiomatic comment style (JSDoc for JS/TS, docstrings for Python, etc.)
- Don't rewrite the code — only add comments

---

## Phase 4: Summary Report

After all files are written, print a summary in chat:

```
✅ Documentation generated for: <Project Name>

📁 Files written:
  - README.md (root)
  - PROJECT.md (root — go-live review dossier)
  - docs/ARCHITECTURE.md
  - docs/SETUP.md
  - docs/API.md        ← (or "skipped — no API detected")
  - docs/SECURITY.md
  - docs/DEPENDENCIES.md  ← (or "skipped — no third-party tools detected")
  - docs/CONTRIBUTING.md  ← (or "skipped")
  - docs/CHANGELOG.md     ← (or "skipped")
  - docs/DESIGN.md (design-review document — produced by the design-document skill)
  - <N> source files annotated with inline comments

⚠️  Things to review:
  - [ ] PROJECT.md owner-input fields: project owner, support contact, risk level, access approval process, review evidence — every ⚠️ placeholder needs a real value before go-live
  - [ ] Risk level: confirm the recorded classification (and resolve any stated conflict with code evidence)
  - [ ] Audience & access scope: confirm internal / partner / public, and whether internal email-domain registration is required (mark which parts were inferred vs. confirmed)
  - [ ] Login method: confirm it is Apps Gateway or Company Google OAuth; any other mechanism is a compliance gap to fix before release
  - [ ] Third-party subscription tiers and costs in DEPENDENCIES.md — every cell marked "⚠️ confirm with owner" needs a real value
  - [ ] docs/DESIGN.md: close its ⚠️ gaps (objectives, PRD link, business-workflow steps, system boundaries, transaction ownership, database-schema field descriptions, external-connection purpose/auth, financial-risk mitigations) via the design-document skill's interview — it also runs at /vibe-check
  - [ ] List any gaps, assumptions, or places where Claude wasn't sure
  - [ ] List any TODOs or security gaps found in the code
  - [ ] Note any files that were too large/complex to fully analyze

💡 Suggested next steps: ...
```

Then offer to refine any specific document or dig deeper into any area.

---

## Notes on Vibe-Coded Projects

These projects are the primary target. Common patterns to handle gracefully:

| Situation | How to handle |
|-----------|--------------|
| No clear entry point | Explore all files, infer from imports |
| Inconsistent naming | Document what exists, don't rename |
| Business logic in UI components | Note it in architecture as a quirk |
| `.env` vars used but no `.env.example` | Extract from code with `grep -r "process.env\|os.environ"` |
| No tests | Note it in CONTRIBUTING.md, skip test section in SETUP.md |
| Commented-out code everywhere | Ignore it in docs |
| No package manager lock file | Note the uncertainty in SETUP.md |
| Secrets hardcoded in source | Flag in SECURITY.md without reproducing the values |
| Third-party SDK present but call sites unclear | Trace imports to where the client is used; document the modules you can confirm, note the rest |
| Subscription tier / cost not in code | Fill tool + utilization from code; mark tier and cost "⚠️ confirm with owner" — never guess a price |
| Audience ambiguous (no domain check, mixed signals) | State the signals found and the most likely bucket, then flag for owner confirmation |
| Owner can't state a risk level | Run golive-gate's `assess-risk-level` if installed; otherwise propose one from the fallback table (1.7) with file-path evidence, record it as proposed-unconfirmed, and list it in the Phase 4 checklist |
| Old-layout PROJECT.md (living-state sections, pre-rename) | Treat it as CONTEXT.md content: suggest the rename per new-repo-init, and only then write the dossier |

---

## Reference Files

- `references/doc-templates.md` — Starter templates for each doc type (load if you need formatting guidance)
