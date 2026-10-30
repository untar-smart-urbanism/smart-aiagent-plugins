# Create plugin (meta)

Meta plugin for authoring new entries in this marketplace.

## Skills

| Skill | Purpose |
|-------|---------|
| `scaffold-plugin` | Generate a new plugin from the example template |

## Agents

| Agent | Purpose |
|-------|---------|
| `plugin-architect` | Design component layout for a new use case |

## Commands

| Command | Purpose |
|---------|---------|
| `create-plugin` | End-to-end scaffold + marketplace registration |

## Typical flow

1. Run `/create-plugin` (or ask an agent to use the `scaffold-plugin` skill)
2. Implement skills/agents/commands in the new `plugins/<name>/` directory
3. `npm run sync-marketplace && npm run validate`
4. Open a PR
