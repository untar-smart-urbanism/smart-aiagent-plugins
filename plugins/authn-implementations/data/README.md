# Authn implementations data

| File | Purpose |
|------|---------|
| `apps-gateway.json` | Mental model, TL;DR, identity header, registration (console == register API) and who performs it |
| `paths.json` | Reserved paths, **gateway probe paths** (exact `/health`, `/api/health`, `/version`, `/api/version` — unauthenticated by design), the app's own public prefix, login/logout navigation |
| `auth-api.json` | `/auth/api` reference and gateway headers |
| `authorization.json` | Gateway access modes vs app-level roles |
| `local-dev.json` | Local `X-User-Id` simulation rules |
| `checklist.json` | Implementation checklist |

Source guidance: Apps Gateway client guideline for downstream apps.
