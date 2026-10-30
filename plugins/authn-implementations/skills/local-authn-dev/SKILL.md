---
name: local-authn-dev
description: Simulate Apps Gateway identity in local development — DEV-only X-User-Id from the front-end and optional /dev-login mock. Never ship in production. Use when running the app without the gateway.
---

# Local authn (no gateway)

Production: gateway injects **`X-User-Id`**.  
Local: app usually runs standalone — simulate the header.

## Rule

| Environment | Who sets `X-User-Id` |
|-------------|----------------------|
| Local / DEV | Front-end **may** send it (guarded by DEV flag) |
| Production | Front-end must **never** send it |

Backend always just reads `req.headers["x-user-id"]` — unchanged.

## Pattern (see `templates/auth-headers.ts`)

```js
const DEV =
  (typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

function authHeaders() {
  if (!DEV) return {};
  const email = localStorage.getItem("dev_user");
  return email ? { "X-User-Id": email } : {};
}

fetch("/api/items", {
  headers: { ...authHeaders(), Accept: "application/json" },
});
```

## Dev login

Prefer path **`/dev-login`** (not `/auth/ui/login`) so production SPA never shadows the gateway.

- Login: store email in `localStorage` key `dev_user`, then redirect
- Logout: `localStorage.removeItem("dev_user")`

Guard route + header injection so production builds never include them.

## Curl

```bash
curl http://localhost:<port>/dangerously-skip-login/api/ping
curl -H "X-User-Id: alice@example.com" http://localhost:<port>/api/items
```

## Forbidden

- Shipping DEV injection in production bundles
- Registering client routes for `/auth/**` in production
