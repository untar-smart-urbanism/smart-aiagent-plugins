---
name: plan-code-structure
description: Resolve where files, modules, and types belong in the monorepo before writing code. Use eagerly when planning, scaffolding, or adding features — do not ask the user where to put files. Read data/*.json rather than guessing layout.
---

# Plan code structure

**Source of truth** for file and module placement. Agents must consult this skill (and `data/*.json`) before creating or moving any application code.

## When to use (do not wait for the user to ask)

Activate when **any** of the following is true:

1. User asks to build, create, scaffold, or extend a system, API, page, or feature
2. You are about to create a new file, folder, module, component, service, or type
3. User asks where code should live — **answer from this plugin**, do not ask them to choose
4. Planning architecture, folder layout, or monorepo setup
5. User did **not** specify directory structure — **resolve it here**

Use eagerly rather than placing files from memory or habit.

## Data to load

| File | Purpose |
|------|---------|
| `data/monorepo-layout.json` | Root `apps/`, `packages/`, `docs/` layout |
| `data/frontend-layout.json` | `apps/frontend/src/` directories |
| `data/backend-layout.json` | `apps/backend/src/modules/` pattern |

## Placement decision tree

### 1. Which app?

| Code type | Location |
|-----------|----------|
| Svelte UI, client state | `apps/frontend/` |
| API, business logic, DB access | `apps/backend/` |
| Shared DTOs, enums, interfaces | `packages/shared-types/` |
| Shared utilities (both apps) | `packages/shared-utils/` |
| Production `Dockerfile` | **repo root** (the platform build detects it there) |
| IaC, docker-compose, dev-only container files | `infrastructure/` |
| Kubernetes deployment manifests | **not this repo** — the deployment platform generates them in `deployment-<app>` at `apps/<app>/<env>/` |
| Repo scripts | `scripts/` |

### 2. Frontend file? (Svelte + Vite)

| What | Where |
|------|-------|
| Route page (thin composition) | `apps/frontend/src/pages/` (or `routes/`) |
| Feature business logic + UI | `apps/frontend/src/lib/features/<feature>/` |
| Shared reusable UI (`.svelte`, PascalCase) | `apps/frontend/src/lib/components/` |
| API calls (Eden treaty client) | `apps/frontend/src/api/` |
| Global client state (stores or runes `.svelte.ts`) | `apps/frontend/src/lib/stores/` |
| Layout wrappers | `apps/frontend/src/lib/layouts/` |
| App shell, router | `apps/frontend/src/App.svelte`, `main.ts` |
| Frontend-only types | `apps/frontend/src/lib/types/` |
| Frontend-only utils | `apps/frontend/src/lib/utils/` |

### 3. Backend file? (Bun + Elysia)

| What | Where |
|------|-------|
| New feature domain | `apps/backend/src/modules/<feature>/` |
| HTTP handling (Elysia chained plugin) | `modules/<feature>/routes.ts` |
| TypeBox request/response schemas | `modules/<feature>/model.ts` |
| Business rules | `modules/<feature>/service.ts` |
| Drizzle queries | `modules/<feature>/repository.ts` |
| Module-local types | `modules/<feature>/types.ts` |
| Cross-cutting Elysia plugins (auth, errors) | `apps/backend/src/plugins/` |
| Drizzle tables | `apps/backend/src/database/schema/` |
| Migrations (drizzle-kit) | `apps/backend/src/database/migrations/` |
| Mounting modules / `export type App` | `apps/backend/src/index.ts` (one fluent chain) |

### 4. Shared type check

Before creating any interface, DTO, or enum: **will the other app need it?**

- Yes → `packages/shared-types/src/<domain>.ts`
- No → app-local `types/`

## Plan output format

```markdown
## Code structure plan — <feature or task>

### Files to create
| File | Purpose |
|------|---------|
| apps/frontend/src/lib/features/orders/... | ... |

### Files to move (if refactoring)
| From | To | Reason |
|------|-----|--------|

### Shared types
- `OrderDto` → packages/shared-types/src/order.ts (used by frontend + backend)
```

## Rules

- Never put business logic in `pages/` or `lib/components/` — use `lib/features/`
- Never put API calls outside `api/` on frontend
- Never put DB queries in Elysia route plugins
- Never duplicate types across apps
- Max 300 lines per `.svelte` component — split if larger
- Stack comes from `golive-gate` `data/build-contract.json` `allowedStack`; legacy projects (Vibe Start before 2026-10-07) keep their existing structure - place new code to match it, do not convert

## After planning

- **New project** → use `scaffold-monorepo` skill to create directories
- **Implementation** → create files at planned paths
- **Existing project audit** → user runs `/check-structure` or `/fix-structure`
