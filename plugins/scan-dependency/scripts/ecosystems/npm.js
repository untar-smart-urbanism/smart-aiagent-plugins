/**
 * npm ecosystem adapter.
 *
 * Everything npm-specific that the generic CLIs used to hardcode: manifest file
 * names, the dependency fields, the version-specifier classification cascade,
 * manifest parsing, version resolution, and license lookup.
 *
 * The classify() cascade below is moved verbatim from check-pinned-versions.js —
 * check-pinned-versions.js now re-exports it so external callers doing
 * `require("./check-pinned-versions").classify` are unaffected.
 */

const { execSync } = require("child_process");

// `resolveVersion`/`fetchLicense` below build a shell command line via
// execSync (needed on Windows, where npm ships as npm.cmd — execFileSync
// without shell:true can't spawn it at all: confirmed ENOENT/EINVAL on this
// platform). JSON.stringify()-quoting a value is NOT shell-safe (it escapes
// JSON-special characters, not shell metacharacters — `$(...)`  still runs
// inside double quotes in a POSIX shell). Since `name` originates as a raw
// CLI argument that may ultimately come from an agent transcribing untrusted
// text, validate it against npm's own package-name character set before it
// ever reaches the shell string, closing the injection vector regardless of
// exec mechanism.
const RE_SAFE_NPM_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const RE_SAFE_VERSION_ARG = /^[A-Za-z0-9._+-]+$/;

function assertSafeNpmName(name) {
  if (typeof name !== "string" || !RE_SAFE_NPM_NAME.test(name)) {
    throw new Error(
      `Refusing to run npm CLI with an unsafe package name: ${JSON.stringify(name)} — ` +
        "package names may only contain letters, digits, '.', '_', '-', and an optional '@scope/' prefix."
    );
  }
}

function assertSafeVersionArg(version) {
  if (typeof version !== "string" || !RE_SAFE_VERSION_ARG.test(version)) {
    throw new Error(
      `Refusing to run npm CLI with an unsafe version argument: ${JSON.stringify(version)} — ` +
        "expected a plain version string with only letters, digits, '.', '_', '+', '-'."
    );
  }
}

const REGISTRY = "https://registry.npmjs.org";
let npmCliCache;

const RE_NPM_ALIAS = /^npm:(.+)@([^@]+)$/;
const RE_WORKSPACE = /^workspace:/i;
const RE_FILE_LINK = /^(file:|link:)/i;
// Bare local path with no protocol prefix: ./x  ../x  ~/x  /x  C:\x
const RE_LOCAL_PATH = /^(\.\.?[\\/]|~[\\/]|\/|[A-Za-z]:[\\/])/;
const RE_GIT_PREFIX = /^(git\+ssh:|git\+https:|git\+http:|git:\/\/|git@|github:|gitlab:|bitbucket:)/i;
const RE_TARBALL_URL = /^https?:\/\/.+\.(tgz|tar\.gz)$/i;
const RE_GITHUB_SHORTHAND = /^[\w.-]+\/[\w.-]+(#.*)?$/;
const RE_COMMIT_REF = /#([0-9a-f]{7,40})$/i;
const RE_EXACT_SEMVER =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const RE_DIST_TAG = /^(latest|next|beta|alpha|canary|rc|nightly|experimental|unstable)$/i;
const RE_CARET_TILDE = /^[\^~]/;
const RE_COMPARATOR = /[<>]=?|\|\|/;
const RE_HYPHEN_RANGE = /^\S+\s+-\s+\S+/;
const RE_WILDCARD = /^(\d+|\*|[xX])(\.(\d+|\*|[xX])){0,2}$/;

/**
 * Classify a version specifier.
 *
 * Evaluation order matters: exempt prefixes and git/URL syntax are peeled off
 * before the semver/range regexes, which would otherwise false-match on them.
 * Anything unrecognized falls through to floating — default-deny, never a
 * silent pass.
 *
 * @returns {{ status: "pinned"|"floating"|"exempt", reason: string, note?: string }}
 */
function classify(spec, depth = 0) {
  if (typeof spec !== "string") {
    return {
      status: "floating",
      reason: "unrecognized/unparseable specifier — treated as floating by default-deny policy",
    };
  }

  const s = spec.trim();

  // 1. Empty — npm reads "" the same as "*".
  if (s === "") {
    return { status: "floating", reason: 'empty specifier — npm treats "" as "*"' };
  }

  // 2. npm alias — the real constraint is the inner spec.
  const alias = s.match(RE_NPM_ALIAS);
  if (alias && depth < 4) {
    const inner = classify(alias[2], depth + 1);
    return { ...inner, note: `npm alias → ${alias[1]}@${alias[2]}` };
  }

  // 3. Local / workspace references — never fetched from the public registry,
  //    so the registry-substitution risk does not apply. Reported for visibility.
  if (RE_WORKSPACE.test(s) || RE_FILE_LINK.test(s) || RE_LOCAL_PATH.test(s)) {
    return {
      status: "exempt",
      reason: "local/workspace reference — not fetched from the public registry",
    };
  }

  // 4. Git / URL specifiers. Only a hex commit SHA is immutable; a tag ref like
  //    #v1.2.3 can be moved, so it does not count as pinned.
  if (RE_GIT_PREFIX.test(s) || RE_TARBALL_URL.test(s) || RE_GITHUB_SHORTHAND.test(s)) {
    const ref = s.match(RE_COMMIT_REF);
    if (ref) {
      return { status: "pinned", reason: "git ref pinned to commit " + ref[1] };
    }
    return {
      status: "floating",
      reason: "git/URL specifier without a commit-SHA ref (branch, tag, or no ref) — mutable",
    };
  }

  // 5. Exact semver — the only shape npm cannot re-resolve.
  if (RE_EXACT_SEMVER.test(s)) {
    return { status: "pinned", reason: "exact semver" };
  }

  // 6. Named floating shapes — matched before the catch-all so the report says
  //    what is actually wrong with the specifier.
  if (RE_DIST_TAG.test(s)) {
    return {
      status: "floating",
      reason: `dist-tag "${s}" — resolves to whatever is currently published under that tag`,
    };
  }
  if (RE_CARET_TILDE.test(s)) {
    return { status: "floating", reason: "caret/tilde range" };
  }
  if (RE_COMPARATOR.test(s)) {
    return { status: "floating", reason: "comparator range (>=, <=, >, <, ||)" };
  }
  if (RE_HYPHEN_RANGE.test(s)) {
    return { status: "floating", reason: "hyphen range" };
  }
  if (RE_WILDCARD.test(s)) {
    return { status: "floating", reason: "wildcard/x-range or partial version" };
  }

  // 7. Default-deny.
  return {
    status: "floating",
    reason: "unrecognized/unparseable specifier — treated as floating by default-deny policy",
  };
}

module.exports = {
  id: "npm",
  manifestFileNames: ["package.json"],
  skipDirNames: [],
  // Wording used by the generic report ("Scanning N package.json file(s)...").
  manifestLabel: "package.json",
  depFields: ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"],

  classify,

  parseManifest(filePath, content) {
    const pkg = JSON.parse(content);
    const fields = {};
    for (const field of this.depFields) if (pkg[field]) fields[field] = pkg[field];
    return { fields };
  },

  resolveVersion(name, version) {
    assertSafeNpmName(name);
    if (version && version !== "latest") return version;
    return execSync(`npm view ${JSON.stringify(name)} version`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  },

  fetchLicense(name, version) {
    try {
      assertSafeNpmName(name);
      assertSafeVersionArg(version);
      const out = execSync(`npm view ${JSON.stringify(name + "@" + version)} license --json`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      return JSON.parse(out);
    } catch {
      return null;
    }
  },

  /**
   * Whether an `npm` CLI is on PATH. A Bun-only machine usually has none, and
   * then every `npm view` fails — which fetchLicense reports as null, i.e.
   * "no license declared", a forbidden P0. Callers check this first and use
   * fetchLicenseFromRegistry instead, so a missing tool is never reported as a
   * licence violation.
   */
  npmCliAvailable() {
    if (npmCliCache === undefined) {
      try {
        execSync("npm --version", { stdio: ["pipe", "pipe", "pipe"] });
        npmCliCache = true;
      } catch {
        npmCliCache = false;
      }
    }
    return npmCliCache;
  },

  /**
   * Licence from the public registry's version document, without the npm CLI.
   * Resolves to the declared licence (string / array / null when none is
   * declared). Rejects when the registry cannot be asked — a lookup failure,
   * which the caller must keep distinct from "no licence declared".
   * Note: this reads registry.npmjs.org only; it does not honour a private
   * registry configured in .npmrc the way `npm view` does.
   */
  async fetchLicenseFromRegistry(name, version) {
    assertSafeNpmName(name);
    assertSafeVersionArg(version);
    const url = `${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`registry ${res.status} for ${name}@${version}`);
    const doc = await res.json();
    if (doc.license != null) return typeof doc.license === "object" ? doc.license.type || null : doc.license;
    if (Array.isArray(doc.licenses)) {
      const types = doc.licenses.map((l) => (typeof l === "object" ? l.type : l)).filter(Boolean);
      return types.length > 0 ? types : null;
    }
    return null;
  },

  policyFile: "pinning-policy.json",
};
