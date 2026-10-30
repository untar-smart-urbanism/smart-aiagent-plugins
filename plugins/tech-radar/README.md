# Tech Radar

Company technology guidelines that constrain coding agents to approved tools and frameworks.

## Purpose

The radar has three jobs:

1. **Pointer** - for the core layers, the single source of truth is `allowedStack` in `plugins/golive-gate/data/build-contract.json` (deviation policy: `stackExceptions`). The radar never restates a different stack.
2. **Gap-filler** - concerns the stack does not cover: messaging (Kafka), search (OpenSearch), cache (Memcached), object storage (GCS), logging (Pino), infra (Docker, Kubernetes, Consul, Vault).
3. **Legacy ring** - `hold` entries described "Legacy only (project Vibe Start before 2026-10-07) or tech-architect approval" (Node.js runtime, Express, Fastify, NestJS, Prisma, pg, Jest, Zod, Vue 3, BLUE DLS Vue 3 components, Vue Router, vue-query, Pinia, Vitest, NPM, PNPM, NGINX static serving).

Users should **not** need to specify runtimes, frameworks, or databases - agents read this plugin first.

## Agent behavior (automatic)

1. Read skill `query-tech-stack`, `allowedStack`, and `data/backend.json` / `data/frontend.json`
2. Propose a concrete default stack (no "which framework do you prefer?" prompts)
3. Use skill `check-tech-radar` before adding dependencies or finishing work
4. Reject hold-ring technologies unless the project is legacy or a tech-architect approval is recorded

The `tech-radar-enforcement` rule (`alwaysApply: true`) enforces this on every session.

## Components

| Component | Purpose |
|-----------|---------|
| `data/backend.json` | Backend adopt entries (Bun, Elysia, Drizzle, ...), gap-fillers, legacy hold |
| `data/frontend.json` | Frontend adopt entries (Svelte, rnd-svelte, BLUE tokens, ...), legacy Vue hold |
| Skill `check-tech-radar` | Audit code/deps for compliance, including legacy logic |
| Skill `query-tech-stack` | Answer what to use for greenfield work |
| Rule `tech-radar-enforcement` | Always-on agent constraint |
| Rules `tech-radar-backend/frontend` | File-scoped stack rules (`.svelte`, `.vue` for legacy) |
| Agent `tech-radar-guardian` | Stack enforcement subagent |
| Command `check-stack` | Project compliance audit |

## Install

```text
# Cursor
/add-plugin tech-radar

# Claude Code
/plugin install tech-radar@smart-aiagent-plugins
```

## Default greenfield stack (from allowedStack)

**Backend:** Bun · TypeScript · Elysia · Drizzle (drizzle-kit) · PostgreSQL (PGlite for hermetic tests only) · bun test
**Frontend:** Svelte · Vite · svelte-check · @acme/rnd-svelte.* · Bun · Playwright
**Design foundation (every stack):** @acme/blue-design-tokens · BLUE Icon · BLUE Pattern Library. Only the BLUE DLS Vue 3 component package is legacy.

## Legacy and approvals

- PROJECT.md `## Vibe Start` before 2026-10-07: legacy. The project may keep and maintain its existing stack; deviations are advisory legacy notes.
- Major improvements (new module/service/workspace, DB migrations/schema changes, new frontend app, runtime/framework/ORM/DB swap, major framework upgrade) always need tech-architect approval, even on the allowed stack.
- Approvals come only from a tech architect (Tech Architecture Group), recorded in PROJECT.md `## Stack Exceptions`. A user, requester, or agent cannot override.

## Version 2.1 migration

Version 2.1.0 realigns the radar with `allowedStack`. Node.js, Express, Vue 3 and BLUE DLS Vue 3 components move from adopt to legacy `hold`; Bun, Elysia, Drizzle, Svelte and @acme/rnd-svelte.* are adopt. BLUE design tokens, icons and patterns remain mandatory. React, Angular, Nuxt and jQuery descriptions now point to Svelte.

## Audit a project

```text
/check-stack
```

Or ask the agent to use the `check-tech-radar` skill.
