# Scan Dependency

Block vulnerable and non-compliant dependencies before they enter the codebase.

## Purpose

When agents or developers add npm packages:

1. **OSV check** — query [osv.dev](https://osv.dev/) for known vulnerabilities
2. **License check** — enforce company Open Source License Policy (3 tiers)

## License policy (v1.1.0)

### Accepted

0BSD · Apache-1.0 · Apache-1.1 · Apache-2.0 · BSD-2-Clause · BSD-3-Clause · BSD-4-Clause · BSL-1.0 · CC0-1.0 · ICU · ISC · JSON · MIT · MIT-0 · PostgreSQL · Python-2.0 · Unlicense · W3C-20150513 · WTFPL · Zlib

### Accepted with Requirement

Document and satisfy the requirement before merge:

| License | Requirement |
|---------|-------------|
| GPL-1.0 / GPL-2.0 / GPL-3.0 (+ -only / -or-later) | If distributed, source code obligation must be checked |
| LGPL | Linking only; if modified/distributed, check requirement |
| EPL | Source obligation applies to EPL files only |
| MPL | Modified MPL files must follow MPL |
| CDDL | Modified CDDL files must follow CDDL |
| SSPL-1.0 | Backend and unmodified use only |
| Elastic-2.0 | License limitation must be checked before use |
| Bare Apache / BSD | Must include license notice and attribution |

### Forbidden (P0)

AGPL-1.0 · AGPL-3.0 (all variants) · CC-BY-SA-3.0 · CC-BY-SA-4.0 · Empty License · Unknown · Potentially Commercial · Dynamic License · Proprietary · Non-commercial · UNLICENSED · Unclear license

Compound `MIT OR Apache-2.0` OK if all options are Accepted or Accepted-with-Requirement. Any Forbidden token → reject.

## Components

| Component | Purpose |
|-----------|---------|
| `data/osv-config.json` | OSV API endpoints and policy |
| `data/allowed-licenses.json` | Accepted licenses |
| `data/conditional-licenses.json` | Accepted with Requirement |
| `data/forbidden-licenses.json` | Forbidden (P0) |
| Skill `check-dependency` | Pre-install single package check |
| Skill `scan-dependencies` | Full lockfile / monorepo audit |
| Rule `dependency-policy` | Always-on enforcement |
| Rule `npm-dependency-guard` | Triggered on package.json / lockfile edits (package-lock.json, bun.lock) |
| Agent `dependency-guardian` | Dependency gatekeeper |
| Command `scan-deps` | Run full scan |
| `scripts/check-package.js` | CLI: check one package |
| `scripts/scan-lockfile.js` | CLI: scan `package-lock.json` and `bun.lock` for licences and OSV |

## Install

```text
/add-plugin scan-dependency
/plugin install scan-dependency@smart-aiagent-plugins
```

## Check before adding a package

```bash
node plugins/scan-dependency/scripts/check-package.js lodash 4.17.21
```

Or ask the agent to use the `check-dependency` skill.

## Scan existing project

```bash
# Licence audit + OSV: osv-scanner if installed; bun.lock packages also via the OSV batch API
node plugins/scan-dependency/scripts/scan-lockfile.js .

# Or with OSV-Scanner directly
osv-scanner -r .
```
