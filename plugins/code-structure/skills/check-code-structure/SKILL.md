---
name: check-code-structure
description: Audit a repository against monorepo, frontend, and backend architecture rules. Use after plan-code-structure during implementation, before PRs, or when manually auditing existing projects via /check-structure or /fix-structure.
---

# Check code structure

Manual audit skill for **existing projects**. Run when the user invokes `/check-structure` or `/fix-structure`, or before merge on repos that predate this plugin.

## Data sources

- `data/monorepo-layout.json` — root monorepo layout
- `data/frontend-layout.json` — `apps/frontend/src` structure (Svelte)
- `data/backend-layout.json` — `apps/backend/src` module pattern (Elysia)

## Workflow

1. **Monorepo check**
   - Verify `apps/frontend/`, `apps/backend/`, `packages/shared-types/`, `packages/shared-utils/`, `packages/eslint-config/`, `packages/tsconfig/`, `docs/`, `infrastructure/`, `scripts/` exist or are intentionally omitted with justification.
   - Flag frontend code outside `apps/frontend/`.
   - Flag backend code outside `apps/backend/`.
   - Scan for duplicated interfaces/DTOs/enums in both apps — should live in `packages/shared-types`.
   - Flag a production `Dockerfile` that is **not** at the repo root — the platform build looks for it
     there. A docker-compose or dev-only Dockerfile under `infrastructure/` is fine.
   - **Never flag missing Kubernetes deployment manifests.** They belong to the platform-created
     `deployment-<app>` repo (`apps/<app>/<env>/`), not to the application repo; their absence here is
     the correct state. If manifests *are* present in the app repo, flag that instead and point at the
     deployment repo.

2. **Frontend check** (`apps/frontend/src/`)
   - Required: `lib/components`, `lib/features`, `lib/stores`, `api/`, `pages/` (or `routes/`), plus `lib/layouts`, `lib/utils`, `lib/types` where used.
   - Components are `.svelte` PascalCase with `<script lang="ts">`; flag React/Vue components on non-legacy repos.
   - API calls only in `api/` (Eden treaty client); flag raw `fetch` in components.
   - Business logic in `lib/features/`, not in `pages/` or `lib/components/`.
   - One client-state mechanism (stores or runes); flag a second state manager.
   - `.svelte` files over 300 lines -> violation.

3. **Backend check** (`apps/backend/src/`)
   - Required: `modules`, `config`, `database` (with `schema/` and `migrations/`); `plugins`, `utils`, `types` where used.
   - Each feature under `modules/<feature>/` has `routes.ts` (Elysia chained plugin), `service.ts`, `repository.ts`; `model.ts` (TypeBox) and `types.ts` as needed.
   - `index.ts` builds one fluent chain and exports `type App = typeof app`; flag `app.get(...)` on separate statements.
   - No DB queries and no business logic in routes.
   - Drizzle tables live in `database/schema/`.

4. **Legacy projects**
   - Read the stack from `golive-gate` `data/build-contract.json` `allowedStack` and `stackExceptions`; the start date comes from PROJECT.md `## Vibe Start` (fallback: earliest commit).
   - If Vibe Start is before 2026-10-07, audit against the repo's **existing** structure (React/Vue `app/features/hooks/services/store`, Express `controller/service/repository/routes/middleware`, npm/pnpm workspaces) and report deviations from the new layout as **advisory notes**, never as findings or conversions.
   - Adding a module, workspace or app, or replacing the frontend, is a major improvement: remind that a recorded tech-architect approval (`## Stack Exceptions`) is required; the tree alone cannot prove it.

## Output

```markdown
## Code structure audit

### Monorepo
- ...

### Frontend violations
- ...

### Backend violations
- ...

### Recommended moves
- move `<file>` → `<target path>`
```
