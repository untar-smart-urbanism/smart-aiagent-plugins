---
name: scan-dependencies
description: Scan existing lockfiles and package.json trees for OSV vulnerabilities and open-source license policy violations (Accepted / Accepted-with-Requirement / Forbidden). Use in CI, PR review, or after `bun install` / `npm install`. Reads package-lock.json and Bun's text bun.lock.
---

# Scan dependencies

Audit **all** dependencies in the current project.

## Methods (pick one)

### A — OSV-Scanner (recommended)

```bash
# Install once
go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v2

# Scan lockfiles
osv-scanner --lockfile=package-lock.json
osv-scanner --lockfile=pnpm-lock.yaml   # legacy projects only

# Scan entire monorepo
osv-scanner -r .
```

See [OSV Scanner docs](https://osv.dev/).

### B — Plugin script

```bash
node plugins/scan-dependency/scripts/scan-lockfile.js
```

Runs from monorepo root and finds every `package-lock.json`, `bun.lock` and `bun.lockb` below it (node_modules and dot-directories skipped). Reports OSV findings, P0 licence violations and Accepted-with-Requirement packages.

**bun.lock** (Bun 1.2+ text lockfile, the allowed stack's lockfile):

- Parsed as JSONC. The resolved `name@version` of each entry is used, so an alias (`"left-pad": ["pad-left@2.1.0", …]`) is checked as the package that was actually installed.
- Workspace, git, `file:` and tarball entries are listed under *Not a registry release* — never silently dropped, never licence-checked as if they were registry packages.
- OSV: bun.lock packages are always sent to the OSV batch API (Method C) in addition to osv-scanner, because osv-scanner's bun.lock support is not verified here. Findings are de-duplicated. API unreachable → reported as not scanned, never as clean.
- **bun.lockb** (the pre-1.2 binary lockfile) cannot be read: the run ends **INCOMPLETE** (exit 1). Convert with `bun install --save-text-lockfile` and commit `bun.lock`.
- No `npm` CLI on the machine (common with Bun): licences are read from `registry.npmjs.org` directly. A private registry in `.npmrc` is not consulted on that path, and a failed lookup is reported as *Licence lookup failed* → INCOMPLETE, never as a forbidden "no licence".

### C — OSV batch API

POST `https://api.osv.dev/v1/querybatch` with all `name@version` pairs from lockfile.

### D — Python tree

```bash
node plugins/scan-dependency/scripts/scan-python-deps.js
```

Scans `requirements.txt` (including files recursively included via `-r`/`-c`) and `pyproject.toml` (both PEP 621 and Poetry dependency tables) for pinning, OSV (via PyPI), and license issues in one pass — the Python equivalent of running `scan-lockfile.js` plus a pinning check together, since `requirements.txt` is often itself the resolved output rather than a separate manifest-plus-lockfile pair.

## License audit

For each unique package@version in lockfile:

1. `npm view <pkg>@<ver> license` — or, without an npm CLI, `GET https://registry.npmjs.org/<pkg>/<ver>` and read `license`
2. Evaluate against:
   - `data/allowed-licenses.json` — Accepted
   - `data/conditional-licenses.json` — Accepted with Requirement
   - `data/forbidden-licenses.json` — Forbidden (P0)
3. Flag P0 violations; list Accepted-with-Requirement packages for documentation

## Pinning audit

For every package.json in the tree, verify each dependency entry is an exact pin:

```bash
node plugins/scan-dependency/scripts/check-pinned-versions.js .
```

For Python only, add `--ecosystem python`, or use `scan-python-deps.js` (Method D above) for the combined pinning+OSV+license audit.

Classifies each specifier as pinned / floating / exempt (`file:`, `workspace:`) per `data/pinning-policy.json`.

## Report

```markdown
## Dependency scan — <project>

### Vulnerabilities (OSV) — grouped by platform decision
| Package | Version | OSV/CVE | Severity | Platform decision | Fixed in |
|---------|---------|---------|----------|-------------------|----------|

### License — Accepted with Requirement
| Package | Version | License | Requirement |
|---------|---------|---------|-------------|

### License violations (P0)
| Package | Version | License | Finding |
|---------|---------|---------|---------|

### Unpinned dependencies
| Package | File | Field | Specifier | Severity | Reason |
|---------|------|-------|-----------|----------|--------|

### Summary
- Total packages scanned: N
- Vulnerable: N (CRITICAL: N block / HIGH: N approval / MEDIUM: N warn / LOW-UNKNOWN: N info)
- Accepted with Requirement: N
- License P0: N
- Unpinned (floating): N (HIGH: N / MEDIUM: N)
- Action required: ...
```

## Platform severity mapping

Group vulnerabilities by the deployment platform's **documented default** decisions, so the report speaks the same language a promotion will. Read `data/osv-config.json` `platformSeverityPolicy`:

| Severity | Platform's documented default |
|---|---|
| CRITICAL | **block** — production deploy refused |
| HIGH | **approval_required** — escalates to an approval task |
| MEDIUM | warn |
| LOW / UNKNOWN | informational |

Where a severity cannot be determined from the OSV record, report it as **UNKNOWN** — never assume LOW.

### This mapping is a vocabulary, not a prediction

**Trivy's scan configuration is platform-internal and is not shared with users or internal teams.** We cannot read its flags, its ignore-file, which scanners run, the check-bundle version, or the live values of the gate thresholds — the table above is what the documentation states, not something any run can verify. State both limits every time:

- **Coverage.** OSV covers declared package dependencies only. The platform's Trivy also scans base-image OS packages, built image layers, Kubernetes/IaC manifests, and embedded secrets.
- **Configuration.** Even on the overlap, results can diverge **both ways**: the platform may suppress a CRITICAL we flag (unfixed, or on an ignore-list we cannot see), and may flag something we never look at.

So a clean result here does **not** mean the gate will pass, and a CRITICAL here does **not** mean it will block. Attribute the verdict to this tool's policy, and get the live decision from the platform's own scan results or the platform team. Never re-run a scanner locally and present the output as the platform's.

Note the deliberate asymmetry with `check-dependency`: adding a *new* dependency is rejected for **any** vulnerability regardless of severity, because a clean choice is free at that moment. This severity mapping is for triaging a tree you already have.

## Remediation

- Vulnerabilities: upgrade to fixed version (`osv-scanner fix`) or replace package
- Accepted with Requirement: document and satisfy the listed requirement before release
- License P0: remove package or get written legal exception
