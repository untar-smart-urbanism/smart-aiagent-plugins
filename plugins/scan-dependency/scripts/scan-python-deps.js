#!/usr/bin/env node
/**
 * Whole-tree Python dependency audit: version pinning + OSV (via PyPI) +
 * license policy, combined in one pass — the Python equivalent of running
 * check-pinned-versions.js and scan-lockfile.js together. Unlike npm's
 * package.json + separately-resolved package-lock.json, a Python manifest
 * tree (requirements.txt/pyproject.toml) is often itself the fully-resolved
 * output (pip freeze), so pinning and OSV/license are both checked from the
 * same manifest parse rather than a separate lockfile graph.
 *
 * Usage: node scan-python-deps.js [path]
 *
 * Only a "pinned" entry that names an exact PyPI release version is checked
 * against OSV/license: a floating entry has no single resolved version to
 * look up, and a git-SHA/hash-pinned entry — while correctly pinned — names
 * no PyPI release that PyPI's API can answer for.
 */

const path = require("path");
const { checkLicensePolicy } = require("./lib/license-policy");
const { evaluate } = require("./lib/severity-verdict");
const {
  scanEcosystem,
  printReport,
  printVerdict,
  manifestLabel,
  loadPolicyOrExit,
  SEVERITY_ORDER,
} = require("./check-pinned-versions");
const python = require("./ecosystems/python");

const PLUGIN_ROOT = path.resolve(__dirname, "..");
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const OSV_QUERY = "https://api.osv.dev/v1/query";

function loadJson(rel) {
  return JSON.parse(require("fs").readFileSync(path.join(PLUGIN_ROOT, rel), "utf8"));
}

async function queryOsv(name, version) {
  const res = await fetch(OSV_QUERY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, package: { name, ecosystem: "PyPI" } }),
  });
  if (!res.ok) throw new Error(`OSV API error: ${res.status}`);
  return res.json();
}

/**
 * A "pinned" classification is checkable against PyPI only when it names an
 * exact release version. Checked in order:
 *   1. `.specifier` — the PEP 440 `==`/`===` operand from a requirements.txt
 *      line or PEP 621 array entry (classifyRequirementSpec sets this).
 *   2. `.spec` matched against the same operator pattern — a Poetry inline
 *      `==1.2.3`/`===1.2.3` string, whose `spec` IS the operator-prefixed
 *      value with no name prefix (unlike requirements.txt's `spec`, which is
 *      the full "name==1.2.3" line and never matches an operator-anchored
 *      pattern, so this branch is a no-op for that shape).
 *   3. A bare Poetry exact pin (`spec` IS the version, no operator at all) —
 *      identified by its distinctive reason string, since nothing else marks
 *      it structurally.
 * A git-SHA pin or a content-hash-pinned URL is correctly pinned but names
 * no PyPI release, so this returns null for those rather than guessing.
 */
function extractCheckableVersion(result) {
  if (!result || result.status !== "pinned") return null;
  for (const candidate of [result.specifier, result.spec]) {
    if (typeof candidate !== "string") continue;
    const m = candidate.trim().match(/^===?\s*(.+)$/);
    if (m) return m[1].trim();
  }
  if (typeof result.reason === "string" && result.reason.includes("bare Poetry version string")) {
    return typeof result.spec === "string" ? result.spec.trim() : null;
  }
  return null;
}

async function main() {
  const policy = loadPolicyOrExit(python);
  const allowed = loadJson("data/allowed-licenses.json");
  const conditional = loadJson("data/conditional-licenses.json");
  const forbidden = loadJson("data/forbidden-licenses.json");

  const scan = scanEcosystem(python, ROOT, policy);
  if (scan.manifests.length === 0) {
    console.log(`No ${manifestLabel(python)} files found.`);
    process.exit(0);
  }

  console.log(`Scanning ${scan.manifests.length} ${manifestLabel(python)} file(s)...\n`);

  const verdict = evaluate(scan.floating, policy, SEVERITY_ORDER);
  printReport(python, scan, verdict);

  // --- OSV + license, over every uniquely-named checkable pinned entry -----
  const checkable = new Map(); // "name@version" -> {name, version}
  for (const entry of scan.pinned) {
    const version = extractCheckableVersion(entry.raw);
    if (!version) continue;
    // entry.name is the report's display key, which parseManifest may have
    // suffixed (e.g. "requests#5") to keep same-named test/duplicate rows
    // unique within one bucket — entry.raw.name is the classifier's own
    // parsed package name and is what must be looked up on PyPI/OSV.
    const name = (entry.raw && entry.raw.name) || entry.name;
    checkable.set(`${name}@${version}`, { name, version });
  }

  console.log("\n## OSV + License (PyPI)\n");
  if (checkable.size === 0) {
    console.log("No pinned dependencies resolve to a checkable PyPI release version.\n");
  } else {
    console.log(
      `Checking ${checkable.size} unique pinned package@version pair(s) against OSV and license policy ` +
        `(git-SHA/hash-pinned entries are excluded — no PyPI release to look up).\n`
    );
  }

  const osvFindings = [];
  const licenseViolations = [];
  const licenseWithRequirements = [];
  let osvErrors = 0;

  for (const { name, version } of checkable.values()) {
    try {
      const osv = await queryOsv(name, version);
      for (const v of osv.vulns || []) {
        osvFindings.push({ name, version, id: v.id, summary: v.summary || "No summary" });
      }
    } catch (e) {
      osvErrors += 1;
      console.log(`  - ${name}@${version}: OSV query error — ${e.message}`);
    }

    const license = await python.fetchLicense(name, version);
    const result = checkLicensePolicy(license, allowed, conditional, forbidden);
    if (!result.pass) {
      licenseViolations.push({ name, version, license, reason: result.reason });
    } else if (result.tier === "accepted-with-requirement") {
      licenseWithRequirements.push({ name, version, license, requirements: result.requirements });
    }
  }

  if (osvFindings.length > 0) {
    console.log("### OSV vulnerabilities found\n");
    for (const f of osvFindings) {
      console.log(`- ${f.name}@${f.version}: ${f.id} — ${f.summary}`);
    }
    console.log("");
  } else if (checkable.size > 0) {
    console.log("No known OSV vulnerabilities for any checked package.\n");
  }

  if (licenseWithRequirements.length > 0) {
    console.log("### License — Accepted with Requirement\n");
    for (const r of licenseWithRequirements) {
      console.log(`- ${r.name}@${r.version} — ${JSON.stringify(r.license)}`);
      for (const req of r.requirements || []) console.log(`    - Requirement: ${req}`);
    }
    console.log("");
  }

  if (licenseViolations.length > 0) {
    console.log("### License violations (P0)\n");
    for (const v of licenseViolations) {
      console.log(`- ${v.name}@${v.version} — ${JSON.stringify(v.license)} — ${v.reason}`);
    }
    console.log("");
  }

  console.log("## Verdict\n");
  printVerdict(scan, verdict);

  const reasons = [];
  if (verdict.blocking.length > 0) reasons.push(`${verdict.blocking.length} floating dependency(ies)`);
  if (osvFindings.length > 0) reasons.push(`${osvFindings.length} OSV finding(s)`);
  if (licenseViolations.length > 0) reasons.push(`${licenseViolations.length} license violation(s)`);

  if (reasons.length > 0) {
    console.log(`\nOverall: FAIL — ${reasons.join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nOverall: PASS");
  if (osvErrors > 0) {
    console.log(
      `Note: ${osvErrors} OSV query(ies) errored rather than returning a clean result — treat as unverified, not as a pass.`
    );
  }
}

main();
