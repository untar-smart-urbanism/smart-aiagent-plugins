/**
 * Ecosystem registry.
 *
 * A full adapter exposes: id, manifestFileNames (and optionally
 * manifestFilePattern / requirementsFilePattern), skipDirNames, classify(spec,
 * depth), parseManifest(filePath, content) -> { fields, fieldMeta? },
 * policyFile, resolveVersion(name, versionArg), and fetchLicense(name,
 * version). None of the last five are required to register an ecosystem —
 * see getCapabilities() below for the minimal "OSV-only" shape.
 *
 * parseManifest's fields values are either a raw spec string (the driver
 * calls classify() on it — npm's shape) or an already-classified result
 * object with a `.status` field (the driver uses it as-is — Python's shape,
 * since its grammar can't cleanly separate "get the raw spec" from
 * "classify it" the way npm's flat name->range JSON map can). fieldMeta, if
 * present, maps a field name to { policyKey } so severity is looked up by
 * the ecosystem's own policy-file keys rather than the raw field name (npm's
 * field names already equal its severity keys, so it never needs this).
 */

const fs = require("fs");
const path = require("path");

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");

const REGISTRY = { npm: require("./npm"), python: require("./python") };

function loadOsvConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, "data", "osv-config.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Basename matchers an ecosystem uses to find its manifests. */
function manifestMatchers(eco) {
  return {
    fileNames: eco.manifestFileNames || [],
    filePattern: eco.manifestFilePattern || eco.requirementsFilePattern || undefined,
    skipDirNames: eco.skipDirNames || [],
  };
}

function matchesManifestName(eco, basename) {
  const m = manifestMatchers(eco);
  if (m.fileNames.includes(basename)) return true;
  if (m.filePattern && m.filePattern.test(basename)) return true;
  return false;
}

/**
 * Resolve an ecosystem id or alias (npm, node, javascript, typescript, python, ...)
 * to its registry adapter and the OSV ecosystem string from data/osv-config.json.
 *
 * @param {string} [idOrAlias] - omit/empty to get the configured default (npm)
 * @returns {{ id: string, osvEcosystem: string, module: object }}
 */
function resolveEcosystem(idOrAlias) {
  const osvConfig = loadOsvConfig();
  const aliasMap = osvConfig.ecosystems || {};
  const defaultOsv = osvConfig.defaultEcosystem || "npm";

  const raw = String(idOrAlias || "").trim();
  if (!raw) {
    const fallback = REGISTRY.npm ? "npm" : Object.keys(REGISTRY)[0];
    return {
      id: fallback,
      osvEcosystem: aliasMap[fallback] || defaultOsv,
      module: REGISTRY[fallback],
    };
  }

  const key = raw.toLowerCase();

  // 1. Direct registry hit (the common case: --ecosystem npm / --ecosystem python).
  if (REGISTRY[key]) {
    return { id: key, osvEcosystem: aliasMap[key] || defaultOsv, module: REGISTRY[key] };
  }

  // 2. Alias hit — map the alias to its OSV string, then back to whichever
  //    registered ecosystem declares that same OSV string.
  const osvFromAlias =
    aliasMap[key] ||
    Object.values(aliasMap).find((v) => String(v).toLowerCase() === key) ||
    null;

  if (osvFromAlias) {
    for (const id of Object.keys(REGISTRY)) {
      if (String(aliasMap[id] || "").toLowerCase() === String(osvFromAlias).toLowerCase()) {
        return { id, osvEcosystem: osvFromAlias, module: REGISTRY[id] };
      }
    }
    // Known to OSV but no adapter registered yet (e.g. python before it lands).
    const err = new Error(
      `Ecosystem "${raw}" maps to OSV ecosystem "${osvFromAlias}" but no adapter is registered. ` +
        `Registered: ${Object.keys(REGISTRY).join(", ")}.`
    );
    err.code = "ECOSYSTEM_NOT_REGISTERED";
    throw err;
  }

  const err = new Error(
    `Unknown ecosystem "${raw}". Registered: ${Object.keys(REGISTRY).join(", ")}.`
  );
  err.code = "ECOSYSTEM_UNKNOWN";
  throw err;
}

/**
 * Which registered ecosystems have at least one manifest under `target`.
 *
 * Only ecosystems capable of the pinning check are considered: this list
 * feeds check-pinned-versions.js's auto-detected multi-ecosystem scan, and an
 * ecosystem without classify()/parseManifest()/policyFile has nothing for
 * that scan to call — see getCapabilities().
 *
 * @param {string} target - a directory to walk, or a single manifest file path
 * @returns {string[]} matching ecosystem ids (registry order)
 */
function detectEcosystem(target) {
  const found = [];
  if (!target || !fs.existsSync(target)) return found;

  let isDir = false;
  try {
    isDir = fs.statSync(target).isDirectory();
  } catch {
    return found;
  }

  // A single file: match on its basename only.
  if (!isDir) {
    const base = path.basename(target);
    for (const [id, eco] of Object.entries(REGISTRY)) {
      if (getCapabilities(eco).pinning && matchesManifestName(eco, base)) found.push(id);
    }
    return found;
  }

  const { findManifests } = require("../lib/walk-manifests");
  for (const [id, eco] of Object.entries(REGISTRY)) {
    if (!getCapabilities(eco).pinning) continue;
    const m = manifestMatchers(eco);
    if (!m.fileNames.length && !m.filePattern) continue;
    const hits = findManifests(target, m);
    if (hits.length > 0) found.push(id);
  }
  return found;
}

/**
 * Which of the three checks an adapter module actually supports, derived from
 * which functions/fields it exports rather than a separately hand-maintained
 * flag — one source of truth that can't drift out of sync with reality.
 *
 * A brand-new ecosystem needs only `id` + `resolveVersion` + an entry in
 * data/osv-config.json's `ecosystems` map to get a working single-package OSV
 * check via check-package.js ("a simple vulnerability check", per the
 * extensibility plan) — classify/parseManifest/policyFile (pinning) and
 * fetchLicense (license tiering) can be added later without touching this
 * file or any call site.
 *
 * @param {object} mod - an ecosystem adapter module (REGISTRY[id])
 * @returns {{ pinning: boolean, osv: boolean, license: boolean }}
 */
function getCapabilities(mod) {
  return {
    pinning: typeof mod.classify === "function" && typeof mod.parseManifest === "function" && !!mod.policyFile,
    osv: typeof mod.resolveVersion === "function",
    license: typeof mod.fetchLicense === "function",
  };
}

module.exports = { REGISTRY, resolveEcosystem, detectEcosystem, getCapabilities };
