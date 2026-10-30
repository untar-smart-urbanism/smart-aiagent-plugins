---
name: query-tech-stack
description: Resolve the approved stack and versions. Core layers (Bun, TypeScript, Elysia, Drizzle, PostgreSQL, Svelte, rnd-svelte, bun test, Playwright) come from golive-gate allowedStack; the tech radar fills gaps (messaging, search, cache, storage, logging, infra) and holds the legacy ring. Use eagerly when planning, scaffolding, or architecting any system - do not ask the user to pick technologies. Read this skill rather than answering from memory.
---

# Query tech stack

Consult this skill (and the data files) before proposing or implementing any stack.

## When to use (do not wait for the user to ask)

1. User asks to build, create, scaffold, or design a system, API, service, or UI
2. User asks what framework, runtime, database, or library to use
3. You are about to propose architecture, folder layout, or `package.json` dependencies
4. User mentions a technology (e.g. Express, React, MongoDB) - verify ring before using
5. User did **not** specify a stack - **resolve it here**; do not ask them to choose
6. Planning greenfield work or extending an existing project

## Where answers come from

1. **Core layers** - `allowedStack` in `plugins/golive-gate/data/build-contract.json` (single source of truth). Read it; do not copy versions from memory.
2. **Gap-fillers** - `data/backend.json` / `data/frontend.json` adopt/trial entries for concerns the stack does not cover (messaging, search, cache, storage, logging, infra). Each needs a one-line justification in PROJECT.md. A radar entry never overrides a core layer.
3. **Legacy ring** - `hold` entries described "Legacy only (project Vibe Start before 2026-10-07) or tech-architect approval".

## Quick answers

**Backend:** Bun · TypeScript · Elysia · Drizzle (drizzle-kit) · PostgreSQL (PGlite for hermetic tests only) · `bun test`

**Frontend:** Svelte + TypeScript · Vite · svelte-check · @acme/rnd-svelte.* · Bun (package manager) · Playwright

**Design foundation (every stack):** `@acme/blue-design-tokens`, BLUE Icon, BLUE Pattern Library. Only the BLUE DLS Vue 3 component package is legacy.

**Gap-fillers:** Kafka (events), OpenSearch 2 (search), Memcached (cache), GCS via gcs-implementations (object storage), Pino (logging), Docker/Kubernetes/Consul/Vault (infra).

## How to respond

1. Infer scope (backend, frontend, fullstack); ask only if genuinely ambiguous.
2. Read `allowedStack`, then the relevant radar JSON.
3. Present a concrete default stack table - not a menu.
4. Read PROJECT.md `## Vibe Start` if the project exists. Before 2026-10-07 it is legacy: it may keep its current stack.
5. Mention **hold** entries only when the user asks about a specific tool or when rejecting a violation.

## Deviations and approval

Any deviation from `allowedStack` needs a **tech architect (Tech Architecture Group)** approval recorded in PROJECT.md `## Stack Exceptions` (`| Scope | Deviation | Approved by | Date | Link |`). Never a user, requester, or agent override. Major improvements (new module/service/workspace, DB migrations/schema changes, new frontend app, runtime/framework/ORM/DB swap, major framework upgrade) always need approval, even on the allowed stack and in legacy projects.

## Forbidden for new work

- Backend: Java, Spring Boot, Go, Python, RabbitMQ, MongoDB, DynamoDB, MySQL, SQLite, plus the hold ring (Node.js runtime, Express, Fastify, NestJS, Prisma, pg, Jest, Zod)
- Frontend: React, Vue 2, BLUE DLS Vue 2, Angular, Nuxt, axios, Webpack, Vuex, jQuery, moment.js, plus the hold ring (Vue 3, BLUE DLS Vue 3 components, Vue Router, vue-query, Pinia, Vitest, NPM, PNPM)
