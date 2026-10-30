---
name: scaffold-plugin
description: Scaffold a new unified agent plugin with canonical manifest, shared components, and per-platform manifests. Use when adding a plugin to this marketplace or bootstrapping a company plugin from the example template.
---

# Scaffold plugin

## Trigger

Create a new plugin under `plugins/<name>/` in this repository.

## Required inputs

- Plugin name (kebab-case, e.g. `data-pipeline-kit`)
- One-line description
- Component set: any of `skills`, `agents`, `commands`, `rules`, `hooks`, `mcp`
- Target platforms: `cursor`, `claude`, `codex` (default: all three)

## Workflow

1. **Validate name** — lowercase kebab-case; must not collide with existing `plugins/` or `meta/` entries.
2. **Scaffold** — run from repo root:
   ```bash
   npm run scaffold -- <plugin-name> --description "..." --components skills,agents
   ```
   Or copy `templates/plugin-template/` manually and rename identifiers.
3. **Edit canonical manifest** — update `plugin.manifest.json` with real metadata and `components` paths.
4. **Add components** — create only the directories you enabled; each skill needs `skills/<skill-name>/SKILL.md`.
5. **Register in marketplace** — add an entry to `.marketplace/marketplace.json`, then run (this also generates `.agents/plugins/marketplace.json` and valid Codex adapters):
   ```bash
   npm run sync-marketplace
   ```
6. **Validate** — run `npm run validate` and fix any reported issues.

## Guardrails

- Define component content **once** under the plugin root; platform manifests only reference paths.
- Do not commit secrets in `.mcp.json` or hooks.
- Pin external plugin SHAs in `externalPlugins` when adding third-party bundles.
- Keep plugins focused on one use case.

## Output

- New plugin directory tree
- Updated marketplace entries
- Validation summary
