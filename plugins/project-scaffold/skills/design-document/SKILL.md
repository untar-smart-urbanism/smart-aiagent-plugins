---
name: design-document
description: Generates docs/DESIGN.md — the IT / Tech Architecture design-review document (product overview & objectives, a business-workflow diagram, component + deployment + sequence + transaction diagrams as inline Mermaid, a database schema with field types & descriptions, an external-connections/integrations inventory, financial-risk analysis, review checklist) for an already-built project by reverse-engineering the code and the existing docs, then interviewing the owner to close what code cannot reveal, and finally exporting a distributable docs/DESIGN.pdf. Use when preparing a design document for architecture, security, or compliance review; when /vibe-check chains it; or when the user asks for design docs, a business-workflow/architecture/component/deployment diagram, sequence diagrams, a transaction-flow diagram, a database-schema/ER diagram, an external-connections write-up, a race-condition/idempotency/duplicate-transaction (financial-risk) write-up, or a PDF of the design document.
---

# Design Document

Produces `docs/DESIGN.md`: the design-review document the Tech Architecture Group reads before sign-off.
Its focus is **financial-transaction correctness** and **clear architecture views** — product overview &
objectives, a business-workflow diagram, component/deployment diagrams, per-use-case sequence diagrams, the
transaction data-flow, a database schema (field types & descriptions), an external-connections inventory, a
financial-risk analysis, and a review checklist. All diagrams are written
**inline as Mermaid** so they render natively on GitHub and live in the document itself. Once finalized, it
exports a distributable **`docs/DESIGN.pdf`**.

Most projects here are **vibe-coded: built first, designed later.** So this skill does not ask for a
greenfield design. It works the way `project-documenter` does — **infer everything the code and existing
docs already prove, mark every remaining gap `⚠️`, then interview the owner to close the gaps** — and it
never invents facts to fill a template.

## When to use

1. The user asks for a design document; a business-workflow, architecture, sequence, deployment, or
   database-schema/ER diagram; an external-connections write-up; a financial-risk write-up; or a PDF of it.
2. `/vibe-check` (the go-live gate) chains it as a standard deliverable — see "Relationship to other skills".
3. Before an architecture / security / compliance review of an existing tool.

## What it produces

- `docs/DESIGN.md` — the review document with **inline Mermaid diagrams** (structure below; scaffold in
  `references/design-doc-template.md`). The Markdown is the source of truth; diagrams render on GitHub.
- `docs/DESIGN.pdf` — a distributable copy, generated **last** (Phase 5) as an exact copy of the finalized
  DESIGN.md, rendered locally, with links resolved to the repo on GitHub. On-demand and **not committed**
  (add `docs/*.pdf` to `.gitignore`).

## Relationship to other skills — reuse, do not duplicate

This skill **reads and links** the as-built docs rather than re-deriving them:

| Needs | Reuses | How |
|-------|--------|-----|
| Component map, data flow, dependencies | `docs/ARCHITECTURE.md` | basis for the component/deployment diagram |
| Endpoints / handlers | `docs/API.md` | basis for sequence diagrams |
| Auth, authorization, secrets, security gaps | `docs/SECURITY.md` | the API-security section **cross-references** it; never restate |
| Audience/access scope, login method, risk, approvals | `PROJECT.md` | Access Status / Login Method / Access Levels / Review Evidence |
| Vendor inventory | `docs/DEPENDENCIES.md` | external systems on the diagrams **and the External Connections table** |
| Persisted data model | ORM schema / migrations / DDL + `docs/ARCHITECTURE.md` | basis for the Database Schema (ER diagram + field tables) |

If those docs are missing, recommend running `project-documenter` first; you can still proceed by reading
the code directly. When invoked from `/vibe-check`, `project-documenter` has usually already run.

---

## Phase 0 — Load the existing docs

Read whichever of these exist: `README.md`, `PROJECT.md`, `CONTEXT.md`, `docs/ARCHITECTURE.md`,
`docs/API.md`, `docs/SECURITY.md`, `docs/DEPENDENCIES.md`, and any existing `docs/DESIGN.md`
(fill it in place, preserving confirmed content — never blow away owner answers). These are your primary
evidence; the code is the tiebreaker.

---

## Phase 1 — Reverse-engineer the inferable content

Build the raw material for every section from code + docs. Capture, with `file:line` evidence:

- **Product overview & objectives** — from README and PROJECT.md "Problem Being Solved". Objectives /
  success criteria and the PRD link are owner input where the code doesn't prove them.
- **Components & deployment** — services/modules and responsibilities (from ARCHITECTURE + code), the
  request/response flows between them, the major data exchanged, and key system dependencies.
- **Use cases / flows / features / modules** — from routes, handlers, entry points, jobs (API.md + code).
  These become the sequence diagrams.
- **Business workflow** — the end-to-end business process across roles (from routes / jobs / domain logic).
  The business intent and step ownership are owner input. This becomes the business-workflow diagram.
- **Data stores, queues, event streams** — DB clients, queue/broker/topic usage, event emitters. This is
  the transaction data-flow.
- **Database schema** — from ORM schema (Drizzle `drizzle.config.ts` + `drizzle-orm` schema files, `schema.prisma`, TypeORM / Sequelize entities), SQL migrations, or
  DDL: tables, columns, types, primary/foreign keys, constraints. Per-field descriptions are owner input
  where not obvious. This becomes the Database Schema section (ER diagram + field tables).
- **External connections** — outbound HTTP clients / SDKs, inbound webhook / callback handlers, and message
  brokers (+ `docs/DEPENDENCIES.md`): the direction, data, protocol, and auth of each boundary crossing.
  *Why* and *when* a connection fires are owner input. This becomes the External Connections & Integrations
  section.
- **Financial surface (decide once, drives the whole financial section)** — grep for payments, money,
  balances, wallets, ledgers, loyalty/points, orders, refunds, transfers, `amount`, `currency`. Record
  whether a financial/transactional surface **exists** and where. No such surface → the financial-risk
  subsections render as explicit `N/A` (see Scaling rule), not fabricated prose.
- **Access model (drives the deployment diagram + role-aware sequences):**
  - **Roles / permissions** — RBAC checks, middleware, `role` / `isAdmin` / scope guards. Note which
    steps or endpoints only some roles can reach.
  - **Audience & access scope** — internal / internal + partner / public, and whether an internal email
    domain is required (same signals `project-documenter` step 1.5 uses). Reuse PROJECT.md **Access Status**.
  - **Network exposure** — which surfaces are public vs internal-only (public routes, ingress, VPN /
    allowlist / private network config).
  - **Login method** — Apps Gateway SSO or Company Google OAuth (reuse PROJECT.md **Login Method**).
    Anything else is a compliance gap — flag it, do not normalize it.

Anything code cannot settle (transaction ownership, failure/recovery intent, the reasoning behind a
race-condition guarantee, PRD link) is left as a `⚠️` gap for Phase 3 — do not guess it now.

---

## Phase 2 — Generate `docs/DESIGN.md` and the diagrams

Write `docs/DESIGN.md` from `references/design-doc-template.md`. Every section carries an HTML comment
describing what it must contain and where the content comes from — fill inferable content, mark the rest
`⚠️`. The document structure:

1. **Product Overview & Objectives** — what it does, who for, the problem, and the objectives / success
   criteria it must meet; PRD link (`⚠️` owner input if none found).
2. **Business Workflow** — the end-to-end business process and the intention behind it, as a Mermaid
   flowchart with one swimlane per role/actor the process crosses.
3. **Architecture Diagrams**
   - **A. Component / Deployment** — component diagram (structure, request/response flows, major data,
     dependencies) **and a required deployment diagram** showing the access/trust boundary: **who** can
     access each node (roles), **from where** (network zone), which nodes are **company-network-only** vs
     **publicly accessible** (drawn as explicit zones), and the **login method** on each entry point.
   - **B. Sequence Diagrams & System Boundaries** — one per major use case / flow / feature / module,
     with system boundaries drawn, financial-asset / payment / loyalty flows highlighted, and
     **role-based access differences** shown where they exist (admin vs standard paths, per-role gates).
   - **C. Queue / Data Storage for Transactions** — how transactional data and financial assets move
     through queues / streams / stores; which upstream systems can read it; transaction ownership; data
     movement; failure & recovery.
4. **Database Schema** — an ER diagram plus one field table per table (`Field | Type | Nullable | Key |
   Description`). Types come from the ORM / migrations / DDL; descriptions are owner-confirmed. `N/A` if no
   datastore.
5. **External Connections & Integrations** — every inbound/outbound boundary crossing as a table of
   **direction, what (data), why (purpose), where (host/zone), when (trigger), how (protocol + auth)**.
   `N/A` if none. Cross-reference `docs/DEPENDENCIES.md`; do not duplicate it.
6. **Financial Risks & Mitigation** — Race Conditions; Failure Models (idempotency / retry /
   compensation-rollback); Duplicate Transaction Detection; API Security (**summary only, cross-references
   `docs/SECURITY.md`**).
7. **Review Checklist** — auto-tick items whose supporting content/diagram exists; leave the rest unticked.

Approvals are **not** part of this document — sign-offs are handled by the go-live gate and the Teams
approval flow (recorded in PROJECT.md Review Evidence). Do not add an approval matrix.

Diagram authoring is **inline Mermaid** — write each diagram directly into `DESIGN.md` as a fenced
` ```mermaid ` block. Mermaid syntax for every type (component, access-zoned deployment, role-differentiated
sequence, business-workflow swimlanes, transaction data-flow, ER schema) is in `references/mermaid-guide.md`.

### Diagrams render inline — no render step here

Diagrams live in `DESIGN.md` as Mermaid and render natively on GitHub, so this phase needs no rendering
step and produces no separate diagram files. The only rendered artifact is the distributable PDF, produced
**last** (Phase 5) after the document is finalized. Never send diagram source to a hosted renderer
(`mermaid.ink`, Kroki, or any cloud converter) — see Phase 5 and `references/mermaid-guide.md`.

### Validate the Mermaid before finalizing — blocking gate

Rendering isn't needed here, but **every diagram must still parse.** An unquoted `;` in sequence text (it is a
statement separator), a stray `#`, or an unquoted special character silently breaks a block — and the failure
only surfaces when a reviewer opens the doc on GitHub. So after writing `DESIGN.md`, and **before Phase 4 can
finalize, parse every ` ```mermaid ` block and fix any that fail**, using the first available **local** method
(never a hosted service). The methods, the headless reference harness, and the no-toolchain static-lint
fallback are in `references/mermaid-guide.md` → **Validating the Mermaid**:

1. **`mmdc`** (`@mermaid-js/mermaid-cli`) if on PATH.
2. Otherwise a **local headless parse** — `mermaid` + `jsdom`, `mermaid.parse()` on each block.
3. No toolchain → **static lint** (reject an unquoted `;` / a bare `#` in sequence text, and unquoted special
   characters in flowchart / ER labels) — and say so.

A block that does not parse is a **blocking finalization failure**, not a warning. State which method you used
in the run output. Phase 5 never generates the PDF from a doc with an unparseable diagram.

---

## Phase 3 — Interview the owner to close the gaps

This is the heart of the skill: **continuously ask, guide, and check** until the document is complete or
every remaining gap is explicitly owner-acknowledged. Ask **one compact batch of questions per section** —
do not drip-feed and do not dump every question at once. Typical `⚠️` gaps:

- Product Overview → objectives / success criteria; PRD link.
- Business Workflow → the business intent; the exact steps and which role owns each.
- Diagram B → which use cases are "major"; the exact system boundaries; role differences per flow.
- Diagram C → transaction ownership; which upstream systems may read the data; failure & recovery.
- Database Schema → per-field descriptions the code doesn't make obvious; which service owns each table.
- External Connections → *why* each integration exists and *when* it fires; the auth on each; anything the
  code can't reveal about inbound callers.
- Financial Risks → the actual race conditions and consistency guarantees; idempotency / retry /
  compensation strategy; duplicate-detection mechanism and transaction identifiers.

**Verify every answer against the codebase — evidence wins.** For each claim, mark
**CONFIRMED** / **CONTRADICTED** / **UNVERIFIABLE** with a `file:line`. If the owner says "we use an
idempotency key" or "duplicates are caught by a unique constraint" but the code shows neither, record the
**conflict** in the document — do not silently write the claim as fact. A design doc that overstates the
safety of money-handling code is worse than one that admits the gap.

---

## Phase 4 — Review checklist

- **Review Checklist** — tick each item only when its supporting content exists in the document (a diagram
  is present, a section is filled, a boundary is drawn). Leave the rest unticked and list them as the
  outstanding work. The checklist is a status mirror, not a formality.

The checklist now also covers **Objectives**, the **Business workflow diagram**, the **Database schema**
(fields / types / descriptions), and **External connections** (direction / purpose / protocol / auth) —
tick each only when its content exists.

Approvals are **not** recorded here — the go-live gate and the Teams approval flow handle sign-offs
(`approvals-complete`, verified against PROJECT.md Review Evidence). Do not add an approval matrix to DESIGN.md.

**Finalize.** DESIGN.md is *final* when every section is filled or every remaining gap is explicitly
owner-acknowledged, **every Mermaid block parses** (the Phase 2 validation gate), and the checklist reflects
the true status. Finalization is the gate for Phase 5 — never generate the PDF from a draft or from a doc with
an unparseable diagram.

---

## Phase 5 — Generate the distributable PDF (after finalization)

Run this **only after DESIGN.md is finalized** (Phases 3–4 complete). Produce `docs/DESIGN.pdf` as a
**faithful, exact copy of the finalized DESIGN.md** — the exact committed content, every rendered Mermaid
diagram, table, and section, so the PDF looks just like the document rendered on GitHub. Never re-derive,
summarize, or restyle the content; the only transformation is link resolution.

1. **Resolve links to GitHub.** Build the distribution copy with relative links rewritten to absolute repo
   URLs so they resolve when the PDF travels outside the repo — **visible link text is unchanged; only the
   `href` target becomes absolute**. Derive the base from `git remote get-url origin`, normalize
   `git@github.com:<org>/<repo>(.git)` or an `https` origin to
   `https://github.com/<org>/<repo>/blob/<default-branch>/`, and resolve each relative link against it
   (default branch: `git symbolic-ref --short refs/remotes/origin/HEAD`, else the current branch). Leave
   DESIGN.md itself using relative links (they resolve on GitHub natively).
2. **Render locally — never hosted.** Produce the PDF by the first available local method and state which
   one you used:
   - a local Markdown→PDF tool on PATH that renders Mermaid (`md-to-pdf`, or `pandoc` + `wkhtmltopdf` /
     `weasyprint`), run offline; **or**
   - a local **headless Edge/Chrome** (`msedge` / `chrome --headless --print-to-pdf`) printing a
     self-contained HTML built from DESIGN.md, with Mermaid rendered by a **locally bundled** `mermaid.min.js`.
   Never route the content through a hosted converter or a hosted diagram renderer (`mermaid.ink`, Kroki).
3. **Degrade gracefully.** No local toolchain → **skip the PDF**, keep the finalized `docs/DESIGN.md` as the
   deliverable (it renders on GitHub), and print a one-line local-setup hint. Never fabricate a PDF.
4. **Do not commit it.** `docs/DESIGN.pdf` is an on-demand derivative — add `docs/*.pdf` to `.gitignore` and
   regenerate to distribute.

---

## Scaling rule — always produced, never bloated

The document is produced for **every** project, but it scales to what exists:

- **No financial/transactional surface** (Phase 1) → the Financial Risks subsections render as
  `N/A — no financial assets or transactions detected in code (confirm with owner)`, and Diagram C is
  reduced to the plain data-flow. Do not fabricate transaction risks for a tool that has none.
- **No datastore** → the Database Schema section is `N/A — no datastore detected in code (confirm with
  owner)`; do not invent tables.
- **No external calls** → External Connections & Integrations is `N/A — none detected in code (confirm with
  owner)`; do not invent integrations.
- **A small single-component tool** → one business-workflow diagram, one component diagram, and one or two
  sequence diagrams are enough; do not manufacture deployment complexity that isn't there.
- Scale **down the diagrams and prose, never the honesty** — every unmet requirement is still listed as a
  `⚠️` gap so the reviewer sees exactly what is missing.

---

## Hard rules

- **Never fabricate.** No invented financial-risk mitigations, no PRD that doesn't
  exist. `⚠️` placeholders are honest; plausible-looking fiction is not.
- **Evidence wins.** When an owner's answer and the code disagree, record the conflict; do not overwrite
  the evidence with the claim.
- **Never send diagrams to a hosted renderer.** Diagrams are inline Mermaid (GitHub renders them within the
  same trust boundary as hosting the repo). The PDF is a **local** derivative — no `mermaid.ink`, no Kroki,
  no cloud converter.
- **Every Mermaid block must parse before finalizing.** Validate locally (the Phase 2 gate); an unparseable
  diagram blocks finalization and the PDF. An unquoted `;` in sequence text is the classic break — see
  `references/mermaid-guide.md` → **Special characters** / **Validating the Mermaid**.
- **The PDF is generated last and mirrors the finalized doc.** Generate it only after DESIGN.md is final; it
  must be an exact copy, with links resolved so they point to the repo on GitHub.
- **Cross-reference, don't duplicate.** API security lives in `docs/SECURITY.md`; the vendor inventory lives
  in `docs/DEPENDENCIES.md`. Point to them. Approvals are handled in the go-live gate / Teams approval flow
  and recorded in `PROJECT.md` — do not add a sign-off matrix to DESIGN.md.

---

## Reference files

- `references/design-doc-template.md` — the full `docs/DESIGN.md` scaffold with per-section guidance comments.
- `references/mermaid-guide.md` — inline-Mermaid syntax for each diagram type (component, access-zoned
  deployment, role-differentiated sequence, business-workflow swimlanes, transaction data-flow, ER schema),
  the local-only PDF rendering steps, and resource links.
