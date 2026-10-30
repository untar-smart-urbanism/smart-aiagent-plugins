# Authn Implementations

Company standard for **authentication of apps behind Apps Gateway**.

## Purpose

When agents build or modify downstream apps:

1. **Never** implement login or sessions — the gateway does that at the edge
2. Read the logged-in user from **`X-User-Id`** (email)
3. Keep paths **secure by default**; the app's own public routes only under **`/dangerously-skip-login/**`**, and the four gateway **probe** paths (`/health`, `/api/health`, `/version`, `/api/version`) unauthenticated at the root by gateway design
4. Use **full-page** navigation for `/auth/ui/login` and `/auth/logout`
5. Simulate identity locally with DEV-only helpers (never in production)

## Mental model

```
Browser → Apps Gateway (TLS, login, routing, identity) → YOUR APP
```

## Components

| Component | Purpose |
|-----------|---------|
| `data/*.json` | Contract, paths, auth API, authz, local DEV, checklist |
| Skill `use-apps-gateway-authn` | Eager default for authn work |
| Skill `get-logged-in-user` | `X-User-Id` / `/auth/api/me` |
| Skill `configure-public-paths` | Public prefix rules |
| Skill `local-authn-dev` | Local simulation |
| Rule `apps-gateway-authn-enforcement` | Always-on |
| Rule `apps-gateway-paths` | File-scoped route/router |
| Agent `authn-guardian` | Enforcement subagent |
| Commands `/setup-authn`, `/check-authn` | Plan and audit |
| `templates/auth-headers.ts` | DEV client headers + gateway nav |
| `templates/gateway-user.ts` | Server identity helpers |

## Install

```text
/add-plugin authn-implementations
/plugin install authn-implementations@smart-aiagent-plugins
```

Install with `code-review` and `tech-radar`.

## Quick reference

| Concern | Rule |
|---------|------|
| Who is the user? | `X-User-Id` (email) |
| App's own public path | `/dangerously-skip-login/**` (prefix) |
| Gateway probe paths | `/health`, `/api/health`, `/version`, `/api/version` (**exact**, unauthenticated, no identity) |
| Reserved | `/auth/**`, `/actuator/**` |
| Browser me | `GET /auth/api/me` |
| Login | Full-page `/auth/ui/login?redirect=...` |
| Logout | Full-page `/auth/logout` |

## Two kinds of unauthenticated path

Confusing these causes real bugs, so `data/paths.json` keeps them separate:

- **`gatewayProbePaths`** — the gateway routes exact `/health`, `/api/health`, `/version`,
  `/api/version` straight to the application, bypassing auth. Implement them; never protect them;
  never read identity in them; never report them as a violation. Non-default probe paths go in
  `.platform/observability.yaml`.
- **`publicPrefix`** — `/dangerously-skip-login/**` is where the **application** puts its own public
  routes. Keep it small. Extra bypasses are declared in `.platform/routing.yaml` when platform policy
  enables them.

## Registration: a DevOps action, and one system

**Registration is never performed by an agent or by these plugins.** It decides who may enter the
application, and the register API is authenticated with a credential (`X-App-Registration-Key`) an agent
should never hold. It is done by DevOps or the platform team — an authorized person submits the console form, or the
deployment platform's own automation registers the app. What the plugins do is **plan** it — record the
intended subdomain, owners, and access mode for DevOps — and **verify** afterwards that the app resolves
and routes. See `data/apps-gateway.json` `registration.performedBy`.

The console and the API are the same system: the browser form at
`https://<app>.<domain>/auth/ui/apps` is the human front-end over `POST /auth/api/apps/register` —
submitting it calls that same API. One operation, one record, two entry points. (That the console lives
under `/auth/**` is exactly why that prefix is gateway-owned and never forwarded to the app.)

## Source

Derived from the Apps Gateway client guideline for downstream applications.
