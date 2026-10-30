---
name: check-build-contract
description: Check a repository against the delivery pipeline's build contract — the fixed command names in the root package.json, the `## Build and run` section in CLAUDE.md/AGENTS.md, a coverage report Sonar can actually read, a hardened Dockerfile, the platform's injected stubs, dependencies inside the allowed stack (or a recorded tech-architect exception), and a gate record that still describes what is being shipped. Runs as a script (`scripts/check-build-contract.js`) rather than being re-derived per call. Mechanical, read-only, and the entry criterion for the go-live gate. Runs automatically — chained by vibe-code-and-deploy at the exit of phases 2 and 5, by check-golive-readiness as prerequisite 0, and by the golive-gatekeeper agent before any release-like action; the stage selects which checks apply. Also use when the user runs /vibe-conform, asks "does this repo follow the pipeline", "is this ready for /vibe-check", "why does Sonar say 0% coverage", or before onboarding a repo to the deployment platform.
allowed-tools: Bash Read Glob Grep
user-invocable: true
---

# Check the build contract

**Run the script. Do not re-implement it.**

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/check-build-contract.js" [--repo <path>] [--stage <stage>] [--json]
```

| Exit | Verdict |
|---|---|
| 0 | PASS |
| 2 | CONDITIONAL — only Low/Medium failed |
| 1 | FAIL — at least one High failed |
| 3 | Not applicable — no root `package.json` |

`--stage` takes `phase-2`, `phase-5`, `phase-7` or `post-onboarding`. Omit it and the script infers
the furthest stage the repo's own files support, and prints which one it ran.

> The other plugins' skills call their scripts by a repo-relative path (`node
> plugins/ops-github/scripts/…`) because they run *inside* this checkout. This one runs against a
> **different** repository — the one being checked — so the working directory is that repo and a
> relative path would not resolve. Hence `$CLAUDE_PLUGIN_ROOT`, or the absolute path to this plugin's
> `scripts/` directory if the variable is not set.

The script reads `data/build-contract.json`, which remains the rule set — it holds every rule, its
severity, and the failure mode that produced it. This document explains how to *interpret* a result;
it is not the implementation, and a hand-rolled check is not a substitute for running it.

**Why it is a script.** Every rule here was already written down in prose, and every one was still
missed by at least one delivered app — that is what `vibe-code-and-deploy` says, and it is the reason
this skill exists. A check that each caller re-derives from a description is re-derived with fresh
bugs: the first hand-rolled implementation of these rules had a predicate that silently never fired
on `FROM oven/bun:latest`, so an unpinned base image reported a clean PASS. A rule agreed with and
not followed needs a check; a check written from scratch each run needs to *be* the check.

`scripts/selftest-check-build-contract.js` builds a conforming fixture, breaks one thing at a time,
and asserts each rule fires with the expected severity — including the two regressions above. Run it
after any change to the script or to the rule set:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/selftest-check-build-contract.js"
```

Never check from memory, and never invent a rule that is not in `data/build-contract.json`.

**Take a stage.** Callers pass one of `phase-2`, `phase-5`, `phase-7` or `post-onboarding`, and the
`stages` block says which checks that stage runs and why the others are held back. Default to `phase-7`
(everything) only when no stage is given and `vibe-release.json` exists; otherwise infer the furthest
stage the repo's own files support, and **say which stage you ran** — a clean report means nothing
until the reader knows what it covered. Never widen a stage to make a repo look better, and never
narrow one to make it pass.

| Stage | Scripts | Agents file | Repo checks |
|---|---|---|---|
| `phase-2` | yes | yes | `stack-allowed` only — the first `package.json` is where a stack deviation starts |
| `phase-5` | yes | yes | every Dockerfile, coverage, stub, `.platform` and bundler check, plus `stack-allowed` |
| `phase-7` | yes | yes | all of phase 5, plus `gate-record-names-head` and `reviewer-named` |
| `post-onboarding` | no | yes | `build-config-has-guard`, `no-platform-stubs`, `platform-yaml-not-hand-authored`, `gate-record-names-head` |

The `stages` block in `data/build-contract.json` is the authority; this table only summarises it.

Every rule in that file is already stated in prose in `vibe-code-and-deploy`, and every one of them
was missed by at least one app delivered on that skill. **Prose is what drifted.** This skill exists
to make the same rules answerable by a command, so phase 7 has an entry criterion rather than an
expectation.

**Read-only.** This skill reports; it does not fix. Fixing is the caller's job, in the phase that owns
the file.

## What each check means

The script runs these; this section is for reading its output, and for the judgement calls no exit
code can make. If the script is unavailable, say so rather than approximating it — an approximation
that passes is the failure this skill was written to remove.

Cheap checks first — a repo that fails `requiredScripts` will usually fail several others for the same
reason, and the report is more useful when it says so.

**Before any check, establish where you are.** Every command below assumes the repository root; run
them from `git rev-parse --show-toplevel`, and guard each file read. A missing file is *not
applicable* or *cannot be evaluated* — never a pass, and never a traceback:

```bash
cd "$(git rev-parse --show-toplevel)" || exit 1
for f in package.json sonar-project.properties Dockerfile vibe-release.json; do
  [ -f "$f" ] && echo "present $f" || echo "absent  $f"
done
```

A repo with no root `package.json` is not a repo this contract applies to — say that and stop, rather
than reporting nine failures against something that was never on this pipeline.

### 1. Scripts — `requiredScripts`, `scriptRules`

Skip with *cannot be evaluated* if `package.json` is absent. Otherwise:

```bash
python3 -c "import json;print(json.dumps(sorted(json.load(open('package.json')).get('scripts',{})),indent=0))"
```

For each entry in `requiredScripts`, the `name` must be a key of the root `scripts` object. Report a
miss with its `severity`, and — when the entry has a `commonAlias` and the repo has that alias instead
— say so explicitly: *"`itest` is present, `test:integration` is not; the alias is additive, not a
substitute."* That is the single most likely finding on a repo built before the contract existed.

For `coverage-fails-closed`, read the body of `test:coverage`: the report must be produced after the
suite, not alongside it. A script that runs the reporter unconditionally passes syntactically and
fails the rule.

### 2. The agents file — `agentsFile`

**Both** `AGENTS.md` and `CLAUDE.md` must exist, and `CLAUDE.md` must be a **committed symlink** to
`AGENTS.md`. The committed mode is what counts, not the working tree:

```bash
git ls-files -s AGENTS.md CLAUDE.md
# AGENTS.md  -> 100644 (regular file, the canonical one)
# CLAUDE.md  -> 120000 (symlink)
```

`CLAUDE.md` at `100644` is a **copy**, and that is the finding — two regular files are two files that
agree until someone edits one. Report it as such rather than as "both present": all three delivered
apps that carried both carried identical copies, which is the state this rule exists to end. Missing
either name is also a finding; a tool that looks for only one of the two must find it.

Then the canonical file must contain the `requiredSection`. Then check
each `requiredContent` entry against the section's text: the command table naming every required
script, the `container build` and `container run` lines, the port, the health paths, the environment
variables.

Then check it is **true**, not merely present — `stalenessRule`. Cross-read three things you can
verify cheaply:

- the port in the section against `EXPOSE` in the `Dockerfile` and `PORT` in `.env.example`;
- the scripts it lists against the ones `package.json` actually has;
- the variables it names against the keys in `.env.example`.

A disagreement is a finding against the agents file, not against the code — the file is the thing
claiming something.

### 3. Repository checks — `repoChecks`

Each entry carries the rule, and most carry the `failureMode` that produced it. Work them in order;
they are independent.

For `coverage-report-tracked`, two conditions and both are required: **at least one path is declared**,
and every declared path is tracked. Zero declared paths is a failure, not a vacuous pass — an empty set
is exactly how one delivered app reached the gate reading 0.0%. Resolve against the index, not the
working tree:

```bash
git ls-files --error-unmatch <path>   # tracked → exit 0
```

A path that exists on disk but is not tracked is the exact failure this check was written for, and
`ls` cannot see the difference.

For `no-platform-stubs`, check the two stub paths **by name**, then look for `require(` only under
what `sonar-project.properties` declares as `sonar.sources`. CommonJS outside the product tree is
legitimate — a Playwright harness, a `.cjs` config, an integration spec — and failing a repo for it
would punish one that had correctly deleted both stubs.

For `platform-yaml-not-hand-authored`, compare when each file arrived:

```bash
git log --format='%h %s' --diff-filter=A -- .platform/<file>.yaml
git log --format='%h %s' --grep='integrate .* with DevOps Platform AI' | tail -1
```

A `.platform` file introduced before the integration commit is the finding — the platform writes only
what is absent, so a hand-authored file is one the platform never validated.

For `gate-record-names-head` — **absent file means the repo has not reached phase 7, which is *not
applicable*, not a failure.** It is also Medium rather than High on purpose: only phase 7 writes this
file, so a High verdict would block the one phase that can clear the finding. Report it and let
`/vibe-check` re-stamp the record.

```bash
[ -f vibe-release.json ] || { echo "n/a — no gate record yet"; exit 0; }
python3 -c "import json;print(json.load(open('vibe-release.json')).get('target-commit-hash') or 'unset')"
git rev-parse HEAD
```

For `stack-allowed` (High, runs at phases 2, 5 and 7), the allowed stack is `allowedStack` in
`data/build-contract.json` and nowhere else. The script collects every dependency name —
`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies` — from the root
`package.json`, each declared workspace, and every other tracked `package.json` outside
`node_modules` and test-fixture directories. It flags each name listed in
`allowedStack.notAllowedWithoutApproval.packages`, and each tracked lockfile listed in
`notAllowedWithoutApproval.lockfiles`. A flagged item is then resolved in this order:

1. **Approved.** A row of the PROJECT.md `## Stack Exceptions` table names the package, has a
   non-empty `Approved by` cell and has an ISO date. Columns are found by header name, so their
   order does not matter. A row with no approver, or no date, approves nothing. `stackExceptions`
   says why: *an exception without an approver and a date is not an exception.*
2. **Legacy.** The project started before `stackExceptions.legacyCutoff`. The start date is the
   first ISO date in PROJECT.md `## Vibe Start` (dates inside HTML comments are ignored), or, when
   that is blank, the earliest commit date. That is the same fallback `/vibe-check` uses. The result
   is a PASS with a legacy note that lists every deviation, not a finding.
3. **Otherwise FAIL**, one row per deviation, each naming the `instead` it should have used. A repo
   with no start date at all (no Vibe Start and no git history) is treated as post-cutoff. It is
   never assumed to be legacy.

Whatever the verdict, the check prints a reminder that **major improvements**
(`stackExceptions.majorImprovements.examples`) need an approval row on every project, legacy or not,
and even when they use the allowed stack. The tree cannot show whether a change is one. The gate and
the reviewer confirm the row exists, and the `nonPackage` deviations (a Node runtime, npm/yarn/pnpm)
are listed as *not evaluated* rather than passed. The script checks that an approver cell is filled
in, not who is in it. Judging whether that person is really the tech architect, and not the
requester or an agent, is the reviewer's job.

### 4. Verdict

Apply `verdicts` exactly: any High-severity failure is **FAIL**; only Low/Medium failures is
**CONDITIONAL**; nothing failed is **PASS**. Do not average, weight or soften — a verdict that can be
argued with is not an entry criterion.

## Reporting

One table, one row per failed check: the check id, its severity, what the repo has, and the one thing
that would fix it. Then the verdict on its own line.

Say what you could not evaluate rather than passing it. A repo with no `vibe-release.json` has not
reached phase 7 yet — that is `gate-record-names-head` **not applicable**, not a pass, and the
difference matters when this runs as a gate.

Quote the `failureMode` when a check fires. These findings all look pedantic in isolation and none of
them were: the missing coverage script is why one app reported 0.0% on a passing suite, and the
missing `apk upgrade` is why another shipped 3 CRITICAL CVEs.

## Non-negotiables

- **Never fix a finding by weakening the check** — `nonNegotiable` in the data file. Renaming the
  contract to match what the repo happens to have, widening a Sonar exclusion, or dropping an
  assertion converts a signal into silence.
- **Never report PASS on a check you skipped.** Not applicable, not evaluated and passed are three
  different results.
- **Never write to the repository.** Not the agents file, not `package.json`, not the dossier. The
  caller fixes; this skill reports.
- **Never add a rule that is not in `data/build-contract.json`.** New rules are edits to that file,
  reviewed like any other policy change — not judgement calls made per repo.
