---
name: scan-deps
description: Scan project dependencies for OSV vulnerabilities and open-source license policy violations (Accepted / Accepted-with-Requirement / Forbidden).
---

# Scan dependencies

Audit all dependencies in this project.

## Steps

1. Load `scan-dependency/data/osv-config.json`, `allowed-licenses.json`, `conditional-licenses.json`, `forbidden-licenses.json`, `pinning-policy.json`
2. Find all lockfiles (`bun.lock`, `package-lock.json`; `pnpm-lock.yaml` on legacy projects; a binary `bun.lockb` must be converted with `bun install --save-text-lockfile`) and manifest files (`package.json`, `requirements.txt`, `pyproject.toml`) in monorepo
3. Run OSV scan:
   - `osv-scanner -r .` if installed, OR
   - `node plugins/scan-dependency/scripts/scan-lockfile.js` (covers bun.lock through the OSV batch API even without osv-scanner), OR
   - OSV batch API per package
4. Check version pinning: `node plugins/scan-dependency/scripts/check-pinned-versions.js .` — reject any floating specifier
5. Check license for each unique package@version against the 3-tier policy
6. Report vulnerabilities, Accepted-with-Requirement items, P0 license violations, and unpinned dependencies
7. Recommend upgrades (`osv-scanner fix`) or exact pins for any floating specifier found, or package replacements

## Python-specific scan

```bash
node plugins/scan-dependency/scripts/scan-python-deps.js
```

## Single package check

If user asks about one package:

```bash
node plugins/scan-dependency/scripts/check-package.js <name> <version>
```

Do not add Forbidden packages. Document requirements for Accepted-with-Requirement licenses.
