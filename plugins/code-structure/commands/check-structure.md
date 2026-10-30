---
name: check-structure
description: Manual audit of the current repository against monorepo, frontend, and backend architecture rules. Read-only — use /fix-structure to apply changes.
---

# Check structure (manual audit)

Audit this **existing** project using the `code-structure` plugin. **Read-only** — report violations without moving files unless the user asks to fix.

## Steps

1. Read skill `check-code-structure`.
2. Load `data/monorepo-layout.json`, `data/frontend-layout.json`, `data/backend-layout.json`.
3. Scan the **entire** repository (not only git diff).
4. Verify root monorepo layout (`apps/`, `packages/`, `docs/`, `infrastructure/`, `scripts/`).
5. Check `apps/frontend/src/` directory structure and layer separation.
6. Check `apps/backend/src/modules/` follows the Elysia routes/service/repository pattern (legacy repos: their existing pattern, advisory).
7. Find duplicated types between apps that should be in `packages/shared-types`.
8. Flag components over 300 lines, React/Vue components on non-legacy repos, DB queries in route plugins, logic in routes.

## Report

- Monorepo compliance
- Frontend violations with file paths
- Backend violations with file paths
- Concrete refactor recommendations (move X to Y)
- Suggest `/fix-structure` if the user wants automated remediation
