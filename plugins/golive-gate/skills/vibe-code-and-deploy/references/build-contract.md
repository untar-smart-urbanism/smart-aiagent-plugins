# The build contract

The section every app on this pipeline carries in its own `CLAUDE.md` / `AGENTS.md`, so that any agent
opening the repo — a maintainer's session, a review agent, the deployment platform's tooling at onboarding —
can go from a fresh clone to a running container without inferring anything.

Copy the block below into the repo's `AGENTS.md`, replace every `<…>`, and delete nothing.
`CLAUDE.md` is not a second copy — it is a symlink, so both names resolve to this one file:

```sh
ln -s AGENTS.md CLAUDE.md && git add AGENTS.md CLAUDE.md
git ls-files -s CLAUDE.md          # must report 120000 (symlink), never 100644 (copy)
``` Keep it accurate at
every commit: a stale contract is a confident wrong answer, and worse than an absent one.

---

## The block to paste

````markdown
## Build and run

Every command below works from a fresh clone with Bun installed and nothing else. These names are
fixed by the delivery pipeline — do not rename or alias them.

| Command | What it does |
|---------|--------------|
| `bun install --frozen-lockfile` | Install every workspace from the committed lockfile |
| `bun run dev` | Run all workspaces in watch mode on `http://localhost:<dev-port>` |
| `bun run build` | Build the production artifact the backend serves |
| `bun run start` | Run the production artifact — the same entry point the container runs |
| `bun run typecheck` | `svelte-check` / `tsc` across every workspace |
| `bun run test` | Hermetic unit suite — no network, no external database |
| `bun run test:coverage` | The suite plus `coverage/lcov.info` (committed; SonarQube reads it) |
| `bun run test:integration` | Playwright — pointer-and-keyboard and production-artifact journeys |
| `bun run db:generate` | `drizzle-kit generate` after a schema change |
| `container build -t <repo> .` | Build the image (Apple Container; skip if not installed) |

### Container

Built with **Apple Container** (`container`). Not Docker Desktop, not Rancher Desktop — a `docker` on
PATH is usually a shim for one of those, and an image built through it is not provably the image the
platform builds. If `container` is not installed, skip this step; the platform builds the Dockerfile
at onboarding either way.

```sh
container system status        # `container system start` if the daemon is down
container build -t <repo> .
container run --rm -p <port>:<port> \
  -e DATABASE_URL='postgres://user:password@host:5432/dbname' \
  -e PORT=<port> \
  <repo>
```

- Listens on **`<port>`** (`PORT`, default `<port>`).
- Health: **`GET /health`** and **`GET /api/health`**, unauthenticated, no identity read.
- With no `DATABASE_URL` the app falls back to an embedded PGlite database, so it boots on a fresh
  checkout. A deployed environment must be given a real `DATABASE_URL`; if `/health` names the local
  fallback, the variable never arrived.
- The fallback writes under **`<pglite-dir>`**, which must be under `/tmp`, never under the working
  directory.
- Every variable the app reads is declared in `.env.example` with a placeholder value.

### Identity

Apps Gateway authenticates; this app reads **`X-User-Id`** and implements no login, session or
password of its own. Local development simulates the header behind `import.meta.env.DEV`, which is
compiled out of a production build.
````

---

## Filling it in

| Placeholder | Where the real value comes from |
|-------------|--------------------------------|
| `<repo>` | `basename $(git remote get-url origin)` |
| `<port>` | `EXPOSE` in the Dockerfile and `PORT` in `.env.example` — they must agree |
| `<dev-port>` | The Vite dev server port, if it differs from the runtime port |
| `<pglite-dir>` | The embedded fallback's directory — **under `/tmp`**, for the reason below |
| environment variables | Every key in `.env.example`, with its placeholder value, not a real one |

### The fallback directory is not a free choice

Two mandated rules collide here, and the collision is only visible at runtime. `apply-security-patterns`
Pattern 9 requires the image to end with a non-root `USER`, and part B requires the Pod to run with
`readOnlyRootFilesystem: true` and an `emptyDir` at `/tmp`. An embedded fallback that writes beside
the application — the obvious default, and what the template above used to imply — cannot write at
all under the first rule and crash-loops under the second.

On a delivered app this presented as a container that started, ran migrations, and died with
`EACCES` on `/app/.pglite` immediately after the non-root `USER` line was added. Point the fallback
at `/tmp` (`PGLITE_DIR`, or the equivalent for whatever embedded engine is used), declare it in
`.env.example`, and set it in the Dockerfile so the default is right without anyone passing it.

A deployed instance should never reach this path — it is handed a real `DATABASE_URL`. It has to work
anyway, because the reviewer's fresh checkout and the first boot of a new environment both depend on
it.

**Keep every row.** A command that does not apply to this app is still declared in `package.json` and
still listed here, with a body that says why and exits 0 — for example an app with no Drizzle schema:

```json
"db:generate": "echo 'no schema in this app' && exit 0"
```

An absent script and a deliberately empty one are indistinguishable to anything reading the manifest,
and only one of them is intended. Deleting the row instead is the one edit that will fail
`/vibe-conform`, because the command table is checked against the contract rather than against the
repo. And before writing the empty body, check that it should be empty: an app with no `db:generate`
has no migrations, which is a claim worth being sure about.

## The `test:coverage` runner, in full

`test:coverage` has two obligations, and only the first is obvious.

1. **Write no report when the suite fails.** A report from a red suite is worse than none: the gate
   reads a number describing code nobody successfully ran.
2. **Fail loudly when the suite passed and the report is missing anyway.** This is the one that bites,
   because it looks like nothing is wrong.

The second obligation exists because a *runner* can exit non-zero on a green suite, and then a
correct fail-closed script deletes a perfectly good report. Measured while delivering an app on this
pipeline: `@electric-sql/pglite` 0.5.x makes the host process exit 99 at teardown while reporting
`70 pass, 0 fail`; 0.3.12 exits 0 on the identical suite. Left alone, the dependency's teardown — not
the tests — would have decided the project's coverage number, and it would have decided **0.0%**, the
exact failure this contract exists to prevent.

So the runner asserts both directions:

```ts
rmSync(reportFile, { force: true })                  // never trust a stale report

const result = spawnSync('bun', [...testArgs, '--coverage', ...], { stdio: 'inherit' })

if (result.status !== 0) {                           // obligation 1
  rmSync(reportFile, { force: true })
  console.error('[coverage] suite failed — no report written')
  process.exit(result.status ?? 1)
}

if (!existsSync(reportFile)) {                       // obligation 2
  console.error(`[coverage] suite passed but ${reportFile} was not produced`)
  process.exit(1)
}
```

Prove both branches once, the same way the build-config guard is proved: break a test on purpose and
confirm no report appears, then confirm a green run produces one. **When a suite reports zero
failures and the process still exits non-zero, suspect a dependency's teardown before suspecting the
tests** — and pin around it, with the reason recorded next to the pin.

## The stack is part of the contract

The command names above assume one stack: Bun, TypeScript, Elysia, Drizzle on PostgreSQL, and
Svelte built with Vite, using `@acme/rnd-svelte.*` components themed by BLUE DLS tokens. That
stack is stated canonically in `allowedStack` in `golive-gate/data/build-contract.json`, and
approved deviations follow the rules in `stackExceptions` in the same file. Where any other prose,
this file included, disagrees with those two blocks, the blocks win.

`check-build-contract` enforces them as `stack-allowed` (High) at the exit of phases 2, 5 and 7. It
fails on a dependency listed in `notAllowedWithoutApproval` in the root or any workspace
`package.json`, and on a tracked `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`. It passes
when a PROJECT.md `## Stack Exceptions` row names the package with an approver and a date. It also
passes, with a legacy note, when `## Vibe Start` is before the cutoff. Record the date in
`## Vibe Start` at phase 1 and don't rely on the git fallback, because a repo imported with
rewritten history can end up with the wrong date.

```markdown
## Stack Exceptions

| Scope | Deviation | Approved by | Date | Link (ADR/ticket) |
|-------|-----------|-------------|------|-------------------|
| apps/api | express instead of elysia | <tech-architect login> | 2026-10-08 | <ADR or ticket> |
```

The approver is the tech architect. It is never the requester, the Project Owner, the Support
Contact, a reviewer or an agent. A major improvement (a new module or app, a schema change, a
framework swap, a major-version upgrade) needs a row even on a legacy project, and even when it uses
the allowed stack.

## Why it is checked, not just recommended

Of four apps delivered on this pipeline, the one with **no `CLAUDE.md` or `AGENTS.md` at all** was
also the one that shipped an image with 3 CRITICAL CVEs and reported 0.0% Sonar coverage. The others,
which carried both files, cleared the image scan and reported 89.6% and 90.4%. The file is not the
cause of a good build, but it is where the standard becomes visible to whoever arrives next — and on
this pipeline, whoever arrives next is usually not a person.
