---
name: get-logged-in-user
description: Get the authenticated user behind Apps Gateway — server reads X-User-Id email header; browser/SPA calls GET /auth/api/me. Use when implementing identity, user context, or scoping data to the current user.
---

# Get the logged-in user

Source of truth: gateway **`X-User-Id`** = user **email**.

| `X-User-Id` | Meaning |
|------------|---------|
| present (e.g. `alice@example.com`) | Authenticated user |
| absent | Anonymous (only on `/dangerously-skip-login/**`) |

## Server-side (Node)

```js
const user = req.headers["x-user-id"]; // string or undefined
if (!user) {
  // anonymous — only valid on skip-login paths; defense-in-depth 401 elsewhere
} else {
  // authenticated as `user`
}
```

Also log / propagate **`X-Request-Id`** for tracing.

## Browser / SPA

The auth cookie is HttpOnly — JS cannot read it. Ask the gateway:

```js
const res = await fetch("/auth/api/me", {
  headers: { Accept: "application/json" },
});
if (res.status === 401) {
  window.location.assign(
    "/auth/ui/login?redirect=" + encodeURIComponent(location.pathname + location.search)
  );
} else {
  const me = await res.json(); // { email, admin }
}
```

Same-origin on your subdomain — cookie is sent automatically.

## App-level roles

Key roles by email from `X-User-Id`. Do **not** reuse gateway `admin` as your app role.

```js
const email = req.headers["x-user-id"];
const roles = await db.rolesFor(email);
if (!roles.includes("editor")) return res.status(403).end();
```

## Forbidden

- Trusting client-supplied identity in production
- Reading the JWT cookie / verifying gateway tokens in the app
- Inventing a second session store for gateway auth
