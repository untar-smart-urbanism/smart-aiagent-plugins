/**
 * Severity grouping, counting, and the pass/fail decision — the ecosystem-neutral
 * math behind a pinning verdict.
 *
 * Extracted from check-pinned-versions.js's main(). Deliberately silent: report
 * wording differs per ecosystem ("package.json files" vs "requirements.txt/
 * pyproject.toml files"), so callers keep doing their own printing and only the
 * counting/grouping/pass-fail logic lives here.
 */

const DEFAULT_ORDER = ["HIGH", "MEDIUM", "INFORMATIONAL"];

/**
 * @param {{severity: string}[]} findings - floating findings, each with .severity already assigned
 * @param {{verdict?: {failOn?: string[], warnOnly?: string[]}}} policy
 * @param {string[]} [knownOrder] - default ["HIGH","MEDIUM","INFORMATIONAL"]
 * @returns {{levels: string[], grouped: Record<string, object[]>, counts: Record<string, number>,
 *            blocking: object[], warnOnlyFindings: object[], pass: boolean,
 *            failOn: string[], warnOnly: string[]}}
 */
function evaluate(findings, policy, knownOrder = DEFAULT_ORDER) {
  const list = findings || [];
  const verdict = (policy && policy.verdict) || {};
  const failOn = verdict.failOn || [];
  const warnOnly = verdict.warnOnly || [];

  // Known severities first, then anything else the policy file introduced.
  const levels = knownOrder.concat(
    [...new Set(list.map((f) => f.severity))].filter((l) => !knownOrder.includes(l))
  );

  const grouped = {};
  const counts = {};
  for (const level of levels) {
    grouped[level] = list.filter((f) => f.severity === level);
    counts[level] = grouped[level].length;
  }

  const blocking = list.filter((f) => failOn.includes(f.severity));
  const warnOnlyFindings = list.filter((f) => !failOn.includes(f.severity));

  return {
    levels,
    grouped,
    counts,
    blocking,
    warnOnlyFindings,
    pass: blocking.length === 0,
    failOn,
    warnOnly,
  };
}

module.exports = { evaluate };
