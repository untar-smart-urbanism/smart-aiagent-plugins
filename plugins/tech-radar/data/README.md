# Tech radar data

Machine-readable stack guidelines for the `tech-radar` plugin.

## Files

| File | Stack | Core layers |
|------|-------|-------------|
| `backend.json` | APIs, services, data, messaging | Pointer to `allowedStack` (Bun, Elysia, Drizzle, PostgreSQL) |
| `frontend.json` | Web UI, build, client libs | Pointer to `allowedStack` (Svelte, Vite, @acme/rnd-svelte.*) |

Both files carry `stackSource` (`plugins/golive-gate/data/build-contract.json#allowedStack`) and `exceptionPolicy` (`...#stackExceptions`). When they disagree with `allowedStack`, `allowedStack` wins.

## Roles of entries

- **adopt** core entries mirror `allowedStack` and are only pointers.
- **adopt/trial** gap-fillers cover concerns the stack does not: messaging, search, cache, storage, logging, infra.
- **hold** entries described "Legacy only (project Vibe Start before 2026-10-07) or tech-architect approval" form the legacy ring.
- BLUE DLS design tokens, BLUE Icon and BLUE Pattern Library are adopt for every stack.

## Origin

Adapted from [acme-org/tech-radar](https://github.com/acme-org/tech-radar) ([backend.json](https://github.com/acme-org/tech-radar/blob/main/backend.json), [frontend.json](https://github.com/acme-org/tech-radar/blob/main/frontend.json)); platform/technique rings kept.

## Version policy

1. Use `recommendedVersion` when present on an entry.
2. If no version is specified, use **latest stable** at time of implementation.

## Rings

- **adopt** - default for new work
- **trial** - allowed with justification
- **assess** - explore only, do not ship
- **hold** - legacy projects or tech-architect approval only

## Updating

Change core layers in `build-contract.json` `allowedStack` first, then mirror them here. Edit the JSON, bump `plugin.manifest.json` version, run `npm run validate` from repo root.
