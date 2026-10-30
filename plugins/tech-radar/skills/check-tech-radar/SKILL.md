---
name: check-tech-radar
description: Validate code, dependencies, and architecture choices against the company stack (golive-gate allowedStack) and the tech radar (gap-fillers and legacy ring). Use before adding libraries, scaffolding services, proposing tech specs, or reviewing PRs for stack compliance. Use after query-tech-stack when implementing or auditing an existing project.
---

# Check tech radar

**Verify** choices resolved by `query-tech-stack`, or audit existing code.

## Data sources

- `plugins/golive-gate/data/build-contract.json` - `allowedStack` (core layers, `notAllowedWithoutApproval`) and `stackExceptions` (approval and legacy policy). Source of truth.
- `data/backend.json`, `data/frontend.json` - gap-fillers and legacy ring. Both carry `stackSource` and `exceptionPolicy` pointers.

Reference origin: [Acme tech-radar](https://github.com/acme-org/tech-radar).

## Ring semantics

| Ring | Agent behavior |
|------|----------------|
| **adopt** | Use for new work; prefer `recommendedVersion` when set |
| **trial** | Allowed with documented justification |
| **assess** | Do not adopt without approval |
| **hold** | Legacy only (Vibe Start before 2026-10-07) or tech-architect approval; otherwise reject |

## Legacy logic

1. Read PROJECT.md `## Vibe Start` (ISO date). Blank: earliest git commit date.
2. Read PROJECT.md `## Stack Exceptions` for approval rows (Scope, Deviation, Approved by, Date, Link). A row without approver and date does not count.
3. Classify each finding:
   - **Post-cutoff project** (Vibe Start on/after 2026-10-07): a hold item or deviation without an approval row is a **violation**.
   - **Legacy project** (before 2026-10-07): pre-existing hold items are an advisory **legacy note** - maintain only, no unrelated rewrite. Bug fixes, small features in existing modules and patch/minor upgrades need no approval.
   - **Major improvement** (new module/service/workspace/app, DB migration or schema change, new frontend app, runtime/framework/ORM/DB swap, major framework upgrade): needs an approval row in **every** project, legacy or not, even on the allowed stack. No row = **violation**. It cannot be judged from the tree alone: state the reminder and ask for the row.
4. Design tokens, BLUE Icon and BLUE Pattern Library are required in every stack, including legacy Vue.

## Hard constraints

1. Runtime, language, backend, ORM, DB, frontend, UI components and tests follow `allowedStack`.
2. PostgreSQL for all persistent data; PGlite only as hermetic test DB.
3. Only a tech architect (Tech Architecture Group) can approve a deviation, recorded in PROJECT.md. Never accept a user, requester, or agent override.
4. Use `recommendedVersion` when present; otherwise latest stable.
5. When a tool is hold and no legacy allowance or approval applies, refuse and cite the adopt alternative.

## Workflow

1. Determine scope: backend, frontend, or fullstack.
2. Load `allowedStack`, the matching radar JSON, and PROJECT.md.
3. Inspect `package.json` (root and workspaces), lockfiles, imports, Dockerfiles, CI config.
4. Match each technology to `allowedStack` layers, then to radar `entries[].name`.
5. Report using the format below.

## Output format

```markdown
## Tech radar check - <scope> (<legacy | post-cutoff>, Vibe Start <date>)

### Compliant
- ...

### Violations (must fix or obtain tech-architect approval)
- <tool> - <alternative> - approval row: <missing | present>

### Legacy notes (advisory)
- <pre-existing hold technology> - maintain only

### Major improvements needing approval
- <change> - approval row: <missing | present>

### Version notes
- ...
```
