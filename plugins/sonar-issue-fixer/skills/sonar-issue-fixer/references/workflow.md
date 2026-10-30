# SonarQube Issue Fixer — Workflow Reference

## Step 1 — Init context

```bash
python3 {skill}/scripts/init_context.py --minimal
# optional overrides:
python3 {skill}/scripts/init_context.py --url https://sonarqube-ops.acme.example --minimal
```

**Checks:** `python3`, `gh`, reachability of `SONARQUBE_URL` / `--url`, git branch, open PR (via `gh`), project key from `sonar-project.properties` / `pom.xml` / `package.json` / `.sonarcloud.properties`.

**Minimal output:**
```
passed=true|false
sonar_server=sonarqube
url=https://sonarqube-ops.acme.example
branch=feature/foo
pr=123
project_key=com.example:service
auth=disabled|token|missing
python=ok
gh=ok|missing
errors=
```

When `passed=false`, read `errors=` and fix before continuing.

## Step 2 — Confirm SonarQube URL

```bash
export SONARQUBE_URL=https://sonarqube-ops.acme.example
# optional if the server requires auth:
export SONARQUBE_TOKEN=...
```

Or pass `--url` on every script. Prefer env so subsequent steps inherit it.

## Step 3 — Fetch & analyze

```bash
python3 {skill}/scripts/fetch_and_analyze.py \
  --project <PROJECT_KEY> \
  --pr <PR_NUMBER> \
  --url "$SONARQUBE_URL" \
  --minimal

# branch analysis (no PR):
python3 {skill}/scripts/fetch_and_analyze.py \
  --project <PROJECT_KEY> \
  --branch <BRANCH> \
  --url "$SONARQUBE_URL" \
  --minimal
```

**What it does:**
1. Pulls open issues (`OPEN,CONFIRMED,REOPENED`) and hotspots (`TO_REVIEW`) for the PR/branch
2. Skips `java:S6204` silently
3. Caches rule guidance under `{skill}/cache/rules/<lang>_<ruleKey>.md`
4. Writes a machine-readable findings file under `{skill}/cache/findings/<project_key>.json`
5. Detects tech stack and caches it under `{skill}/cache/techstack/<project_key>.json`

**Minimal output:**
```
project_key=...
branch=...
pr=...
server=sonarqube
issue_count=12
hotspot_count=2
skipped_count=1
tech_stack=java,maven
findings_path=.../cache/findings/...
techstack_path=.../cache/techstack/...
```

Then open `findings_path` and fix each issue using the matching rule cache file.

## Step 3.5 — Tech stack detection matrix

| Signal files | Stack tags |
|--------------|------------|
| `pom.xml`, `*.java` | `java`, `maven` |
| `build.gradle`, `build.gradle.kts` | `java`, `gradle` |
| `package.json` | `node` |
| `tsconfig.json` | `typescript` |
| `go.mod` | `go` |
| `pyproject.toml`, `requirements.txt` | `python` |
| `Cargo.toml` | `rust` |
| `*.csproj` | `dotnet` |

Use version-appropriate APIs when applying fixes (e.g. Java 17+ records only if the project already uses them).

## Step 4 — Fix issues

1. **Regular issues first** — apply minimal edits guided by `cache/rules/<lang>_<rule>.md`
2. **Security hotspots second** — for EACH hotspot:
   - Show rule, file, line, current snippet, suggested fix
   - Ask the user for approval before editing
   - Skip if the user declines

Do not fix skipped rules. Do not broaden refactors beyond the flagged finding.

## Step 5 — Validate

| Tech stack | Validation |
|------------|------------|
| `maven` | `./mvnw -q -DskipTests compile` or `mvn -q -DskipTests compile` |
| `gradle` | `./gradlew compileJava` / `compileKotlin` |
| `node` / `typescript` | `npm test` or project lint/build script |
| `go` | `go build ./...` |
| `python` | project test/lint entrypoint if present |
| unknown | ask user which command to run |

Fix compile/lint failures introduced by Sonar fixes before committing.

## Step 6 — Commit & push

1. Show `git diff` / `git status`
2. Ask user for confirmation
3. Commit with the format from `SKILL.md`
4. Push only if the user asks

## Quality gate (read-only) — independent verb

```bash
python3 {skill}/scripts/gate_status.py <PROJECT_KEY> \
  --branch <BRANCH> \
  --server sonarqube \
  --url "$SONARQUBE_URL" \
  --minimal
```

Does not fetch issues, does not write files. Exit code 0 means the API call succeeded — use `status=` for the verdict.

## API notes (SonarQube)

| Script need | Endpoint |
|-------------|----------|
| Issues | `GET /api/issues/search` |
| Hotspots | `GET /api/hotspots/search` |
| Rule detail | `GET /api/rules/show` |
| Quality gate | `GET /api/qualitygates/project_status` |
| Server ping | `GET /api/system/status` |

Auth: send `Authorization: Bearer <token>` only when `SONARQUBE_TOKEN` / `SONARCLOUD_TOKEN` is set. When authentication is disabled on the server, omit the header.

## Important notes

- Always pass `--minimal` so the agent can parse `key=value` lines.
- Resolve script paths from the skill directory, never from the project root.
- Prefer PR scope (`--pr`) when an open PR exists; otherwise use `--branch`.
- Keep fixes minimal and rule-guided.
- Never commit secrets.
