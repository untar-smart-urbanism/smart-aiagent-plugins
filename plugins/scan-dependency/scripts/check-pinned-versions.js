#!/usr/bin/env node
/**
 * Check declared dependency version specifiers are exact-pinned, not floating.
 *
 * A floating specifier (^1.2.3, latest, a git branch ref, "") lets the package
 * manager re-resolve to a different package at install time. That is the mechanism
 * behind real supply-chain incidents (event-stream 2018, ua-parser-js 2021): the
 * audited version and the installed version are not the same artifact.
 *
 * Usage: node check-pinned-versions.js [path-to-manifest-or-dir] [--ecosystem <id>]
 *
 * The ecosystem adapter (manifest names, dependency fields, specifier
 * classification, policy file) comes from scripts/ecosystems/. With no
 * --ecosystem flag the ecosystem is auto-detected from the manifests present,
 * defaulting to npm.
 *
 * Severity per dependency field and the fail/warn split are read from the
 * ecosystem's policy file in data/ — nothing is hardcoded here.
 */

const fs = require("fs");
const path = require("path");

const { findManifests } = require("./lib/walk-manifests");
const { evaluate } = require("./lib/severity-verdict");
const { REGISTRY, resolveEcosystem, detectEcosystem, getCapabilities } = require("./ecosystems");

const PLUGIN_ROOT = path.resolve(__dirname, "..");
const SEVERITY_ORDER = ["HIGH", "MEDIUM", "INFORMATIONAL"];

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, rel), "utf8"));
}

function displayPath(file) {
  const rel = path.relative(process.cwd(), file);
  return !rel || rel.startsWith("..") ? file : rel;
}

function describe(result) {
  return result.note ? `${result.reason} (${result.note})` : result.reason;
}

/** `[path] [--ecosystem <id>]` in any order. */
function parseArgs(argv) {
  let ecosystem = null;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ecosystem") {
      ecosystem = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--ecosystem=")) {
      ecosystem = arg.slice("--ecosystem=".length);
    } else {
      positional.push(arg);
    }
  }
  return { ecosystem, targetPath: positional[0] };
}

/** Human label for this ecosystem's manifests, used throughout the report. */
function manifestLabel(eco) {
  return eco.manifestLabel || (eco.manifestFileNames || []).join("/") || "manifest";
}

function manifestMatchers(eco) {
  return {
    fileNames: eco.manifestFileNames || [],
    filePattern: eco.manifestFilePattern || eco.requirementsFilePattern || undefined,
    skipDirNames: eco.skipDirNames || [],
  };
}

/** Walk, parse, and classify every declared dependency for one ecosystem. */
function scanEcosystem(eco, root, policy) {
  const severityMap = policy.severity || {};

  const manifests = fs.statSync(root).isDirectory()
    ? findManifests(root, manifestMatchers(eco))
    : [root];

  const floating = [];
  const exempt = [];
  const unreadable = [];
  const pinned = [];

  for (const file of manifests) {
    let parsed;
    try {
      parsed = eco.parseManifest(file, fs.readFileSync(file, "utf8"));
    } catch (e) {
      unreadable.push({ file, reason: e.message });
      continue;
    }

    for (const [field, deps] of Object.entries((parsed && parsed.fields) || {})) {
      if (!deps || typeof deps !== "object") continue;

      // Some ecosystems (npm) hand back a raw spec string per dependency and
      // rely on eco.classify() here. Others (Python) classify while parsing,
      // since their grammar can't be split into "get the raw spec" then
      // "classify it" the way a flat name->range JSON map can — those hand
      // back an already-classified result object instead. Detect which one
      // this value is rather than assuming every ecosystem shares npm's shape.
      const fieldMeta = (parsed && parsed.fieldMeta && parsed.fieldMeta[field]) || null;
      const policyKey = (fieldMeta && fieldMeta.policyKey) || field;

      for (const [name, value] of Object.entries(deps)) {
        const isPreClassified = value && typeof value === "object" && typeof value.status === "string";
        const result = isPreClassified ? value : eco.classify(value);
        const spec = isPreClassified ? (value.spec !== undefined ? value.spec : name) : value;
        // `raw` carries the full classification result (not just its rendered
        // reason string) for callers that need more than the report line —
        // e.g. scan-python-deps.js recovering an exact checkable version out
        // of a "pinned" verdict to run OSV/license against.
        const entry = { name, spec, file, field, reason: describe(result), raw: result };

        if (result.status === "pinned") {
          pinned.push(entry);
        } else if (result.status === "exempt") {
          exempt.push(entry);
        } else {
          // Unmapped field would mean a malformed policy file — fail closed on HIGH.
          entry.severity = severityMap[policyKey] || "HIGH";
          floating.push(entry);
        }
      }
    }
  }

  return { manifests, floating, exempt, unreadable, pinned, pinnedCount: pinned.length };
}

/** The findings/summary body — identical wording to the pre-refactor npm report. */
function printReport(eco, scan, verdict) {
  const label = manifestLabel(eco);
  const { floating, exempt, unreadable, manifests, pinnedCount } = scan;
  const { levels, grouped, counts, failOn } = verdict;

  console.log("## Floating version specifiers\n");
  if (floating.length === 0) {
    console.log("None found.\n");
  } else {
    for (const level of levels) {
      const group = grouped[level];
      if (!group || group.length === 0) continue;
      const disposition = failOn.includes(level) ? "fails the run" : "warn only";
      console.log(`### ${level} — ${disposition}\n`);
      for (const f of group) {
        console.log(
          `- ${f.name}@${f.spec} (in ${displayPath(f.file)}, ${f.field}) — ${f.reason}`
        );
      }
      console.log("");
    }
  }

  console.log("## Exempt (local/workspace references)\n");
  if (exempt.length === 0) {
    console.log("None found.\n");
  } else {
    for (const e of exempt) {
      console.log(`- ${e.name}@${e.spec} (in ${displayPath(e.file)}, ${e.field}) — ${e.reason}`);
    }
    console.log("");
  }

  if (unreadable.length > 0) {
    console.log("## Unreadable manifests (not classified)\n");
    for (const u of unreadable) {
      console.log(`- ${displayPath(u.file)} — ${u.reason}`);
    }
    console.log("");
  }

  console.log("## Summary\n");
  console.log(`${label} files scanned: ${manifests.length}`);
  console.log(`Pinned: ${pinnedCount}`);
  console.log(
    `Floating: ${floating.length}` +
      (floating.length > 0
        ? `  (${levels
            .filter((l) => counts[l] > 0)
            .map((l) => `${l}: ${counts[l]}`)
            .join("  |  ")})`
        : "")
  );
  console.log(`Exempt: ${exempt.length}`);
}

function printVerdict(scan, verdict) {
  const { floating, exempt, pinnedCount } = scan;
  const blocking = verdict.blocking;

  if (blocking.length > 0) {
    console.log(`FAIL — ${blocking.length} floating dependency(ies) violate the exact-pin policy.`);
    const warnOnly = floating.length - blocking.length;
    if (warnOnly > 0) {
      console.log(`Also ${warnOnly} floating dependency(ies) at warn-only severity.`);
    }
    if (exempt.length > 0) {
      console.log(`${exempt.length} local/workspace reference(s) were exempt from this policy.`);
    }
    console.log("Replace each floating specifier with the exact version you audited.");
    return;
  }

  console.log(`PASS — all ${pinnedCount} declared dependencies are exact-pinned.`);
  if (floating.length > 0) {
    console.log(
      `${floating.length} floating dependency(ies) at warn-only severity — reported above, not blocking.`
    );
  }
  if (exempt.length > 0) {
    console.log(`${exempt.length} local/workspace reference(s) were exempt from this policy.`);
  }
}

function loadPolicyOrExit(eco) {
  const rel = `data/${eco.policyFile}`;
  try {
    return loadJson(rel);
  } catch (e) {
    // Fail closed: without the policy there is no severity map and no verdict.
    console.error(`Cannot read ${rel} — ${e.message}`);
    process.exit(1);
  }
}

/** Single-ecosystem run — the path every npm-only repo takes. Output is unchanged. */
function runSingle(eco, root) {
  const policy = loadPolicyOrExit(eco);

  const scan = scanEcosystem(eco, root, policy);
  if (scan.manifests.length === 0) {
    console.log(`No ${manifestLabel(eco)} files found.`);
    process.exit(0);
  }

  console.log(`Scanning ${scan.manifests.length} ${manifestLabel(eco)} file(s)...\n`);

  const verdict = evaluate(scan.floating, policy, SEVERITY_ORDER);
  printReport(eco, scan, verdict);

  console.log("\n## Verdict\n");
  printVerdict(scan, verdict);

  if (verdict.blocking.length > 0) process.exit(1);
}

/** Polyglot repo — one section per ecosystem, then a combined verdict. */
function runMulti(ecos, root) {
  const sections = [];

  for (const eco of ecos) {
    const policy = loadPolicyOrExit(eco);
    const scan = scanEcosystem(eco, root, policy);
    if (scan.manifests.length === 0) continue;
    sections.push({ eco, scan, verdict: evaluate(scan.floating, policy, SEVERITY_ORDER) });
  }

  if (sections.length === 0) {
    console.log("No manifest files found.");
    process.exit(0);
  }

  for (const { eco, scan, verdict } of sections) {
    console.log(`# Ecosystem: ${eco.id}\n`);
    console.log(`Scanning ${scan.manifests.length} ${manifestLabel(eco)} file(s)...\n`);
    printReport(eco, scan, verdict);
    console.log(`\n### Verdict — ${eco.id}\n`);
    printVerdict(scan, verdict);
    console.log("");
  }

  const totalBlocking = sections.reduce((n, s) => n + s.verdict.blocking.length, 0);
  const totalFloating = sections.reduce((n, s) => n + s.scan.floating.length, 0);
  const totalPinned = sections.reduce((n, s) => n + s.scan.pinnedCount, 0);
  const totalExempt = sections.reduce((n, s) => n + s.scan.exempt.length, 0);

  console.log("## Overall verdict\n");
  console.log(`Ecosystems scanned: ${sections.map((s) => s.eco.id).join(", ")}`);
  console.log(`Pinned: ${totalPinned}  |  Floating: ${totalFloating}  |  Exempt: ${totalExempt}`);
  if (totalBlocking > 0) {
    console.log(
      `FAIL — ${totalBlocking} floating dependency(ies) violate the exact-pin policy across ${sections.length} ecosystem(s).`
    );
    console.log("Replace each floating specifier with the exact version you audited.");
    process.exit(1);
  }
  console.log(`PASS — all ${totalPinned} declared dependencies are exact-pinned.`);
}

function main() {
  const { ecosystem, targetPath } = parseArgs(process.argv.slice(2));
  const root = targetPath ? path.resolve(targetPath) : process.cwd();

  // Explicit --ecosystem wins; otherwise detect from what is on disk.
  if (ecosystem) {
    let resolved;
    try {
      resolved = resolveEcosystem(ecosystem);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    if (!getCapabilities(resolved.module).pinning) {
      console.error(
        `Ecosystem "${resolved.id}" does not support the pinning check yet ` +
          "(no classify/parseManifest/policyFile) — see check-package.js for its OSV-only check."
      );
      process.exit(1);
    }
    runSingle(resolved.module, root);
    return;
  }

  const detected = detectEcosystem(root);

  // Zero detected: stay on the default ecosystem so the "no manifests" message
  // and exit code are exactly what they have always been for an npm-only repo.
  if (detected.length <= 1) {
    const id = detected[0] || resolveEcosystem().id;
    runSingle(REGISTRY[id], root);
    return;
  }

  runMulti(detected.map((id) => REGISTRY[id]), root);
}

if (require.main === module) {
  main();
}

// Backward compatible: external callers do require("./check-pinned-versions").classify.
// The rest is reused by scan-python-deps.js so the combined pinning+OSV+
// license audit shares the exact same walk/classify/report logic rather than
// a second, driftable copy of it.
module.exports = {
  classify: require("./ecosystems/npm").classify,
  scanEcosystem,
  printReport,
  printVerdict,
  manifestLabel,
  loadPolicyOrExit,
  SEVERITY_ORDER,
};
