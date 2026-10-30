---
name: check-dependency
description: Check a single npm package before adding it — OSV vulnerability scan via osv.dev and open-source license policy (Accepted / Accepted-with-Requirement / Forbidden). Use whenever installing or importing a new dependency.
---

# Check dependency

Run this **before** adding any package to `package.json` or running `bun add <pkg>` (`npm install <pkg>` on legacy projects).

## Inputs

- Package name (required)
- Exact pinned version (required — a range, dist-tag, or unpinned git/URL ref is rejected outright, not resolved)
- Ecosystem: `npm` or `python` (auto-detected from the manifest file present, or pass `--ecosystem` explicitly)

## Step 0 — Pinning check (reject before resolving)

Before anything else, verify the requested specifier is an **exact pin**:

```bash
node plugins/scan-dependency/scripts/check-pinned-versions.js <path-to-package.json>
```

For a Python dependency, add `--ecosystem python` and point at `requirements.txt`/`pyproject.toml` instead.

Reject `^`/`~`/`>=`/`<=`/`>`/`<`/`||`/wildcards (`*`, `1.x`) and dist-tags (`latest`, `next`, `beta`, `canary`). Reject a git/URL ref that isn't a commit SHA. `file:`/`workspace:` are exempt but noted.

**Policy:** If floating, **reject immediately** — do not resolve it and continue to Step 1. Ask for the exact version to pin (`npm view <package> versions --json`), then re-check.

Reference: `data/pinning-policy.json`

## Step 1 — OSV vulnerability check

Query [OSV API](https://osv.dev/):

```bash
curl -s -X POST "https://api.osv.dev/v1/query" \
  -H "Content-Type: application/json" \
  -d '{"version":"<exact-version>","package":{"name":"<package>","ecosystem":"npm"}}'
```

Or run from repo root:

```bash
node plugins/scan-dependency/scripts/check-package.js <package> <version>
```

For a Python package, use `"ecosystem":"PyPI"` instead — resolved from `data/osv-config.json`'s `ecosystems` map, not hardcoded.

**Policy:** If `vulns` array is non-empty → **reject** the dependency. Report CVE/OSV IDs, severity summary, and suggest a fixed version or an alternative package.

Reference: `data/osv-config.json`

## Step 2 — License check (3-tier policy)

Fetch license from npm registry:

```bash
npm view <package>@<version> license --json
```

For a Python package, fetch from PyPI's JSON API instead:
```bash
curl -s "https://pypi.org/pypi/<package>/<version>/json" | jq '.info.license, .info.classifiers'
```
Trove classifiers (e.g. `"License :: OSI Approved :: MIT License"`) are translated to SPDX via `data/license-classifier-trove-map.json` before matching against the same allowed/conditional/forbidden files below.

Compare against:

| File | Tier |
|------|------|
| `data/allowed-licenses.json` | **Accepted** |
| `data/conditional-licenses.json` | **Accepted with Requirement** |
| `data/forbidden-licenses.json` | **Forbidden (P0)** |

### License rules

| Result | Action |
|--------|--------|
| Single **Accepted** license (MIT, Apache-2.0, 0BSD, etc.) | **Approve** |
| **Accepted with Requirement** (GPL, LGPL, MPL, SSPL-1.0, Elastic-2.0, …) | **Approve only after documenting the requirement** |
| `MIT OR Apache-2.0` — all options Accepted / Accepted-with-Requirement | **Approve** (document requirements if any) |
| AGPL, CC-BY-SA, UNLICENSED, proprietary, non-commercial, unknown | **Reject P0** |
| Empty / missing license | **Reject P0** |
| Unknown SPDX / custom | **Reject P0** — not on Accepted or Accepted-with-Requirement lists |

Normalize SPDX IDs before matching (case, whitespace).

### Accepted (summary)

0BSD · Apache-1.0 · Apache-1.1 · Apache-2.0 · BSD-2-Clause · BSD-3-Clause · BSD-4-Clause · BSL-1.0 · CC0-1.0 · ICU · ISC · JSON · MIT · MIT-0 · PostgreSQL · Python-2.0 · Unlicense · W3C-20150513 · WTFPL · Zlib

### Accepted with Requirement (must document)

| License family | Requirement |
|----------------|-------------|
| GPL-1.0 / GPL-2.0 / GPL-3.0 (incl. -only / -or-later) | If distributed, source code obligation must be checked |
| LGPL | Linking only; if modified/distributed, check requirement |
| EPL | Source obligation applies to EPL files only |
| MPL | Modified MPL files must follow MPL |
| CDDL | Modified CDDL files must follow CDDL |
| SSPL-1.0 | Backend and unmodified use only |
| Elastic-2.0 | License limitation must be checked before use |
| Bare Apache / BSD | Must include license notice and attribution |

### Forbidden (P0)

AGPL-1.0 · AGPL-3.0 (all variants) · CC-BY-SA-3.0 · CC-BY-SA-4.0 · Empty License · Unknown · Potentially Commercial · Dynamic License · Proprietary · Non-commercial · UNLICENSED · Unclear license

## Step 3 — Transitive warning

If approving a direct dependency, note that transitive deps must also pass on lockfile scan. Recommend running `scan-dependencies` after install.

## Output

```markdown
## Dependency check — <package>@<version>

### OSV
- Status: PASS | FAIL
- Vulnerabilities: ...

### License
- Declared: ...
- Tier: Accepted | Accepted with Requirement | Forbidden
- Status: PASS | FAIL (P0)
- Requirements (if any): ...

### Verdict
APPROVED | APPROVED (with requirements) | REJECTED — <action>
```

**Never add Forbidden packages.** For Accepted-with-Requirement, document compliance in the PR/commit notes before merging.
