---
name: create-plugin
description: Create a new plugin scaffold in the smart-aiagent-plugins marketplace repository.
---

Create a new plugin in this repository.

Ask for (if not provided):

1. Plugin name (kebab-case)
2. Short description
3. Components to include: skills, agents, commands, rules, hooks, mcp
4. Whether it is internal (`plugins/`) or meta (`meta/`)

Then:

1. Run `npm run scaffold -- <name> --description "<desc>" --components <list>`
2. Register the plugin in `.marketplace/marketplace.json`
3. Run `npm run sync-marketplace` and `npm run validate`
4. Summarize the created files and install commands for each platform
