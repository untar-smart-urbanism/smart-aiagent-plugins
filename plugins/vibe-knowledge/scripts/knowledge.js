#!/usr/bin/env node
"use strict";

// The model sees search results, never the complete catalog or transcript store.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const TOPICS = ["architecture", "coding", "debugging", "testing", "security", "data", "integrations", "dependencies", "performance", "ci-cd", "deployment", "operations", "governance"];
const MAX_PUBLISH_CARDS = 20;
const REMOTE = "https://github.com/acme-org-ops/vibe-knowledge.git";
const DEFAULT_CACHE = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".cache"), "vibe-knowledge", "repo");

function fail(message) { throw new Error(message); }
function json(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); }
function git(args, cwd, timeout = 30000) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", timeout, windowsHide: true });
  if (result.error || result.status !== 0) fail(`git ${args[0]} failed: ${(result.stderr || result.error?.message || "unknown error").trim()}`);
  return result.stdout.trim();
}
function options(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!token.startsWith("--")) { out._.push(token); continue; }
    const key = token.slice(2);
    if (["write", "shared"].includes(key)) { out[key] = true; continue; }
    if (!args[i + 1] || args[i + 1].startsWith("--")) fail(`Missing value for ${token}`);
    out[key] = args[++i];
  }
  return out;
}
function normalizeRemote(value) {
  let parsed;
  const scp = value.match(/^[^@]+@([^:]+):(.+)$/);
  if (scp) parsed = { host: scp[1], pathname: scp[2] };
  else {
    const url = new URL(value);
    if (!["https:", "ssh:"].includes(url.protocol)) fail("Only HTTPS or SSH Git remotes are supported");
    parsed = { host: url.hostname, pathname: url.pathname };
  }
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "").split("/");
  if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9._-]+$/.test(p))) fail("Git remote must identify one host/owner/repo");
  return `${parsed.host.toLowerCase()}/${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`;
}
function projectOf(opts) {
  if (opts.project) return normalizeRemote(opts.project);
  return normalizeRemote(git(["remote", "get-url", "origin"], opts.cwd || process.cwd()));
}
function repoOf(opts) { return path.resolve(opts.repo || DEFAULT_CACHE); }
function inside(root, relative) {
  const full = path.resolve(root, relative);
  const rel = path.relative(root, full);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) fail(`Unsafe card path: ${relative}`);
  if (fs.existsSync(full)) {
    const actualRoot = fs.realpathSync(root);
    const actual = fs.realpathSync(full);
    const actualRel = path.relative(actualRoot, actual);
    if (!actualRel || actualRel.startsWith("..") || path.isAbsolute(actualRel)) fail(`Card path escapes knowledge repository: ${relative}`);
  }
  return full;
}
function required(value, field) { if (typeof value !== "string" || !value.trim()) fail(`Card needs ${field}`); }
function validateCard(card) {
  for (const key of ["id", "project", "title", "summary", "claim", "applicability", "status"]) required(card[key], key);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.id)) fail("Card id must be lower-case kebab-case");
  if (card.project !== "shared" && normalizeRemote(`https://${card.project}`) !== card.project) fail("Card project must be a normalized host/owner/repo");
  if (card.summary.length > 180) fail("Card summary must be at most 180 characters");
  if (/[\r\n]/.test(card.title + card.summary)) fail("Card title and summary must each be one line");
  if (!["candidate", "verified", "disputed", "superseded"].includes(card.status)) fail("Invalid card status");
  if (!Array.isArray(card.labels) || card.labels.length < 1 || card.labels.length > 4 || new Set(card.labels).size !== card.labels.length || card.labels.some((l) => !TOPICS.includes(l))) fail("Card needs 1-4 distinct defined topic labels");
  if (!card.verification || !["observed", "reproduced", "reviewed", "deployed"].includes(card.verification.level)) fail("Invalid verification level");
  required(card.verification.date, "verification.date");
  required(card.verification.revision, "verification.revision");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(card.verification.date)) fail("verification.date must be YYYY-MM-DD");
  if (!Array.isArray(card.evidence) || card.evidence.length === 0 || card.evidence.some((e) => !e || !["commit", "pr", "issue", "test", "review", "deployment", "doc"].includes(e.kind) || !e.ref || typeof e.ref !== "string")) fail("Published cards need durable evidence references; chat transcripts stay local");
  for (const field of ["related", "conflicts", "supersedes"]) if (!Array.isArray(card[field]) || card[field].some((id) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) fail(`Card needs ${field} as an array of card IDs`);
  if (card.status === "verified" && (card.verification.level === "observed" || !card.evidence.some((e) => e.kind !== "chat"))) fail("Verified cards need non-chat evidence and a verified level");
  if (card.status === "superseded" && !card.supersededBy) fail("Superseded cards need supersededBy");
  const content = JSON.stringify(card);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}|\bsk-[A-Za-z0-9_-]{20,}|\b(?:password|secret|api[_-]?key|token)\s*[:=]\s*\S+/i.test(content)) fail("Card appears to contain a credential; remove it before publication");
  const possiblePhones = content.match(/\+?\d[\d .()-]{8,}\d/g) || [];
  if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(content) || possiblePhones.some((number) => number.replace(/\D/g, "").length >= 10)) fail("Card appears to contain personal contact data; redact before publication");
}
function cardPath(card) { return card.project === "shared" ? `shared/cards/${card.id}.json` : `projects/${card.project}/cards/${card.id}.json`; }
function listCards(repo) {
  const found = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`Symlink in knowledge tree: ${full}`);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) found.push(full);
    }
  }
  walk(path.join(repo, "projects")); walk(path.join(repo, "shared", "cards"));
  return found.sort();
}
function buildCatalog(repo) {
  const topics = json(path.join(repo, "topics.json"));
  if (JSON.stringify(topics) !== JSON.stringify(TOPICS)) fail("topics.json differs from the defined taxonomy");
  const cards = listCards(repo).map((file) => {
    const card = json(file); validateCard(card);
    const relative = path.relative(repo, file).replace(/\\/g, "/");
    if (relative !== cardPath(card)) fail(`Card project/path mismatch: ${relative}`);
    return { id: card.id, project: card.project, title: card.title, labels: card.labels, summary: card.summary, status: card.status, revision: card.verification.revision, date: card.verification.date, path: relative, related: card.related, conflicts: card.conflicts, supersedes: card.supersedes, supersededBy: card.supersededBy || null };
  });
  const ids = new Set();
  for (const card of cards) { if (ids.has(card.id)) fail(`Duplicate card id: ${card.id}`); ids.add(card.id); }
  for (const card of cards) for (const ref of [...card.related, ...card.conflicts, ...card.supersedes, ...(card.supersededBy ? [card.supersededBy] : [])]) if (!ids.has(ref)) fail(`Unknown related card id ${ref} in ${card.id}`);
  return { version: 1, topics: TOPICS, cards };
}
function validateCatalog(repo, write) {
  const expected = buildCatalog(repo);
  const file = path.join(repo, "catalog.json");
  if (write) writeJson(file, expected);
  else if (!fs.existsSync(file) || JSON.stringify(json(file)) !== JSON.stringify(expected)) fail("catalog.json is missing or stale; regenerate with catalog --write");
  return { cards: expected.cards.length, catalog: file };
}
function loadCatalog(repo) {
  const catalog = json(path.join(repo, "catalog.json"));
  if (catalog.version !== 1 || !Array.isArray(catalog.cards)) fail("Invalid knowledge catalog");
  return catalog;
}
function refresh(opts) {
  const repo = repoOf(opts);
  const exists = fs.existsSync(path.join(repo, ".git"));
  if (!exists) {
    fs.mkdirSync(path.dirname(repo), { recursive: true });
    git(["clone", "--depth", "1", REMOTE, repo], process.cwd(), 60000);
  } else {
    try { git(["-C", repo, "pull", "--ff-only"], process.cwd(), 30000); }
    catch (error) { return { repo, revision: git(["-C", repo, "rev-parse", "HEAD"], process.cwd()), cached: true, warning: error.message }; }
  }
  loadCatalog(repo);
  return { repo, revision: git(["-C", repo, "rev-parse", "HEAD"], process.cwd()), cached: false };
}
function search(opts) {
  const repo = repoOf(opts);
  const project = projectOf(opts);
  const labels = opts.labels ? opts.labels.split(",").map((s) => s.trim()) : [];
  if (labels.some((l) => !TOPICS.includes(l))) fail("Unknown topic label");
  const limit = opts.limit === undefined ? 5 : Number(opts.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail("limit must be 1-50");
  const catalog = loadCatalog(repo);
  const ranked = catalog.cards.filter((c) => (c.project === project || c.project === "shared") && c.status !== "candidate" && c.status !== "superseded")
    .map((c) => ({ ...c, score: (c.project === project ? 10 : 0) + c.labels.filter((l) => labels.includes(l)).length * 4 }))
    .filter((c) => labels.length === 0 || c.labels.some((l) => labels.includes(l)))
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const shortlist = ranked.slice(0, limit);
  return { project, labels, revision: git(["-C", repo, "rev-parse", "HEAD"], process.cwd()), cards: shortlist, conflicts: catalog.cards.filter((c) => (c.project === project || c.project === "shared") && shortlist.some((s) => s.conflicts.includes(c.id) || c.conflicts.includes(s.id))).map((c) => ({ id: c.id, title: c.title, status: c.status, path: c.path })) };
}
function show(opts) {
  const repo = repoOf(opts); const project = projectOf(opts);
  const ids = (opts.ids || "").split(",").filter(Boolean);
  const limit = opts.limit === undefined ? 5 : Number(opts.limit);
  if (!ids.length || !Number.isInteger(limit) || limit < 1 || ids.length > limit) fail("Provide card IDs; default maximum is five");
  const catalog = loadCatalog(repo);
  return ids.map((id) => { const entry = catalog.cards.find((c) => c.id === id && (c.project === project || c.project === "shared")); if (!entry) fail(`Unknown card in this project: ${id}`); return json(inside(repo, entry.path)); });
}
function prepare(opts) {
  if (!opts.card || !opts.repo) fail("prepare needs --card and --repo (a writable knowledge checkout)");
  const repo = repoOf(opts); const card = json(path.resolve(opts.card)); validateCard(card);
  if (opts.project && card.project !== "shared" && card.project !== projectOf(opts)) fail("Card project differs from the selected source remote");
  if (card.status === "candidate") fail("Candidate cards stay local until verified or explicitly marked disputed");
  const target = inside(repo, cardPath(card));
  if (fs.existsSync(target)) fail(`Card already exists: ${card.id}`);
  writeJson(target, card);
  try { validateCatalog(repo, true); } catch (error) { fs.unlinkSync(target); throw error; }
  return { card: target, catalog: path.join(repo, "catalog.json"), next: "Review git diff and run validate before opening a pull request. Never push directly to the default branch." };
}
function gh(args, cwd) {
  const result = spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 60000, windowsHide: true });
  if (result.error || result.status !== 0) fail(`gh ${args[0]} failed: ${(result.stderr || result.error?.message || "unknown error").trim()}`);
  return result.stdout.trim();
}
function publish(opts) {
  if (!opts.draft) fail(`publish needs --draft with one to ${MAX_PUBLISH_CARDS} sanitized card objects`);
  const source = path.resolve(opts.cwd || process.cwd());
  const project = projectOf({ cwd: source });
  const raw = json(path.resolve(opts.draft));
  const cards = Array.isArray(raw) ? raw : [raw];
  if (cards.length < 1 || cards.length > MAX_PUBLISH_CARDS) fail(`Publish one to ${MAX_PUBLISH_CARDS} cards per PR`);
  const ids = new Set();
  const claims = new Set();
  for (const card of cards) {
    validateCard(card);
    if (card.status === "candidate") fail(`Candidate card ${card.id} stays local until evidence is available`);
    if (card.project !== project && !(opts.shared && card.project === "shared")) fail(`Card ${card.id} is outside the current project; shared scope needs --shared`);
    if (ids.has(card.id)) fail(`Duplicate draft card id ${card.id}`);
    ids.add(card.id);
    const claimKey = `${card.claim} ${card.applicability}`.trim().toLowerCase().replace(/\s+/g, " ");
    if (claims.has(claimKey)) fail(`Duplicate claim in draft: ${card.id}; combine overlapping cards before publication`);
    claims.add(claimKey);
    if (card.project !== "shared") {
      const resolved = git(["-C", source, "rev-parse", "--verify", `${card.verification.revision}^{commit}`], process.cwd());
      if (!/^[0-9a-f]{40}$/.test(resolved)) fail(`Card ${card.id} has no verifiable source revision`);
    }
  }
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-knowledge-proposal-"));
  try {
  const repo = path.join(workspace, "repo");
  git(["clone", "--depth", "1", REMOTE, repo], process.cwd(), 60000);
  const base = git(["-C", repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], process.cwd()).replace(/^origin\//, "");
  if (!base || base === "HEAD") fail(`Cannot determine knowledge default branch; proposal retained at ${workspace}`);
  const branch = `knowledge/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  git(["-C", repo, "switch", "-c", branch], process.cwd());
  const staged = [];
  for (const card of cards) {
    const target = inside(repo, cardPath(card));
    if (fs.existsSync(target)) fail(`Card ${card.id} already exists; proposal retained at ${workspace}`);
    writeJson(target, card);
    staged.push(cardPath(card));
  }
  validateCatalog(repo, true);
  validateCatalog(repo, false);
  git(["-C", repo, "add", "--", "catalog.json", ...staged], process.cwd());
  const changed = git(["-C", repo, "diff", "--cached", "--name-only"], process.cwd()).split(/\r?\n/).filter(Boolean);
  if (!changed.includes("catalog.json") || changed.some((name) => name !== "catalog.json" && !staged.includes(name))) fail(`Unexpected staged change; proposal retained at ${workspace}`);
  git(["-C", repo, "commit", "-m", `docs(knowledge): propose ${cards.map((c) => c.id).join(", ")}`], process.cwd());
  git(["-C", repo, "push", "-u", "origin", branch], process.cwd(), 60000);
  const body = ["## Proposed knowledge", "", `Source project: ${project}`, "", ...cards.map((c) => `- ${c.id}: ${c.summary} (${c.status}; ${c.labels.join(", ")})`), "", "The card and generated catalog are the complete PR diff. Raw chats and local drafts remain on the coder's workstation. Main PIC reviews the claim, evidence, scope, and redaction before merge."].join("\n") + "\n";
  const bodyFile = path.join(workspace, "pr-body.md");
  fs.writeFileSync(bodyFile, body);
  const url = gh(["pr", "create", "--repo", "acme-org-ops/vibe-knowledge", "--base", base, "--head", branch, "--title", `knowledge: ${cards.map((c) => c.id).join(", ")}`, "--body-file", bodyFile], repo);
  if (!/^https:\/\/github\.com\/acme-org-ops\/vibe-knowledge\/pull\/\d+$/.test(url)) fail(`Unexpected PR URL: ${url}`);
  let reviewRequest = "requested";
  try { gh(["pr", "edit", url, "--add-reviewer", "acme-org-jane-doe"], repo); }
  catch (error) { reviewRequest = `CODEOWNERS review still required; explicit request failed: ${error.message}`; }
  return { url, project, ids: cards.map((c) => c.id), branch, workspace, reviewRequest };
  } catch (error) { fail(`${error.message}; local proposal workspace: ${workspace}`); }
}
function main() {
  const [action, ...rest] = process.argv.slice(2); const opts = options(rest);
  let result;
  if (action === "normalize-remote") result = { project: projectOf(opts) };
  else if (action === "refresh") result = refresh(opts);
  else if (action === "catalog" || action === "validate") result = validateCatalog(repoOf(opts), !!opts.write && action === "catalog");
  else if (action === "search") result = search(opts);
  else if (action === "show") result = show(opts);
  else if (action === "prepare") result = prepare(opts);
  else if (action === "publish") result = publish(opts);
  else fail("Usage: knowledge.js <normalize-remote|refresh|catalog|validate|search|show|prepare|publish> [--repo path] [--project URL|--cwd path] [--labels a,b] [--ids a,b] [--limit n] [--card path] [--draft path] [--shared] [--write]");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
try { main(); } catch (error) { process.stderr.write(`vibe-knowledge: ${error.message}\n`); process.exitCode = 1; }
