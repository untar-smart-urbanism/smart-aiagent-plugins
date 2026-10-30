# Security patterns (GRC-informed)

Design-level security patterns for features that handle sensitive data, identity,
authentication, secrets, or bulk access. Companion to the OWASP line-level checklist
(`data/owasp-checklist.json`) — OWASP tells you how to write a safe line; these tell you how
to shape a safe feature. The verifiable pass/fail form of each pattern below lives as the
security-pattern sections of that same checklist.

Stack-agnostic (allowed stack: Bun + Elysia + Drizzle + Svelte + PostgreSQL; legacy React/Node projects map the same way). Each pattern names the *mechanism*, not a vendor
— map it onto the KMS, secrets manager, ORM, or rate-limiter your project already uses.

Every pattern follows: **Problem → Pattern → Requirements → Residual risk → Verify.**
The recurring principle across all of them: **the server is the trust boundary, and every
accepted risk is written down, never silent.**

---

## Pattern 1 — Envelope encryption for sensitive data at rest

**Problem.** Sensitive fields (identity numbers, financial/salary figures, health data, free-text
case notes) stored as plaintext columns are fully exposed by *any* read of the database — a stolen
backup, an over-broad DB grant, or SQL injection that dumps a table. A single flat key that
encrypts data directly has an enormous blast radius, usually ends up living in application memory
or config (exportable), and can't be rotated without a coordinated re-encryption of everything.

**Pattern.** A two-tier key hierarchy ("envelope encryption"):

```
KEK  — Key Encryption Key, held in a managed KMS or HSM
        (key material non-exportable; app authenticates via workload identity, never a key file)
  └─ wraps →  DEK — Data Encryption Key (random 32 bytes, generated in-app, stored only wrapped)
        └─ encrypts →  field values (AES-256-GCM, fresh random 12-byte IV per value,
                        bound to model + row + column via AAD)
```

The KEK never leaves the KMS/HSM; the app sends DEK bytes to be wrapped/unwrapped and gets a
result back. The DEK does the bulk field encryption.

**Requirements.**
- **KEK in a KMS/HSM.** Wrap/unwrap via the KMS API; key material never enters app memory,
  config, or the repo. Authenticate with workload identity / short-lived credentials, not a
  static key file. Validate the key reference at process startup and **fail fast** on a malformed
  value (same discipline as a signing-secret check). If an environment's KMS key genuinely isn't
  provisioned yet, a *documented, loud-warning* local-key fallback is acceptable as an explicitly
  transitional state — never as the target posture, and never masking a real misconfiguration.
- **One DEK per encrypted column** (keyed by the column's name), not one shared DEK and not one
  coarse key per data-classification category. A column name that recurs across tables (e.g. an
  identity number stored in two tables) shares a single DEK. This is the finest practical
  granularity, so compromising one column's DEK exposes only that column, and each column's DEK
  rotates independently. Derive the DEK list from the encrypted-field config (a single source of
  truth) so provisioning and rotation can't drift from it. (A coarser one-DEK-per-classification
  grouping is a weaker but acceptable fallback where per-column provisioning is impractical.)
- **DEKs generated with a CSPRNG**, stored **only in wrapped form** in a dedicated key table,
  never plaintext at rest.
- **Provision DEKs explicitly** via a one-time admin/setup step. Request-serving code only ever
  *reads* an active DEK and errors if none exists — it must **never lazily create** one, or two
  instances cold-starting at once can each mint a different DEK and race to become "active" for a
  purpose.
- **Authenticated encryption** (AES-256-GCM), **fresh random IV per value**.
- **Bind ciphertext to its location** with Additional Authenticated Data (AAD) =
  `model : row-id : column`. Without this, GCM only proves the ciphertext+tag are internally
  consistent — not that they belong in *this* row/column. An attacker with UPDATE-only DB rights
  (no key access) could otherwise copy one record's encrypted salary into another record's salary
  column and have it decrypt to a real-but-wrong value under the wrong identity. AAD binding makes
  a relocated ciphertext fail to decrypt.
- **Self-describing ciphertext format** that embeds a scheme version and the key id used, so old
  ciphertext keeps decrypting after a DEK rotation — e.g.
  `enc:v1:<keyId>:<ivB64>:<tagB64>:<ciphertextB64>`.
- **Pad numeric fields to a fixed width before encrypting.** GCM ciphertext length equals
  plaintext length, so an unpadded number leaks its digit count / order of magnitude.

**Residual risk.**
- **Key loss = data loss.** Losing a locally-held KEK, or the wrapped-DEK table, permanently
  destroys everything it protects — nothing else can unwrap it. Back up the key table with the
  same rigor as primary data; never delete a KEK/DEK value still referenced by any row.
- **Free-text length leak.** Bucketing free text (notes, addresses) to a fixed length isn't
  practical, so ciphertext length still leaks approximate input length. Accept and document it.
- **Aggregation breaks.** Fields used in DB-side `GROUP BY` / equality aggregation (e.g. a
  diversity dashboard grouping by a category column) break under random-IV encryption — identical
  plaintext no longer yields identical ciphertext. Either leave such a field plaintext (documented
  exclusion) or move to deterministic encryption / a blind-index-as-group-key design (a separate,
  heavier design — see Pattern 2). Do not silently encrypt-and-break the aggregate.

**Verify.** Sensitive columns hold only ciphertext in the documented format; KEK reference
validated at startup; DEKs are wrapped, per-column, and provisioned explicitly (not lazily);
AAD binds model+row+column; numeric fields padded; key table is backed up; a rotation path exists.

---

## Pattern 2 — Searchable encrypted values via a blind index

**Problem.** Once a field is encrypted with a random IV, you can no longer look it up by value —
dedup, uniqueness checks, and "does this identity already exist?" all need equality matching that
random-IV ciphertext can't provide.

**Pattern.** Store a keyed one-way index next to the ciphertext and query *that*. A **blind index**
is `HMAC(indexKey, normalized_plaintext)`. It reveals nothing on its own and cannot be reversed
from a database-only breach, yet equal inputs produce equal indexes, enabling exact-match lookup.

**Requirements.**
- Use a **keyed HMAC**, not a bare hash — an unkeyed hash of a low-entropy value is trivially
  rainbow-tabled.
- Give the index its **own dedicated key**, separate from the field's encryption DEK, so it can be
  rotated on its own schedule. (Rotating it means recomputing every row's index — unlike a normal
  DEK rotation, which is transparent to existing ciphertext.)
- **Mix a separate high-entropy salt into the index key via a KDF** — derive
  `indexKey = HKDF(dek, salt, info)` rather than HMAC-ing under the bare DEK. Hold the salt in the
  secrets manager, separate from the KEK/DEK, and mix it into the *key* (not concatenated into the
  message), which gives domain separation and stays versionable via the `info` string. This raises
  the bar on the offline-brute-force residual below: an attacker now needs the salt **in addition
  to** a DB dump and KEK access. Guard the salt with a **fail-fast boot check** — refuse to start on
  a missing or too-short salt — and compare a stored one-way *fingerprint* of it at boot, so a
  swapped salt (e.g. a staging value reaching prod) fails loudly instead of silently making every
  lookup miss.
- **Normalize/canonicalize** the input before indexing (trim, case-fold, strip formatting) so
  logically-equal values match.
- Supports **exact match only** — never expose it for prefix or range search.

**Residual risk.**
- **Low-entropy / structured identifiers.** An identifier that *looks* long but is structured
  (e.g. a national ID encoding region + birth date + sequence) has a real search space far smaller
  than its digit count implies. If the index key ever leaks *together with* a data dump (compromised
  app server + stolen DB backup), an attacker can offline-brute-force the whole plausible space and
  match it against index values. This is inherent to any exact-match blind index over low-entropy
  input, not a flaw of the implementation. Mitigate by mixing a **separate secret salt** into the
  index key (above) so a DB dump plus KEK access alone is not enough — the salt must leak too — and
  by keeping DB access to the index column as narrow as the ciphertext column itself; treat the
  index as **equally sensitive** as the encrypted value — not weaker. Disclose the residual.

**Verify.** The index is a keyed HMAC with its own key; a separate secret salt is mixed into the key
via a KDF and guarded by a fail-fast boot check plus a stored fingerprint; input is normalized; it's
used only for exact match; access to the index column is restricted; the low-entropy residual is
documented.

---

## Pattern 3 — Minimize sensitive-data exposure on read paths

**Problem.** Even authorized features leak more than they need: list endpoints return full PII for
every row, projections over-fetch, export endpoints let a plain viewer bulk-download everything,
and existence/lookup endpoints quietly become **enumeration oracles**.

**Pattern.** Expose the *minimum* sensitive data per surface; escalate privilege for bulk/raw
access; log it; and make lookups un-enumerable.

**Requirements.**
- **Field-level projection.** Each read path selects only the columns it needs. Relationship /
  org-chart / graph endpoints select **no PII** — just the ids and labels needed to draw the
  structure.
- **Mask in breadth, reveal in depth.** List responses **mask** sensitive identifiers (reveal only
  the last few characters); the **full value is returned only by the single-record detail route**
  for an authorized viewer. Masking is done **server-side** — it is the boundary, never a
  client-only display trick.
- **Gate bulk export above browse.** Require a *higher* privilege for export than for viewing
  (e.g. EDIT / an explicit export grant, not plain VIEW), **rate-limit** it (Pattern 8), and write
  an **audit-log entry** recording who exported what subset/filters (Pattern 7). Aggregate-only
  exports (headcounts, totals) may stay at VIEW but should still be rate-limited.
- **Close enumeration oracles.** Existence / uniqueness / lookup endpoints must validate input to
  the **full expected format** before querying (reject short, partial, or malformed values) and be
  rate-limited per actor — otherwise an attacker probes prefixes to enumerate or confirm records
  (and any "is this value blacklisted?" check doubles the oracle).
- **Aggregates-only boundaries.** When a computation must read per-record sensitive values
  internally (e.g. summing salaries to a total), aggregate **before returning** — no per-record
  sensitive figure may leave the function or appear in any response, view, or export. Emit counts,
  not lists of names. If a field is added to such a response later, verify it is an aggregate.
- **Verify object ownership (IDOR).** On every direct object reference, confirm the caller owns /
  is authorized for that specific object; a foreign id should return 404/403, never the object.

**Residual risk.** Client-side masking and route guards are UX only and trivially bypassed — the
server must re-enforce every check on every request.

**Verify.** Lists mask and detail reveals; exports require an elevated grant + audit + rate limit;
lookup endpoints reject malformed/partial input; aggregate endpoints expose no per-record value;
relationship endpoints select no PII; foreign object ids are rejected.

---

## Pattern 4 — Server-side session/token lifecycle & revocation

**Problem.** A stateless JWT is valid until it expires, so logout, password change, and compromise
can't actually kill it. A fixed lifetime is simultaneously too long (idle sessions linger) and too
short (active users get kicked). Rotating the signing secret invalidates everyone at once.

**Pattern.** Keep the token stateless but add (a) a server-side revocation check, (b) a sliding
idle window with an absolute cap, and (c) overlapping-secret rotation.

**Requirements.**
- **Revocation.** Give every token a unique id claim (e.g. a `jti`, a random UUID). On each
  authenticated request, check that id against a revocation store and reject if present — even if
  the token is still cryptographically valid. Revoke on **logout** and on **password/credential
  change**. Prune expired revocation rows (e.g. on each successful login) to keep the table small.
- **Sliding idle timeout.** Re-set the session cookie's `maxAge` on every authenticated request so
  a browser session dies after N minutes of **inactivity**; keep the token's own expiry as an
  **absolute** ceiling. Enforce idle-window ≤ absolute-lifetime. (API/bearer clients without a
  cookie simply end at token expiry.)
- **Zero-downtime secret rotation.** The verifier tries the current signing secret, then a
  `PREVIOUS_SECRET` env value; tokens signed with the old secret stay valid through the transition
  window. Remove the previous value once all old tokens have expired.
- **Fail-fast secret validation.** Refuse to boot if the signing secret is missing, shorter than a
  safe minimum (e.g. 32 chars), or a known weak default.
- **Cookie hygiene.** `HttpOnly`; `Secure` in production; restricted domain/path; **never** put
  tokens or session ids in URLs, query strings, or logs; re-issue on privilege change.

**Residual risk.** The revocation check adds a per-request store lookup — index it and prune it.
Bearer clients aren't covered by the cookie's sliding window; their session ends at token expiry
(document this).

**Verify.** Revocation is checked per request; logout and password-change both revoke immediately;
idle **and** absolute limits are enforced; a previous-secret verification path exists; startup
rejects a missing/weak secret; cookies are HttpOnly/Secure and never appear in URLs or logs.

---

## Pattern 5 — CSRF defense-in-depth for cookie auth

**Problem.** If the session is carried in a cookie, the browser attaches it to cross-site requests
automatically, so a malicious page can trigger state-changing requests as the victim.

**Pattern.** Two **independent** layers so neither is a single point of failure.

**Requirements.**
- **SameSite cookie attribute.** Prefer `Strict`. If a top-level cross-site *return* navigation
  must carry the session (e.g. coming back from an external OAuth consent screen), use `Lax` and
  **document why** — `Lax` still withholds the cookie on cross-site `POST`/`PUT`/`PATCH`/`DELETE`
  and on cross-site subresource loads (`fetch`/XHR/`<img>`/`<script>`), so state-changing cross-site
  requests still arrive without credentials.
- **Custom-header guard.** Require a custom header (e.g. `X-Requested-With: XMLHttpRequest`) on
  **all** mutating routes, set automatically by the app's fetch/XHR client. A cross-origin form or
  `<img>`/`<script>` tag **cannot** set a custom header, so forged cross-site submissions are
  rejected even if a cookie were somehow delivered. (A synchronizer token or double-submit cookie
  is an equivalent second layer if you prefer.)
- **Keep all mutating operations non-GET**, so the header/token guard covers every state change.

**Residual risk.** The custom-header guard relies on the browser same-origin policy for custom
headers; it's the primary layer, with SameSite as backup. Both together satisfy OWASP's
defense-in-depth guidance without server-side synchronizer-token state.

**Verify.** SameSite is set (rationale documented if `Lax`); every mutating route rejects a request
lacking the custom header/token; no state-changing operation is reachable via GET.

---

## Pattern 6 — Secrets management

**Problem.** Secrets in source, committed `.env` files, or CI variables leak via repo access,
logs, and backups — and are painful to rotate.

**Pattern.** Keep secrets out of the repo entirely; source them from an external secrets manager
injected into the runtime; validate at startup; rotate with overlap.

**Requirements.**
- **No secrets in source or committed config.** A local `.env` is gitignored and dev-only. In
  production, inject secrets into the process environment from a **managed secrets store** (KV) via
  the deployment platform — not a committed file, not CI-provider secrets baked into an image.
- **Fail-fast startup validation.** A dedicated config/startup module reads required secrets and
  refuses to boot if any is missing, malformed, too short, or a known placeholder/weak default.
- **Never log secrets** or connection strings; keep them out of error responses returned to
  clients.
- **Rotation with overlap** where the secret authenticates existing artifacts (see Pattern 4's
  previous-secret window). After a secret is committed by mistake, **rotate it** — scrubbing git
  history is necessary but not sufficient, assume it's compromised.
- **Prefer workload-identity / short-lived credentials** over long-lived static keys for cloud
  services, so there is no exportable key to leak in the first place.

**Keep `.env.example` complete and placeholder-only.** When the deployment platform seeds its
secrets store from that template, a key missing there is a secret missing at runtime — and a real
value there is both a committed secret and a Trivy `secret` finding. Update values through the
platform's secrets tooling, never by committing them.

**Residual risk.** Secrets still transit process memory and environment at runtime — minimize
their lifetime there and scope the workload identity as narrowly as possible.

**Verify.** No secret literals in the repo (git-scan the staged diff); startup validation present
and tested; `.env` gitignored; logs and error responses free of secrets; a rotation procedure is
documented; static keys replaced by workload identity where the platform supports it.

---

## Pattern 7 — Security audit logging

**Problem.** Without an audit trail you can neither detect nor investigate abuse of sensitive data,
and you can't produce the evidence a GRC/compliance review requires.

**Pattern.** Log security-relevant events to a tamper-evident, access-restricted store.

**Requirements.**
- **Log these event classes:** authentication attempts (success **and** failure, with source IP);
  access-control failures; privilege/role/permission changes; **sensitive-data exports and bulk
  mutations** (who, what subset/filters, when); and administrative actions (config, hard deletes,
  user management).
- **Record actor id, action, resource, and a minimal non-sensitive detail object** — a count and
  filter summary, **never the sensitive values themselves.** No PII, secrets, tokens, or full
  identifiers in the log.
- **Restrict read access** to the audit log to authorized roles; **index** it for analysis
  (by time, actor, resource); retain per policy.

**Residual risk.** Logs are themselves sensitive metadata — an over-broad detail object can leak
what it was meant to protect. Keep detail minimal and reviewed.

**Verify.** Each listed event class produces an audit entry; entries carry actor + action +
resource; no sensitive payload is logged; audit-log read access is gated and the table is indexed.

---

## Pattern 8 — Abuse-resistant rate limiting

**Problem.** A single global or IP-only limiter either lumps unrelated users behind a shared
proxy/NAT into one bucket (false throttling) or fails to throttle a single compromised session
(no protection). Auth and PII surfaces are the prime targets for scripted abuse.

**Pattern.** Independent, **per-authenticated-actor** limiters on each sensitive surface.

**Requirements.**
- **Key limiters on the authenticated user id**, falling back to IP only *before* auth (e.g. the
  login limiter). Mount per-user limiters **after** the authentication middleware. Set
  `trust proxy` so the limiter sees the real client IP behind a reverse proxy.
- **Separate counters per sensitive surface** — login, export, lookup/existence check, list/search
  — so heavy legitimate traffic on one surface doesn't mask abuse of another.
- **Return HTTP 429** with standard `RateLimit-*` headers on breach; tune each limit *above* real
  usage but low enough to deter automation (e.g. exports 10/15 min, existence-check 40/min,
  list/search 120/min — calibrate to the surface).
- Also apply the OWASP **transaction-velocity** limit to state-changing business operations, not
  just reads.

**Residual risk.** Distributed abuse across many accounts/IPs evades per-actor limits — pair with
audit logging (Pattern 7) and anomaly monitoring for that case.

**Verify.** Auth, export, lookup, and list/search surfaces each have their own limiter keyed per
actor; breaches return 429 with standard headers; the login limiter is IP-keyed and the app trusts
the proxy hop.

---

## Pattern 9 — Container and Pod hardening

**Problem.** A container running as root, on a floating base tag, with a writable root filesystem
turns any code-execution bug into host-adjacent access — and leaves the image un-auditable, because
you cannot prove which bytes shipped. The deployment platform scans for exactly this: Trivy's
`image` scan reads the built container and its `config` scan reads the Kubernetes manifests, and
those verdicts gate production — **CRITICAL blocks the deploy, HIGH escalates to an approval task**,
MEDIUM warns.

**Pattern.** Harden in two places owned by two different parties. Get the half we own right *before*
the platform ever scans; remediate the other half from the findings it reports.

### A — Dockerfile: application repo, ours, exists before onboarding

The half we control, and what Trivy's `image` scan reads.

**Requirements.**
- **End with an explicit non-root `USER`.** Create an unprivileged user in the build; do not rely on
  the base image's default. Prefer a **UID ≥ 10000** so the cluster-side low-UID check in part B
  passes too. (`AVD-DS-0002` — image user should not be root)
- **Minimal base image.** Distroless for compiled or self-contained apps; `alpine` or a `-slim`
  variant otherwise. Fewer OS packages means fewer OS-package CVEs to answer for at the gate.
- **No floating tags.** Never `FROM …:latest`. Pin a version tag for development and a
  **`@sha256:` digest for anything promoted to production**, so the image that was scanned and the
  image that runs are provably the same bytes. (`AVD-DS-0001` — `:latest` tag used)
- **Multi-stage build.** Build/install in a builder stage and copy only the runtime artifact
  forward, so toolchains, dev dependencies, and `.git` never reach the final layer.
- **Install runtime dependencies with `--production`, in their own stage.** The multi-stage rule above
  is easy to satisfy in spirit and miss in fact: a runtime stage that does
  `COPY --from=build /build/node_modules ./node_modules` has a builder stage, copies "only" what it
  needs, and still ships the entire toolchain — bundler, test runner, type checker, browser driver —
  into the image Trivy scans. The tell is an advisory for a package the application never runs at
  runtime; on one delivery an `esbuild` dev-server CVE was what exposed it, reachable only through
  `vite` and `drizzle-kit`, both `devDependencies`. Add a third stage that installs from the same
  lockfile with the production flag and copy *that* `node_modules` forward.
  → Verify by searching the built image rather than reasoning about it: the bundler, test runner and
  type checker should not resolve inside the running container, while the runtime dependencies still
  do. Workspace layouts hide this — check where packages actually resolve from, not just the top-level
  directory listing.
- **No build secrets in any layer.** Never `COPY .env`, never pass a token via `ARG`/`ENV`. A file
  deleted in a later layer is still in the image history and still readable. Use a build-time mount
  or inject at runtime (Pattern 6).
- **Copy narrowly, behind a `.dockerignore`.** `COPY . .` sweeps in local env files, keys, and
  history — exclude them explicitly rather than deleting them afterwards.
- **Pin what you install** and clean package caches in the same `RUN` layer, so the image contents
  are reproducible and no index cache inflates the attack surface.
- A missing `HEALTHCHECK` is reported as low severity (`AVD-DS-0026`). Kubernetes probes against
  `/health` are what actually gate traffic on this platform, so add it for local/compose parity —
  not as a substitute for the probe.

### B — Pod / Deployment manifests: the platform's files, post-onboard, review-and-remediate only

These live in `deployment-<app>` at `apps/<app>/<env>/`, are **generated by the platform at
onboarding**, and are what Trivy's `config` scan reads. We never author or pre-generate them. Apply
the criteria below when reviewing a finding or a real checkout — and only then.

**Criteria (each maps to the check that reports it).**

| Control | Setting | Reported as |
|---|---|---|
| No privilege escalation | `allowPrivilegeEscalation: false` | `AVD-KSV0001` |
| Drop all capabilities | `capabilities.drop: [ALL]`, adding back only what is needed (e.g. `NET_BIND_SERVICE`) | `AVD-KSV0003` |
| Non-root | `runAsNonRoot: true` with an explicit `runAsUser` | `AVD-KSV0012` |
| Read-only root filesystem | `readOnlyRootFilesystem: true`, plus an explicit `emptyDir` for every writable path the app needs (`/tmp`, caches, upload staging) | `AVD-KSV0014` |
| Not privileged | `privileged: false` / omitted | `AVD-KSV0017` |
| High UID / GID | `runAsUser` and `runAsGroup` **≥ 10000** | `AVD-KSV0020`, `AVD-KSV0021` |
| Seccomp | `seccompProfile.type: RuntimeDefault` | `AVD-KSV0030` |
| Resource bounds | CPU and memory `requests` **and** `limits` set | `AVD-KSV0011`, `AVD-KSV0018` |
| No host mounts | no `hostPath` volume, no `hostNetwork`/`hostPID`/`hostIPC` | `AVD-KSV0023` |

`readOnlyRootFilesystem` is the one that breaks apps rather than merely annoying them: an app that
writes to its own directory will crash-loop. Find the writable paths first, mount them as
`emptyDir`, then flip the flag — do not turn the control off to make the pod start.

Check ids are Trivy / Aqua Vulnerability Database identifiers. Take the id from the actual finding
output; treat this table as the fix map, not as the authority on numbering.

**Two constraints, stated rather than papered over.**
1. The Dockerfile/GKE generator (`alpha-lab-toolkit:vibe-stack`) lives **outside this repo**. These
   rules guide authoring and audit an existing file; they do not template one.
2. Deployment manifests **do not exist before onboarding**. Their absence in a pre-onboard project
   is the correct state, never a finding — `check-structure` and any readiness check must treat it
   that way, and part B applies only when a `deployment-<app>` checkout is actually present.

**Residual risk.** A hardened pod still runs application code with its own network reach and
service-account permissions; hardening limits blast radius, it does not contain a compromised app.
Digest pinning also freezes base-image patches — pair it with a scheduled rebase, or a pinned digest
silently rots into the CRITICAL that blocks a release.

**Verify.** Dockerfile: explicit non-root `USER`, minimal base, no `:latest`, production references
a digest, multi-stage, **runtime dependencies installed with `--production` rather than copied from
the builder**, no secret in any layer, `.dockerignore` present. Manifests (only if a
checkout exists): every control in the table above set, with `emptyDir` volumes for each writable
path. Trivy `image` and `config` scans for the target environment report no CRITICAL, and each HIGH
has an owner and a fix — not an approval used as a workaround.

---

## Relation to the OWASP checklist

| These patterns | Deepen OWASP sections |
|---|---|
| 1 Envelope encryption, 2 Blind index | Cryptographic practices; Data protection |
| 3 Minimize exposure | Access control; Data protection; Error handling |
| 4 Session/token lifecycle | Authentication; Session management |
| 5 CSRF defense-in-depth | Session management; Access control |
| 6 Secrets management | Cryptographic practices; Database security; System configuration |
| 7 Audit logging | Error handling and logging |
| 8 Rate limiting | Access control (transaction throttling) |
| 9 Container/Pod hardening | System configuration; General coding practices (third-party components) |

OWASP says *what* control to have; these patterns say *how* to build it well for a Bun/Elysia/Svelte/
Postgres app handling regulated data — and, crucially, which **residual risks to document** so a
GRC review sees a considered trade-off rather than a silent gap.
