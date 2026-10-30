---
name: use-apps-gateway-authn
description: Build apps behind Apps Gateway — never implement login/sessions; read X-User-Id; secure-by-default paths; public routes only under /dangerously-skip-login/**. Use eagerly when scaffolding apps, adding auth, routes, login UI, or APIs behind the company gateway.
---

# Use Apps Gateway authentication

**Mandatory authn** for company apps behind Apps Gateway: the gateway authenticates users; your app reads **`X-User-Id`** (email).

## When to use (do not wait for the user to ask)

Activate when **any** of the following is true:

1. Creating or extending a web app / API that will sit behind Apps Gateway
2. User asks for login, SSO, sessions, JWT, auth middleware, or "who is logged in"
3. Adding routes, public pages, health endpoints, or SPA navigation to login/logout
4. Local-dev simulation of an authenticated user

## Data to load

| File | Purpose |
|------|---------|
| `data/apps-gateway.json` | Contract, TL;DR, registration |
| `data/paths.json` | Reserved / public / login-required paths |
| `data/auth-api.json` | Gateway auth APIs |
| `data/authorization.json` | Access mode vs app roles |
| `data/local-dev.json` | Local simulation |
| `data/checklist.json` | Done criteria |

## Mandatory choices

| Topic | Policy |
|-------|--------|
| Login / sessions | **Never** implement in the app — gateway owns them |
| Identity (server) | Read **`X-User-Id`** (email) |
| Identity (browser) | `GET /auth/api/me` → `{ email, admin }` |
| Paths | Login required **by default** |
| Public paths | Only under **`/dangerously-skip-login/**`** |
| Reserved | Do **not** use `/auth/**` or `/actuator/**` |
| Login / logout nav | **Full-page** only (`window.location.assign`) — never SPA router |
| Production trust | Trust `X-User-Id` only via network isolation behind the gateway |
| App registration | **Never performed by you.** DevOps or the platform team registers the app. Plan it, record the values, verify afterwards — see `data/apps-gateway.json` `registration.performedBy` |

## Mental model

```
Browser → Apps Gateway (TLS, login, routing, identity) → YOUR APP
```

If a request reaches you on a normal path, the user is authenticated and allowed into the app; `X-User-Id` is present.

## Do not build

- Custom login pages (except optional gateway `/auth/api/login` or **dev-only** `/dev-login`)
- Password / JWT / session handling for gateway identity
- Client-side routes that shadow `/auth/**`
- Production code that sends `X-User-Id` from the browser

## Do not perform: gateway registration

Registering the app — subdomain, **owners**, access mode — decides who may enter it, and the register
API is authenticated with a credential (`X-App-Registration-Key`) you should never hold. It is a
**DevOps/platform action**, done by an authorized person at `/auth/ui/apps`.

So: **never** call `POST /auth/api/apps/register`, never write code or a script that does, never put
the registration key anywhere, never submit the console form through a browser tool, and never change
an existing app's owners or access mode.

What you do instead: state the intended subdomain, owners, and access mode so DevOps can apply them,
then stop. Verifying afterwards that the app resolves and
routes is fine and encouraged. If asked to register, say it is a DevOps action and hand over the values;
do not offer a scripted workaround.

## Related skills

- `get-logged-in-user` — header + `/auth/api/me`
- `configure-public-paths` — `/dangerously-skip-login/**`
- `local-authn-dev` — local simulation

## Before finishing

Verify `data/checklist.json` items that apply to the change.
