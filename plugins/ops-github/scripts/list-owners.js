#!/usr/bin/env node
/**
 * List GitHub owners available to the authenticated user (self + orgs).
 * Requires: gh auth login
 *
 * Usage: node list-owners.js [--json]
 */

const { execSync } = require("child_process");

function ghJson(args) {
  const out = execSync(`gh ${args}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  return JSON.parse(out);
}

function main() {
  const asJson = process.argv.includes("--json");
  const user = ghJson("api user");
  const orgs = ghJson("api user/orgs");

  const owners = [
    { type: "user", login: user.login, name: user.name || user.login },
    ...orgs.map((o) => ({ type: "org", login: o.login, name: o.login })),
  ];

  if (asJson) {
    console.log(JSON.stringify(owners, null, 2));
    return;
  }

  console.log("Available GitHub owners:\n");
  for (const o of owners) {
    console.log(`  [${o.type}] ${o.login}`);
  }
  console.log("\nAsk the user which owner to use for the new repository.");
}

try {
  main();
} catch (e) {
  console.error("Failed to list owners. Run: gh auth login");
  console.error(e.message || e);
  process.exit(1);
}
