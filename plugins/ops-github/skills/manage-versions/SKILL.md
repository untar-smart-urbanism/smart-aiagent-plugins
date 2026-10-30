---
name: manage-versions
description: Bump app and package versions using SemVer and Conventional Commits before pushing to GitHub. Use eagerly before push-to-github or when user asks about releases. Read data/versioning-policy.json for rules.
---

# Manage versions

**Source of truth** for version bumps. Runs automatically via `push-github.js` before every push.

## Standard

- **SemVer** `MAJOR.MINOR.PATCH` per [Semantic Versioning 2.0.0](https://semver.org/)
- **Conventional Commits** for bump level — see `data/versioning-policy.json`

| Change type | Bump |
|-------------|------|
| `BREAKING CHANGE` or `feat!:` | **MAJOR** |
| `feat:` | **MINOR** |
| `fix:`, `perf:`, `refactor:`, `security:` | **PATCH** |
| `docs:`, `chore:`, `test:`, `ci:` (no src change) | **none** |
| Production `src/` changed, no qualifying commit | **PATCH** (default) |

## Version files

| Path | When bumped |
|------|-------------|
| `apps/frontend/package.json` | Changes under `apps/frontend/` |
| `apps/backend/package.json` | Changes under `apps/backend/` |
| `packages/*/package.json` | Changes under that package |
| `plugins/*/plugin.manifest.json` | Changes under that plugin (+ platform `plugin.json` synced) |

## Commands

```bash
# Preview bumps (no writes)
node plugins/ops-github/scripts/bump-versions.js --dry-run

# Bump and auto-commit
node plugins/ops-github/scripts/bump-versions.js --auto-commit

# Automatic before push (default)
node plugins/ops-github/scripts/push-github.js

# Skip version check
node plugins/ops-github/scripts/push-github.js --skip-bump
```

## Agent workflow

1. Use **Conventional Commit** messages (`feat:`, `fix:`, etc.) so bump level is inferred correctly.
2. After `git commit`, run `push-github.js` — it bumps versions then pushes.
3. For plugin repos: after plugin version bump, run `npm run sync-marketplace` if `.marketplace/` exists.
4. Use scoped commits when possible: `feat(frontend): add orders page`.

## Manual audit (existing project)

User runs `/bump-versions` to check or apply bumps without pushing.
