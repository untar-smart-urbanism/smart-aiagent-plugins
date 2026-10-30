---
name: check-stack
description: Audit the current project against the company stack (golive-gate allowedStack) and the tech radar (gap-fillers, legacy ring). Also use when validating a stack the agent resolved via query-tech-stack.
---

# Check stack compliance

Audit this project against `allowedStack` (`plugins/golive-gate/data/build-contract.json`) and the `tech-radar` plugin. For greenfield work, run `query-tech-stack` first, then use this command to verify the result.

## Steps

1. Determine if this is a backend, frontend, or fullstack project.
2. Read `allowedStack` and `stackExceptions`, then `plugins/tech-radar/data/backend.json` and/or `data/frontend.json`.
3. Read PROJECT.md `## Vibe Start` (legacy if before 2026-10-07) and `## Stack Exceptions`.
4. Inspect `package.json` (root and workspaces), lockfiles, source imports, Docker/CI configs.
5. Map each technology to `allowedStack` and a radar ring.
6. Post-cutoff project: hold items or deviations without an approval row are violations. Legacy project: pre-existing hold items are advisory legacy notes. Major improvements (new module/service/workspace, DB migration/schema change, new frontend app, runtime/framework/ORM/DB swap, major framework upgrade) need a tech-architect approval row in every project.
7. For each violation, recommend the adopt alternative; deviations go to a tech architect, never a user override.

## Report

- Compliant technologies
- Violations (must fix or obtain tech-architect approval)
- Legacy notes (pre-existing hold technologies)
- Major improvements needing approval
- Suggested dependency changes (exact package names)
