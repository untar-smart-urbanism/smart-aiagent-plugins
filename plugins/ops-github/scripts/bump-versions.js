#!/usr/bin/env node
/**
 * Analyze unpushed commits and bump app/package versions (SemVer + Conventional Commits).
 *
 * Usage:
 *   node bump-versions.js [--cwd <path>] [--dry-run] [--auto-commit] [--since <ref>]
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cwd = process.argv.includes("--cwd")
  ? path.resolve(process.argv[process.argv.indexOf("--cwd") + 1])
  : process.cwd();
const dryRun = process.argv.includes("--dry-run");
const autoCommit = process.argv.includes("--auto-commit");
const sinceIdx = process.argv.indexOf("--since");
const sinceRef = sinceIdx >= 0 ? process.argv[sinceIdx + 1] : null;

const BUMP_RANK = { none: 0, patch: 1, minor: 2, major: 3 };

const LOG_SEP = "\x1e";
const LOG_FORMAT = `%s${LOG_SEP}%b${LOG_SEP}%H`;

// execFileSync, NOT execSync: execSync's signature is (command, options), so passing an args ARRAY
// as the second parameter put it where `options` belongs and silently discarded the real options
// object (including `cwd`). The call then ran bare `git` with no arguments, which exits 1 — so every
// git() call here threw. Every caller wraps git() in try/catch with an empty fallback, so the
// failure was invisible: resolveSinceRef() returned null, getUnpushedCommits()/getChangedFiles()
// returned [], and main() reported "No unpushed changes — skipping version bump." on every run.
// Net effect: version bumping never worked at all.
// stderr is piped rather than inherited (execFileSync's default sends it to the parent) because
// several probes here are EXPECTED to fail — resolveSinceRef() deliberately tries a branch upstream
// that a fresh branch does not have. Inheriting stderr printed a bare "fatal: no upstream configured
// for branch X" on every normal run, which reads like a real error. The message is still available on
// the thrown error's .stderr for callers that want it.
function git(args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fileExists(rel) {
  return fs.existsSync(path.join(cwd, rel));
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(cwd, rel), "utf8"));
}

function writeJson(rel, data) {
  if (!dryRun) {
    fs.writeFileSync(path.join(cwd, rel), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

function bumpVersion(version, level) {
  const v = parseVersion(version);
  if (!v) return version;
  if (level === "major") return `${v.major + 1}.0.0`;
  if (level === "minor") return `${v.major}.${v.minor + 1}.0`;
  if (level === "patch") return `${v.major}.${v.minor}.${v.patch + 1}`;
  return version;
}

function discoverVersionTargets() {
  const targets = [];

  const rootPkg = path.join(cwd, "package.json");
  if (fs.existsSync(rootPkg)) {
    const pkg = JSON.parse(fs.readFileSync(rootPkg, "utf8"));
    if (pkg.version && !pkg.private) {
      targets.push({ file: "package.json", name: pkg.name || "root", scope: "" });
    }
  }

  for (const dir of ["apps", "packages", "plugins"]) {
    const base = path.join(cwd, dir);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest =
        dir === "plugins"
          ? path.join(dir, entry.name, "plugin.manifest.json")
          : path.join(dir, entry.name, "package.json");
      if (!fileExists(manifest)) continue;
      const data = readJson(manifest);
      if (!data.version) continue;
      targets.push({
        file: manifest.replace(/\\/g, "/"),
        name: data.name || entry.name,
        scope: `${dir}/${entry.name}`,
      });
    }
  }

  return targets;
}

/** origin's default branch ref (e.g. "origin/main"), or null if none can be resolved. */
function resolveDefaultBranchRef() {
  for (const candidate of ["origin/HEAD", "origin/main", "origin/master"]) {
    try {
      const resolved = git(["rev-parse", "--abbrev-ref", candidate]);
      if (resolved) return resolved;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

function resolveSinceRef() {
  if (sinceRef) return sinceRef;
  try {
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    const upstream = git(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]);
    if (upstream) return upstream;
  } catch {
    /* no upstream */
  }
  // A freshly created feature branch has no upstream until its first push, and push-github.js runs
  // this bump BEFORE pushing — so the no-upstream case is the NORMAL one, not an edge case. Use the
  // merge-base with origin's default branch: that is the true "what is unpushed on this branch"
  // baseline. Without it, a repo with no tags falls through to `git log -20` below and bumps from 20
  // arbitrary commits of unrelated history (a stray `feat!` there would cut a major release).
  const defaultRef = resolveDefaultBranchRef();
  if (defaultRef) {
    try {
      const mergeBase = git(["merge-base", defaultRef, "HEAD"]);
      if (mergeBase) return mergeBase;
    } catch {
      /* fall through to the tag heuristic */
    }
  }
  try {
    return git(["describe", "--tags", "--abbrev=0"]);
  } catch {
    return null;
  }
}

function getUnpushedCommits(ref) {
  const logArgs = ["log", `--pretty=format:${LOG_FORMAT}`];
  if (ref) logArgs.push(`${ref}..HEAD`);
  else logArgs.push("-20");
  try {
    const out = git(logArgs);
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getChangedFiles(ref) {
  const diffArgs = ["diff", "--name-only", ref ? `${ref}..HEAD` : "HEAD"];
  try {
    const out = git(diffArgs);
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function classifyCommit(subject, body) {
  const text = `${subject}\n${body}`;
  const scopeMatch = subject.match(/^\w+(?:\(([^)]+)\))?!?:/);
  const commitScope = scopeMatch?.[1]?.toLowerCase();
  if (/BREAKING CHANGE/i.test(text) || /!\:/.test(subject) || /\w+!(\(|:)/.test(subject)) {
    return { level: "major", commitScope };
  }
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:/);
  const type = match?.[1]?.toLowerCase();
  let level = "none";
  if (type === "feat") level = "minor";
  else if (type === "fix" || type === "perf" || type === "refactor" || type === "security") level = "patch";
  return { level, commitScope: match?.[2]?.toLowerCase() };
}

function commitScopeMatchesTarget(commitScope, target) {
  if (!commitScope) return true;
  const short = target.scope.split("/").pop();
  const name = target.name.toLowerCase();
  return (
    commitScope === short ||
    commitScope === name ||
    commitScope === target.scope.replace(/\//g, "-") ||
    target.scope.includes(commitScope)
  );
}

function scopeForFile(filePath) {
  const norm = filePath.replace(/\\/g, "/");
  if (norm.startsWith("apps/frontend/")) return "apps/frontend";
  if (norm.startsWith("apps/backend/")) return "apps/backend";
  const pkgMatch = norm.match(/^packages\/([^/]+)\//);
  if (pkgMatch) return `packages/${pkgMatch[1]}`;
  const pluginMatch = norm.match(/^plugins\/([^/]+)\//);
  if (pluginMatch) return `plugins/${pluginMatch[1]}`;
  if (norm === "package.json" || norm.startsWith("apps/") || norm.startsWith("packages/")) {
    return "";
  }
  return null;
}

function maxBump(a, b) {
  return BUMP_RANK[a] >= BUMP_RANK[b] ? a : b;
}

function filesForScope(changedFiles, scope) {
  return changedFiles.filter((f) => {
    const s = scopeForFile(f);
    return s === scope;
  });
}

function analyze(targets, commits, changedFiles) {
  const bumpByScope = new Map();
  for (const t of targets) bumpByScope.set(t.scope, "none");

  for (const target of targets) {
    const scopeFiles = filesForScope(changedFiles, target.scope);
    if (scopeFiles.length === 0) continue;

    let level = "none";
    for (const entry of commits) {
      const parts = entry.split(LOG_SEP);
      const subject = parts[0] || "";
      const body = parts[1] || "";
      const { level: commitLevel, commitScope } = classifyCommit(subject, body);
      if (commitLevel === "none") continue;
      if (!commitScopeMatchesTarget(commitScope, target)) continue;
      level = maxBump(level, commitLevel);
    }

    if (level === "none" && scopeFiles.some((f) => /\/(src|lib)\//.test(f.replace(/\\/g, "/")))) {
      level = "patch";
    }

    bumpByScope.set(target.scope, level);

    if (
      target.scope.startsWith("packages/shared-types") ||
      target.scope.startsWith("packages/shared-utils")
    ) {
      for (const t of targets) {
        if (t.scope.startsWith("apps/") && filesForScope(changedFiles, t.scope).length > 0) {
          bumpByScope.set(t.scope, maxBump(bumpByScope.get(t.scope), "minor"));
        }
      }
    }
  }

  return bumpByScope;
}

function main() {
  const targets = discoverVersionTargets();
  if (targets.length === 0) {
    console.log("No versioned apps or packages found — skipping bump.");
    return;
  }

  const ref = resolveSinceRef();
  const commits = getUnpushedCommits(ref);
  const changedFiles = getChangedFiles(ref);

  if (commits.length === 0 && changedFiles.length === 0) {
    console.log("No unpushed changes — skipping version bump.");
    return;
  }

  const bumpByScope = analyze(targets, commits, changedFiles);
  const updates = [];

  for (const target of targets) {
    const level = bumpByScope.get(target.scope) || "none";
    if (level === "none") continue;

    const data = readJson(target.file);
    const next = bumpVersion(data.version, level);
    if (next === data.version) continue;

    const fromVersion = data.version;
    updates.push({ ...target, from: fromVersion, to: next, level });
    data.version = next;
    writeJson(target.file, data);

    if (target.file.includes("plugins/") && target.file.endsWith("plugin.manifest.json")) {
      for (const platform of [".cursor-plugin", ".claude-plugin", ".codex-plugin"]) {
        const platformJson = target.file.replace(
          "plugin.manifest.json",
          `${platform}/plugin.json`
        );
        if (fileExists(platformJson)) {
          const pData = readJson(platformJson);
          if (pData.version) {
            const prev = pData.version;
            pData.version = next;
            writeJson(platformJson, pData);
            updates.push({
              file: platformJson,
              name: target.name,
              from: prev,
              to: next,
              level,
              note: "platform manifest synced",
            });
          }
        }
      }
    }
  }

  if (updates.length === 0) {
    console.log("Versions are up to date — no bump needed.");
    return;
  }

  console.log(dryRun ? "Dry run — would bump:" : "Bumped versions:");
  for (const u of updates) {
    console.log(`  ${u.name}: ${u.from} → ${u.to} (${u.level}) [${u.file}]`);
  }

  if (dryRun || !autoCommit) return;

  const names = [...new Set(updates.map((u) => u.name))].join(", ");
  const files = [...new Set(updates.map((u) => u.file))];
  git(["add", ...files]);
  git(["commit", "-m", `chore(release): bump ${names}`]);
  console.log("Created version bump commit.");
}

try {
  main();
} catch (e) {
  console.error("bump-versions failed:", e.message || e);
  process.exit(1);
}
