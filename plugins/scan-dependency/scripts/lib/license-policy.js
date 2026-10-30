/**
 * Open-source license policy classification (3-tier: Accepted /
 * Accepted-with-Requirement / Forbidden).
 *
 * Single source of truth. check-package.js and scan-lockfile.js each carried a
 * near-verbatim copy of this cascade; scan-lockfile.js's copy had drifted (it
 * omitted the `severity` field on failures and used shorter `reason` strings).
 * check-package.js's copy is the canonical one and is what lives here — it is a
 * strict superset: identical pass/fail decisions and identical failure `reason`
 * strings, plus `severity` on every failure.
 *
 * Ecosystem-neutral: the caller supplies the declared license (string, array, or
 * SPDX expression) and the three policy data files.
 */

function normalizeLicense(token) {
  return String(token).trim().replace(/\s+/g, "-");
}

function tokenizeExpression(expr) {
  if (typeof expr !== "string") return [];
  return expr
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND)\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function licenseToExpr(license) {
  if (license == null || license === "") return "";
  if (typeof license === "string") return license;
  if (Array.isArray(license)) return license.join(" OR ");
  return String(license);
}

function entryIds(entry) {
  const ids = [];
  if (entry.id) ids.push(entry.id);
  for (const id of entry.spdxIds || []) ids.push(id);
  return ids.map((id) => id.toUpperCase());
}

function tokenMatchesEntry(token, entry) {
  const norm = normalizeLicense(token).toUpperCase();
  return entryIds(entry).some((id) => norm === id);
}

function matchesForbidden(license, forbidden) {
  const expr = licenseToExpr(license);
  if (!expr) return { pass: false, finding: "Empty / no license declared — forbidden" };

  const upper = expr.toUpperCase();
  for (const entry of forbidden.forbidden || []) {
    for (const id of entry.spdxIds || []) {
      const idU = id.toUpperCase();
      // Token-aware: exact SPDX or clear word boundary match
      const tokens = tokenizeExpression(expr);
      if (tokens.some((t) => normalizeLicense(t).toUpperCase() === idU) || upper === idU) {
        return { pass: false, finding: entry.finding, matched: id };
      }
    }
  }

  for (const pat of forbidden.patterns || []) {
    const re = new RegExp(pat.match, pat.caseInsensitive ? "i" : "");
    if (re.test(expr)) {
      return { pass: false, finding: pat.finding, matched: pat.match };
    }
  }

  return { pass: true };
}

function findConditional(token, conditional) {
  for (const entry of conditional.conditional || []) {
    if (tokenMatchesEntry(token, entry)) return entry;
  }
  return null;
}

function findAllowed(token, allowed) {
  for (const entry of allowed.allowed || []) {
    if (tokenMatchesEntry(token, entry)) return entry;
  }
  return null;
}

/**
 * @returns {{ pass: boolean, severity?: string, tier?: string, reason: string, requirements?: string[] }}
 */
function checkLicensePolicy(license, allowed, conditional, forbidden) {
  const forbiddenResult = matchesForbidden(license, forbidden);
  if (!forbiddenResult.pass) {
    return { pass: false, severity: "P0", tier: "forbidden", reason: forbiddenResult.finding };
  }

  if (license == null || license === "") {
    return { pass: false, severity: "P0", tier: "forbidden", reason: "Empty / no license declared — forbidden" };
  }

  const expr = licenseToExpr(license);
  const tokens = tokenizeExpression(expr);
  if (tokens.length === 0) {
    return { pass: false, severity: "P0", tier: "forbidden", reason: "Unable to parse license expression" };
  }

  const requirements = [];
  let allAccepted = true;

  for (const token of tokens) {
    const allowedHit = findAllowed(token, allowed);
    if (allowedHit) continue;

    const conditionalHit = findConditional(token, conditional);
    if (conditionalHit) {
      allAccepted = false;
      requirements.push(`${conditionalHit.id}: ${conditionalHit.requirement}`);
      continue;
    }

    return {
      pass: false,
      severity: "P0",
      tier: "forbidden",
      reason: `Unknown / not on Accepted or Accepted-with-Requirement list: ${token}`,
    };
  }

  if (requirements.length > 0) {
    return {
      pass: true,
      tier: "accepted-with-requirement",
      reason: "Approved with requirements — document compliance before use",
      requirements,
    };
  }

  return {
    pass: true,
    tier: "accepted",
    reason: allAccepted ? "All license tokens Accepted" : "Accepted",
  };
}

module.exports = {
  checkLicensePolicy,
  normalizeLicense,
  tokenizeExpression,
  licenseToExpr,
  entryIds,
  tokenMatchesEntry,
  matchesForbidden,
  findConditional,
  findAllowed,
};
