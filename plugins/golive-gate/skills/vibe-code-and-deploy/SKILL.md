---
name: vibe-code-and-deploy
description: Deliver a company tool end to end — requirement or Jira ticket → approved stack → repo and go-live dossier → implementation with gateway identity → tests a person could have run → deployment assets (Dockerfile, health, .env.example, .platform contracts, Sonar) → governance gate → platform handoff → post-deploy verification and bug triage. Orchestrates the existing skills instead of restating them, and carries the field notes that make each phase work the first time. Use this whenever someone wants a tool built and shipped — "vibe code this", "build and deploy it", "implement this ticket and ship it", "make it production ready", "what is left before we go live" — and equally when something that works locally misbehaves on staging, or when a half-built tool has no dossier, no tests, no Dockerfile and no gate. Reach for it even if the user never mentions a pipeline, a gate, or this skill by name.
allowed-tools: Bash Read Write Edit Glob Grep AskUserQuestion Skill Task
user-invocable: true
---

# Vibe code and deploy

The delivery pipeline for an AI-built company tool, from a sentence of requirement to a running,
governed deployment. **This skill is an orchestrator: it decides the order, the entry and exit
criteria, and what must be true before moving on. It never re-implements what another skill already
owns** — read that skill and run it.

Read `references/field-notes.md` (relative to this skill) before the build and test phases. It is the
catalogue of traps this pipeline hit for real; each one costs hours to rediscover.
`references/build-contract.md` is the companion: the fixed command set every app on this pipeline
exposes, and the `## Build and run` block that goes into the repo's own `CLAUDE.md`/`AGENTS.md` so the
next agent — including the platform's — reads the build instead of inferring it.

**Where the skills live.** Most phases delegate to skills in this marketplace (`smart-aiagent-plugins`:
`tech-radar`, `project-scaffold`, `ops-github`, `authn-implementations`, `code-review`,
`scan-dependency`, `sonar-issue-fixer`, `golive-gate` itself). Three come from the sibling marketplace
`acme-org/agent-plugins`: `jira-issues`, `ui-dev` (`rnd-svelte-implementor`) and `ui-integration-test`.
Check what is installed before leaning on one — if a skill is absent, say so and do that phase inline
rather than silently skipping it, because each of those phases is where a whole class of defect gets
caught.

## When to use

1. The user hands over a requirement, a ticket key, or a "build me X" for a new tool.
2. The user asks to ship, deploy, or go live with something they have been building.
3. A tool exists but the delivery scaffolding does not — no dossier, no tests, no Dockerfile, no gate.
4. Something that was deployed is misbehaving and the question is "why does it work locally".

For an existing project being brought into the playbook, run `/adopt-vibe` first, then rejoin at
phase 5.

## The pipeline

Each phase names the skill that owns the work. Run them; do not paraphrase them.

**`check-build-contract` runs itself, three times, and the user never asks for it.** At the exit of
phase 2 (`phase-2` stage — the commands and the `## Build and run` section), at the exit of phase 5
(`phase-5` — plus the Dockerfile, the coverage report and the platform's stubs), and again as
`check-golive-readiness`'s prerequisite 0 at phase 7. `data/build-contract.json` `stages` says which
checks apply where, and why the rest are held back — reporting a missing Dockerfile at phase 2 would
teach the caller to ignore the output. Run the stage, do not invent a subset. If you find yourself
about to tell the user to run `/vibe-conform`, you have skipped a step that was yours.

| # | Phase | Owner skill / command | Exit criterion |
|---|-------|----------------------|----------------|
| 0 | Understand the request | `jira-issues` when there is a ticket | Scope restated in one paragraph and confirmed |
| 1 | Confirm the stack **and the commands** | fixed (see phase 1); `tech-radar:query-tech-stack` for gaps only | Bun · Svelte · TypeScript · Elysia · Drizzle · PostgreSQL, with anything extra justified in one line, **and the command contract exposed under its exact names** |
| 2 | Repo + dossier + risk | `project-scaffold:new-repo-init` (`/start-vibe`), `ops-github:create-github-repo`, `golive-gate:assess-risk-level`, `golive-gate:check-build-contract` (stage `phase-2`) | PROJECT.md exists; **CLAUDE.md/AGENTS.md carries the `## Build and run` contract**; contract check clean at `phase-2`; risk tier is final, not Provisional |
| 3 | Build | `ui-dev:rnd-svelte-implementor`; `authn-implementations:use-apps-gateway-authn` | Feature works locally; identity comes from the gateway; no login code exists |
| 4 | Prove it | `ui-integration-test`, `golive-gate:generate-test-scenarios` | Hermetic suite green **and** one journey drives the production artifact with a real mouse and keyboard |
| 5 | Deployment assets | `code-review:apply-security-patterns`, `golive-gate:check-build-contract` (stage `phase-5`) | Contract check clean at `phase-5`; the image builds on Apple Container, or the skip is recorded because it is not installed |
| 6 | Quality gates | `sonar-issue-fixer`, `scan-dependency:scan-dependencies` | Sonar gate OK; no unresolved CRITICAL/HIGH the team has not accepted |
| 7 | Governance | `golive-gate:check-build-contract` (`/vibe-conform`), then `golive-gate:check-golive-readiness` (`/vibe-check`) | Conformance is PASS or CONDITIONAL; a verdict is recorded in PROJECT.md and `vibe-release.json` is written |
| 8 | Watch it land | this skill | The app answers on its own health path; every build failure fixed at the cause, or handed over with evidence |
| 9 | Triage what users report | this skill | Any reported bug reproduced against the production artifact before code changes |

### Phase 0 — Understand the request

A ticket key means `jira-issues`; read the description and comments rather than the title. Restate the
scope in one paragraph and name what you are **not** building. Ask only the questions whose answers
change the work — everything else gets a stated assumption and a note in the summary.

### Phase 1 — The stack is fixed

**This pipeline has one stack, and it is mandatory.** The canonical statement is `allowedStack` in
`data/build-contract.json`; when this prose disagrees with it, the JSON wins. It is not re-negotiated
per project, per ticket or per requester. The summary below is a convenience copy, not the authority:

| Layer | Stack |
|-------|-------|
| Runtime / package manager | **Bun** (`bun install --frozen-lockfile`, `bun.lock`) · **TypeScript** |
| Backend | **Elysia** · **Drizzle** (ORM and migrations) |
| Database | **PostgreSQL** (PGlite only as the hermetic test database) |
| Frontend | **Svelte · TypeScript · Vite**, components `@acme/rnd-svelte.*` |
| Unit tests | **`bun test`** — the hermetic suite |
| Browser journeys | **Playwright** — the phase 4 journeys, and the only sanctioned second runner |

Playwright is listed explicitly because the non-negotiables below forbid "a second library for a job
the stack already covers — no extra test runner", and phase 4 then requires exactly one. It is not an
exception to be argued for per project: `bun test` owns the hermetic suite, Playwright owns the
browser journeys, and neither substitutes for the other.

The UI layer on top of Svelte is `@acme/rnd-svelte.*` via `ui-dev:rnd-svelte-implementor`. Design
tokens and design language stay **BLUE DLS** (`@acme/blue-design-tokens`) for every stack; the
components are themed by those tokens.

- Do **not** substitute an equivalent: no Node/Express or Fastify for Elysia, no Prisma or TypeORM for
  Drizzle, no Vue or React for Svelte, no MySQL or Mongo for PostgreSQL, no npm/yarn/pnpm for Bun.
  The full not-allowed list is `allowedStack.notAllowedWithoutApproval`; the `stack-allowed` repo check
  enforces it.
- Do **not** add a second library where one already in the table does the job — no extra ORM, HTTP
  client, state manager, component kit or test runner.
- **A requester asking for a different stack does not change it.** "Same as our other apps, Node and
  Vue 3" is a reasonable thing for someone to say and still not a licence to deviate: say plainly that
  tools built this way use the stack above, and that an exception is a decision for the **tech architect
  (Tech Architecture Group)** — never the requester, Project Owner, reviewer or an agent. It is recorded
  as a row in PROJECT.md `## Stack Exceptions` (scope, deviation, approver, date, link). Deviating quietly
  is the failure mode this rule exists to prevent, because it is invisible until the tooling, the field
  notes and the deployment assets no longer fit.
- **Legacy projects.** A project whose PROJECT.md `## Vibe Start` is before 2026-10-07 (fallback: earliest
  git commit) may keep and maintain its existing stack — bug fixes, small features inside existing
  modules, patch/minor upgrades — without a new approval; existing deviations are a legacy note, not a
  finding.
- **Major improvements always need a tech-architect approval row**, even for a legacy project and even
  when the change uses the allowed stack: a new module, service or app, database migrations, a new
  frontend app, a runtime/framework/ORM/database swap, or a major-version upgrade. This cannot be judged
  from the tree alone, so confirm the row exists.
- `query-tech-stack` fills only the gaps (a queue, a cache, a PDF renderer) per `allowedStack.gapFilling`,
  and only with radar `adopt` entries. Anything added beyond the table gets one line of justification
  in PROJECT.md.

Record the resolved stack in PROJECT.md. Expect the trade-off that comes with it: **this tooling has
its own gaps**, and nearly every entry in `references/field-notes.md` came from one.

#### The commands are fixed too

A stack pinned down to the ORM and then left free at the script name is only half a standard. Four
apps delivered on this pipeline produced four different answers: `itest` in one repo and
`test:integration` in the next, `check` in three and `typecheck` in the fourth, `db:generate` missing
from one, and **one repo with no coverage script at all** — which is the whole reason its Sonar
coverage read 0.0% on a suite that was perfectly good. None of that broke a stated rule. The rules
simply stopped at the dependency list.

**Every app this pipeline produces exposes exactly these commands, under exactly these names, in the
root `package.json`.** They are the contract that phases 4, 5, 6 and 8 are written against, and the
one thing an agent arriving at the repo later should not have to infer.

| Command | Must do | Exits non-zero when |
|---------|---------|---------------------|
| `bun install --frozen-lockfile` | Resolve every workspace from the committed lockfile | The lockfile does not match the manifests |
| `bun run dev` | Run every workspace in watch mode for local development | — |
| `bun run build` | Produce the production artifact the backend serves | Any workspace build fails |
| `bun run start` | Run that artifact — the same entry point the container runs | The server cannot boot or bind |
| `bun run typecheck` | `svelte-check` / `tsc` across every workspace | Any type error |
| `bun run test` | The hermetic suite — no network, no external database | Any test fails |
| `bun run test:coverage` | The hermetic suite **and** `coverage/lcov.info` at the repo root | The suite fails — and then it must write no report at all |
| `bun run test:integration` | Playwright: the pointer-and-keyboard journey and the production-artifact journey | Any journey fails |
| `bun run db:generate` | `drizzle-kit generate` | Migration generation fails |
| `container build -t <repo> .` | Build the image the platform is going to build — **Apple Container only**, and only when it is installed (see phase 5) | The build fails for any reason |

Four rules make the contract worth having:

- **No aliases, no substitutes.** `test:integration`, never `itest`; `typecheck`, never `check`. A
  repo that wants a shorter form adds it *alongside* the contract name, never instead of it.
- **A command that does not apply is still declared** — a one-line body that says why and exits 0. An
  absent script and a deliberately empty one look identical to anything reading the manifest, and only
  one of them is correct.
- **`test:coverage` fails closed.** Writing `coverage/lcov.info` from a red suite is worse than
  writing nothing: the gate then reads a number describing code nobody ran. Generate the report only
  after the suite passes, and let a failure delete or skip it.
- **`test:coverage` also fails when the suite passed and no report appeared.** Fail-closed alone is
  half the rule: a runner that exits non-zero on a green suite makes a correct fail-closed script
  delete a good report, and the gate then reads 0.0% on a suite where everything passed. Assert both
  directions — see `references/build-contract.md`.
- **The image build belongs to the contract, on one runtime.** `container build` — Apple Container —
  is how you learn the platform's build will fail *before* the platform does. Never `docker`: on a
  company Mac that name is usually a shim for Docker Desktop or Rancher Desktop, so a build that
  "succeeded" cannot say which engine produced it. **If Apple Container is not installed, skip the
  local build and say so** — the Dockerfile is still written and still checked statically, and the
  platform still builds it. This is the one contract command that is conditional.

Anything the app genuinely needs beyond this list is additive and gets one line of justification in
PROJECT.md, exactly like an extra dependency.

### Phase 2 — Repo, dossier, and risk

`new-repo-init` scaffolds PROJECT.md, CLAUDE.md/AGENTS.md and a secure `.gitignore`. Then classify
with `assess-risk-level` **before writing much code** — the tier decides everything downstream:
Medium and above require an independent review, recovery procedures, a design document and a test
dossier, and Medium is the common outcome for anything a team will use. Classifying late means
discovering at the gate that a human review you cannot perform yourself is now the blocker.

**In practice, assume Medium.** The criterion "used by a team" is satisfied by a per-user table plus
the shared deployment configs every app on this pipeline has, so a tool the owner sincerely describes
as a personal demo still classifies Medium once the code exists — and the evidence rule means it can
only go up from the provisional tier, never down. Treat Low as the exception that has to be argued,
not the default. **Name the independent reviewer here, at phase 2.** The review is the long pole and
the one step no agent can perform; discovering at phase 7 that nobody is lined up costs a day, not a
minute.

#### Write the build contract into the repo, not just into this run

`new-repo-init` scaffolds `CLAUDE.md`/`AGENTS.md`. **Both names must exist, and `CLAUDE.md` is a
symlink to `AGENTS.md`** — one file, two names, so the two can never disagree:

```sh
ln -s AGENTS.md CLAUDE.md && git add AGENTS.md CLAUDE.md
git ls-files -s CLAUDE.md          # 120000, not 100644
```

Both names are required because tools look for different ones, and the symlink is required because
copies drift: every delivered app that carried both carried them as two regular files with identical
content, agreeing by coincidence with nothing to keep them that way. Commit the link, not a copy —
`git ls-files -s` reporting `100644` for `CLAUDE.md` means a copy went in, whatever the working tree
shows.

This pipeline requires that they carry a **`## Build and run`** section holding the phase 1 command table verbatim, plus the exact
`container build` and `container run` lines for this app, its port, and the environment variables it needs
to start. Copy `references/build-contract.md` and fill in the app's own values — it is written to be
pasted.

This is not documentation for its own sake. Every agent that opens the repo after you reads those
files first: a maintainer's session months later, a review agent, and **the deployment platform's own tooling
at onboarding**. Without them each one has to infer the build from the tree, and inference is exactly
where it goes wrong — an agent that reaches for `npm run build` in a Bun workspace, or serves the
frontend's `dist/` instead of the artifact the backend actually serves, produces a failure that reads
like a platform problem and is not one. A repo that states its own build in the file the reader is
already opening turns "work out how this is built" into "do what it says", which is the difference
between a support thread and a green pipeline.

Make it concrete rather than descriptive. `AGENTS.md` should let someone — or something — go from a
fresh clone to a running container without opening another file, so the section names the commands,
the port, the health path, and the variables, and does not paraphrase them.

**Run `check-build-contract` at stage `phase-2` before leaving this phase** — it checks exactly the two
things phase 2 produces, the contract commands and this section, and nothing that does not exist yet. It
is the cheapest place in the pipeline to find a missing script: renaming one here is an edit, renaming
one at phase 7 is an edit plus a re-run of every phase that quoted it.

The check is mechanical: **if `AGENTS.md` does not contain the command table and the image lines,
phase 2 is not finished.** Worth stating plainly, because the one app delivered on this pipeline with
no `CLAUDE.md` or `AGENTS.md` at all is also the one that shipped an unpatched image carrying 3
CRITICAL CVEs and reported 0.0% coverage. That is not a coincidence: the file is where the standard
would have been visible to whoever came next, and nobody came next to a standard that was never
written down.

### Phase 3 — Build

- **UI**: `ui-dev:rnd-svelte-implementor` — and read it *now*, not from memory: what a library ships
  (its CSS in particular) changes between releases, and the skill is where that is corrected. Read the
  per-component reference before using an unfamiliar component; several props differ from their Vue
  twins.
- **Never hand-write a component's own styling before checking the installed version.** A component
  rendering unstyled is far more often an old release than a wrong import — see the first entry in
  `references/field-notes.md`.
- **Identity**: `use-apps-gateway-authn` from the first commit, not as a retrofit. The gateway
  authenticates; the app reads `X-User-Id`. Never build login, sessions, JWTs or a password column —
  removing them later means a migration and a rewritten test dossier.
- **Local development** without a gateway uses the sanctioned simulation (`local-authn-dev`), gated so
  it cannot ship: `import.meta.env.DEV` in the browser, never a production code path.
- Keep the data layer boring and the health endpoint honest — see phase 5.

### Phase 4 — Prove it

**Pick the harness to match the repo before writing anything.** `ui-integration-test` documents
`@acme/integration-test-tools` — a snapshot harness for repos that already have `integrations/specs/`
and a `acme-integration-test.config.cjs`. A greenfield repo on this stack has neither, and adopting
it would mean a second runner stacked on the Playwright the stack already provides, which the stack
rules forbid. So: that skill for a repo already using those tools, **plain Playwright for a greenfield
one**, and say which you chose. The two rules below are the requirement; the harness is not.

Two rules, both learned by shipping something broken:

1. **At least one journey must use a real pointer and real keystrokes.** Setting `input.value` and
   dispatching an `input` event walks straight past the layer where UI actually breaks — layout,
   hit-testing, focus. A field can be invisible, mispositioned or covered and every DOM-level test
   still passes. Assert that the centre of the visible field hit-tests to its own `<input>`, click it
   with the mouse, type with the keyboard, and check the value landed.
2. **At least one journey must run against the production artifact**, not the dev server: the built
   bundle served by the backend, with the gateway simulated (identity header stamped on each proxied
   API request). Minification, `import.meta.env.DEV` being false, and header-based identity are all
   invisible to a dev-server test. Reload mid-journey and re-assert — a row that was only prepended
   optimistically must not pass for a saved one.

What rule 1 looks like in practice — the assertion that catches a form nobody can type into, before a
user finds it:

```js
// 1. the field owns the clicks inside it (not a label, an overlay, or the page behind it)
const centreHitsInput = await page.evaluate(([field, input]) => {
  const r = document.querySelector(field).getBoundingClientRect()
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    === document.querySelector(input)
}, ['.composer .field', '.composer input'])
expect(centreHitsInput, 'a click in the middle of the field must reach its input').toBe(true)

// 2. a real click and real keystrokes actually land
const box = await boxOf(page, '.composer input')
await page.mouse.click(box.x, box.y)
await page.keyboard.type(title)
expect(await page.evaluate(s => document.querySelector(s).value, '.composer input')).toBe(title)
```

Make failures self-diagnosing: when an expected row does not appear, report the failing API call and
status, the toast, the text stranded in the input and the server's own view of the data. "Text not
found" is not a bug report, and a test that cannot explain itself will be blamed on the runner — the
first run of the production-artifact journey above reported `GET /api/todos?scope=mine → 401`, which
is how it identified its own gateway simulation, rather than the app, as the fault.

Then run `generate-test-scenarios` to reconcile `docs/TEST-SCENARIO.md` against the code and keep the
scenario IDs, statuses and history straight.

### Phase 5 — Deployment assets

The platform reads specific files; the recurring set is:

- `Dockerfile` at the repo root, hardened per `apply-security-patterns` Pattern 9 (non-root user,
  pinned base, no secrets in layers). Company registries that allow anonymous reads need **no token** —
  do not bake one in. **Patch the base image's OS packages in the runtime stage** — the mandated bases
  ship known CVEs and bumping the tag does not clear them (see `references/field-notes.md`).
- An **unauthenticated health endpoint** on the exact paths the gateway bypasses (commonly `/health`
  *and* `/api/health`) that reads no identity.
- `.env.example` with placeholders only — it seeds the platform's secret store, so every variable the app reads must appear
  and no real value may.
- `.platform/*.yaml` — **do not hand-author these.** The onboarding integration commit writes all of
  them (`resources`, `storage`, `observability`, `routing`, `android`) into the application repo
  itself, and on one delivery it got them right unprompted: probe path matching the app's own
  `/health`, `volumes: []` for a stateless app so no ReadWriteOnce volume forced `replicas: 1`, and
  bypass paths matching exactly the four the app served. The schema is not published anywhere an
  application team can read, so guessing at it risks breaking your own rollout to declare something
  the platform was about to declare correctly. **Review what the onboarding commit wrote and object if it is wrong**
  — in particular a `storage.yaml` declaring an RWO volume the app does not need, which forces
  `replicas: 1` and `Recreate`.
- `sonar-project.properties` with exclusions for generated output, coverage reports, build config and
  test code — and a `.gitignore` that keeps those artifacts out of the repo in the first place.
- **Every frontend dependency declared as a `devDependency`**, when the frontend ships as a bundle.
  `--production` drops devDependencies and nothing else, so a UI library sitting under `dependencies`
  reaches the runtime image even with a textbook three-stage Dockerfile. Check the built image rather
  than the Dockerfile: the bundler and type checker must not resolve inside the container.
- **The image built locally — on Apple Container, or not at all.** Check first:

  ```sh
  command -v container && container system status   # `container system start` if the daemon is down
  ```

  Present → `container build -t <repo> .`, then start it once:
  `container run --rm -p <port>:<port> -e DATABASE_URL=... <repo>`, and for a boot-time crash
  `container run --rm -m 1024M <repo>` reproduces the platform's memory limit. It is the cheapest
  check in the phase: the platform builds the same file, and a break found only in the platform's image build
  costs a full pipeline run to learn what one local minute would have said.

  **Absent → skip the build and record the skip.** Do not fall back to `docker`, and do not install a
  runtime to satisfy this step. `docker` on a company Mac is usually a shim — on the machine this rule
  came from it resolved to `~/.rd/bin/docker`, Rancher Desktop, with Apple Container installed and
  running beside it; an image built through that shim cannot be said to be the platform's image, and
  which container runtime a laptop carries is not this pipeline's decision to make. The Dockerfile is
  still written, still checked statically by `check-build-contract` (base patched, production-only
  dependencies, pinned tag, UID ≥ 10000 — the checks that caught 3 CRITICAL CVEs read the file, not a
  daemon), and still built by the platform at onboarding.

  **One exception.** A symptom only the running image shows — a container killed at boot with no
  output, a path that exists only in the build stage — is not diagnosable from the file. Without a
  runtime, say that plainly and hand it over rather than guessing at a Dockerfile you cannot run.
- **A committed coverage report**, and this one is counter-intuitive enough to state plainly: the
  quality gate requires **coverage ≥ 70%**, and the platform's analysis step runs the *scanner*, not
  your test suite. With no report the metric reads 0% and the gate fails on a project with a perfectly
  good suite. Commit `coverage/lcov.info` — the one generated file that belongs in the repo — keep the
  rest of `coverage/` ignored, exclude the directory from `sonar.exclusions`, and point
  `sonar.javascript.lcov.reportPaths` at it. Regenerate it with a script that **fails if the suite
  fails**, so a stale-but-green report can never be committed.

**Then run `check-build-contract` at stage `phase-5`**. This is the stage that
catches the four findings that otherwise reach production silently — an untracked coverage report, a base
image nobody patched, a runtime layer built from build-stage dependencies, and the platform's injected
CommonJS stubs. Every one of them was found this way after the fact on a delivered app, and every one is
a single edit at this point in the pipeline.

**Write these into the first commit.** They are the difference between an onboarding that passes at
the first attempt and one that halts at the Sonar analysis step twice while someone triages thousands of
findings from a coverage report that should never have been committed. The same repo, built with the
exclusions present from commit one, cleared the gate on its first run.

### Phase 6 — Quality gates

Run `sonar-issue-fixer` against the project's own Sonar server and `scan-dependencies` for CVEs.
Security hotspots need the user's approval per fix. Fix the finding, never the detector.

### Phase 7 — Governance

**`check-golive-readiness` runs the contract check itself, as prerequisite 0** — you do not invoke it
separately here, and you never ask the user to. This is its third run at stage `phase-7`, the full set:
the
command names, the `## Build and run` section and whether it is still true at HEAD, a coverage path
that resolves to a tracked file, a Dockerfile that patches its base and installs production-only
dependencies, the absence of the platform's injected CommonJS stubs, and a gate record naming HEAD.
A High-severity failure means phase 7 is not entered yet.

None of those rules are new; they are the ones this skill already states in prose and that four
consecutive deliveries still missed. A rule an agent agrees with and does not follow needs a check,
not a stronger paragraph — which is the whole reason `data/build-contract.json` exists rather than
another bold sentence here.

`/vibe-check` chains the dossier, design document, test scenarios and review proof, then returns
READY / NOT READY / CONDITIONAL and writes `vibe-release.json`. At Medium and above the sealed review
must come from an independent human — **never self-run `/vibe-review`**, and never present a
CONDITIONAL as shippable. A Medium-or-above verdict that is NOT READY only because the human review
is pending does not stop a staging deployment — staging is where the reviewer needs the app in order to
review it. Deploy to staging; do not release to users.

### Phase 8 — Watch it land, and fix what stops it

A deployment is not finished when the push succeeds. It is finished when the app answers. Stay with
the run rather than handing back a "should be deploying" — the whole point of driving this end to end
is that nobody has to come back to it later.

**Follow it.** Watch the platform's pipeline for the push until it completes, and poll the app's
staging health path directly — it typically answers 503 while the rollout settles, then 200.

**On a failure, fix the cause and push.** A push rebuilds; re-requesting a deployment only re-runs
what already failed. Read the failed step and the log lines it quotes, then:

| Failed step | Where the cause almost always is |
|---|---|
| Quality-gate analysis | The quality gate: real findings in new code, or generated output being analysed at all. Pull the actual findings (`sonar-issue-fixer`) and fix them |
| Image build | The Dockerfile or the build itself: a path that exists only on your machine, a file the ignore list withholds from the build, a lockfile that does not match. Reproduce with a local image build **before** pushing a guess — **and if the file it names is valid in your checkout, `git fetch` before forming any theory: the platform's own integration commit edits application source after you push** (see `references/field-notes.md`) |
| deploy / health not ready | Environment or probes: a variable the app reads that `.env.example` never declared, a port mismatch, a probe path the gateway does not bypass. The health response naming a local fallback database is the tell that `DATABASE_URL` never arrived |

**Up but misbehaving is a log problem, not a guess.** Once `/health` answers, a 500, an error page or
a crash loop is diagnosed from the app's own logs: trace the error to the code before changing
anything.

**Bounded, and never by lowering the bar.** At most **three** attempts per distinct cause, each one
diagnosed before it is written — and each verified locally (suite, build, or image) before it is
pushed, because a blind push costs a full pipeline run to learn nothing.

The line that must not be crossed: *making the gate stop complaining is not fixing the cause.*
Excluding product code from analysis to dodge its findings, deleting or skipping a failing test,
relaxing a threshold, or dropping a check from the pipeline are all forbidden here, however tempting
at attempt three. Exclusions are for generated output, build configuration and test code — never for
code the product actually runs.

Stop and hand over, with the evidence, when three attempts have not fixed one cause, or when the
cause is not yours to fix: platform capacity, registry or cluster credentials, a missing platform
secret, quota, or anything needing a decision that belongs to a person.

**Finish on evidence, not on a status message.** Healthy means `/health` answers 200 with the
platform's database named in it, and `/` answers 401 unauthenticated because the gateway is doing its
job.

**But healthy is not the end of the run.** An image vulnerability scan can publish *after* the
rollout — on one delivery it landed **40 seconds after `/health` went green**, reporting
`CRITICAL=2, HIGH=13`, by which point the run had already been reported complete. CRITICAL blocks a
production promotion, so a run that stops at 200 hands over a green result carrying a blocker. Wait
for the image scan result and read it — a repository scan lands earlier and an all-clear there says
**nothing** about the image. Only then say plainly what shipped, and — if anything failed on the way —
what broke, what you changed, and which commit fixed it.

A rebase to fix any of it means a **new branch and a new PR**: repositories created under the approved
org refuse force-push on *every* branch, not just the default one.

### Phase 9 — Triage what users report

When someone says it works locally but not on staging, **get one line of evidence from the failing
environment before changing code**: the API status for the failing action, the console error, what
element actually sits under the click. Reproduce against the production artifact with the gateway
simulated. If it reproduces, fix it and add the test that would have caught it; if it does not, the
fault is above the app — identity, gateway, CDN, browser extension — and guessing at code changes
only adds risk.

A screenshot of an empty form is ambiguous by construction: it looks identical whether nothing was
typed, typing did not register, or the submit failed and cleared the field. Ask which it is before
choosing a fix.

Every fix that changes tracked source makes a sealed review proof stale and flips scenarios to STALE.
Re-run the affected phase and re-stamp the dossier rather than leaving it for the next gate.

## Non-negotiables

- **Never deviate from the allowed stack** (`allowedStack` in `data/build-contract.json`: Bun · TypeScript ·
  Elysia · Drizzle · PostgreSQL · Svelte, with `@acme/rnd-svelte.*` for UI and BLUE DLS tokens). No
  substitutions, no second library for a job the stack already covers, and no exception granted because a
  requester asked for one — that decision belongs to the tech architect and is recorded in PROJECT.md
  `## Stack Exceptions`. Major improvements need that approval even for legacy projects. Gaps are filled
  from the tech radar and justified in one line.
- **Never rename, drop or alias a contract command**, and never let `AGENTS.md` describe a build the
  repo no longer has. The command names are what every later phase, field note and reading agent
  depends on; a repo-local synonym silently breaks all three, and a stale `## Build and run` section
  misleads the next reader more effectively than no section at all.
- **Never build the image with anything but Apple Container** (`container`), and never install a
  container runtime to satisfy a pipeline step. `docker` on a company Mac is usually a Docker Desktop
  or Rancher Desktop shim, and an image built through it is not provably the one the platform builds.
  No runtime installed means the local build is **skipped and the skip recorded** — not substituted,
  and never reported as verified.
- **Never self-certify a Medium/High review.** The reviewer is neither the Project Owner nor the
  Support Contact and seals in their own checkout — a review whose independence cannot be shown is
  worth nothing to the people relying on it.
- **Never register the app with the gateway** and never hold a registration key. Registration decides
  who may enter the app; it is the platform team's call, made with a credential you should not be holding.
- **Never create the platform's artifacts** (deployment repo, manifests, Argo apps, Vault paths, Sonar
  project). The platform writes them at onboarding, so anything you pre-create becomes drift it has to
  reconcile — their absence beforehand is the correct state, and a missing or unreadable deployment repo
  is never a finding (it is SRE/platform-only; onboarding state is confirmed with SRE/platform).
- **Never ship the local identity simulation.** It sends the identity header from the browser; if it
  survives into a production build, anyone can be anyone by editing one value.
- **Never weaken or delete an assertion to make a suite pass, and never widen an exclusion to make a
  quality gate pass.** Both convert a signal into silence, and a control that is trusted and wrong is
  more expensive than one that is red. Never report a run as green when it is not.
- **Never claim a deployment happened because a push succeeded.** Pushes and pipelines fail
  independently; verify from the platform's own output, or say plainly that you have not.
- Record honestly: a pass on a dirty tree is stamped as dirty; a skipped step is named in the summary.

## Output

At the end of a run, report: what was built and where it lives; the risk tier and what it requires;
the test results by suite with the counts; the deployment assets produced; the gate verdict with its
blocking items; what a human must still do (independent review, platform onboarding, approvals); and
any assumption you made on the user's behalf.
