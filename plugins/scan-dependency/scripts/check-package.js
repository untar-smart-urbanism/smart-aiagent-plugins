#!/usr/bin/env node
/**
 * Check a single package against OSV and license policy (3-tier).
 *
 * Usage: node check-package.js <package> [version] [--ecosystem <id>]
 * Example: node check-package.js lodash 4.17.21
 *
 * Version resolution and license lookup come from the ecosystem adapter in
 * scripts/ecosystems/; the OSV ecosystem string is resolved from
 * data/osv-config.json's `ecosystems` map, never hardcoded at the call site.
 * With no --ecosystem flag the ecosystem is npm, so existing two-argument
 * invocations behave exactly as before.
 *
 * License tiers:
 *   Accepted                  → APPROVED
 *   Accepted-with-Requirement → APPROVED (document requirement)
 *   Forbidden                 → REJECTED (P0)
 */

const path = require("path");
const fs = require("fs");
const { checkLicensePolicy } = require("./lib/license-policy");
const { resolveEcosystem, getCapabilities } = require("./ecosystems");

const PLUGIN_ROOT = path.resolve(__dirname, "..");
const OSV_QUERY = "https://api.osv.dev/v1/query";

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, rel), "utf8"));
}

/** `<package> [version]` plus an optional `--ecosystem <id>` in any position. */
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
  return { ecosystem, name: positional[0], versionArg: positional[1] };
}

async function queryOsv(name, version, ecosystem) {
  const res = await fetch(OSV_QUERY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version,
      package: { name, ecosystem },
    }),
  });
  if (!res.ok) throw new Error(`OSV API error: ${res.status}`);
  return res.json();
}

// Every early-exit below sets process.exitCode and returns rather than
// calling process.exit() directly. Once an ecosystem's fetchLicense/
// resolveVersion make real fetch() calls (Python's PyPI lookups do; npm's
// execSync-based ones don't), forcing process.exit() while undici's
// keep-alive sockets are still open reproducibly crashes on Windows with a
// libuv assertion (`UV_HANDLE_CLOSING` in src/win/async.c), surfacing as exit
// code 127 instead of the intended 1. Setting exitCode and letting main()'s
// promise resolve naturally lets the event loop drain those handles first.
async function main() {
  const { ecosystem, name, versionArg } = parseArgs(process.argv.slice(2));
  if (!name) {
    console.error("Usage: node check-package.js <package> [version] [--ecosystem <id>]");
    process.exitCode = 1;
    return;
  }

  let eco;
  try {
    eco = resolveEcosystem(ecosystem); // no flag → npm
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }

  const caps = getCapabilities(eco.module);

  if (!caps.osv) {
    console.error(
      `OSV check not available for ecosystem "${eco.id}" — no resolveVersion() defined. ` +
        "A minimal adapter needs at least resolveVersion() and an entry in data/osv-config.json's ecosystems map."
    );
    process.exitCode = 1;
    return;
  }

  if (!caps.pinning) {
    console.log(
      `Note: pinning check not available for ecosystem "${eco.id}" (no classify/parseManifest/policyFile) — version accepted as-is.\n`
    );
  } else if (versionArg && versionArg !== "latest") {
    // Prefer classifyVersionArg when the ecosystem defines one: it classifies
    // a BARE CLI version argument (no operator = "this exact version"), which
    // differs from classify()'s job of classifying a manifest specifier
    // clause (no operator = "unconstrained"). npm doesn't need the
    // distinction — its classify() already treats a bare exact semver as
    // pinned — so this falls back to classify() there, unchanged.
    const classifyArg = eco.module.classifyVersionArg || eco.module.classify;
    const pinCheck = classifyArg(versionArg);
    if (pinCheck.status !== "pinned") {
      console.error(`Rejected: ${name}@${versionArg} is not an exact-pinned version — ${pinCheck.reason}`);
      console.error("Pass an exact semver version (e.g. 4.17.21) so the audited version is the installed version.");
      process.exitCode = 1;
      return;
    }
  }

  const allowed = loadJson("data/allowed-licenses.json");
  const conditional = loadJson("data/conditional-licenses.json");
  const forbidden = loadJson("data/forbidden-licenses.json");

  let version;
  try {
    // await is required here: npm's resolveVersion is synchronous (a plain
    // string via execSync) so awaiting it is a no-op, but python's is async
    // (a PyPI HTTP fetch) and would otherwise resolve to an unfulfilled
    // Promise instead of a version string.
    version = await eco.module.resolveVersion(name, versionArg);
  } catch (e) {
    console.error(`Failed to resolve version for ${name}: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nChecking ${name}@${version}\n`);

  let osvPass = true;
  try {
    const osv = await queryOsv(name, version, eco.osvEcosystem);
    const vulns = osv.vulns || [];
    osvPass = vulns.length === 0;
    console.log("## OSV");
    if (osvPass) {
      console.log("Status: PASS — no known vulnerabilities");
    } else {
      console.log("Status: FAIL");
      for (const v of vulns) {
        console.log(`  - ${v.id}: ${v.summary || "No summary"}`);
      }
    }
  } catch (e) {
    console.log("## OSV");
    console.log(`Status: ERROR — ${e.message}`);
    osvPass = false;
  }

  // A missing CAPABILITY (no fetchLicense defined) is a different fact from a
  // missing DECLARED license (fetchLicense ran and returned null, which
  // checkLicensePolicy correctly treats as "no license declared → forbidden").
  // Conflating them would make every OSV-only ecosystem fail closed for a
  // reason that isn't real, so this is a separate branch, not a null license.
  let licenseResult = { pass: true, tier: "not-applicable" };
  if (caps.license) {
    // Same reasoning as resolveVersion above: npm's fetchLicense is
    // synchronous, python's is an async PyPI HTTP fetch, so await it too.
    const license = await eco.module.fetchLicense(name, version);
    licenseResult = checkLicensePolicy(license, allowed, conditional, forbidden);

    console.log("\n## License");
    console.log(`Declared: ${JSON.stringify(license)}`);
    if (!licenseResult.pass) {
      console.log(`Status: FAIL (${licenseResult.severity || "P0"})`);
      console.log(`Tier: ${licenseResult.tier}`);
      console.log(`Reason: ${licenseResult.reason}`);
    } else if (licenseResult.tier === "accepted-with-requirement") {
      console.log("Status: PASS (Accepted with Requirement)");
      console.log(`Tier: ${licenseResult.tier}`);
      console.log(`Reason: ${licenseResult.reason}`);
      for (const req of licenseResult.requirements || []) {
        console.log(`  - Requirement: ${req}`);
      }
    } else {
      console.log("Status: PASS (Accepted)");
      console.log(`Tier: ${licenseResult.tier}`);
    }
  } else {
    console.log("\n## License");
    console.log(`Not available for this ecosystem (no fetchLicense adapter) — verdict is based on OSV alone.`);
  }

  const approved = osvPass && licenseResult.pass;
  const verdict =
    !approved
      ? "REJECTED"
      : licenseResult.tier === "accepted-with-requirement"
        ? "APPROVED (with requirements)"
        : "APPROVED";

  console.log(`\n## Verdict: ${verdict}`);
  if (!approved) {
    console.log("Do not add this dependency.");
    process.exitCode = 1;
    return;
  }
  if (licenseResult.tier === "accepted-with-requirement") {
    console.log("Document and satisfy all requirements before merging.");
  }
}

main();
