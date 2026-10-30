#!/usr/bin/env node
/**
 * Diagnose marketplace duplication and drift.
 *
 * Read-only. Checks three things:
 *   1. Repo-side manifest integrity — duplicate plugin names/sources, missing source dirs.
 *   2. Sync drift — do .cursor-plugin / .claude-plugin / .agents/plugins marketplace.json
 *      match the canonical .marketplace/marketplace.json?
 *   3. Local install hygiene — does the user's ~/.claude/plugins/marketplaces/ cache hold
 *      more than one directory declaring this marketplace's name (the symptom behind
 *      "every plugin shows twice in the Directory"), or unregistered temp_* clones left
 *      behind by a marketplace install/update that didn't finish renaming its staging dir?
 *
 * This never deletes anything — it reports and prints the cleanup command.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CANONICAL_PATH = path.join(ROOT, ".marketplace", "marketplace.json");
const PLATFORM_FILES = [".cursor-plugin/marketplace.json", ".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"];

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

function info(msg) {
  console.log(msg);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// --- 1 & 2: repo-side integrity + sync drift -------------------------------------------

function checkRepo() {
  info("--- Repo-side manifest checks ---");

  if (!fs.existsSync(CANONICAL_PATH)) {
    error("Missing .marketplace/marketplace.json");
    return;
  }

  const canonical = readJson(CANONICAL_PATH);
  const allEntries = canonical.plugins || [];
  const visible = allEntries.filter((p) => !p.hidden);

  const seenNames = new Set();
  const seenSources = new Map();
  for (const entry of allEntries) {
    if (seenNames.has(entry.name)) {
      error(`Duplicate plugin name in .marketplace/marketplace.json: ${entry.name}`);
    }
    seenNames.add(entry.name);

    const normSource = entry.source.replace(/^\.\//, "");
    if (seenSources.has(normSource)) {
      error(
        `Duplicate source in .marketplace/marketplace.json: '${normSource}' used by both ` +
          `'${seenSources.get(normSource)}' and '${entry.name}'`
      );
    }
    seenSources.set(normSource, entry.name);

    if (!fs.existsSync(path.join(ROOT, normSource))) {
      error(`Source not found for '${entry.name}': ${entry.source}`);
    }
  }

  for (const rel of PLATFORM_FILES) {
    const p = path.join(ROOT, rel);
    const codex = rel.startsWith(".agents/");
    if (!fs.existsSync(p)) {
      warn(`Missing ${rel} — run npm run sync-marketplace`);
      continue;
    }

    const platform = readJson(p);
    const byName = new Map(platform.plugins.map((entry) => [entry.name, entry]));

    const platformSeen = new Set();
    for (const entry of platform.plugins) {
      if (platformSeen.has(entry.name)) {
        error(`Duplicate plugin name in ${rel}: ${entry.name}`);
      }
      platformSeen.add(entry.name);
    }

    for (const canonicalEntry of visible) {
      const match = byName.get(canonicalEntry.name);
      if (!match) {
        error(`${rel} is missing visible plugin '${canonicalEntry.name}'`);
        continue;
      }
      const source = codex ? match.source?.path : match.source;
      if (source !== canonicalEntry.source) {
        error(
          `${rel}: '${canonicalEntry.name}' source drifted from canonical ` +
            `(${source} vs ${canonicalEntry.source}) — run npm run sync-marketplace`
        );
      }
      if (!codex && match.description !== canonicalEntry.description) {
        warn(
          `${rel}: '${canonicalEntry.name}' description is stale — ` +
            `run npm run sync-marketplace`
        );
      }
    }

    for (const name of byName.keys()) {
      if (!visible.find((v) => v.name === name)) {
        warn(`${rel} has extra plugin not in canonical (or no longer visible): ${name}`);
      }
    }
  }

  info(`Canonical: ${visible.length} visible plugin(s), ${allEntries.length - visible.length} hidden.`);
}

// --- 3: local install hygiene -----------------------------------------------------------

function gitRemote(dir) {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "(no git remote)";
  }
}

function checkLocalInstall(marketplaceName) {
  info("\n--- Local install hygiene (~/.claude/plugins) ---");

  const claudeDir = path.join(os.homedir(), ".claude", "plugins");
  const marketplacesDir = path.join(claudeDir, "marketplaces");
  const knownPath = path.join(claudeDir, "known_marketplaces.json");

  if (!fs.existsSync(marketplacesDir)) {
    info("No ~/.claude/plugins/marketplaces directory found — skipping (not installed locally, or CI).");
    return;
  }

  let known = {};
  if (fs.existsSync(knownPath)) {
    try {
      known = readJson(knownPath);
    } catch (e) {
      warn(`Could not parse known_marketplaces.json: ${e.message}`);
    }
  } else {
    warn("known_marketplaces.json not found — cannot cross-check registered installs.");
  }

  const registeredLocations = new Set(
    Object.values(known)
      .map((entry) => entry.installLocation)
      .filter(Boolean)
      .map((p) => path.resolve(p))
  );

  const declaredBy = new Map(); // marketplace name -> [{dir, mtime}]
  const orphans = [];

  for (const entry of fs.readdirSync(marketplacesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(marketplacesDir, entry.name);
    const manifestPath = path.join(dir, ".claude-plugin", "marketplace.json");

    let declaredName = null;
    if (fs.existsSync(manifestPath)) {
      try {
        declaredName = readJson(manifestPath).name;
      } catch (e) {
        warn(`${entry.name}: invalid .claude-plugin/marketplace.json — ${e.message}`);
      }
    }

    const isRegistered = registeredLocations.has(path.resolve(dir));
    const stat = fs.statSync(dir);

    if (declaredName) {
      if (!declaredBy.has(declaredName)) declaredBy.set(declaredName, []);
      declaredBy.get(declaredName).push({ dir, mtime: stat.mtime });
    }

    if (!isRegistered) {
      orphans.push({ dir, declaredName, mtime: stat.mtime });
    }
  }

  let foundDuplication = false;
  for (const [name, dirs] of declaredBy.entries()) {
    if (dirs.length > 1) {
      foundDuplication = true;
      error(
        `Marketplace name '${name}' is declared by ${dirs.length} local directories — ` +
          `this is why every plugin shows duplicated in the Directory:`
      );
      for (const { dir, mtime } of dirs) {
        console.error(`    ${dir}  (modified ${mtime.toISOString()})`);
      }
    }
  }

  if (orphans.length > 0) {
    warn(`${orphans.length} directory(ies) under marketplaces/ are not registered in known_marketplaces.json:`);
    for (const { dir, declaredName, mtime } of orphans) {
      const remote = gitRemote(dir);
      console.warn(
        `    ${dir}  (declares: ${declaredName || "unknown"}, remote: ${remote}, modified ${mtime.toISOString()})`
      );
    }
    console.warn("\n  These are typically leftover staging clones from an install/update that didn't");
    console.warn("  finish renaming into place. Safe to remove if not referenced by known_marketplaces.json");
    console.warn("  or installed_plugins.json:\n");
    console.warn(
      "    rm -rf " + orphans.map(({ dir }) => JSON.stringify(dir)).join(" ")
    );
  }

  if (!foundDuplication && orphans.length === 0) {
    info("No duplicate or orphaned marketplace clones found.");
  }

  if (marketplaceName && declaredBy.has(marketplaceName) && declaredBy.get(marketplaceName).length === 1) {
    info(`'${marketplaceName}' is installed exactly once locally.`);
  }
}

function main() {
  const canonical = fs.existsSync(CANONICAL_PATH) ? readJson(CANONICAL_PATH) : null;
  checkRepo();
  checkLocalInstall(canonical?.name);

  console.log(`\nDoctor complete: ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) process.exit(1);
}

main();
