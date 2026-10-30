---
name: check-authn
description: Audit whether the app follows Apps Gateway authn — X-User-Id, path rules, no custom sessions, DEV injection gated.
---

# Check Apps Gateway authn

Audit this project against the `authn-implementations` plugin.

## Steps

1. Load `data/apps-gateway.json`, `data/paths.json`, `data/checklist.json`, `data/local-dev.json`.
2. Search for login/session/JWT/Passport/cookie-session implementations that duplicate gateway auth.
3. Verify:
   - Identity from `X-User-Id` and/or `/auth/api/me`
   - No app routes under `/auth/**` or `/actuator/**`
   - The app's **own** public routes only under `/dangerously-skip-login/**`
   - The four **gateway probe paths** (`/health`, `/api/health`, `/version`, `/api/version`, exact
     match) are implemented, answer **without** a session, and read no identity. These are
     gateway-defined and unauthenticated by design — **never report them as a violation**, and flag it
     instead when the app *does* require auth on one, or when one is missing. Non-default probe paths
     must be declared in `.platform/observability.yaml`.
   - Login/logout use full-page navigation (not SPA router)
   - Client `X-User-Id` / mock login gated by DEV and absent from production paths
   - `X-Request-Id` logged/propagated where applicable
4. Report violations with file paths and fixes.

## Report

```markdown
## Authn audit (Apps Gateway)

### Compliant
- ...

### Violations
- ...

### Checklist gaps
- ...
```
