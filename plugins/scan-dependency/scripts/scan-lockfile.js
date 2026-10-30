#!/usr/bin/env node
/**
 * Scan npm-ecosystem lockfiles — package-lock.json and Bun's text bun.lock — for
 * license policy violations (3-tier) and OSV vulnerabilities.
 *
 * OSV: osv-scanner when installed. bun.lock packages are also queried through the
 * OSV batch API, because osv-scanner's bun.lock support is not something this
 * plugin has verified; findings from both are merged and de-duplicated.
 * bun.lockb (binary) is reported as unreadable, never as an empty lockfile.
 *
 * Usage: node scan-lockfile.js [path-to-lockfile-or-dir]
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { checkLicensePolicy } = require("./lib/license-policy");
const { findManifests } = require("./lib/walk-manifests");
const { LOCKFILE_NAMES, readLockfile } = require("./lib/lockfiles");
const osvBatch = require("./lib/osv-batch");
const npmEco = require("./ecosystems/npm");

const PLUGIN_ROOT = path.resolve(__dirname, "..");
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

function loadJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, rel), "utf8"));
}

function findLockfiles(dir) {
  return findManifests(dir, { fileNames: LOCKFILE_NAMES });
}

function displayPath(file) {
  return path.relative(fs.statSync(ROOT).isDirectory() ? ROOT : path.dirname(ROOT), file) || file;
}

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

/** Normalize an OSV vulnerability record to one of SEVERITY_ORDER. */
function severityOf(vuln) {
  const raw = String(
    (vuln.database_specific && vuln.database_specific.severity) ||
      (vuln.ecosystem_specific && vuln.ecosystem_specific.severity) ||
      ""
  ).toUpperCase();
  if (SEVERITY_ORDER.includes(raw)) return raw;
  if (raw === "MODERATE") return "MEDIUM";
  // The `severity` array holds CVSS vector strings, not numeric scores. Deriving a
  // score from a vector is out of scope, so stay honest rather than guessing LOW.
  return "UNKNOWN";
}

/**
 * Run osv-scanner and collect what it found.
 *
 * osv-scanner exits non-zero when it finds vulnerabilities. That exit code used to
 * be discarded, so lockfile vulnerabilities were reported as text and then silently
 * ignored while licence violations blocked — a scan could "pass" with known CVEs.
 */
function collectOsvScannerFindings(hasNonBun) {
  const json = spawnSync("osv-scanner", ["--format", "json", "-r", ROOT], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (json.error) {
    console.log("OSV-Scanner not installed. Install: go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v2");
    if (hasNonBun) {
      console.log("package-lock.json vulnerabilities were NOT scanned (osv-scanner is needed for them).");
      console.log("Or check packages individually: node check-package.js <name> <version>\n");
    } else {
      console.log("bun.lock packages are checked through the OSV batch API instead.\n");
    }
    return { ran: false, findings: [] };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(json.stdout || "{}");
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // Fall back to human output, but still respect the exit code.
    console.log("## OSV-Scanner output\n");
    console.log(json.stdout || json.stderr);
    const found = json.status !== 0;
    if (found) {
      console.log("\nCould not parse JSON output; osv-scanner exited non-zero, so treat this as vulnerabilities found.");
    }
    return { ran: true, findings: [], unparsed: found };
  }

  const findings = [];
  for (const result of parsed.results || []) {
    const source = (result.source && result.source.path) || "";
    for (const pkgEntry of result.packages || []) {
      const pkg = pkgEntry.package || {};
      for (const vuln of pkgEntry.vulnerabilities || []) {
        findings.push({
          id: vuln.id || "(no id)",
          name: pkg.name || "(unknown)",
          version: pkg.version || "",
          severity: severityOf(vuln),
          summary: (vuln.summary || "").split("\n")[0],
          source,
        });
      }
    }
  }
  return { ran: true, findings };
}

/**
 * bun.lock packages go to the OSV batch API directly. When the API cannot be
 * reached they are reported as not scanned — never as clean.
 */
async function collectBunLockFindings(bunPackages) {
  if (bunPackages.length === 0) return { ran: false, attempted: false, findings: [] };
  try {
    const findings = await osvBatch.queryPackages(bunPackages, severityOf, "npm");
    return { ran: true, attempted: true, findings };
  } catch (err) {
    console.log(`OSV batch API unreachable for bun.lock packages (${err.message}).`);
    console.log("bun.lock vulnerabilities were NOT scanned — this run checked their licences only.\n");
    return { ran: false, attempted: true, findings: [] };
  }
}

async function runOsvScan(bunPackages, hasNonBun) {
  const osvConfig = loadJson("data/osv-config.json") || {};
  const decisions =
    (osvConfig.platformSeverityPolicy && osvConfig.platformSeverityPolicy.decisions) || {};

  const scanner = collectOsvScannerFindings(hasNonBun);
  const bun = await collectBunLockFindings(bunPackages);

  // osv-scanner may also read bun.lock; the same advisory must not be counted twice.
  const seen = new Set();
  const findings = [];
  for (const f of [...scanner.findings, ...bun.findings]) {
    const key = `${f.id}|${f.name}|${f.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(f);
  }

  if (!scanner.ran && !bun.ran) {
    return { ran: false, counts: {}, findings: [], blocked: false, approvalRequired: false };
  }
  if (scanner.unparsed) {
    return { ran: true, counts: {}, findings, blocked: true, approvalRequired: false, unparsed: true };
  }

  const counts = {};
  for (const level of SEVERITY_ORDER) counts[level] = 0;
  for (const f of findings) counts[f.severity] += 1;

  console.log("## OSV vulnerabilities\n");
  if (findings.length === 0) {
    console.log(
      scanner.ran
        ? "None found in declared dependencies.\n"
        : hasNonBun
          ? "None found in bun.lock packages (osv-scanner missing — other lockfiles were NOT scanned for vulnerabilities).\n"
          : "None found in bun.lock packages (checked through the OSV batch API).\n"
    );
  } else {
    console.log(
      SEVERITY_ORDER.filter((l) => counts[l] > 0)
        .map((l) => `${l}: ${counts[l]}`)
        .join("  |  ") + "\n"
    );
    for (const level of SEVERITY_ORDER) {
      const group = findings.filter((f) => f.severity === level);
      if (group.length === 0) continue;
      const decision = decisions[level] || "informational";
      console.log(`### ${level} — platform's documented default: ${decision}\n`);
      for (const f of group) {
        console.log(`- ${f.name}@${f.version} — ${f.id}${f.summary ? ` — ${f.summary}` : ""}`);
      }
      console.log("");
    }
    console.log(
      "Scope note: OSV covers declared package dependencies only. The deployment platform's Trivy\n" +
        "also scans base-image OS packages, image layers, IaC/Kubernetes manifests, and embedded secrets.\n"
    );
    console.log(
      "Configuration note: Trivy's scan parameters are platform-internal and not shared, so this result\n" +
        "cannot predict the gate. The platform may suppress a finding listed above (unfixed, or on an\n" +
        "ignore-list we cannot read), and may flag things this scan never looks at. Treat the decisions\n" +
        "above as the documented default applied to OUR findings — not as the platform's verdict. For the\n" +
        "platform's actual state, check the platform's own scan results.\n"
    );
  }

  return {
    ran: true,
    // Part of the tree went unscanned: other lockfiles without osv-scanner, or bun.lock without the API.
    partial: (!scanner.ran && hasNonBun) || (bun.attempted && !bun.ran),
    counts,
    findings,
    blocked: counts.CRITICAL > 0,
    approvalRequired: counts.HIGH > 0,
  };
}

async function main() {
  const allowed = loadJson("data/allowed-licenses.json");
  const conditional = loadJson("data/conditional-licenses.json");
  const forbidden = loadJson("data/forbidden-licenses.json");

  const lockfiles = fs.statSync(ROOT).isDirectory() ? findLockfiles(ROOT) : [ROOT];
  if (lockfiles.length === 0) {
    console.log(`No lockfiles found (${LOCKFILE_NAMES.join(", ")}).`);
    process.exit(0);
  }

  console.log(`Scanning ${lockfiles.length} lockfile(s)...\n`);

  const parsed = [];
  const unreadable = [];
  for (const lockPath of lockfiles) {
    let result;
    try {
      result = readLockfile(lockPath);
    } catch (err) {
      unreadable.push({ lockPath, reason: err.message });
      continue;
    }
    if (result.unreadable) {
      unreadable.push({ lockPath, reason: result.unreadable });
      continue;
    }
    parsed.push({ lockPath, ...result });
  }
  // Only osv-scanner covers lockfiles other than bun.lock.
  const hasNonBun = parsed.some((l) => l.kind !== "bun.lock");

  const bunPackages = [];
  const bunSeen = new Set();
  for (const lf of parsed.filter((l) => l.kind === "bun.lock")) {
    for (const p of lf.packages) {
      const key = `${p.name}@${p.version}`;
      if (bunSeen.has(key)) continue;
      bunSeen.add(key);
      bunPackages.push({ ...p, source: lf.lockPath });
    }
  }

  const osvOutcome = await runOsvScan(bunPackages, hasNonBun);

  const violations = [];
  const withRequirements = [];
  const lookupFailures = [];
  const seen = new Set();
  const useCli = npmEco.npmCliAvailable();
  if (!useCli) {
    console.log(
      "npm CLI not found — licences are read from registry.npmjs.org directly " +
        "(a private registry configured in .npmrc is not consulted).\n"
    );
  }

  for (const { lockPath, packages: pkgs } of parsed) {
    for (const { name, version } of pkgs) {
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Routed through the ecosystem adapter (not a local execSync template
      // string) so this gets the same assertSafeNpmName/assertSafeVersionArg
      // input validation already applied there — name/version here originate
      // from a lockfile, but the adapter's guard is what actually closes the
      // shell-injection vector, not where the values came from.
      let license;
      if (useCli) {
        license = npmEco.fetchLicense(name, version);
      } else {
        // No npm CLI (typical on a Bun-only machine): ask the registry over HTTP.
        // A failed lookup is not "no licence declared" and must not become a P0.
        try {
          license = await npmEco.fetchLicenseFromRegistry(name, version);
        } catch (err) {
          lookupFailures.push({ name, version, reason: err.message, lockfile: lockPath });
          continue;
        }
      }

      const result = checkLicensePolicy(license, allowed, conditional, forbidden);
      if (!result.pass) {
        violations.push({ name, version, license, reason: result.reason, lockfile: lockPath });
      } else if (result.tier === "accepted-with-requirement") {
        withRequirements.push({
          name,
          version,
          license,
          requirements: result.requirements,
          lockfile: lockPath,
        });
      }
    }
  }

  const skippedEntries = parsed.flatMap((l) => l.skipped.map((s) => ({ ...s, lockfile: l.lockPath })));
  if (skippedEntries.length > 0) {
    console.log("\n## Not a registry release (licence and OSV not checked)\n");
    for (const s of skippedEntries) {
      console.log(`- ${s.name} — ${s.spec} — ${displayPath(s.lockfile)}`);
    }
  }

  if (lookupFailures.length > 0) {
    console.log("\n## Licence lookup failed (licence NOT checked)\n");
    for (const f of lookupFailures) console.log(`- ${f.name}@${f.version} — ${f.reason}`);
  }

  if (unreadable.length > 0) {
    console.log("\n## Unreadable lockfiles (NOT scanned)\n");
    for (const u of unreadable) console.log(`- ${displayPath(u.lockPath)} — ${u.reason}`);
  }

  console.log("\n## License — Accepted with Requirement\n");
  if (withRequirements.length === 0) {
    console.log("None found.");
  } else {
    for (const v of withRequirements) {
      console.log(`- ${v.name}@${v.version} — ${JSON.stringify(v.license)}`);
      for (const req of v.requirements || []) console.log(`    Requirement: ${req}`);
    }
  }

  console.log("\n## License violations (P0)\n");
  if (violations.length === 0) {
    console.log("None found.");
  } else {
    for (const v of violations) {
      console.log(`- ${v.name}@${v.version} — ${JSON.stringify(v.license)} — ${v.reason}`);
    }
  }

  // Verdict — licence violations and CRITICAL vulnerabilities both fail the scan.
  // HIGH mirrors the platform's approval_required: reported prominently, not a failure here.
  const reasons = [];
  if (violations.length > 0) reasons.push(`${violations.length} forbidden-licence package(s)`);
  if (osvOutcome.blocked) {
    reasons.push(
      osvOutcome.unparsed
        ? "osv-scanner reported vulnerabilities"
        : `${osvOutcome.counts.CRITICAL} CRITICAL vulnerability(ies)`
    );
  }

  // Every verdict below is THIS tool's, under our own policy. It is never the platform's gate
  // decision: Trivy's scan parameters are not shared with us, so we cannot reproduce what it sees.
  console.log("\n## Verdict (this tool's policy — not the platform's gate)\n");
  if (reasons.length > 0) {
    console.log(`FAIL — ${reasons.join("; ")}.`);
    if (osvOutcome.approvalRequired) {
      console.log(
        `Also ${osvOutcome.counts.HIGH} HIGH finding(s) — the platform's documented default escalates HIGH to an approval task.`
      );
    }
    process.exit(1);
  }

  // A lockfile we could not read says nothing about its dependencies — never a pass.
  if (unreadable.length > 0 || lookupFailures.length > 0) {
    const parts = [];
    if (unreadable.length > 0) parts.push(`${unreadable.length} lockfile(s) could not be read and were not scanned`);
    if (lookupFailures.length > 0) parts.push(`${lookupFailures.length} package licence(s) could not be looked up`);
    console.log(`INCOMPLETE — ${parts.join("; ")} (see above). Fix the cause and re-run.`);
    process.exit(1);
  }

  if (osvOutcome.approvalRequired) {
    console.log(
      `PASS with attention needed — ${osvOutcome.counts.HIGH} HIGH vulnerability(ies). ` +
        "The platform's documented default escalates HIGH to an approval task; clear them before promotion day."
    );
    return;
  }
  if (!osvOutcome.ran) {
    console.log(
      "PASS on licences only — vulnerabilities were not scanned (osv-scanner missing, and no bun.lock was queried through the OSV API)."
    );
    return;
  }
  if (osvOutcome.partial) {
    console.log(
      "PASS on what was scanned — vulnerabilities were checked for only part of the tree " +
        "(osv-scanner missing for non-Bun lockfiles, or the OSV API was unreachable for bun.lock)."
    );
    return;
  }
  console.log("PASS — no forbidden licences and no blocking vulnerabilities in declared dependencies.");
  console.log(
    "This says nothing about the production security gate: check the platform's own scan results."
  );
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(2);
});
