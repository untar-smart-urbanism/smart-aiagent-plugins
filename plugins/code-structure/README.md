# Code Structure

Monorepo and layered architecture guidelines for company projects.

## Purpose

- **Auto-resolve** where files, modules, and types belong — users do not specify directories
- **Enforce** Svelte feature/api/store separation and the Elysia routes/service/repository (Drizzle) module pattern
- **Audit and fix** existing projects on demand

## Agent behavior (automatic)

When an agent plans or writes code:

1. Read skill `plan-code-structure` and `data/*.json`
2. State planned file paths before creating files
3. Place code in correct layer (`lib/features/`, `api/`, `modules/`, etc.)
4. Move or flag violations — do not leave misplaced code

The `monorepo-structure` rule (`alwaysApply: true`) enforces this on every session when installed.

## Manual commands (existing projects)

| Command | Purpose |
|---------|---------|
| `/check-structure` | Read-only audit — report violations |
| `/fix-structure` | Audit + move files, scaffold dirs, dedupe types |

## Components

| Component | Purpose |
|-----------|---------|
| `data/monorepo-layout.json` | Root monorepo structure |
| `data/frontend-layout.json` | Svelte + Vite `src/` layout |
| `data/backend-layout.json` | Bun + Elysia module pattern |
| Skill `plan-code-structure` | **Plan file placement before coding** |
| Skill `scaffold-monorepo` | Scaffold new monorepo or feature |
| Skill `check-code-structure` | Audit repository compliance |
| Rule `monorepo-structure` | Always-on enforcement |
| Rules `frontend/backend-architecture` | App-scoped layer rules |
| Agent `architecture-guardian` | Structure enforcement subagent |
| Command `check-structure` | Manual read-only audit |
| Command `fix-structure` | Manual audit + remediation |

## Install

```text
/add-plugin code-structure
/plugin install code-structure@smart-aiagent-plugins
```

Install alongside `tech-radar` for full stack + structure enforcement. The stack itself comes from `golive-gate` `data/build-contract.json` `allowedStack`; workspaces are Bun workspaces.

## Legacy projects

Projects with Vibe Start before 2026-10-07 (React/Vue, Express, npm/pnpm) are audited against their existing structure as advisory and are not converted. Major improvements still need tech-architect approval in PROJECT.md `## Stack Exceptions`.

## Monorepo layout

```
apps/
├── frontend/          # Svelte + Vite + TypeScript
└── backend/           # Bun + Elysia + TypeScript

packages/
├── shared-types/
├── shared-utils/
├── eslint-config/
└── tsconfig/

docs/
infrastructure/
scripts/
```
