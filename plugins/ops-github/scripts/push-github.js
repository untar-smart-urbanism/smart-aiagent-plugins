#!/usr/bin/env node
/**
 * Push current branch to origin after a commit.
 *
 * Usage: node push-github.js [--cwd <path>]
 */

const { execSync } = require("child_process");
const path = require("path");

const cwd = process.argv.includes("--cwd")
  ? path.resolve(process.argv[process.argv.indexOf("--cwd") + 1])
  : process.cwd();

function run(cmd) {
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

function getBranch() {
  return execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf8" }).trim();
}

function hasRemote() {
  try {
    execSync("git remote get-url origin", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function bumpVersions() {
  const script = path.join(__dirname, "bump-versions.js");
  const skip = process.argv.includes("--skip-bump");
  if (skip) return;
  try {
    execSync(`node "${script}" --cwd "${cwd}" --auto-commit`, {
      cwd,
      stdio: "inherit",
      shell: true,
    });
  } catch (e) {
    console.error("Version bump step failed:", e.message || e);
    process.exit(1);
  }
}

function main() {
  if (!hasRemote()) {
    console.error("No 'origin' remote. Run create-github-repo workflow first.");
    process.exit(1);
  }

  bumpVersions();

  const branch = getBranch();
  if (branch === "main" || branch === "master") {
    run(`git push -u origin ${branch}`);
  } else {
    run(`git push -u origin ${branch}`);
  }
  console.log(`Pushed ${branch} to origin.`);
}

try {
  main();
} catch (e) {
  console.error("Push failed:", e.message || e);
  process.exit(1);
}
