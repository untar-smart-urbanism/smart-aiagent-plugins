#!/usr/bin/env node
/**
 * Validate plugin structure and marketplace consistency.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PLUGIN_ROOTS = [
  path.join(ROOT, "plugins"),
  path.join(ROOT, "meta"),
];

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
  warnings++;
}

function fileExists(p) {
  return fs.existsSync(p);
}

function resolveComponent(pluginDir, relPath) {
  return path.join(pluginDir, relPath.replace(/^\.\//, ""));
}

function validatePlugin(pluginDir) {
  const name = path.basename(pluginDir);
  const manifestPath = path.join(pluginDir, "plugin.manifest.json");

  if (!fileExists(manifestPath)) {
    error(`${name}: missing plugin.manifest.json`);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    error(`${name}: invalid plugin.manifest.json — ${e.message}`);
    return;
  }

  if (manifest.name !== name) {
    warn(`${name}: manifest.name (${manifest.name}) differs from directory name`);
  }

  const platforms = [
    [".cursor-plugin/plugin.json", "cursor"],
    [".claude-plugin/plugin.json", "claude"],
    [".codex-plugin/plugin.json", "codex"],
  ];

  for (const [rel, platform] of platforms) {
    if (!fileExists(path.join(pluginDir, rel))) {
      if (manifest.platforms?.includes(platform)) {
        error(`${name}: missing ${rel} but platform '${platform}' is listed`);
      }
    }
  }

  if (manifest.platforms?.includes("codex")) {
    const codexPath = path.join(pluginDir, ".codex-plugin", "plugin.json");
    if (fileExists(codexPath)) {
      const codex = JSON.parse(fs.readFileSync(codexPath, "utf8"));
      if (codex.name !== name || codex.version !== manifest.version) {
        error(`${name}: Codex manifest name/version differs from canonical manifest`);
      }
      for (const key of ["agents", "commands", "rules", "hooks"]) {
        if (key in codex) error(`${name}: unsupported Codex manifest field '${key}'`);
      }
      for (const key of ["displayName", "shortDescription", "longDescription", "developerName", "category", "capabilities", "defaultPrompt"]) {
        if (!codex.interface?.[key]) error(`${name}: Codex interface missing '${key}'`);
      }
    }
  }

  const components = manifest.components || {};
  for (const [key, relPath] of Object.entries(components)) {
    if (!relPath) continue;
    const paths = Array.isArray(relPath) ? relPath : [relPath];
    for (const p of paths) {
      const full = resolveComponent(pluginDir, p);
      if (!fileExists(full)) {
        error(`${name}: component '${key}' path not found: ${p}`);
      }
    }
  }

  const skillsDir = path.join(pluginDir, "skills");
  if (fileExists(skillsDir)) {
    for (const skill of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      const skillMd = path.join(skillsDir, skill.name, "SKILL.md");
      if (!fileExists(skillMd)) {
        error(`${name}: skill '${skill.name}' missing SKILL.md`);
      }
    }
  }
}

function validateMarketplace() {
  const marketplacePath = path.join(ROOT, ".marketplace", "marketplace.json");
  if (!fileExists(marketplacePath)) {
    error("Missing .marketplace/marketplace.json");
    return;
  }

  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
  const seen = new Set();

  for (const entry of marketplace.plugins || []) {
    if (seen.has(entry.name)) {
      error(`Duplicate marketplace plugin name: ${entry.name}`);
    }
    seen.add(entry.name);

    const sourcePath = path.join(ROOT, entry.source.replace(/^\.\//, ""));
    if (!fileExists(sourcePath)) {
      error(`Marketplace source not found for '${entry.name}': ${entry.source}`);
    }
    if (!fileExists(path.join(sourcePath, "plugin.manifest.json"))) {
      error(`Marketplace entry '${entry.name}' missing plugin.manifest.json at source`);
    }
  }

  const platformFiles = [".cursor-plugin/marketplace.json", ".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"];
  for (const rel of platformFiles) {
    const p = path.join(ROOT, rel);
    if (!fileExists(p)) {
      error(`Missing ${rel} — run npm run sync-marketplace`);
      continue;
    }
    const platform = JSON.parse(fs.readFileSync(p, "utf8"));
    const expected = (marketplace.plugins || []).filter((entry) => !entry.hidden && (rel !== ".agents/plugins/marketplace.json" || entry.platforms?.includes("codex")));
    if (platform.name !== marketplace.name || platform.plugins?.length !== expected.length) {
      error(`${rel}: marketplace identity or plugin count differs from canonical source`);
      continue;
    }
    for (const [index, entry] of expected.entries()) {
      const actual = platform.plugins[index];
      const source = rel === ".agents/plugins/marketplace.json" ? actual?.source?.path : actual?.source;
      if (actual?.name !== entry.name || source !== entry.source) {
        error(`${rel}: plugin '${entry.name}' is missing, out of order, or points to the wrong source`);
      }
      if (rel !== ".agents/plugins/marketplace.json" && actual?.description !== entry.description) {
        error(`${rel}: plugin '${entry.name}' description differs from canonical source`);
      }
      if (rel === ".agents/plugins/marketplace.json" &&
          (actual?.source?.source !== "local" || actual?.policy?.installation !== "AVAILABLE" ||
           actual?.policy?.authentication !== "ON_INSTALL" || !actual?.category)) {
        error(`${rel}: Codex entry '${entry.name}' has invalid source, policy, or category`);
      }
    }
  }
}

function main() {
  for (const root of PLUGIN_ROOTS) {
    if (!fileExists(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      validatePlugin(path.join(root, entry.name));
    }
  }

  validateMarketplace();

  console.log(`\nValidation complete: ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) process.exit(1);
}

main();
