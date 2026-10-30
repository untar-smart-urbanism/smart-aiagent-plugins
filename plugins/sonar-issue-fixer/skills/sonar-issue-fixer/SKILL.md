---
name: sonar-issue-fixer
description: >
  This skill should be used when the user asks to "fix sonar issues", "resolve SonarQube issues",
  "fix SonarQube warnings", "clean up sonar findings", "fix sonar code smells", or mentions fixing
  code quality issues detected in a pull request. ALSO use when the user asks to "check sonar quality
  gate", "did sonar pass", "is the gate green", "what's failing the gate", "show me gate conditions",
  or wants a read-only gate status check (often after CI cited "Sonar quality gate failed"). Handles
  regular issues and security hotspots with mandatory user approval per hotspot for fixes; gate status
  is a separate read-only verb that returns the gate verdict and failing conditions.
allowed-tools: Bash Read Write Edit Glob Grep AskUserQuestion
user-invocable: true
metadata:
  color: "orange"
---

# SonarQube Issue Fixer

Automatically fix code quality issues detected by SonarQube.

**Platform defaults live in `data/platform-sonar.json`** (at the plugin root) — read it rather than assuming a generic SonarQube setup. It records the company server, the `acme:<app>` project-key convention, the seven `platform-default` gate conditions, and the Community Build limitation.

**Run this BEFORE you merge, not only after CI fails.** The company server is SonarQube **Community Build**: it analyses `main`/`master` only, with no branch analysis and no pull-request decoration. A feature branch therefore gets *no* gate feedback from the server, and the first signal is a red gate on main — which fails the CI pipeline before any image is built, so there is nothing to deploy. The scripts force default-branch scope on that server and report it in a `scope=` field; they will not silently return "no issues" for a scope that was never analysed.

> **Script paths**: All scripts are relative to this skill's directory. Resolve the full path before running:
> `python3 {path-to-this-SKILL.md-directory}/scripts/<script>.py [args] --minimal`
> Do NOT run bare `python3 scripts/...` from the project root.

## Prerequisites

| Variable | Required for | Description |
|----------|-------------|-------------|
| `SONARQUBE_URL` | Optional | Base URL of the SonarQube server. When unset, the scripts fall back to the company server in `data/platform-sonar.json` (`https://sonarqube-ops.acme.example`). `--url` overrides both. |
| `SONARQUBE_TOKEN` | Optional | User token when the server requires auth. Not needed on the company server — authentication is disabled there. |
| `SONAR_ASSUME_BRANCH_ANALYSIS` | Escape hatch | Set to `1` only if the company server is upgraded to an edition with branch/PR analysis; it re-enables PR-scoped queries. |

**Validate prerequisites:**
```bash
python3 scripts/init_context.py --minimal
```

Expected output: `passed=true`, `sonar_server=sonarqube`, `branch=...`, `pr=...`, `scope=...`, `project_key=...`

On the company server `project_key` resolves to **`acme:<app>`**, where `<app>` is the platform application id (the git remote's repo name). An explicit `--project`, or a `sonar.projectKey` in a committed `sonar-project.properties`, still wins — the pipeline would have used that too. Off-platform, the original detection chain (`sonar-project.properties` → `pom.xml` → `package.json` → directory name) is unchanged. If the project does not exist, ask the platform team to register it.

Java/Maven/JaCoCo checks are only critical for Java projects. For non-Java projects, only `python3` and `gh` CLI are universally required.

## Workflow Overview

| Step | Action | Key Detail |
|------|--------|------------|
| 1 | Init context | `init_context.py --minimal` — checks prerequisites, detects branch/PR/project |
| 2 | Confirm SonarQube URL | Defaults to the company server from `data/platform-sonar.json`; override with `SONARQUBE_URL` or `--url` for any other server |
| 3 | Fetch & analyze | `fetch_and_analyze.py --project --pr --url --minimal` |
| 3.5 | Detect tech stack | Auto-detect from project files, cache per project_key |
| 4 | Fix issues | Regular issues first, then hotspots (with user approval each) |
| 5 | Validate | Run appropriate build/compile for detected tech stack |
| 6 | Commit & push | Show diff, ask user, generate commit message |

For full step details, bash commands, output format reference, and tech stack detection matrix, see `references/workflow.md`.

## Quality Gate Status Check (read-only)

For checking *whether* the Sonar quality gate is passing or failing (without fetching the full issue list to fix), use `gate_status.py`. This is the right tool when CI cited "Sonar quality gate failed" and the agent needs to know which conditions are red before deciding how to address them.

```bash
python3 scripts/gate_status.py <PROJECT_KEY> --branch <BRANCH> --minimal
# Or for a PR:
python3 scripts/gate_status.py <PROJECT_KEY> --pr <PR_NUMBER> --minimal
```

The company server is the default, so `--url` is only needed for a different server:
```bash
python3 scripts/gate_status.py <PROJECT_KEY> --branch <BRANCH> \
  --server sonarqube --url https://sonar.example.com --minimal
```

Project key, branch, and PR can be auto-detected by `init_context.py --minimal` (look at its `project_key=`, `branch=`, and `pr=` lines). When `init_context.py` reports an empty `pr=`, use `--branch` instead of `--pr`.

**On the company server, `--pr` and `--branch` are deliberately ignored** and the query runs at default-branch scope — Community Build analysed nothing else. The `scope=` output line states what was actually queried; read it before concluding a branch is clean. Reporting a branch as green when it was never analysed is the one failure mode this guard exists to prevent.

On multi-tenant SonarCloud, project keys are only unique within an organization. If the key you pass is not globally unique, add `--organization <ORG_KEY>` so the gate is evaluated against the right project (mirrors `fetch_and_analyze.py --organization`):
```bash
python3 scripts/gate_status.py <PROJECT_KEY> --branch <BRANCH> \
  --organization <ORG_KEY> --minimal
```
Omit it when keys are already fully qualified / globally unique.

`failing_conditions` reports each condition's threshold from the field matching its level — `errorThreshold` for `ERROR`, `warningThreshold` for `WARN` — so `WARN` rows show the warning threshold, not a placeholder.

**Output (--minimal):**
```
status=ERROR
project_key=acme:payment-api
branch=master
scope=default-branch scope
server=sonarqube
failing_count=2
failing_conditions=coverage:ERROR:LT:70.0:64.3,duplicated_lines_density:ERROR:GT:3.0:3.2
```

`status` is `OK` | `ERROR` | `WARN` | `NONE` (no gate configured) | `UNKNOWN` (fallback if the API returns no status field). `failing_conditions` lists each non-OK condition as `metric:status:comparator:threshold:actual` so the agent can distinguish hard failures (`ERROR`) from warnings (`WARN`) and see by how much each condition is off. Empty `failing_conditions=` for passing gates.

`gate_status.py` exits 0 on successful API call regardless of gate verdict — read the `status=` field, not the exit code.

This verb is **independent** of the fix workflow above. It does not fetch issues or hotspots, does not write to disk, and does not require Java/Maven/JaCoCo. Only `SONARQUBE_URL` is required when auth is disabled; set `SONARQUBE_TOKEN` (or `SONARCLOUD_TOKEN`) if the server requires authentication.

## The platform-default quality gate

Authoritative values are in `data/platform-sonar.json` `qualityGate`; the server's own definition still wins at runtime (report what the API returns, and use these only when the API is unreachable). Every condition is an **ERROR** condition — there are no warnings to defer:

| Metric | Fails when | Meaning |
|---|---|---|
| `bugs` | `> 0` | Any bug fails the gate |
| `vulnerabilities` | `> 0` | Any vulnerability fails the gate |
| `coverage` | `< 70` | Coverage must be ≥ 70% |
| `duplicated_lines_density` | `> 3` | Duplication must be ≤ 3% |
| `sqale_rating` | `> 2` | Maintainability must be A or B |
| `reliability_rating` | `> 2` | Reliability must be A or B |
| `security_rating` | `> 2` | Security must be A or B |

Ratings are `1=A … 5=E`, so `2` means B. Platform knobs: `SONAR_QG_COVERAGE_MIN=70`, `SONAR_QG_DUPLICATION_MAX=3`, `SONAR_QG_RATINGS_MAX=2`.

**Fix order** when several conditions are red: vulnerabilities → bugs → coverage → duplication → ratings.

**Never** weaken the gate to get a build out. Application users cannot modify profiles or gates anyway — platform admins own global policy — so the only route is fixing the code. Specifically: do not disable `sonar-enabled`, do not mute or downgrade a rule instead of fixing the finding, and do not add assertion-free tests to lift coverage. If a finding is a genuine false positive, refute it with a justified code change. Note that a *missing* coverage report reads as low coverage — check CI actually produces one before concluding the tests are inadequate.

## Pipeline effect

A failed gate can stop the CI pipeline before the image build; where the platform allows a soft staging mode, staging may still deploy with recommendations. Inspect the actual pipeline run before asserting the staging outcome. Production requires Quality Gate OK.

## Skipped Rules

The following rules must **never** be fixed, regardless of how many occurrences are reported. When encountered, skip silently and do not mention them to the user unless they ask.

| Rule | Reason |
|------|--------|
| `java:S6204` | `Stream.toList()` returns an internal JDK list type (`ImmutableCollections`) that is incompatible with GraalVM Native Image — reflection metadata is not auto-registered. Keep `.collect(Collectors.toList())` or `.collect(Collectors.toUnmodifiableList())` instead. |

## Key Principles

**SonarQube server (Step 2):**
- This skill targets SonarQube only.
- The server URL has a **built-in default**: the company server from `data/platform-sonar.json`
  (`https://sonarqube-ops.acme.example`). `SONARQUBE_URL` overrides it, and `--url` overrides both —
  pass one of those only when targeting a different server.
- This marketplace's SonarQube server has authentication disabled; do not fail when `SONARQUBE_TOKEN` is unset.

**Fixing (Step 4):**
- Follow rule guidance cached at `cache/rules/<lang>_<rule>.md`
- Apply tech stack context — use version/platform-appropriate syntax
- Keep changes minimal — only fix what is flagged
- For security hotspots: ALWAYS ask user before EACH fix; show rule, file, line, current code, and suggested fix before asking

**Processing order:** Regular issues first, then security hotspots with per-hotspot confirmation.

**Always use `--minimal` flag** on all script invocations.

## Commit Message Format

```
fix: resolve Sonar issues (<N> total: <X> hotspots + <Y> issues)

Security hotspots addressed:
- <rule>: <description> (<count> occurrences)

Fixed issues:
- <rule>: <description> (<count> occurrences)
```

Omit sections with 0 items.

## Additional Resources

- **`references/workflow.md`** — Full step-by-step details, bash commands, output format reference, tech stack detection matrix, and important notes
