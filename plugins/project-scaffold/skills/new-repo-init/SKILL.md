---
name: new-repo-init
description: >
  Initializes a new project repository by copying the standard agent operating
  template into the target folder as AGENTS.md (read by Codex and most agents)
  plus a CLAUDE.md symlink to it (read by Claude Code), scaffolding CONTEXT.md
  (living project state),
  PROJECT.md (go-live review dossier skeleton), and a baseline secure
  .gitignore, then running `git init`. Use this skill whenever the user wants
  to start a new project, scaffold a new repo, set up a new codebase, or says
  things like "init a new repo", "create a new project folder", "set up a
  project", "initialize my repo", "scaffold a new service", "set up Claude
  Code for a new project", or "set up Codex for a new project". Also trigger
  when the user asks to add a CLAUDE.md or AGENTS.md to an existing folder or
  wants to bootstrap agent conventions in a repo that doesn't have them yet.
---

# Agent Repo Init

Scaffold a new project by placing the standard agent operating file into a
target directory as **two mirrored files** — `CLAUDE.md` (read natively by
Claude Code) and `AGENTS.md` (read natively by Codex and most other coding
agents) — plus `CONTEXT.md`, `PROJECT.md`, and a baseline `.gitignore`, then
initialising a Git repository.

**`AGENTS.md` is the real file and `CLAUDE.md` is a symlink to it**, so the two
can never disagree — one file, two names.

Two copies only cannot drift *at creation time*. They drift on the first edit
that lands in one and not the other, and the failure is silent and asymmetric:
whichever agent reads the stale name gets instructions that are quietly wrong,
which is worse than the file being absent. Four apps delivered on the
`golive-gate` pipeline carried both names as mode `100644` with byte-identical
content — agreeing by coincidence, with nothing keeping them that way.

**The Windows case is still handled, by detection rather than by defaulting to
copies.** Git checks a symlink out as a plain text file containing the link
target when `core.symlinks` is false, which is the default on Windows without
Developer Mode. Step 3 detects that and falls back to two copies, says so, and
tells the user how to enable links. What it no longer does is impose the
degraded form on every platform because one platform needs it.

## The two project files (do not confuse them)

- `CONTEXT.md` — living project state: overview, structure, plan and
  milestones, key decisions, current progress. Progress tracker and AI
  context. Agents read and maintain it continuously.
- `PROJECT.md` — go-live review dossier: owner, support contact, risk level,
  data classification, login method, access, approvals, review evidence,
  hosting, recovery. Reviewers read it before release. It is scaffolded here
  but **completed later via the `project-documenter` skill**, which asks the
  owner for the owner-input fields (project owner, risk level, approvals).
  This skill only places the skeleton; do not interview the user for those
  fields at init time. In particular, leave `## Vibe Start` blank — it is stamped
  by `/start-vibe` (today's date) or `/adopt-vibe` (the first git commit date),
  not here.

## The assets

```
assets/CLAUDE.template.md    # canonical agent instructions (written to both filenames)
assets/CONTEXT.template.md   # CONTEXT.md skeleton (living project state file)
assets/PROJECT.template.md   # PROJECT.md skeleton (go-live review dossier)
assets/gitignore.template    # baseline secure .gitignore (.env, keys, node_modules, ...)
```

Read the template files when executing the workflow so you always use the
latest version, not a memorised copy.

## Step-by-step workflow

### Step 1 — Resolve the target path

If the user already named a path (e.g. "init a repo at `~/projects/my-app`"),
use it. If not, ask for it with one short question:

> "Which folder should I initialise? (Give an absolute path or a path relative
> to your current working directory.)"

Expand `~` to the actual home directory before proceeding.

### Step 2 — Pre-flight checks

Run the following checks **before** writing anything:

```bash
test -d "<target>" && echo "exists" || echo "new"
test -f "<target>/CLAUDE.md" && echo "claude_exists" || echo "no_claude"
test -f "<target>/AGENTS.md" && echo "agents_exists" || echo "no_agents"
test -f "<target>/CONTEXT.md" && echo "context_exists" || echo "no_context"
test -f "<target>/PROJECT.md" && echo "project_exists" || echo "no_project"
test -f "<target>/.gitignore" && echo "gitignore_exists" || echo "no_gitignore"
test -d "<target>/.git" && echo "git_exists" || echo "no_git"
```

Decision table:

| Scenario | Action |
|---|---|
| Folder does not exist | Create it, write all files, git init |
| CLAUDE.md and/or AGENTS.md missing | Write the missing file(s) from the template |
| CLAUDE.md or AGENTS.md already exists | **Ask** before overwriting that file |
| Only one of the pair exists | If `AGENTS.md` exists, link `CLAUDE.md` to it (`ln -s AGENTS.md CLAUDE.md`) — no content decision to make. If only `CLAUDE.md` exists, **ask** before renaming it to `AGENTS.md` and linking back, since that moves a file the user may reference elsewhere |
| CONTEXT.md missing | Write the skeleton from `CONTEXT.template.md` |
| CONTEXT.md exists | Leave it untouched — it holds live project state |
| PROJECT.md missing | Write the skeleton from `PROJECT.template.md` |
| PROJECT.md exists, **old living-state layout** (sections: Overview, Structure, Plan And Milestones, Key Decisions, Current State) | This is a pre-rename living-state file. Offer to rename it to `CONTEXT.md` (preserving its content), then write the fresh dossier skeleton as the new `PROJECT.md`. Only proceed with the user's confirmation |
| PROJECT.md exists, dossier layout or unrecognised layout | Leave it untouched; if unrecognised, ask the user what it is before doing anything |
| .gitignore missing | Write the baseline from `gitignore.template` |
| .gitignore exists | Leave it untouched; check it covers `.env` and warn if it does not |
| Already a git repo (.git exists) | Skip `git init`; note it is already a repo |

Never silently overwrite an existing `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`,
`PROJECT.md`, or `.gitignore`. An existing `CONTEXT.md` (or an old-layout
`PROJECT.md`) is live project state: never overwrite it, even with
permission-style prompts — offer a rename or a manual merge instead. An
existing dossier-layout `PROJECT.md` may hold recorded approvals and review
evidence: never overwrite it.

### Step 3 — Execute

```bash
# Create the target folder if needed
mkdir -p "<target>"

# Agent instructions: AGENTS.md is the file, CLAUDE.md is a link to it.
cp "<skill_assets_dir>/CLAUDE.template.md" "<target>/AGENTS.md"

# Symlinks survive here only when git will check them out as links.
if [ "$(git config --get core.symlinks)" = "false" ] || case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) true;; *) false;; esac; then
  cp "<skill_assets_dir>/CLAUDE.template.md" "<target>/CLAUDE.md"
  echo "NOTE: core.symlinks is off (typical on Windows without Developer Mode)."
  echo "      CLAUDE.md written as a COPY — edits must be applied to both files."
  echo "      To use a link instead: enable Developer Mode, then"
  echo "        git config core.symlinks true && ln -sf AGENTS.md CLAUDE.md"
else
  ln -s AGENTS.md "<target>/CLAUDE.md"
fi

# CONTEXT.md skeleton (only if none exists — never touch an existing one)
test -f "<target>/CONTEXT.md" || cp "<skill_assets_dir>/CONTEXT.template.md" "<target>/CONTEXT.md"

# PROJECT.md dossier skeleton (only if none exists — see decision table for the rename case)
test -f "<target>/PROJECT.md" || cp "<skill_assets_dir>/PROJECT.template.md" "<target>/PROJECT.md"

# Baseline secure .gitignore (only if none exists)
test -f "<target>/.gitignore" || cp "<skill_assets_dir>/gitignore.template" "<target>/.gitignore"

# Initialise git (skip if .git already exists)
cd "<target>" && git init
```

Verify the link went in as a link once the repo is committed — the index mode
is what other tools and the `golive-gate` contract check read, not the working
tree:

```bash
git -C "<target>" ls-files -s CLAUDE.md    # 120000 = symlink, 100644 = copy
```

A `100644` after an apparently successful `ln -s` means the copy was committed
anyway — a checkout with `core.symlinks=false`, or a tool that resolved the
link while writing. Fix the index rather than the file:
`git rm --cached CLAUDE.md && ln -sf AGENTS.md CLAUDE.md && git add CLAUDE.md`.

The skill assets directory is the `assets/` folder inside this skill's
directory. Locate it relative to this SKILL.md file.

### Step 4 — Report

After completing the steps, output a brief summary:

```
✓ Created: <target>/AGENTS.md    (agent instructions — Codex and most agents; the real file)
✓ Created: <target>/CLAUDE.md    (symlink → AGENTS.md; read natively by Claude Code)
✓ Created: <target>/CONTEXT.md   (living project state — overview, structure, plan, progress)
✓ Created: <target>/PROJECT.md   (go-live review dossier — completed via project-documenter before release)
✓ Created: <target>/.gitignore   (baseline: env files, keys, node_modules)
✓ Git repo: <target>/.git        (initialised / already existed)

Next steps you may want to take:
  - Customise the agent instructions for this project's stack and conventions.
    Edit AGENTS.md; CLAUDE.md is a link to it and follows automatically.
    (If the Windows fallback wrote a copy, apply every edit to both.)
  - Fill in CONTEXT.md (overview, structure, plan) — agents read it at the
    start of every non-trivial task and keep it updated.
  - Create the private company repo (/init-github-repo) and record a
    provisional risk level (/assess-risk) — or use /start-vibe next time,
    which chains all three of these steps.
  - When ready to ship, run /vibe-check: it chains documentation
    (project-documenter), risk re-verification, and release review.
  - Make an initial commit: cd <target> && git add . && git commit -m "chore: init repo"
```

If this skill was invoked via the `/start-vibe` command, continue that
command's chain (company repo, then provisional risk classification) instead
of printing the manual next steps above.

Keep the summary concise. Do not suggest additional tools or frameworks unless
the user asked.

## Keeping the mirrors in sync

If, on any later run against an existing repo, `CLAUDE.md` and `AGENTS.md`
have diverged, tell the user, show a short diff summary, and ask which
direction to sync. Do not pick a canonical side yourself.

## Edge cases

- **Windows paths** (e.g. `C:\Users\...`): convert backslashes to forward
  slashes when passing to bash. Remind the user that `git` must be on their
  PATH. Do not create symlinks between the two files on Windows.
- **Relative paths**: resolve them against the user's current working directory,
  not the skill directory. Ask for confirmation if ambiguous.
- **Permission errors**: report them clearly and suggest running with appropriate
  permissions rather than attempting to escalate silently.
- **git not installed**: if `git init` fails because git is not found, report
  the error and instruct the user to install Git, but still confirm that the
  agent files were written successfully.
- **Repos scaffolded before the CONTEXT/PROJECT split**: they have a
  living-state `PROJECT.md` and no `CONTEXT.md`. Follow the rename row in the
  decision table; never destroy the living state.
