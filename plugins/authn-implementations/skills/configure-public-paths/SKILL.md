---
name: configure-public-paths
description: Expose anonymous (public) routes behind Apps Gateway only under /dangerously-skip-login/**. Use when adding health checks, landing pages, or public APIs that must work without login.
---

# Configure public paths

Two different things are unauthenticated, and confusing them causes real bugs. Read
`data/paths.json` — `gatewayProbePaths` and `publicPrefix` are separate concepts.

| | Who defines it | Paths | Match |
|---|---|---|---|
| **Gateway probe paths** | The **gateway** | `/health`, `/api/health`, `/version`, `/api/version` | exact |
| **Public prefix** | The **application** | `/dangerously-skip-login/**` | prefix |

**Secure by default:** every other path requires login.

## Gateway probe paths — implement them, do not protect them

The gateway routes these four **exact** paths straight to the application service, bypassing
authentication entirely. They are part of the platform's routing contract, so:

- Implement `/health` (and `/version` where useful) at the **root**, answering **without a session**.
  This is correct, expected, and required — probes and ops tooling depend on it.
- **Never** require auth on them, and never move them under `/dangerously-skip-login/`.
- No `X-User-Id` is forwarded on a probe path — never read identity in a probe handler.
- Exact match only: `/health` is a probe path, `/health/detail` is a normal login-required path.
- Different probe paths? Declare them in `.platform/observability.yaml` — do not invent a new scheme.

## Rules for the app's own public routes

1. Place public pages/APIs **under `/dangerously-skip-login/**`** (prefix is **not** stripped).
2. Keep the public surface **small**.
3. On skip-login paths, `X-User-Id` may be absent (anonymous) or present (logged-in visitor).
4. Never invent another "public" scheme (`/public/**`, `/open/**`, …). Additional bypasses are
   declared in `.platform/routing.yaml` when platform policy enables them — ask the platform team
   rather than inventing a prefix. This does **not** apply to the four gateway probe paths above,
   which are the platform's own convention.

## Suggested layout

```text
/                                  login required
/api/**                            login required
/health  /api/health               gateway probe path — unauthenticated by design, exact match
/version /api/version              gateway probe path — unauthenticated by design, exact match
/dangerously-skip-login/           the app's own public pages
/dangerously-skip-login/api/**     the app's own public JSON APIs
```

## Gateway behavior (normal paths)

- Browser (`Accept: text/html`) → **302** to `/auth/ui/login?redirect=<original-path>`
- API → **401 Unauthorized**

So if a normal-path request reaches you, identity is already enforced.

## Reserved (never yours)

- `/auth/**`
- `/actuator/**`

## Login / logout navigation

Always **full-page**:

```js
window.location.assign("/auth/ui/login?redirect=" + encodeURIComponent(location.pathname));
window.location.assign("/auth/logout");
```

Never `router.push("/auth/...")` or SPA `<Link>` to `/auth/**`.
