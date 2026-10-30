---
name: setup-authn
description: Plan Apps Gateway authn for this app — registration, paths, X-User-Id identity, public prefix, local DEV simulation.
---

# Setup Apps Gateway authn

Plan authentication for this project using the `authn-implementations` plugin.

## Steps

1. Read skills `use-apps-gateway-authn`, `get-logged-in-user`, `configure-public-paths`, `local-authn-dev`.
2. Load `data/apps-gateway.json`, `data/paths.json`, `data/auth-api.json`, `data/checklist.json`.
3. **Record** the intended subdomain and access mode (WHITELIST / EVERYONE) for DevOps to apply — this
   command plans registration, it never performs it. Registration is done by DevOps or the
   platform team at `/auth/ui/apps`. Never call
   `POST /auth/api/apps/register` and never handle the `X-App-Registration-Key`.
4. Map routes:
   - Login-required defaults (`/`, `/api/**`, …)
   - Public under `/dangerously-skip-login/**` only
   - No `/auth/**` or `/actuator/**` in the app
5. Wire server identity from `X-User-Id`; browser from `/auth/api/me`.
6. Document login/logout as full-page navigations.
7. If local standalone: DEV-only `authHeaders` + `/dev-login` (never production).
8. Do not implement custom gateway login/session/JWT unless user explicitly overrides.

## Output

```markdown
## Authn setup — <app>

### Registration — values for DevOps to apply (not performed here)
- Subdomain: <name>
- Owners: <emails>
- Access mode: WHITELIST | EVERYONE
- Applied by: DevOps or the platform team at /auth/ui/apps

### Paths
- Login-required: ...
- Public (/dangerously-skip-login/**): ...

### Identity
- Server: X-User-Id
- Browser: GET /auth/api/me

### Local DEV
- /dev-login + authHeaders gated by DEV

### Checklist
- [ ] items from data/checklist.json
```
