#!/usr/bin/env node
/**
 * Create a private GitHub repository, set origin remote, and grant default org teams.
 *
 * Usage:
 *   node create-repo.js --owner <user|org> --name <repo> [--description "..."] [--cwd <path>] [--skip-teams]
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function run(cmd, cwd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: true }).trim();
}

function repoExists(owner, name) {
  try {
    execSync(`gh repo view ${owner}/${name}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function loadPolicy() {
  const policyPath = path.join(__dirname, "..", "data", "github-policy.json");
  return JSON.parse(fs.readFileSync(policyPath, "utf8"));
}

function isOrganization(owner) {
  try {
    const type = runCapture(`gh api users/${owner} --jq .type`);
    return type === "Organization";
  } catch {
    return false;
  }
}

/**
 * Grant default teams from policy on an org-owned repo.
 * Permission: GitHub API uses pull (read) / push (write).
 */
function addDefaultTeams(owner, name, policy) {
  const teams = Array.isArray(policy.defaultTeams) ? policy.defaultTeams : [];
  if (teams.length === 0) {
    console.log("No defaultTeams in policy — skipping team grants.");
    return;
  }

  if (!isOrganization(owner)) {
    console.log(
      `Owner ${owner} is not an organization — skipping default team grants (teams require an org repo).`
    );
    return;
  }

  console.log(`\nAdding default teams to ${owner}/${name}...`);

  for (const team of teams) {
    const slug = team.slug;
    const permission = team.permission;
    const label = team.name || slug;
    const access = team.access || permission;

    if (!slug || !permission) {
      console.warn(`Skipping invalid team entry: ${JSON.stringify(team)}`);
      continue;
    }

    const apiPath = `/orgs/${owner}/teams/${slug}/repos/${owner}/${name}`;
    const cmd = `gh api --method PUT -H "Accept: application/vnd.github+json" "${apiPath}" -f permission=${permission}`;

    try {
      console.log(`> Grant ${label} (${access}) → ${permission}`);
      execSync(cmd, { stdio: "inherit", shell: true });
      console.log(`  OK: ${label}`);
    } catch (e) {
      console.error(
        `  FAILED: could not add team "${label}" (${slug}) with ${permission}. ` +
          `Ensure the team exists in ${owner} and your token can administer team repo access.`
      );
      console.error(e.message || e);
    }
  }
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const owner = flags.owner;
  const name = flags.name;
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const skipTeams = Boolean(flags["skip-teams"]);

  if (!owner || !name) {
    console.error(
      'Usage: node create-repo.js --owner <login> --name <repo> [--description "..."] [--cwd <path>] [--skip-teams]'
    );
    process.exit(1);
  }

  if (repoExists(owner, name)) {
    console.error(`Repository ${owner}/${name} already exists. Ask the user for a different name.`);
    process.exit(1);
  }

  const policy = loadPolicy();

  let description = flags.description;
  if (!description) {
    const gen = path.join(__dirname, "generate-description.js");
    description = execSync(`node "${gen}" "${cwd}"`, { encoding: "utf8" }).trim();
    console.log(`Generated description: ${description}`);
  }

  const descEscaped = description.replace(/"/g, '\\"');

  if (!fs.existsSync(path.join(cwd, ".git"))) {
    run("git init", cwd);
  }

  const createCmd = `gh repo create ${owner}/${name} --private --description "${descEscaped}" --source "${cwd}" --remote origin`;
  run(createCmd, cwd);

  console.log(`\nCreated private repo: https://github.com/${owner}/${name}`);
  console.log("Remote 'origin' configured.");

  if (skipTeams) {
    console.log("Skipped default team grants (--skip-teams).");
  } else if (policy.requirements?.newProject?.addDefaultTeamsAfterCreate !== false) {
    addDefaultTeams(owner, name, policy);
  }
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
