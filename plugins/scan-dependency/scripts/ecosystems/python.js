/**
 * Python ecosystem adapter for the dependency version-pinning classifier.
 *
 * Same threat model as the npm classifier (scripts/check-pinned-versions.js): a
 * floating specifier lets the resolver pick a different artifact at install time
 * than the one that was audited. In Python that shows up as a bare `requests`
 * with no operator at all, a `>=1.2.3` range, a `~=` compatible-release clause,
 * an `==1.2.*` prefix match, or a git ref pointing at a branch or tag.
 *
 * Every classify* function returns the same shape as the npm classifier:
 *   { status: "pinned" | "floating" | "exempt", reason: string, note?: string }
 * and every unrecognized shape falls through to "floating" — default-deny, never
 * a silent pass.
 *
 * This module is pure classification plus policy-key resolution. Walking the
 * tree, recursing into -r/-c includes, applying severity and computing a verdict
 * are the CLI's job.
 */

const fs = require("fs");
const path = require("path");
const toml = require("smol-toml");

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const POLICY_FILE = "pinning-policy-python.json";

// ---------------------------------------------------------------------------
// Shared regexes
// ---------------------------------------------------------------------------

/**
 * Exact PEP 440 release version. Adapted from PEP 440 Appendix B / the
 * `packaging` library's VERSION_PATTERN, minus the surrounding specifier
 * grammar: epoch, release segment, optional pre/post/dev segments and an
 * optional local version label. Deliberately does NOT accept a `.*` suffix —
 * that is a prefix-match range, handled by RE_WILDCARD_VERSION below.
 */
const RE_EXACT_PEP440_VERSION =
  /^v?(?:[0-9]+!)?[0-9]+(?:\.[0-9]+)*(?:[-_.]?(?:a|b|c|rc|alpha|beta|pre|preview)[-_.]?[0-9]*)?(?:(?:-[0-9]+)|(?:[-_.]?(?:post|rev|r)[-_.]?[0-9]*))?(?:[-_.]?dev[-_.]?[0-9]*)?(?:\+[a-z0-9]+(?:[-_.][a-z0-9]+)*)?$/i;

/** PEP 440 prefix-match operand: 1.2.*, 2.*, 1!3.4.* — a RANGE, not a pin. */
const RE_WILDCARD_VERSION = /^(?:[0-9]+!)?[0-9]+(?:\.[0-9]+)*\.\*$/;

/** Longest-operator-first so `===` is not shadowed by `==`, `>=` not by `>`. */
const RE_SPECIFIER_CLAUSE = /^(===|~=|==|!=|<=|>=|<|>)\s*(.+)$/;

/** Only a hex commit SHA is immutable; a tag or branch ref can be moved. */
const RE_COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

const RE_VCS_PREFIX = /^(git\+ssh:|git\+https:|git\+http:|git:\/\/|git@|hg\+|svn\+|bzr\+)/i;

/**
 * Bare local path with no scheme: ./x  ../x  ~/x  /x  C:\x — and also the bare
 * "." / ".." current/parent-directory forms with nothing after them, which
 * `pip install -e .` (arguably the single most common editable-install
 * pattern there is) uses on their own with no trailing slash at all.
 */
const RE_LOCAL_PATH = /^(\.\.?([\\/]|$)|~[\\/]|\/|[A-Za-z]:[\\/])/;

/** A `file://` URL is a local reference, same exemption as a bare local path. */
const RE_FILE_URL = /^file:\/\//i;

const RE_HTTP_URL = /^https?:\/\//i;

/** PEP 508 direct reference: `name[extras] @ target` (whitespace optional). */
const RE_DIRECT_REFERENCE = /^([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*@\s*(.+)$/;

/** `name[extras]<specifier>` — the ordinary registry requirement. */
const RE_NAME_EXTRAS_SPEC = /^([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*(.*)$/;

const RE_EGG_FRAGMENT = /[#&]egg=([^&#\s]+)/i;

const RE_INCLUDE_OPTION = /^(?:-r|--requirement|-c|--constraint)(?:=|\s+)(.+)$/i;
const RE_EDITABLE_OPTION = /^(?:-e|--editable)(?:=|\s+)(.+)$/i;
const RE_HASH_TOKEN = /(?:^|\s)--hash(?:=|\s+)([A-Za-z0-9_]+:[0-9a-fA-F]+)/gi;

/**
 * requirements*.txt discovery. Broader than a single `requirements*` prefix
 * because the policy file's `_devRequirementsFilenames` also lists the
 * suffix spelling (dev-requirements.txt, test-requirements.txt).
 */
const RE_REQUIREMENTS_FILE =
  /^requirements(?:[-_.][^/\\]*)?\.txt$|^[A-Za-z0-9._-]+[-_.]requirements\.txt$/i;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function withNotes(result, notes) {
  const kept = (notes || []).filter(Boolean);
  return kept.length > 0 ? { ...result, note: kept.join("; ") } : result;
}

/** Split a PEP 508 environment marker off at the first top-level `;`. */
function splitMarker(text) {
  const s = String(text);
  const i = s.indexOf(";");
  if (i === -1) return { requirement: s.trim(), marker: null };
  return { requirement: s.slice(0, i).trim(), marker: s.slice(i + 1).trim() || null };
}

function markerNote(marker) {
  return marker ? `marker: ${marker} (informational, not evaluated)` : null;
}

/**
 * Ref-delimiting `@` in a VCS URL is the LAST `@` before any `#` fragment, so an
 * SSH authority (`git+ssh://git@host/...`) is not mistaken for a ref delimiter.
 */
function extractVcsRef(url) {
  const beforeFragment = url.split("#")[0];
  const at = beforeFragment.lastIndexOf("@");
  return at === -1 ? "" : beforeFragment.slice(at + 1).trim();
}

function eggName(target) {
  const m = target.match(RE_EGG_FRAGMENT);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// B. PEP 440 specifier classification
// ---------------------------------------------------------------------------

/**
 * Classify the specifier portion of a requirement — the part after the name and
 * extras, with any environment marker already stripped by the caller.
 *
 * Shared by requirements.txt lines and PEP 621 dependency arrays. NOT used for
 * Poetry values: see classifyPoetryEntry for why those must stay separate.
 *
 * @param {string} clauseString e.g. "", "==1.2.3", ">=1.2.3,<2.0.0", "~=1.4.2"
 * @returns {{ status: "pinned"|"floating"|"exempt", reason: string, note?: string }}
 */
function classifyPep440Specifier(clauseString) {
  const s = typeof clauseString === "string" ? clauseString.trim() : "";

  // 1. No operator at all. This is the worst case, not a pass: pip resolves it
  //    to whatever is newest on the index at install time.
  if (s === "") {
    return {
      status: "floating",
      reason:
        "no version specifier — pip installs whatever is latest at install time; this is unconstrained, not a range",
    };
  }

  // 2. PEP 440 clauses never nest commas, so a plain split is exact.
  const clauses = s
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  if (clauses.length > 1) {
    return {
      status: "floating",
      reason:
        "multiple comma-separated specifiers — a bounded range still resolves to whichever release in that window is current at install time",
    };
  }

  // 3. Single clause.
  const m = clauses.length === 1 ? clauses[0].match(RE_SPECIFIER_CLAUSE) : null;
  if (!m) {
    return {
      status: "floating",
      reason: "unrecognized/unparseable specifier — treated as floating by default-deny policy",
    };
  }

  const operator = m[1];
  const operand = m[2].trim();

  // 4. Dispatch on operator.
  switch (operator) {
    case "===":
      return {
        status: "pinned",
        reason:
          "arbitrary-equality (===) forces a literal string match with no PEP 440 version-ordering or range resolution",
      };

    case "==":
      // Wildcard BEFORE exact: 1.2.* must report as a prefix-match range, not
      // fall into the generic "does not parse" bucket.
      if (RE_WILDCARD_VERSION.test(operand)) {
        return {
          status: "floating",
          reason:
            "== with a .* wildcard is a PEP 440 prefix-match range, not an exact pin, despite the equality operator",
        };
      }
      if (RE_EXACT_PEP440_VERSION.test(operand)) {
        return { status: "pinned", reason: "exact PEP 440 version" };
      }
      return { status: "floating", reason: "== operand does not parse as a single exact version" };

    case "!=":
      return {
        status: "floating",
        reason:
          "exclusion — installs anything except this one version, i.e. unconstrained apart from one carve-out",
      };

    case "~=":
      return { status: "floating", reason: "compatible-release range (~=X.Y)" };

    default:
      // <=, >=, <, >
      return { status: "floating", reason: "comparator range" };
  }
}

// ---------------------------------------------------------------------------
// C. Requirement-body classification (shared by requirements.txt and PEP 621)
// ---------------------------------------------------------------------------

/**
 * Classify a bare requirement body — everything after comments, pip CLI options,
 * --hash tokens and the environment marker have been stripped off.
 *
 * This is the single home of the VCS / local-path / URL / registry branching.
 * Both classifyRequirementLine and the PEP 621 array path call it, so that
 * logic exists exactly once.
 *
 * @param {string} text
 * @param {{ editable?: boolean, hasHash?: boolean }} [opts]
 * @returns {{ name: string, spec: string, status: string, reason: string,
 *             note?: string, extras?: string, specifier?: string }}
 */
function classifyRequirementSpec(text, opts = {}) {
  const editable = opts.editable === true;
  const hasHash = opts.hasHash === true;
  const rest = String(text == null ? "" : text).trim();
  const notes = [];
  if (editable) notes.push("editable install");

  if (rest === "") {
    return withNotes(
      {
        name: "",
        spec: rest,
        status: "floating",
        reason: "unrecognized/unparseable specifier — treated as floating by default-deny policy",
      },
      notes
    );
  }

  // Peel the PEP 508 direct-reference form `name[extras] @ target` first, but
  // only when the line does not already start with a VCS prefix — `git@host:...`
  // has an `@` that is an SSH authority, not a direct-reference delimiter.
  let declaredName = null;
  let extras = null;
  let target = rest;
  if (!RE_VCS_PREFIX.test(rest)) {
    const direct = rest.match(RE_DIRECT_REFERENCE);
    if (direct) {
      declaredName = direct[1];
      extras = direct[2] || null;
      target = direct[3].trim();
    }
  }
  if (extras) notes.push(`extras ${extras}`);

  // --- VCS reference -------------------------------------------------------
  if (RE_VCS_PREFIX.test(target)) {
    const name = declaredName || eggName(target) || target;
    const ref = extractVcsRef(target);
    const base = { name, spec: rest, extras: extras || undefined };
    if (ref && RE_COMMIT_SHA.test(ref)) {
      return withNotes(
        { ...base, status: "pinned", reason: "git ref pinned to commit " + ref },
        notes
      );
    }
    // `-e` does not exempt this: an editable checkout of a branch still moves.
    return withNotes(
      {
        ...base,
        status: "floating",
        reason: "git/URL ref without a commit-SHA ref (branch, tag, or none) — mutable",
      },
      notes
    );
  }

  // --- Local path / file: URL -----------------------------------------------
  if (RE_LOCAL_PATH.test(target) || RE_FILE_URL.test(target)) {
    return withNotes(
      {
        name: declaredName || target,
        spec: rest,
        extras: extras || undefined,
        status: "exempt",
        reason: "local path reference — not fetched from a registry or VCS",
      },
      notes
    );
  }

  // --- Direct URL reference / bare URL line --------------------------------
  if (RE_HTTP_URL.test(target)) {
    const name = declaredName || eggName(target) || target;
    const base = { name, spec: rest, extras: extras || undefined };
    if (hasHash) {
      return withNotes(
        {
          ...base,
          status: "pinned",
          reason:
            "content-hash pinned (--hash=...) — the installed bytes are verified against a fixed digest regardless of URL mutability",
        },
        notes
      );
    }
    return withNotes(
      {
        ...base,
        status: "floating",
        reason:
          "URL requirement with no commit-SHA VCS ref and no --hash content pin — the URL's target can change",
      },
      notes
    );
  }

  // A `name @ something` whose target is neither VCS, local path nor http(s).
  if (declaredName !== null) {
    return withNotes(
      {
        name: declaredName,
        spec: rest,
        extras: extras || undefined,
        status: "floating",
        reason: "unrecognized/unparseable specifier — treated as floating by default-deny policy",
      },
      notes
    );
  }

  // --- Ordinary registry requirement: name[extras]<specifier> --------------
  const m = target.match(RE_NAME_EXTRAS_SPEC);
  if (!m) {
    return withNotes(
      {
        name: target,
        spec: rest,
        status: "floating",
        reason: "unrecognized/unparseable specifier — treated as floating by default-deny policy",
      },
      notes
    );
  }

  const name = m[1];
  const nameExtras = m[2] || null;
  const specifier = m[3].trim();
  if (nameExtras) notes.push(`extras ${nameExtras}`);
  // A --hash on a registry install is legal but does not change the verdict —
  // the ==/exact-version classification already governs.
  if (hasHash) notes.push("--hash also present (does not change the version-pin verdict)");

  const result = classifyPep440Specifier(specifier);
  return withNotes(
    {
      name,
      spec: rest,
      specifier,
      extras: nameExtras || undefined,
      status: result.status,
      reason: result.reason,
    },
    notes.concat(result.note || null)
  );
}

/**
 * Classify one line of a requirements.txt.
 *
 * @returns {null
 *   | { include: string }
 *   | { name, spec, status, reason, note?, extras?, marker? }}
 *   null for blank/comment/global-option lines; `{ include }` for -r/-c
 *   references, which the caller resolves relative to the referencing file
 *   (with cycle detection) and tags with `via -r <file>`.
 */
function classifyRequirementLine(line, opts = {}) {
  if (typeof line !== "string") return null;

  // 1. Comments. pip requires start-of-line or whitespace before the `#`, so a
  //    VCS fragment (`...x.git@main#egg=x`) is NOT a comment.
  let s = line.replace(/(^|\s+)#.*$/, "").trim();
  if (s === "") return null;

  // 2. -r / --requirement / -c / --constraint — a file reference, not a dep.
  const include = s.match(RE_INCLUDE_OPTION);
  if (include) {
    return { include: include[1].trim().replace(/^["']|["']$/g, "") };
  }

  // 4. Editable flag — checked before the generic option catch-all in step 3.
  //    Does not change status by itself; only a genuinely local path is exempt.
  let editable = false;
  const ed = s.match(RE_EDITABLE_OPTION);
  if (ed) {
    editable = true;
    s = ed[1].trim();
  } else if (s.startsWith("-")) {
    // 3. Any other pip global option (-i, --extra-index-url, -f, --pre,
    //    --require-hashes, --no-binary, ...) is not a dependency.
    return null;
  }

  // 5. --hash=<algo>:<hex> tokens (there can be several).
  let hasHash = false;
  const hashes = [];
  s = s
    .replace(RE_HASH_TOKEN, (_match, digest) => {
      hasHash = true;
      hashes.push(digest);
      return " ";
    })
    .trim();
  if (s === "") return null;

  // 6. Environment marker.
  const split = splitMarker(s);
  const marker = split.marker;

  // 7. Classify the remainder.
  const result = classifyRequirementSpec(split.requirement, { editable, hasHash });

  const notes = [result.note || null, markerNote(marker)].filter(Boolean);
  const entry = { ...result };
  if (marker) entry.marker = marker;
  if (hashes.length > 0) entry.hashes = hashes;
  if (editable) entry.editable = true;
  if (notes.length > 0) entry.note = notes.join("; ");
  else delete entry.note;
  return entry;
}

/**
 * pip requirements files allow backslash line continuation, and `--hash` tokens
 * are almost always written on a continuation line. Join them before parsing,
 * otherwise the trailing `\` corrupts the version specifier and the hash line
 * looks like an unrelated global option.
 */
function joinContinuations(rawLines) {
  const joined = [];
  let buffer = null;
  let startLine = 0;
  rawLines.forEach((raw, index) => {
    const isContinued = /\\\s*$/.test(raw);
    const body = raw.replace(/\\\s*$/, "");
    if (buffer === null) {
      buffer = body;
      startLine = index + 1;
    } else {
      buffer += " " + body.trim();
    }
    if (!isContinued) {
      joined.push({ text: buffer, line: startLine });
      buffer = null;
    }
  });
  if (buffer !== null) joined.push({ text: buffer, line: startLine });
  return joined;
}

/**
 * Parse a whole requirements file.
 *
 * @returns {{ entries: Array<object>, includes: Array<{path: string, line: number}> }}
 *   Includes are returned unresolved — resolution, recursion and cycle
 *   detection belong to the caller.
 */
function parseRequirementsFile(content) {
  const entries = [];
  const includes = [];
  for (const { text, line } of joinContinuations(String(content == null ? "" : content).split(/\r?\n/))) {
    const result = classifyRequirementLine(text);
    if (!result) continue;
    if (result.include) {
      includes.push({ path: result.include, line });
      continue;
    }
    entries.push({ ...result, line });
  }
  return { entries, includes };
}

// ---------------------------------------------------------------------------
// D. pyproject.toml
// ---------------------------------------------------------------------------

/**
 * Classify a Poetry BARE VERSION STRING value.
 *
 * DO NOT merge this with classifyPep440Specifier. The two have deliberately
 * OPPOSITE defaults for a bare token:
 *   - requirements.txt `requests`      → the name carries NO specifier at all
 *                                        → unconstrained → floating.
 *   - Poetry `requests = "1.2.3"`      → the name is the table key and the value
 *                                        is a version → Poetry's documented
 *                                        "exact requirements" semantics → pinned.
 * Collapsing them into one "bare token" path would silently flip one of the two.
 */
function classifyPoetryVersionString(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";

  if (s === "*") return { status: "floating", reason: "wildcard — any version" };
  if (s.startsWith("^")) return { status: "floating", reason: "caret range" };
  // Poetry's own bare tilde (~1.2.3) is checked here; `~=1.2.3` is PEP 440's
  // compatible-release operator and falls through to the delegate below.
  if (s.startsWith("~") && !s.startsWith("~=")) {
    return { status: "floating", reason: "tilde range" };
  }

  // Poetry also accepts PEP 440-style operator-prefixed strings (==, ===, ~=,
  // !=, >=, <=, <, >) as an alternative to its native caret/tilde/wildcard
  // syntax. Delegate to the same dispatch requirements.txt uses rather than
  // re-deriving it, so `requests = "==1.2.3"` is recognized as pinned exactly
  // like requirements.txt's `requests==1.2.3` is, instead of falling through
  // to "does not parse as a version".
  if (RE_SPECIFIER_CLAUSE.test(s)) {
    return classifyPep440Specifier(s);
  }

  if (RE_WILDCARD_VERSION.test(s)) return { status: "floating", reason: "wildcard/x-range" };
  if (RE_EXACT_PEP440_VERSION.test(s)) {
    return {
      status: "pinned",
      reason:
        "bare Poetry version string — Poetry's documented 'exact requirements' semantics: install this version and only this version",
    };
  }
  return { status: "floating", reason: "does not parse as a version" };
}

/**
 * Classify one `[tool.poetry.*.dependencies]` entry.
 *
 * @param {string} key   dependency name (table key)
 * @param {*} value      string version, inline table, or anything else
 * @returns {null | { status, reason, note? }}  null means "skip, not a dependency"
 */
function classifyPoetryEntry(key, value) {
  // 1. Poetry's required-Python-version key is not a PyPI package.
  if (key === "python") return null;

  // Arrays (Poetry multiple-constraints dependencies) are objects to typeof,
  // so they must be rejected before the inline-table branch.
  if (Array.isArray(value)) {
    return { name: key, status: "floating", reason: "unrecognized dependency value shape" };
  }

  // 2. Inline table.
  if (value !== null && typeof value === "object") {
    if (typeof value.path === "string") {
      return { name: key, spec: value.path, status: "exempt", reason: "local path dependency" };
    }

    if (value.git !== undefined) {
      const rev = typeof value.rev === "string" ? value.rev.trim() : "";
      if (rev !== "") {
        if (RE_COMMIT_SHA.test(rev)) {
          return {
            name: key,
            spec: String(value.git),
            status: "pinned",
            reason: "git dependency pinned to commit " + rev,
          };
        }
        return {
          name: key,
          spec: String(value.git),
          status: "floating",
          reason:
            "rev is not a commit SHA — could be a moving tag/branch reused for a different commit",
        };
      }
      if (value.tag !== undefined) {
        return {
          name: key,
          spec: String(value.git),
          status: "floating",
          reason: "pinned to a tag ref, which is mutable — a tag can be force-moved",
        };
      }
      // branch present, or nothing at all → the branch HEAD moves either way.
      return {
        name: key,
        spec: String(value.git),
        status: "floating",
        reason: "pinned to a branch, or unpinned and defaulting to the branch HEAD",
      };
    }

    if (value.url !== undefined) {
      const url = String(value.url);
      if (RE_FILE_URL.test(url)) {
        return {
          name: key,
          spec: url,
          status: "exempt",
          reason: "local file: URL — not fetched from a registry or VCS",
        };
      }
      return {
        name: key,
        spec: url,
        status: "floating",
        reason: "URL dependency — no immutable content verification available at the manifest level",
      };
    }

    if (value.version !== undefined) {
      const inner =
        typeof value.version === "string"
          ? classifyPoetryVersionString(value.version)
          : { status: "floating", reason: "unrecognized dependency value shape" };
      const extras = Array.isArray(value.extras) ? value.extras.join(", ") : null;
      return withNotes(
        { name: key, spec: String(value.version), ...inner },
        [extras ? `extras: ${extras}` : null]
      );
    }

    return {
      name: key,
      status: "floating",
      reason: "inline table has no recognizable version/git/path/url field",
    };
  }

  // 3. Bare version string.
  if (typeof value === "string") {
    return { name: key, spec: value, ...classifyPoetryVersionString(value) };
  }

  // 4. Default-deny.
  return { name: key, status: "floating", reason: "unrecognized dependency value shape" };
}

/** Classify one PEP 508 string out of a TOML array (no comments/options/hashes). */
function classifyPep508String(text) {
  const { requirement, marker } = splitMarker(String(text == null ? "" : text));
  const result = classifyRequirementSpec(requirement, {});
  const notes = [result.note || null, markerNote(marker)].filter(Boolean);
  const entry = { ...result };
  if (marker) entry.marker = marker;
  if (notes.length > 0) entry.note = notes.join("; ");
  else delete entry.note;
  return entry;
}

function addField(out, fieldName, meta, classifiedEntries) {
  if (classifiedEntries.length === 0) return;
  const bucket = {};
  for (const entry of classifiedEntries) {
    bucket[entry.name] = entry;
  }
  out.fields[fieldName] = bucket;
  out.fieldMeta[fieldName] = meta;
}

/**
 * Parse pyproject.toml and classify every declared dependency.
 *
 * Reads PEP 621 `[project] dependencies` / `[project.optional-dependencies]`
 * and Poetry `[tool.poetry.dependencies]`, `[tool.poetry.group.*.dependencies]`
 * and legacy `[tool.poetry.dev-dependencies]`.
 *
 * `[tool.poetry.extras]` is intentionally not classified: it only names which
 * already-declared main-table dependencies bundle into an extra, and carries no
 * version specifiers of its own.
 *
 * @returns {{
 *   fields: Object<string, Object<string, object>>,
 *   fieldMeta: Object<string, {kind: string, group: string|null, policyKey: string}>,
 *   parseError?: string
 * }}
 */
function parsePyprojectToml(content) {
  const out = { fields: {}, fieldMeta: {} };

  let parsed;
  try {
    parsed = toml.parse(String(content == null ? "" : content));
  } catch (e) {
    // Fail loudly rather than silently reporting zero dependencies.
    out.parseError = e && e.message ? e.message : String(e);
    return out;
  }
  if (!parsed || typeof parsed !== "object") return out;

  const project = parsed.project;
  const poetry = parsed.tool && parsed.tool.poetry;

  // --- PEP 621 -------------------------------------------------------------
  if (project && Array.isArray(project.dependencies)) {
    addField(
      out,
      "project.dependencies",
      { kind: "pep621", group: null, policyKey: "pyprojectDependencies" },
      project.dependencies.map(classifyPep508String)
    );
  }

  const optional = project && project["optional-dependencies"];
  if (optional && typeof optional === "object") {
    for (const [group, list] of Object.entries(optional)) {
      if (!Array.isArray(list)) continue;
      addField(
        out,
        `project.optional-dependencies.${group}`,
        { kind: "pep621-optional", group, policyKey: "pyprojectOptionalDependencies" },
        list.map(classifyPep508String)
      );
    }
  }

  // --- Poetry --------------------------------------------------------------
  const classifyTable = (table) => {
    if (!table || typeof table !== "object") return [];
    const results = [];
    for (const [name, value] of Object.entries(table)) {
      const result = classifyPoetryEntry(name, value);
      if (result) results.push(result);
    }
    return results;
  };

  if (poetry && poetry.dependencies) {
    addField(
      out,
      "tool.poetry.dependencies",
      { kind: "poetry", group: null, policyKey: "poetryMain" },
      classifyTable(poetry.dependencies)
    );
  }

  if (poetry && poetry.group && typeof poetry.group === "object") {
    for (const [group, cfg] of Object.entries(poetry.group)) {
      if (!cfg || typeof cfg !== "object" || !cfg.dependencies) continue;
      addField(
        out,
        `tool.poetry.group.${group}.dependencies`,
        { kind: "poetry-group", group, policyKey: poetryGroupPolicyKey(group) },
        classifyTable(cfg.dependencies)
      );
    }
  }

  if (poetry && poetry["dev-dependencies"]) {
    addField(
      out,
      "tool.poetry.dev-dependencies",
      { kind: "poetry-legacy-dev", group: "dev", policyKey: "poetryDevGroup" },
      classifyTable(poetry["dev-dependencies"])
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Policy access — severity is read from data/pinning-policy-python.json at
// runtime, never hardcoded here.
// ---------------------------------------------------------------------------

let policyCache;

function loadPolicy() {
  if (policyCache === undefined) {
    policyCache = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_ROOT, "data", POLICY_FILE), "utf8")
    );
  }
  return policyCache;
}

function policySeverity() {
  try {
    return loadPolicy().severity || {};
  } catch (e) {
    return {};
  }
}

/** Dev-ish Poetry groups get the policy's dev severity; anything else is main. */
function poetryGroupPolicyKey(group) {
  const names = policySeverity()._poetryDevGroupNames;
  if (!Array.isArray(names)) return "poetryMain"; // fail closed on the stricter key
  return names.includes(String(group).toLowerCase()) ? "poetryDevGroup" : "poetryMain";
}

/** Policy key for a requirements file, from its path/name. */
function requirementsPolicyKey(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/").toLowerCase();
  const devNames = policySeverity()._devRequirementsFilenames;
  if (!Array.isArray(devNames)) return "requirements"; // fail closed on HIGH
  const isDev = devNames.some((n) => {
    const suffix = String(n).replace(/\\/g, "/").toLowerCase();
    return normalized === suffix || normalized.endsWith("/" + suffix);
  });
  return isDev ? "requirementsDev" : "requirements";
}

/** Severity string for a policy key; unmapped keys fail closed on HIGH. */
function severityForPolicyKey(policyKey) {
  return policySeverity()[policyKey] || "HIGH";
}

// ---------------------------------------------------------------------------
// Generic-CLI adapter — the shape scripts/check-pinned-versions.js expects:
// parseManifest(filePath, content) -> { fields, fieldMeta }.
//
// Unlike npm's package.json, this module's parsers already CLASSIFY each
// entry while parsing (requirements.txt needs comment/continuation/marker
// state; Poetry needs to know which table shape it's looking at) — there is
// no clean "get raw specs, then classify separately" split the way npm's
// flat {name: rangeString} map allows. So `fields[field][name]` here holds an
// ALREADY-CLASSIFIED result object ({status, reason, spec, ...}), not a raw
// spec string. The driver detects this (an object with a `.status` string)
// and uses it directly instead of calling `classify()` again.
//
// fieldMeta[field].policyKey lets the driver look up severity by the
// Python-specific keys in pinning-policy-python.json (pyprojectDependencies,
// poetryMain, poetryDevGroup, ...) instead of the raw TOML path used as the
// field name, mirroring how npm's field names already equal its severity keys.
// ---------------------------------------------------------------------------

/**
 * Parse one requirements*.txt file, resolving and recursing into any -r/-c
 * includes itself (relative to the referencing file's own directory), with
 * cycle detection. This keeps recursion entirely inside the ecosystem module
 * rather than requiring the generic walker to understand include directives.
 *
 * @param {string} filePath
 * @param {string} content
 * @param {Set<string>} [seen] - absolute paths already visited, for cycle guarding
 * @returns {{ fields: Object, fieldMeta: Object }}
 */
function parseRequirementsFileWithIncludes(filePath, content, seen) {
  const visited = seen || new Set();
  visited.add(path.resolve(filePath));

  const { entries, includes } = parseRequirementsFile(content);
  const policyKey = requirementsPolicyKey(filePath);
  const bucket = {};

  entries.forEach((entry, i) => {
    const key = entry.name && entry.name !== "" ? entry.name : `(line ${entry.line})`;
    bucket[bucket[key] ? `${key}#${i}` : key] = entry;
  });

  for (const inc of includes) {
    const incPath = path.resolve(path.dirname(filePath), inc.path);
    const tag = `via -r ${path.basename(filePath)} (line ${inc.line})`;

    if (visited.has(incPath)) {
      bucket[`__cycle_${inc.path}`] = {
        name: inc.path,
        spec: inc.path,
        status: "floating",
        reason: `circular -r/-c include detected (${inc.path}) — treated as floating, not silently skipped`,
      };
      continue;
    }
    if (!fs.existsSync(incPath)) {
      bucket[`__missing_${inc.path}`] = {
        name: inc.path,
        spec: inc.path,
        status: "floating",
        reason: `included file not found: ${inc.path} (${tag})`,
      };
      continue;
    }

    const incResult = parseRequirementsFileWithIncludes(
      incPath,
      fs.readFileSync(incPath, "utf8"),
      visited
    );
    for (const innerDeps of Object.values(incResult.fields)) {
      for (const [name, result] of Object.entries(innerDeps)) {
        const withTag = { ...result, note: result.note ? `${result.note}; ${tag}` : tag };
        bucket[bucket[name] ? `${name}#inc` : name] = withTag;
      }
    }
  }

  return {
    fields: { [policyKey]: bucket },
    fieldMeta: { [policyKey]: { kind: "requirements", group: null, policyKey } },
  };
}

/**
 * Adapter entry point: dispatch on the manifest's own filename.
 *
 * @param {string} filePath
 * @param {string} content
 * @returns {{ fields: Object, fieldMeta: Object, parseError?: string }}
 */
function parseManifest(filePath, content) {
  if (RE_REQUIREMENTS_FILE.test(path.basename(filePath))) {
    return parseRequirementsFileWithIncludes(filePath, content);
  }
  return parsePyprojectToml(content);
}

/**
 * Classify a BARE version argument supplied directly on the CLI (e.g.
 * check-package.js's `<version>` positional argument) — NOT a specifier
 * clause pulled out of a manifest.
 *
 * This is deliberately separate from classifyPep440Specifier/`classify`.
 * That function classifies the specifier PORTION of a requirement (the part
 * after the name), where an operator-less string means "no constraint at
 * all" (a bare `requests` line in requirements.txt) — floating by design.
 * A CLI version argument has the opposite meaning: it names the exact
 * version to check, with no operator, by definition — the Python analogue
 * of npm's bare "4.17.21" being recognized as pinned via RE_EXACT_SEMVER.
 * Reusing classifyPep440Specifier here would default-deny every valid CLI
 * invocation (`check-package.js requests 2.31.0 --ecosystem python`).
 *
 * @param {string} versionArg
 * @returns {{ status: "pinned"|"floating", reason: string }}
 */
function classifyVersionArg(versionArg) {
  const s = typeof versionArg === "string" ? versionArg.trim() : "";

  if (s === "") {
    return { status: "floating", reason: "empty version argument" };
  }

  // An operator-prefixed argument (>=1.2.3, ~=1.2, ==1.2.3, ...) is still a
  // RANGE even when supplied directly on the CLI — delegate to the same
  // PEP 440 cascade used for manifest specifiers.
  if (RE_SPECIFIER_CLAUSE.test(s)) {
    return classifyPep440Specifier(s);
  }

  if (RE_WILDCARD_VERSION.test(s)) {
    return { status: "floating", reason: "prefix-match wildcard (X.Y.*), not an exact version" };
  }

  if (RE_EXACT_PEP440_VERSION.test(s)) {
    return { status: "pinned", reason: "exact PEP 440 version" };
  }

  return {
    status: "floating",
    reason: "unrecognized/unparseable version argument — treated as floating by default-deny policy",
  };
}

// ---------------------------------------------------------------------------
// E. Single-package CLI adapter: version resolution + license lookup.
//
// npm's equivalents (ecosystems/npm.js) shell out to `npm view`; PyPI has no
// npm-view equivalent, so these hit PyPI's public JSON API over plain HTTP
// instead. There is no shell string being built here (fetch(), not
// execSync()), so the injection concern npm.js guards against with
// assertSafeNpmName/assertSafeVersionArg doesn't apply the same way — the
// equivalent defensive measure is URL-encoding `name`/`version`, since `name`
// may ultimately come from an agent transcribing untrusted text.
// ---------------------------------------------------------------------------

/**
 * Resolve a version argument to a concrete release version via PyPI's public
 * JSON API — the Python equivalent of `npm view <name> version`.
 *
 * @param {string} name
 * @param {string} [versionArg] - omit or "latest" to resolve the current release
 * @returns {Promise<string>}
 */
async function resolveVersion(name, versionArg) {
  if (versionArg && versionArg !== "latest") return versionArg;
  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!res.ok) throw new Error(`PyPI lookup failed for ${name}: HTTP ${res.status}`);
  const data = await res.json();
  const version = data && data.info && data.info.version;
  if (!version) throw new Error(`PyPI response for ${name} had no info.version`);
  return version;
}

let troveMapCache;

/** data/license-classifier-trove-map.json, cached: trove classifier -> SPDX-ish token. */
function loadTroveMap() {
  if (troveMapCache === undefined) {
    troveMapCache = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_ROOT, "data", "license-classifier-trove-map.json"), "utf8")
    );
  }
  return troveMapCache;
}

/**
 * Look up the declared license for one exact release via PyPI's public JSON
 * API. Returns a value shaped for the ecosystem-neutral checkLicensePolicy()
 * in lib/license-policy.js: a short SPDX-ish string taken from the free-text
 * `info.license` field, an "A OR B" expression built from translated
 * `License :: OSI Approved :: ...` trove classifiers, a raw untranslated
 * classifier (so an unrecognized token still default-denies rather than
 * silently passing), or null when nothing is declared / the lookup fails —
 * which routes to checkLicensePolicy's "Empty / no license declared" path.
 *
 * @param {string} name
 * @param {string} version - exact release version, e.g. from resolveVersion()
 * @returns {Promise<string|null>}
 */
async function fetchLicense(name, version) {
  try {
    const res = await fetch(
      `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const info = (data && data.info) || {};

    // A short, non-"UNKNOWN" free-text license field is usually already an
    // SPDX-ish token (e.g. "MIT", "BSD-3-Clause") — pass it straight to the
    // classifier untranslated. A long blob (some packages inline the entire
    // license TEXT into this field) is not a token to match against SPDX ids.
    const raw = typeof info.license === "string" ? info.license.trim() : "";
    if (raw && raw.length < 80 && !/^unknown$/i.test(raw)) return raw;

    const troveMap = loadTroveMap();
    const classifiers = (info.classifiers || []).filter((c) => c.startsWith("License ::"));
    const translated = classifiers.map((c) => troveMap.map[c]).filter(Boolean);
    if (translated.length > 0) return translated.join(" OR ");
    if (classifiers.length > 0) return classifiers[0]; // untranslated -> forbidden/default-deny catches it
    return null; // -> checkLicensePolicy's "Empty / no license declared" path
  } catch {
    return null;
  }
}

module.exports = {
  id: "python",
  manifestFileNames: ["pyproject.toml"],
  requirementsFilePattern: RE_REQUIREMENTS_FILE,
  // The generic report prints "Scanning N <manifestLabel> file(s)..." — this
  // ecosystem scans two distinct manifest kinds, not just pyproject.toml.
  manifestLabel: "requirements.txt/pyproject.toml",
  skipDirNames: ["venv", ".venv", "__pycache__", ".tox", "site-packages", "node_modules"],
  policyFile: POLICY_FILE,

  // Single-package CLI (check-package.js): OSV/license half.
  resolveVersion,
  fetchLicense,
  // check-package.js prefers this over `classify` for the pinning gate on a
  // bare CLI version argument — see classifyVersionArg's doc comment for why
  // `classify` (classifyPep440Specifier) is the wrong function for that job.
  classifyVersionArg,

  parseManifest,
  parseRequirementsFileWithIncludes,
  // Defensive fallback only — every value parseManifest() produces is already
  // classified, so the generic driver never actually calls this for Python.
  // Exported for parity with the npm adapter and any direct/test callers.
  classify: classifyPep440Specifier,

  classifyPep440Specifier,
  classifyRequirementSpec,
  classifyRequirementLine,
  parseRequirementsFile,
  classifyPep508String,
  classifyPoetryVersionString,
  classifyPoetryEntry,
  parsePyprojectToml,

  loadPolicy,
  poetryGroupPolicyKey,
  requirementsPolicyKey,
  severityForPolicyKey,

  // exported for the parallel shared-engine refactor / tests
  RE_EXACT_PEP440_VERSION,
  RE_WILDCARD_VERSION,
  RE_COMMIT_SHA,
};
