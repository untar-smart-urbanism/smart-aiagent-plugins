#!/usr/bin/env node
/**
 * Scaffold a new plugin from templates/plugin-template.
 *
 * Usage:
 *   npm run scaffold -- my-plugin --description "Does X" --components skills,agents,mcp
 *   npm run scaffold -- my-plugin --target meta
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "templates", "plugin-template");
const KEBAB = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function copyDir(src, dest, replacements) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      let content = fs.readFileSync(srcPath, "utf8");
      for (const [from, to] of replacements) {
        content = content.split(from).join(to);
      }
      fs.writeFileSync(destPath, content, "utf8");
    }
  }
}

function pruneComponents(pluginDir, components) {
  const all = ["skills", "agents", "commands", "rules", "hooks", "mcp"];
  const enabled = new Set(components);

  if (!enabled.has("skills")) {
    fs.rmSync(path.join(pluginDir, "skills"), { recursive: true, force: true });
  }
  if (!enabled.has("agents")) {
    fs.rmSync(path.join(pluginDir, "agents"), { recursive: true, force: true });
  }
  if (!enabled.has("commands")) {
    fs.rmSync(path.join(pluginDir, "commands"), { recursive: true, force: true });
  }
  if (!enabled.has("rules")) {
    fs.rmSync(path.join(pluginDir, "rules"), { recursive: true, force: true });
  }
  if (!enabled.has("hooks")) {
    fs.rmSync(path.join(pluginDir, "hooks.json"), { force: true });
  }
  if (!enabled.has("mcp")) {
    fs.rmSync(path.join(pluginDir, ".mcp.json"), { force: true });
  }

  const manifestPath = path.join(pluginDir, "plugin.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const nextComponents = {};
  if (enabled.has("skills")) nextComponents.skills = "./skills/";
  if (enabled.has("agents")) nextComponents.agents = "./agents/";
  if (enabled.has("commands")) nextComponents.commands = "./commands/";
  if (enabled.has("rules")) nextComponents.rules = "./rules/";
  if (enabled.has("hooks")) nextComponents.hooks = "./hooks.json";
  if (enabled.has("mcp")) nextComponents.mcp = "./.mcp.json";
  manifest.components = nextComponents;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  updatePlatformManifests(pluginDir, nextComponents);
}

function updatePlatformManifests(pluginDir, components) {
  const cursorPath = path.join(pluginDir, ".cursor-plugin", "plugin.json");
  if (fs.existsSync(cursorPath)) {
    const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8"));
    delete cursor.skills;
    delete cursor.agents;
    delete cursor.commands;
    delete cursor.rules;
    delete cursor.hooks;
    delete cursor.mcpServers;
    if (components.skills) cursor.skills = components.skills;
    if (components.agents) cursor.agents = components.agents;
    if (components.commands) cursor.commands = components.commands;
    if (components.rules) cursor.rules = components.rules;
    if (components.hooks) cursor.hooks = components.hooks;
    if (components.mcp) cursor.mcpServers = components.mcp;
    fs.writeFileSync(cursorPath, JSON.stringify(cursor, null, 2) + "\n");
  }

  const codexPath = path.join(pluginDir, ".codex-plugin", "plugin.json");
  if (fs.existsSync(codexPath)) {
    const codex = JSON.parse(fs.readFileSync(codexPath, "utf8"));
    delete codex.skills;
    delete codex.apps;
    delete codex.mcpServers;
    if (components.skills) codex.skills = components.skills;
    if (components.mcp) codex.mcpServers = components.mcp;
    fs.writeFileSync(codexPath, JSON.stringify(codex, null, 2) + "\n");
  }
}

function addMarketplaceEntry(name, description, source, category = "developer-tools") {
  const marketplacePath = path.join(ROOT, ".marketplace", "marketplace.json");
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  if (marketplace.plugins.some((p) => p.name === name)) {
    console.log(`Marketplace entry '${name}' already exists — skipping.`);
    return;
  }
  marketplace.plugins.push({
    name,
    source,
    description,
    category,
    keywords: [],
    platforms: ["cursor", "claude", "codex"],
  });
  fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\n");
  console.log(`Added marketplace entry for '${name}'. Run: npm run sync-marketplace`);
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const name = positional[0];
  if (!name) {
    console.error("Usage: npm run scaffold -- <plugin-name> [--description \"...\"] [--components skills,agents] [--target plugins|meta]");
    process.exit(1);
  }
  if (!KEBAB.test(name)) {
    console.error(`Invalid plugin name '${name}'. Use kebab-case.`);
    process.exit(1);
  }

  const target = flags.target === "meta" ? "meta" : "plugins";
  const dest = path.join(ROOT, target, name);
  if (fs.existsSync(dest)) {
    console.error(`Plugin directory already exists: ${dest}`);
    process.exit(1);
  }

  const displayName = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const description =
    flags.description || `TODO: describe ${name}`;
  const components = (flags.components || "skills")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const replacements = [
    ["plugin-template", name],
    ["Plugin Template", displayName],
    ["TODO: describe this plugin", description],
    ["template-skill", `${name}-skill`],
    ["template-agent", `${name}-agent`],
    ["template-command", `${name}-command`],
    ["template-rule", `${name}-rule`],
  ];

  copyDir(TEMPLATE, dest, replacements);
  pruneComponents(dest, components);

  const source = target === "meta" ? `./meta/${name}` : `./plugins/${name}`;
  addMarketplaceEntry(name, description, source);

  console.log(`\nCreated plugin at: ${dest}`);
  console.log(`Components: ${components.join(", ")}`);
  console.log("\nNext steps:");
  console.log("  1. Edit plugin.manifest.json and component files");
  console.log("  2. npm run sync-marketplace");
  console.log("  3. npm run validate");
}

main();
