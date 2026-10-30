# Agent instructions — SMART-AIAGENT-PLUGINS marketplace

This file helps coding agents discover, install, and author plugins in this repository.

## Repository purpose

Multi-platform plugin marketplace. Component content (skills, agents, commands, rules, hooks, MCP) is authored **once** per plugin under `plugins/<name>/`. Platform manifests are thin adapters.

## Discovery commands

Run from repository root:

```bash
npm run list              # all plugins + component paths
npm run list -- <name>    # single plugin
npm run list -- --json    # machine-readable output
npm run validate          # structural checks before PRs
```

Canonical marketplace: `.marketplace/marketplace.json`

## Install full plugin

| Platform | Command / source |
|----------|------------------|
| Cursor | `/add-plugin <plugin-name>` — marketplace: `.cursor-plugin/marketplace.json` |
| Claude Code | `claude plugin marketplace add acme-org-ops/smart-aiagent-plugins`, then `/plugin install <plugin-name>@smart-aiagent-plugins` — marketplace: `.claude-plugin/marketplace.json` |
| Codex | `codex plugin marketplace add acme-org-ops/smart-aiagent-plugins`, then `codex plugin add <plugin-name>@smart-aiagent-plugins` — marketplace: `.agents/plugins/marketplace.json` |

## Install by component

Use `npm run list -- <plugin-name>` to resolve paths, then copy or symlink only the needed component.

### Skills

- Source: `plugins/<name>/skills/<skill-name>/` (contains `SKILL.md`)
- Cursor: copy to `~/.cursor/skills/<skill-name>/` or install full plugin
- Claude: registered as `<plugin-name>:<skill-name>` when plugin installed
- Do not duplicate SKILL.md into platform manifest directories

### Agents

- Source: `plugins/<name>/agents/*.md`
- Install with full plugin or copy into project agent directory per platform docs

### Commands

- Source: `plugins/<name>/commands/*.md`

### Rules (Cursor)

- Source: `plugins/<name>/rules/*.mdc`
- Copy to `.cursor/rules/` or install full plugin

### Hooks

- Source: `plugins/<name>/hooks.json`
- Merge into existing hooks config; do not blind overwrite

### MCP

- Source: `plugins/<name>/.mcp.json`
- Merge into user/project MCP config
- **Never** commit API keys; use env var substitution per platform docs

## Author a new plugin

Preferred path:

1. Read `meta/create-plugin/skills/scaffold-plugin/SKILL.md`
2. Run `npm run scaffold -- <kebab-name> --description "..." --components skills,agents`
3. Edit `plugins/<name>/plugin.manifest.json` and component files
4. Ensure `.marketplace/marketplace.json` contains the entry (scaffold adds it)
5. Run `npm run sync-marketplace` and `npm run validate`; sync regenerates Codex adapters with the required interface metadata

Reference template: `templates/plugin-template/`

## Quality gates

Before finishing plugin work:

- [ ] `plugin.manifest.json` is canonical; platform JSON files reference same paths
- [ ] Every `components.*` path exists on disk
- [ ] Skills have `SKILL.md` with `name` and `description` frontmatter
- [ ] No secrets in repo
- [ ] `npm run validate` passes

## Key files

| File | Role |
|------|------|
| `plugin.manifest.json` | Single source of truth per plugin |
| `.marketplace/marketplace.json` | Canonical marketplace index |
| `schemas/plugin-manifest.schema.json` | Manifest shape |
| `schemas/marketplace.schema.json` | Marketplace shape |

## Marketplace name

Default marketplace id: `smart-aiagent-plugins` (SMART-AIAGENT-PLUGINS). Claude install suffix: `@smart-aiagent-plugins`.

Update this file if your fork renames the marketplace.

## Current policy and platform sources

- For classification, use `plugins/golive-gate/data/risk-criteria.json`: individual customer/seller names, direct emails, and phones are PII; legal-entity names and generic company channels are business data. Named business-partner representatives remain identifiable people unless GRC/Information Security documents an exception. Daily purchase/sales order items and values not linked to a customer are internal operational data, even in a database; customer transaction history, complaints, and feedback are Restricted; assess payment and other High-risk functions separately. Do not attribute the 2026-09-26 owner update to the earlier 2026-07-29 GRC confirmation.
- The October 2026 change-management procedure is reflected in `risk-criteria.json` (`dataClassification` four levels, `pdpRules` UU PDP 27/2022 with DPIA for specific personal data, `triage` inbound/outbound/mass deployment → Tech & InfoSec review, `bptConfirmation` BPT confirms the final level up or down, High `formalApproval` by one named approver) and `golive-gate.json` (`bpt-risk-confirmed`, `triage-review`, `data-classification-recorded`, `dpia-recorded`, `ai-usage-recorded`, advisory 14-day `review-lead-time`). `/start-vibe` writes `docs/REGISTRATION.json` (`registration-doc.json`) for the Alpha Projects Registry form.
- `devops-ai@platform.local` is an expected internal automation contributor under `plugins/code-review/data/trusted-automation.json`. Its email is spoofable attestation, not proof of authorization or an exemption from content review, independent review, or production approval.
- SRE owns the backup pipeline or method. Record missing details as a follow-up in `PROJECT.md`; `backup-recovery` is advisory and does not block release by itself. Keep application rollback instructions separate.
- Allowed stack: `allowedStack` in `plugins/golive-gate/data/build-contract.json` is the single source of truth (Bun, TypeScript, Elysia, Drizzle, PostgreSQL, Svelte + Vite, `@acme/rnd-svelte.*` UI, `bun test` + Playwright). Design tokens and visual language stay BLUE DLS (`@acme/blue-design-tokens`, BLUE Icon, BLUE Pattern Library). Deviations follow `stackExceptions`: tech architect (Tech Architecture Group) approval recorded in PROJECT.md `## Stack Exceptions`; projects with `## Vibe Start` before 2026-10-07 are legacy and may keep their stack, but major improvements (new module/service/workspace, DB migrations/schema changes, new frontend app, runtime/framework/ORM/DB swap, major framework upgrade) always need approval. The `stack-allowed` check enforces this.
- The platform `deployment-<app>` GitOps repository is accessible only to the SRE/platform team. App teams and agents cannot verify it (a 404 means no access as often as absence); never infer onboarding state from it. Confirm with SRE/platform.
- The generated `AGENTS.md` and `CLAUDE.md` use the single source `plugins/project-scaffold/skills/new-repo-init/assets/CLAUDE.template.md`; update that template for project-wide agent instructions.
