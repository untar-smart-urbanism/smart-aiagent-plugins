#!/usr/bin/env node
/**
 * List plugins and components for agent-driven installs.
 *
 * Usage:
 *   npm run list
 *   npm run list -- tech-radar
 *   npm run list -- --json
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN_ROOTS = [
  { label: "plugins", dir: path.join(ROOT, "plugins") },
  { label: "meta", dir: path.join(ROOT, "meta") },
];

function discoverPlugins(filterName) {
  const results = [];
  for (const { label, dir } of PLUGIN_ROOTS) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (filterName && entry.name !== filterName) continue;
      const pluginDir = path.join(dir, entry.name);
      const manifestPath = path.join(pluginDir, "plugin.manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      results.push({
        name: manifest.name,
        group: label,
        path: `${label}/${entry.name}`,
        description: manifest.description,
        platforms: manifest.platforms || [],
        components: manifest.components || {},
      });
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filter = args.find((a) => !a.startsWith("--"));

  const plugins = discoverPlugins(filter);

  if (asJson) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }

  if (plugins.length === 0) {
    console.log(filter ? `No plugin named '${filter}' found.` : "No plugins found.");
    return;
  }

  for (const p of plugins) {
    console.log(`\n${p.name} (${p.path})`);
    console.log(`  ${p.description}`);
    console.log(`  platforms: ${p.platforms.join(", ") || "—"}`);
    for (const [key, val] of Object.entries(p.components)) {
      console.log(`  ${key}: ${Array.isArray(val) ? val.join(", ") : val}`);
    }
  }

  console.log("\nInstall hints:");
  console.log("  Cursor:       /add-plugin <name>  or install from .cursor-plugin/marketplace.json");
  console.log("  Claude Code:  /plugin install <name>@smart-aiagent-plugins");
  console.log("  Codex:        codex plugin marketplace add acme-org-ops/smart-aiagent-plugins");
  console.log("  Component:    copy the listed path only (see AGENTS.md)");
}

main();
