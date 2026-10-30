---
name: scaffold-monorepo
description: Scaffold or extend a monorepo project with the company-standard apps/, packages, and module layout. Use after plan-code-structure when creating a new project, adding feature modules, or fixing missing directories in existing projects.
---

# Scaffold monorepo

Run **after** `plan-code-structure` has resolved paths. Use during greenfield setup or when `/fix-structure` identifies missing directories.

## Root layout

Create this structure for new projects:

```
.
├── apps/
│   ├── frontend/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── App.svelte
│   │       ├── app.d.ts
│   │       ├── api/
│   │       ├── pages/
│   │       └── lib/
│   │           ├── components/
│   │           ├── features/
│   │           ├── stores/
│   │           ├── layouts/
│   │           ├── utils/
│   │           └── types/
│   └── backend/
│       ├── drizzle.config.ts
│       └── src/
│           ├── index.ts
│           ├── modules/
│           ├── config/
│           ├── plugins/
│           ├── database/
│           │   ├── schema/
│           │   └── migrations/
│           ├── utils/
│           └── types/
├── packages/
│   ├── shared-types/
│   ├── shared-utils/
│   ├── eslint-config/
│   └── tsconfig/
├── docs/
├── infrastructure/
└── scripts/
```

## New backend feature module

```
apps/backend/src/modules/<feature>/
├── routes.ts       # Elysia chained plugin
├── model.ts        # TypeBox schemas
├── service.ts
├── repository.ts   # Drizzle
└── types.ts
```

Mount the plugin with `.use(<feature>Routes)` inside the single fluent chain in `index.ts` (keep `export type App = typeof app`). Add tables under `database/schema/` and generate migrations with drizzle-kit. Import shared types from `@repo/shared-types` (or workspace package name).

## New frontend feature

```
apps/frontend/src/lib/features/<feature>/
├── components/
├── <FeatureName>.svelte
├── <feature>.svelte.ts   # runes state, or use lib/stores/
└── index.ts
```

Add a page in `pages/` that composes the feature. API calls go through the Eden client in `api/<feature>.ts`. UI comes from `@acme/rnd-svelte.*`, themed with `@acme/blue-design-tokens`.

## Shared code rule

Before creating a type or util in an app, ask: **will the other app need this?**

- Yes → `packages/shared-types` or `packages/shared-utils`
- No → app-local `types/` or `utils/`

## Package manager

Use **Bun workspaces**: root `package.json` with `"workspaces": ["apps/*", "packages/*"]`, install with `bun install --frozen-lockfile`, commit `bun.lock`. Do not create `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`.

## Stack and legacy

The stack comes from `golive-gate` `data/build-contract.json` `allowedStack`. Do not scaffold the new layout into a legacy project (Vibe Start before 2026-10-07) unless a tech-architect approval is recorded in PROJECT.md `## Stack Exceptions`; extend its existing structure instead.
