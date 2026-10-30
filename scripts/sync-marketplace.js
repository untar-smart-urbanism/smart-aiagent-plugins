#!/usr/bin/env node
/**
 * Sync .marketplace/marketplace.json → per-platform marketplace.json files.
 * Codex uses the repository catalog at .agents/plugins/marketplace.json.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, ".marketplace", "marketplace.json");

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function main() {
  const canonical = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const visiblePlugins = (canonical.plugins || []).filter((p) => !p.hidden);

  const cursor = {
    name: canonical.name,
    owner: {
      name: canonical.owner?.name,
      url: canonical.owner?.url,
    },
    metadata: canonical.metadata,
    plugins: visiblePlugins.map((p) => ({
      name: p.name,
      source: p.source,
      description: p.description,
    })),
  };

  const claude = {
    name: canonical.name,
    owner: {
      name: canonical.owner?.name,
      url: canonical.owner?.url,
    },
    description: canonical.metadata?.description,
    plugins: visiblePlugins.map((p) => ({
      name: p.name,
      description: p.description,
      source: p.source,
      category: p.category || "developer-tools",
    })),
  };

  const codex = {
    name: canonical.name,
    interface: {
      displayName: "OPS AI Agent Plugins",
    },
    plugins: visiblePlugins.filter((p) => p.platforms?.includes("codex")).map((p) => ({
      name: p.name,
      source: { source: "local", path: p.source },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Developer Tools",
    })),
  };

  writeJson(path.join(ROOT, ".cursor-plugin", "marketplace.json"), cursor);
  writeJson(path.join(ROOT, ".claude-plugin", "marketplace.json"), claude);
  writeJson(path.join(ROOT, ".agents", "plugins", "marketplace.json"), codex);

  // Codex accepts a smaller manifest vocabulary than Cursor/Claude. Build its
  // adapter from the canonical plugin manifest so unsupported fields cannot
  // silently break installs after a plugin is scaffolded or version-bumped.
  let codexManifestCount = 0;
  for (const entry of canonical.plugins || []) {
    if (!entry.platforms?.includes("codex")) continue;
    const pluginDir = path.join(ROOT, entry.source.replace(/^\.\//, ""));
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "plugin.manifest.json"), "utf8"));
    const displayName = manifest.displayName || manifest.name;
    const codexPlugin = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: { name: manifest.author?.name || canonical.owner?.name },
      homepage: manifest.homepage,
      repository: manifest.repository,
      license: manifest.license,
      keywords: manifest.keywords || [],
      ...(manifest.components?.skills ? { skills: manifest.components.skills } : {}),
      ...(manifest.components?.mcp ? { mcpServers: manifest.components.mcp } : {}),
      interface: {
        displayName,
        shortDescription: manifest.description.split(/[.!?] /)[0].slice(0, 120),
        longDescription: manifest.description,
        developerName: manifest.author?.name || canonical.owner?.name,
        category: "Developer Tools",
        capabilities: ["Interactive"],
        defaultPrompt: [`Help me use ${displayName} in this repository.`],
      },
    };
    writeJson(path.join(pluginDir, ".codex-plugin", "plugin.json"), codexPlugin);
    codexManifestCount++;
  }

  console.log("Synced marketplace manifests:");
  console.log("  .cursor-plugin/marketplace.json");
  console.log("  .claude-plugin/marketplace.json");
  console.log("  .agents/plugins/marketplace.json");
  const hiddenCount = (canonical.plugins || []).length - visiblePlugins.length;
  console.log(`  ${visiblePlugins.length} visible plugin(s)`);
  console.log(`  ${codexManifestCount} Codex plugin manifest(s)`);
  if (hiddenCount > 0) {
    console.log(`  ${hiddenCount} hidden plugin(s) (not synced to platform manifests)`);
  }
}

main();
