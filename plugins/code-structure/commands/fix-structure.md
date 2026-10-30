---
name: fix-structure
description: Audit and fix an existing project against monorepo, frontend, and backend architecture rules — move misplaced files and scaffold missing directories.
---

# Fix structure (existing projects)

Refactor this **existing** project to comply with the `code-structure` plugin.

## Steps

1. Run full audit using skill `check-code-structure`:
   - Load `data/monorepo-layout.json`, `data/frontend-layout.json`, `data/backend-layout.json`
   - Scan entire repo — not only changed files
2. Produce audit report with violations and recommended moves
3. **Ask user to confirm** before large moves (unless they said "fix automatically")
4. Execute fixes in priority order:
   - Create missing standard directories (`scaffold-monorepo` skill)
   - Move misplaced files to correct paths
   - Extract duplicated types → `packages/shared-types/`
   - Split components over 300 lines
   - Refactor backend modules to the routes/service/repository pattern (Elysia + Drizzle); skip legacy repos (advisory only)
5. Re-run `check-code-structure` and report remaining issues

## Scope

| Area | Actions |
|------|---------|
| Monorepo | Ensure `apps/`, `packages/` layout; move stray frontend/backend code |
| Frontend | Move logic to `features/`, API to `services/`, thin `pages/` |
| Backend | Split fat route plugins; add missing `repository.ts` / `service.ts` |
| Shared | Deduplicate types into `packages/shared-types/` |

## Output

```markdown
## Structure fix — <project>

### Audit summary
- Violations found: N
- Fixed: N | Remaining: N

### Changes made
- moved `src/api/orders.ts` → `apps/backend/src/modules/orders/...`

### Manual follow-up
- ...
```

Do not change unrelated code. Prefer `git mv` to preserve history when moving files.
