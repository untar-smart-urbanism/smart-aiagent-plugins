# Contributing

## Adding an internal plugin

1. Scaffold from the example template:
   ```bash
   npm run scaffold -- my-plugin --description "What it does" --components skills,agents
   ```
2. Implement components under `plugins/my-plugin/`.
3. Confirm `.marketplace/marketplace.json` lists your plugin (scaffold does this automatically).
4. Sync and validate:
   ```bash
   npm run sync-marketplace
   npm run validate
   ```
5. Add a focused `plugins/my-plugin/README.md` with install notes.
6. Open a PR.

## Adding an external plugin

Do **not** vendor third-party code unless required. Instead, add an `externalPlugins` entry in `.marketplace/marketplace.json` with a pinned `sha`. See [external_plugins/README.md](./external_plugins/README.md).

## Naming

- Plugin names: kebab-case (`my-data-kit`)
- Skill directories: kebab-case, each with `SKILL.md`
- One plugin = one primary use case

## Review checklist

- [ ] No duplicated skill/agent bodies across platform folders
- [ ] MCP and hooks reviewed for safety
- [ ] `npm run validate` passes
- [ ] License declared in `plugin.manifest.json`
