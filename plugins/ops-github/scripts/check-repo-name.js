#!/usr/bin/env node
/**
 * Check if a GitHub repository name is available under an owner.
 *
 * Usage: node check-repo-name.js <owner> <repo-name>
 * Exit 0 = available, exit 1 = taken or error
 */

const { execSync } = require("child_process");

function repoExists(owner, name) {
  try {
    execSync(`gh repo view ${owner}/${name}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const [owner, name] = process.argv.slice(2);
  if (!owner || !name) {
    console.error("Usage: node check-repo-name.js <owner> <repo-name>");
    process.exit(1);
  }

  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!pattern.test(name)) {
    console.error(`Invalid repo name '${name}'. Use lowercase kebab-case.`);
    process.exit(1);
  }

  if (repoExists(owner, name)) {
    console.error(`REJECTED: ${owner}/${name} already exists on GitHub.`);
    console.error("Ask the user to choose a different repository name.");
    process.exit(1);
  }

  console.log(`AVAILABLE: ${owner}/${name}`);
}

main();
