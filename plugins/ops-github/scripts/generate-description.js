#!/usr/bin/env node
/**
 * Generate a repository description when the user did not provide one.
 *
 * Usage: node generate-description.js [project-root]
 */

const fs = require("fs");
const path = require("path");

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function fromPackageJson() {
  for (const p of ["package.json", "apps/frontend/package.json", "apps/backend/package.json"]) {
    const pkg = readJson(path.join(root, p));
    if (pkg?.description && pkg.description.trim()) return pkg.description.trim();
    if (pkg?.name) return `${pkg.name} — company monorepo project`;
  }
  return null;
}

function fromReadme() {
  const readmePath = path.join(root, "README.md");
  if (!fs.existsSync(readmePath)) return null;
  const lines = fs.readFileSync(readmePath, "utf8").split("\n");
  for (const line of lines) {
    const t = line.replace(/^#+\s*/, "").trim();
    if (t && !t.startsWith("[")) return t.slice(0, 350);
  }
  return null;
}

function fromStructure() {
  const parts = [];
  if (fs.existsSync(path.join(root, "apps", "frontend"))) parts.push("Svelte frontend");
  if (fs.existsSync(path.join(root, "apps", "backend"))) parts.push("Bun + Elysia backend");
  if (parts.length) return `${parts.join(" + ")} application`;
  return null;
}

function main() {
  const desc =
    fromPackageJson() ||
    fromReadme() ||
    fromStructure() ||
    `${path.basename(root)} — private repository managed via SMART-AIAGENT-PLUGINS`;

  console.log(desc.slice(0, 350));
}

main();
