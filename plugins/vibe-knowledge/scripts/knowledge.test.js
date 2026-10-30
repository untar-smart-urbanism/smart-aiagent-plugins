"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "knowledge.js");
const topics = ["architecture", "coding", "debugging", "testing", "security", "data", "integrations", "dependencies", "performance", "ci-cd", "deployment", "operations", "governance"];
function run(args, cwd) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, value: result.status === 0 ? JSON.parse(result.stdout) : null };
}
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function card(id, project, labels, status = "verified") {
  return { id, project, title: id, summary: `Learning for ${id}`, claim: "A reproducible fix applies here.", applicability: "This repository at the recorded revision.", status, labels,
    verification: { level: status === "verified" ? "reproduced" : "observed", revision: "abc123", date: "2026-09-26" },
    evidence: [{ kind: "commit", ref: "abc123" }], related: [], conflicts: [], supersedes: [] };
}
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-knowledge-test-"));
  fs.writeFileSync(path.join(dir, "topics.json"), JSON.stringify(topics));
  git(["init", "-q"], dir);
  git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "init"], dir);
  return dir;
}
function put(repo, item) {
  const rel = item.project === "shared" ? `shared/cards/${item.id}.json` : `projects/${item.project}/cards/${item.id}.json`;
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(item));
}
test("topic search stays within project, includes shared patterns and visible conflicts", () => {
  const repo = fixture();
  try {
    const project = "github.com/team/app";
    const a = card("security-fix", project, ["security", "coding"]);
    const b = card("security-dispute", project, ["security"], "disputed");
    a.conflicts = [b.id]; b.conflicts = [a.id];
    put(repo, a); put(repo, b);
    put(repo, card("shared-pattern", "shared", ["security", "architecture"]));
    put(repo, card("foreign-fix", "github.com/team/other", ["security"]));
    put(repo, card("unrelated", project, ["data"]));
    assert.equal(run(["catalog", "--repo", repo, "--write"], repo).status, 0);
    const result = run(["search", "--repo", repo, "--project", "https://github.com/team/app.git", "--labels", "security,coding"], repo);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.value.cards.map((c) => c.id), ["security-fix", "security-dispute", "shared-pattern"]);
    assert(result.value.conflicts.some((c) => c.id === "security-dispute"));
    assert.equal(run(["show", "--repo", repo, "--project", "https://github.com/team/app", "--ids", "foreign-fix"], repo).status, 1);
    assert.equal(run(["validate", "--repo", repo], repo).status, 0);
    const stale = JSON.parse(fs.readFileSync(path.join(repo, "catalog.json")));
    stale.cards[0].summary = "stale";
    fs.writeFileSync(path.join(repo, "catalog.json"), JSON.stringify(stale));
    assert.equal(run(["validate", "--repo", repo], repo).status, 1);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
test("unverified claims and sensitive content cannot enter the catalog", () => {
  const repo = fixture();
  try {
    const weak = card("weak-fix", "github.com/team/app", ["debugging"]);
    weak.verification.level = "observed";
    put(repo, weak);
    assert.equal(run(["catalog", "--repo", repo, "--write"], repo).status, 1);
    fs.rmSync(path.join(repo, "projects"), { recursive: true });
    const pii = card("pii-fix", "github.com/team/app", ["security"]);
    pii.evidence[0].ref = "person@example.com";
    put(repo, pii);
    assert.equal(run(["catalog", "--repo", repo, "--write"], repo).status, 1);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
test("offline refresh identifies the cached revision", () => {
  const repo = fixture();
  try {
    assert.equal(run(["catalog", "--repo", repo, "--write"], repo).status, 0);
    const result = run(["refresh", "--repo", repo], repo);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.value.cached, true);
    assert.equal(result.value.revision, git(["rev-parse", "HEAD"], repo));
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});
