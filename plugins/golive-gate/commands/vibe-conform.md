---
name: vibe-conform
description: Check this repository against the delivery pipeline's build contract — fixed command names, the `## Build and run` section in AGENTS.md, a coverage report Sonar can read, a hardened Dockerfile, no platform stubs, and a gate record naming HEAD. Read-only, and the entry criterion for /vibe-check.
---

# Vibe conform

Run the `check-build-contract` skill from the `golive-gate` plugin. It answers one question: does this
repository actually follow the pipeline it was built with?

**You normally do not need this command.** The check is chained: `vibe-code-and-deploy` runs it at the
exit of phases 2 and 5, `check-golive-readiness` runs it as prerequisite 0, and the `golive-gatekeeper`
agent runs it before any release-like action. This command is the ad-hoc entry point — a repo nobody is
currently shipping, a second opinion, or a repo being assessed before adoption. Pass a stage
(`phase-2`, `phase-5`, `phase-7`, `post-onboarding`) or let the skill infer one from what the repo has.

Every rule it checks is already written in prose in `vibe-code-and-deploy`, and every one was missed by
at least one app delivered on that skill. This is the same set, made answerable by a command.

## Steps

1. Read `plugins/golive-gate/data/build-contract.json` — the rule set. Do not check from memory, and
   do not invent a rule that is not in it.
2. **Scripts** — every `requiredScripts[].name` is a key of the root `package.json` `scripts`. When a
   `commonAlias` is present instead of the contract name, say so: an alias is additive, never a
   substitute. Check `test:coverage` fails closed — no report from a red suite.
3. **Agents file** — `AGENTS.md` or `CLAUDE.md` carries `## Build and run` with the command table, the
   `container build` / `container run` lines, the port, the health paths and the environment variables.
   Then
   check it is *true at HEAD*: port against `EXPOSE` and `.env.example`, scripts against
   `package.json`, variables against `.env.example`.
4. **Repository** — the `repoChecks`: coverage paths resolving to files `git ls-files` lists; the
   Dockerfile patching its base, installing production-only dependencies, pinned to an exact tag, and
   running as UID ≥ 10000; no CommonJS `require(` from the platform's injected stubs; no
   `.platform/*.yaml` older than the integration commit; `vibe-release.json` `target-commit-hash`
   equal to HEAD; a named reviewer at Medium risk or above.
5. **Verdict** per `verdicts` — any High-severity failure is FAIL, Low/Medium only is CONDITIONAL,
   clean is PASS. Report one row per failure with the fix, and quote the `failureMode` so a finding
   that reads pedantic carries the cost that produced it.

## Non-negotiables

- **Read-only.** This command reports; the phase that owns the file fixes it.
- Never satisfy a check by weakening it — renaming the contract to match the repo, widening a Sonar
  exclusion, or deleting an assertion is silencing the control.
- Never report PASS on a check you skipped. *Not applicable*, *not evaluated* and *passed* are three
  different results, and a repo that has not reached phase 7 has no gate record to be stale.
- Never add a rule that is not in the data file. New rules are edits to `build-contract.json`.

## Scope

- **This command:** does the repo follow the pipeline's own contract — run it before `/vibe-check`.
- **Governance gate:** `/vibe-check`.
- **Build and ship the whole thing:** `/vibe-ship`.
