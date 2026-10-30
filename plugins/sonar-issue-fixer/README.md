# Sonar Issue Fixer

Fix SonarQube findings and check quality gate status against the OPS SonarQube server.

## Purpose

1. Detect branch / PR / project key (`acme:<app>` on the company server)
2. Fetch SonarQube issues and security hotspots
3. Apply minimal rule-guided fixes (hotspots require per-item approval)
4. Optionally check quality gate status (read-only)

**Run it before you merge.** The company server is SonarQube **Community Build** — `main`/`master` only, no branch analysis, no PR decoration. A feature branch gets no gate feedback at all, so the first signal is a red gate on main, which fails the CI pipeline before an image is built. Local pre-merge checking is the only feedback loop available.

## Server

| Setting | Value |
|---------|-------|
| URL | `https://sonarqube-ops.acme.example` — **the built-in default**; `SONARQUBE_URL` or `--url` overrides it |
| Auth | Disabled on this server — `SONARQUBE_TOKEN` is optional |
| Project key | `acme:<app>`, registered by the platform at onboarding |
| Quality gate | `platform-default` — 0 bugs, 0 vulnerabilities, coverage ≥ 70%, duplication ≤ 3%, all three ratings A or B. Not modifiable by application users. |
| Scope | Default branch only; `--pr` / `--branch` are ignored here and the `scope=` output line says so |

## Components

| Component | Purpose |
|-----------|---------|
| Skill `sonar-issue-fixer` | Fix issues / check gate |
| `data/platform-sonar.json` | Company server, `acme:<app>` convention, `platform-default` gate conditions, Community Build limitation, fix guidance |
| `scripts/init_context.py` | Prerequisites + context detection |
| `scripts/fetch_and_analyze.py` | Fetch issues/hotspots + cache rules |
| `scripts/gate_status.py` | Read-only quality gate status |
| `references/workflow.md` | Full step-by-step workflow |

## Install

```text
/add-plugin sonar-issue-fixer
/plugin install sonar-issue-fixer@smart-aiagent-plugins
```

## Quick start

```bash
python3 plugins/sonar-issue-fixer/skills/sonar-issue-fixer/scripts/init_context.py --minimal

python3 plugins/sonar-issue-fixer/skills/sonar-issue-fixer/scripts/gate_status.py acme:<app> --minimal
```

No `--url` needed for the company server.

## Skipped rules

`java:S6204` is never auto-fixed (GraalVM Native Image incompatibility with `Stream.toList()`).
