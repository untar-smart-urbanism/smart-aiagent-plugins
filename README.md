# SMART-AIAGENT-PLUGINS

Unified company marketplace for agent plugins across **Cursor**, **Claude Code**, and **Codex**.

Inspired by [Anthropic's claude-plugins-official](https://github.com/anthropics/claude-plugins-official), [Cursor's plugins](https://github.com/cursor/plugins), and [OpenAI's plugins](https://github.com/openai/plugins) — combined into one layout so component content is defined **once** and installed per platform or per component.

> **Trust boundary:** Review every plugin (especially MCP servers and hooks) before installing in production. Team members need access to this private repository.

## Repository layout

```
SMART-AIAGENT-PLUGINS/          # repo: smart-aiagent-plugins
├── .marketplace/
│   └── marketplace.json          # Canonical marketplace (edit this)
├── .cursor-plugin/               # Cursor marketplace (synced)
├── .claude-plugin/               # Claude Code marketplace (synced)
├── .agents/plugins/              # Codex marketplace (synced)
├── plugins/                      # Internal company plugins
├── templates/
│   └── plugin-template/          # Scaffold source (not a marketplace plugin)
├── meta/
│   └── create-plugin/            # Meta plugin (hidden from marketplace; use npm run scaffold)
├── external_plugins/             # Docs for third-party git-subdir entries
├── schemas/                      # JSON schemas for manifests
└── scripts/                      # scaffold, validate, sync, list
```

## Unified plugin structure

Each plugin lives in `plugins/<name>/` (or `meta/<name>/` for tooling plugins):

```
plugins/my-plugin/
├── plugin.manifest.json          # Source of truth (components defined once)
├── .cursor-plugin/plugin.json    # Thin adapter — paths only
├── .claude-plugin/plugin.json
├── .codex-plugin/plugin.json
├── skills/<skill-name>/SKILL.md
├── agents/<agent>.md
├── commands/<command>.md
├── rules/<rule>.mdc
├── hooks.json
├── .mcp.json
└── README.md
```

**No duplication rule:** Skills, agents, commands, and rules live in one place. Platform manifests only reference paths from `plugin.manifest.json` → `components`.

## Quick start

### 1. Review org metadata

Review before publishing:

- `.marketplace/marketplace.json` (`owner`, URLs)
- Root `LICENSE` copyright line

### 2. Create a new plugin

```bash
npm run scaffold -- data-kit --description "Data pipeline skills for agents" --components skills,agents,mcp
npm run sync-marketplace
npm run validate
```

Or use the `create-plugin` meta plugin / `scaffold-plugin` skill with your agent.

### 3. Register and sync marketplace

Add entries to `.marketplace/marketplace.json`, then:

```bash
npm run sync-marketplace
```

This updates `.cursor-plugin/`, `.claude-plugin/`, and `.agents/plugins/` marketplace files, plus the Codex plugin adapters.

## Installation (by platform)

| Platform | Full plugin install |
|----------|---------------------|
| **Cursor** | `/add-plugin <name>` or browse marketplace from this repo |
| **Claude Code** | `claude plugin marketplace add acme-org-ops/smart-aiagent-plugins`, then `/plugin install <name>@smart-aiagent-plugins` |
| **Codex** | `codex plugin marketplace add acme-org-ops/smart-aiagent-plugins`, then `codex plugin add <name>@smart-aiagent-plugins` |

Team members need GitHub access to this private repository. Once changes reach the marketplace's tracked branch (normally `master`), Claude users run `/plugin marketplace update smart-aiagent-plugins` or `claude plugin update <name>@smart-aiagent-plugins`; Codex users run `codex plugin marketplace upgrade smart-aiagent-plugins` and `codex plugin add <name>@smart-aiagent-plugins` or use the Codex Plugins Directory. Start a new session after updating to load the new components. The Codex catalog is `.agents/plugins/marketplace.json`; `.codex-plugin/plugin.json` lives inside each plugin. Bump each changed plugin's version before publishing so hosted installs receive the update.

## Installation (by component)

Agents and humans can install **only what they need**:

```bash
# List all plugins and component paths
npm run list
npm run list -- tech-radar
npm run list -- --json
```

| Component | Typical target |
|-----------|----------------|
| `skills/` | `~/.cursor/skills/`, Claude/Codex skill dirs |
| `agents/` | Plugin or project `agents/` directory |
| `commands/` | Plugin commands directory |
| `rules/` | `.cursor/rules/` (Cursor) |
| `hooks.json` | Merge into project hooks config |
| `.mcp.json` | Merge into MCP config (review carefully) |

See [AGENTS.md](./AGENTS.md) for machine-readable install instructions.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run scaffold -- <name> [flags]` | Create plugin from `templates/plugin-template` |
| `npm run validate` | Check manifests, paths, marketplace consistency |
| `npm run sync-marketplace` | Propagate canonical marketplace to platform files |
| `npm run list [-- <plugin>] [--json]` | List components for selective install |

### Scaffold flags

```bash
npm run scaffold -- my-plugin \
  --description "Short description" \
  --components skills,agents,commands,rules,hooks,mcp \
  --target plugins   # or meta
```

## External plugins

Third-party plugins use `externalPlugins` in `.marketplace/marketplace.json` with `git-subdir` sources (Claude-style skill bundles). See [external_plugins/README.md](./external_plugins/README.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache-2.0 — see [LICENSE](./LICENSE). Individual plugins may declare their own license in `plugin.manifest.json`.
