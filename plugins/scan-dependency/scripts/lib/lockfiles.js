/**
 * npm-ecosystem lockfile readers: package-lock.json and Bun's text bun.lock.
 *
 * Each reader returns the resolved registry packages ({ name, version }) plus the
 * entries it deliberately did not resolve to a registry release (workspace, git,
 * file/link, tarball), so the report can say what was left out instead of
 * silently dropping it.
 *
 * bun.lockb — Bun's pre-1.2 binary lockfile — cannot be read here. It is
 * reported as unreadable, never treated as an empty lockfile.
 */

const fs = require("fs");
const path = require("path");

const LOCKFILE_NAMES = ["package-lock.json", "bun.lock", "bun.lockb"];

/**
 * Strip comments and trailing commas outside of strings, turning JSONC (what
 * `bun.lock` is written as) into plain JSON. Strings are copied through
 * untouched, escapes included, so a "//" or "," inside a value survives.
 */
function jsoncToJson(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === ",") {
      // Look past whitespace AND comments: `1, // note\n]` is still a trailing comma.
      let j = i + 1;
      for (;;) {
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] === "/" && text[j + 1] === "/") {
          while (j < n && text[j] !== "\n") j++;
        } else if (text[j] === "/" && text[j + 1] === "*") {
          const end = text.indexOf("*/", j + 2);
          j = end === -1 ? n : end + 2;
        } else break;
      }
      if (text[j] !== "}" && text[j] !== "]") out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Split "name@version" at the last '@' that is not the scope prefix. */
function splitNameAtVersion(ident) {
  if (typeof ident !== "string") return null;
  const at = ident.lastIndexOf("@");
  if (at <= 0) return null;
  return { name: ident.slice(0, at), version: ident.slice(at + 1) };
}

const RE_REGISTRY_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]*)?$/;

function parsePackageLock(lockPath) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const packages = [];
  const skipped = [];
  for (const [pkgPath, meta] of Object.entries(lock.packages || {})) {
    if (!meta.version) continue;
    // "" is the project itself and "packages/web" a workspace folder — both are
    // this repo's own code, not installed dependencies. Only node_modules/ paths are.
    if (!pkgPath.includes("node_modules/")) continue;
    const name = meta.name || pkgPath.replace(/^.*node_modules\//, "");
    if (!name) continue;
    if (meta.link || !RE_REGISTRY_VERSION.test(meta.version)) {
      skipped.push({ name, spec: meta.resolved || meta.version, reason: "not a registry release" });
      continue;
    }
    packages.push({ name, version: meta.version });
  }
  return { packages, skipped };
}

/**
 * bun.lock `packages` maps an install path ("ms", "web/ms", "@scope/x") to a tuple
 * whose first element is the resolved "name@version" — the REAL package name, so
 * an alias ("left-pad": ["pad-left@2.1.0", ...]) resolves to what was installed.
 * Registry tuples look like [ident, registryUrl, meta, integrity]; workspace, git,
 * file and tarball entries carry a non-semver version and are reported as skipped.
 */
function parseBunLock(lockPath) {
  let lock;
  try {
    lock = JSON.parse(jsoncToJson(fs.readFileSync(lockPath, "utf8")));
  } catch (err) {
    throw new Error(`could not parse ${lockPath} as bun.lock (JSONC): ${err.message}`);
  }
  if (!lock || typeof lock.packages !== "object") {
    throw new Error(`${lockPath} has no "packages" object — not a bun.lock this reader understands`);
  }
  const packages = [];
  const skipped = [];
  for (const [installPath, entry] of Object.entries(lock.packages)) {
    const ident = Array.isArray(entry) ? splitNameAtVersion(entry[0]) : null;
    if (!ident) {
      skipped.push({ name: installPath, spec: JSON.stringify(entry).slice(0, 80), reason: "unrecognized entry" });
      continue;
    }
    if (!RE_REGISTRY_VERSION.test(ident.version)) {
      skipped.push({ name: ident.name, spec: ident.version, reason: "not a registry release (workspace/git/file/tarball)" });
      continue;
    }
    packages.push(ident);
  }
  return { packages, skipped };
}

/**
 * @returns {{ kind: string, packages: {name:string,version:string}[], skipped: object[], unreadable?: string }}
 */
function readLockfile(lockPath) {
  const base = path.basename(lockPath);
  if (base === "bun.lockb") {
    return {
      kind: "bun.lockb",
      packages: [],
      skipped: [],
      unreadable:
        "binary bun.lockb cannot be read — convert it with `bun install --save-text-lockfile` " +
        "(Bun 1.2+ writes the text bun.lock by default) and commit bun.lock",
    };
  }
  if (base === "bun.lock") return { kind: "bun.lock", ...parseBunLock(lockPath) };
  return { kind: "package-lock.json", ...parsePackageLock(lockPath) };
}

module.exports = { LOCKFILE_NAMES, jsoncToJson, splitNameAtVersion, parseBunLock, parsePackageLock, readLockfile };
