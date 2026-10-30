# Field notes

Traps this pipeline hit while delivering a real tool end to end on its mandated stack (Bun · Svelte ·
TypeScript · Elysia · Drizzle · PostgreSQL with `@acme/rnd-svelte.*`, built from a ticket and
deployed to staging behind Apps Gateway).
Each entry is **symptom → cause → what to do**. They are not hypothetical; every one of them cost
hours, and most of them are invisible to the tests you would write by default.

---

## Component libraries

**A component renders with no styling at all — check the installed version before anything else.**
This is almost never a wrong import. Packages can ship a stylesheet that nothing imports, so the CSS
is in `node_modules` and never reaches the page. For `@acme/rnd-svelte.*` the components inject
their own CSS from the JS bundle **only from the 2026-08-06 releases onward** (button 5.0.3, modal
5.0.3, text-field 5.0.2 — each package was patch-bumped from its own version, so versions are **not**
uniform and the floor has to be raised per package). Upgrading is the whole fix: no stylesheet import,
no build-time rewrite.
→ Confirm what you installed actually carries it: `grep` the package's `dist/**/svelte/*.js` for the
style-injection prelude, then check the built bundle contains the library's class names.

**Do not borrow the other-framework twin's CSS — and delete it if you inherit it.**
The workaround that circulated before those releases (import `@acme/blue.*` compiled CSS and strip
its `[data-v-…]` scoping attributes) is **retired**. It is worth knowing what it costs, because that
is what you are removing and because the same failure shape appears whenever anyone de-scopes
framework-scoped CSS:

- **The skeleton rules may not exist at all.** A library's per-component CSS can carry only the
  element-level overrides while the layout for its wrapper structure lives in an unpublished shared
  partial. The visible result: a placeholder on one line and an invisible, border-less input on the
  next; clicking the text puts the caret somewhere you cannot see, focus reflows the box, and the next
  click lands outside the input and silently blurs it. A form that cannot be typed into, with a green
  test suite.
- **Scoped rules become global resets.** `input[data-v-abc123] { border: none; padding: 0 }` with the
  attribute stripped is a site-wide `input {}` reset; `button:focus, a { outline: none }` removes
  every focus ring in the app. If you ever must do this, re-scope the **subject** of each selector
  (its last compound) with a zero-specificity `:where([class*="lib-"], [class*="lib-"] *)` and leave
  compounds that already carry a class alone — scoping the *first* compound instead silently kills
  `html:not([dark]) .lib-x` rules.

→ After removing the workaround, prove it: audit every library class rendered in the DOM for a
matching CSS rule, check the bundle for `data-v-` remnants and leaked bare-element rules, and keep the
phase-4 hit-test assertion so an unusable field can never pass again.

**Library guidance goes stale faster than the library.** Both of the corrections above landed in the
component-library skill *after* a delivery had already worked around them. Read the skill at the start
of the build phase, and when its advice contradicts what you observe, check the package version before
concluding the skill is wrong.

**Importing the package root gives you the wrong component.** Several packages' `main` resolves to a
child (`chips` → `Chip`, and likewise `tabs`, `lists`, `stepper`, `accordions`), so you get one chip
where you asked for the container, with no error.
→ Always use the documented deep import path.

**A component renders but is invisible, and no error is thrown.** The reference documents prop
*names*, not the values each accepts. `Badge color="info"` looks perfectly reasonable and produces
white text on a transparent background, because that component's palette takes colour names
(`blue`, `green`, `yellow`, `red`, `gray`…) and silently ignores status words.
→ When a value has no visible effect, read the modifiers in the component's own injected CSS —
`grep` its `dist/**/svelte/*.js` for the class names it defines — rather than guessing a second time.
The CSS is the only complete list of accepted values.

**A test hook set as `data-testid` never reaches the DOM.**
Several `@acme/rnd-svelte.*` components — `Chip` and `Button` among them — do not spread
`restProps`, so an unknown attribute is silently dropped rather than rendered. The element is there,
the test cannot address it, and nothing errors.
→ Use the component's own **`id` prop** for test hooks. This matters directly for the phase-4
hit-test: `document.querySelector` and `elementFromPoint` need a real CSS selector, and a Playwright
`text=` locator is not one.

**A component crashes with "snippet is not a function".**
Slot-like props in Svelte 5 ports are snippets, not strings.
→ Read the component's own reference page before first use; several props differ from the twin.

**…and "crashes" undersells it: the page keeps rendering but stops updating.** Passing plain strings
to `EmptyState`'s `title` and `description` threw at mount and took the whole Svelte render loop with
it. Nothing on screen looked broken — the composer still held the text that had been typed into it,
the toast container rendered empty, and the newly created poll never appeared. Every later state
change was applied to state and never painted, so it presents as a data or API bug, in a completely
different part of the app from the component that actually failed.
→ Two things separate the two in seconds. The phase-4 rule that failures must be self-diagnosing is
the first: the run reported the poll **present in the server's own response and absent from the DOM**
in a single message, which is not a shape any data bug takes. The second is that an empty-state
component only mounts when a list is empty, so the fault appears on a fresh environment and vanishes
on a seeded one — if a journey passes against a store with rows and fails against an empty one,
suspect the empty-state branch before suspecting the data.

**`ownership_invalid_mutation` when binding to a prop's field.**
`bind:checked={todo.done}` on an object owned by a store.
→ Controlled value plus an explicit store mutation.

---

## The stack itself

**A syntax error in `vite.config.ts` fails the platform build and no test sees it.** Vite 8 loads a
TypeScript config by parsing it with rolldown, so the config is neither type-checked with the app nor
imported by any suite — it is parsed once, by the bundler, at build time. A broken one is invisible
locally right up until the platform's image build fails, and the error names the config rather than whatever
edited it. This is not a hypothetical pairing: the config is exactly the file the platform's
integration commit rewrites, so the file most likely to be edited by something other than you is also
the file with no test coverage at all.
→ Import the config in a unit test and assert something real about it — that every dev-proxy target is
an `http(s)://` URL, not a `"*"` that only makes sense as a CORS value. It turns a five-minute
pipeline failure into a two-second red suite. Prove the guard by reintroducing the broken line once
and watching it fail; a guard nobody has seen fail is a guess.

**And the rewrite has a second generation: valid syntax, wrong value.** On a later delivery the
config was written defensively as an explicit ternary, exactly as advised, and the integration
rewrite could no longer produce a parse error. It produced this instead:

```diff
-const apiTarget = process.env.VITE_API_TARGET ? process.env.VITE_API_TARGET : 'http://localhost:3000'
+const apiTarget = process.env.VITE_API_TARGET ? process.env.VITE_API_TARGET : process.env.CORS_ORIGIN || "*"
```

That parses, builds, and ships. The defensive ternary did its job — the build did not break — but the
proxy now targets `"*"`, which is a CORS value and not a URL. The suite caught it in **1.6 ms**,
because the assertion was about the *value* and not about whether the file parses.
→ Two consequences. A guard that only proves the config loads is now insufficient; assert the
semantics. And put the resolution behind a validating function rather than a bare expression — a
single expression is what the integration rewrite reaches for, so leave it nothing that a one-line edit can turn into
a wildcard:

```ts
function resolveApiTarget(): string {
  const candidate = process.env.VITE_API_TARGET
  if (!candidate) return DEFAULT_API_TARGET
  try {
    const { protocol } = new URL(candidate)
    return protocol === 'http:' || protocol === 'https:' ? candidate : DEFAULT_API_TARGET
  } catch {
    return DEFAULT_API_TARGET
  }
}
```

**The typed client collapses to `{}` and every API call stops type-checking.** Elysia's route
methods return a *new* typed instance; assigning `const app = new Elysia()` and then calling
`app.get(...)` on separate statements throws those types away, so `typeof app` carries no routes and
Eden treaty exports an empty object. Nothing fails at runtime — only the types quietly disappear.
→ Build the whole app as one fluent chain and export `typeof` the result. Static-file fallbacks and
conditional routes belong *inside* a handler, not outside the chain.

**A validated field arrives typed as `undefined` in the client.** Building a TypeBox union by
mapping over a constant — `t.Union(EFFORTS.map(e => t.Literal(e)))` — loses the literal types, and
the loss surfaces far away, in the generated client, as a field that accepts nothing.
→ Spell the union out: `t.Union([t.Literal('quick'), t.Literal('normal'), …])`. Keep the runtime
constant for iteration; write the schema literally.

**Two servers cannot share one PGlite directory.** The engine is single-process, so the second
instance — typically the production-artifact server the integration run boots alongside the dev one
— never starts, and the runner reports only a wait-URL timeout.
→ Give each instance its own `PGLITE_DIR`.

**`svelte-check` fails on every component import.** The component packages ship compiled JS with no
`.d.ts`.
→ One ambient declaration with a wildcard module covers the whole scope; declare the toast store
separately, since it exports functions rather than a component.

---

## Reactive state

**An effect that "corrects" state fights the user.**
An `$effect` that bounced anonymous visitors off a private tab the instant they opened it made the
sign-in gate unreachable — and presented as hours of "flaky" browser tests, because the page under
test really did change under the runner.
→ Corrections that belong to an *action* go in the action's handler, not in a reactive effect. When a
UI test stalls in a way that makes no sense, suspect your own reactivity before the runner.

**An effect that only *calls* a store method still subscribes to what that method reads.**
This is the quieter sibling of the note above, and it cost a debugging cycle on its own. An
`$effect(() => { void store.load() })` looks inert — it reads no state itself. But an effect tracks
every `$state` read during its synchronous run, and `load()` runs synchronously as far as its first
`await`, which was a read of the store's own `busy` concurrency guard. That was enough to subscribe
the effect to `busy`, so finishing a load re-fired the effect, which started another one, forever.
→ It presents as a **permanently disabled button**, not as a loop — the screen renders, nothing
errors, and the control simply never becomes clickable — which is why it is expensive to find. Kick
mount-time work off from `onMount`, or wrap the call in `untrack`. When a UI test reports a control
that is visible and never enabled, read your own effects before blaming the runner.

**A readiness flag flipped inside the guarded callback swallows the first click.**
Setting `loaded = true` inside the same callback that holds the concurrency guard paints an
interactive-looking screen one tick before any of its buttons will accept input. A user fast enough
to click in that window gets nothing at all, silently, because the guard refuses a second concurrent
request rather than queueing it.
→ Flip readiness *after* the work settles. And note that `page.mouse.click` performs none of
Playwright's actionability checks, so a real-pointer journey will happily click a disabled control
and fail somewhere downstream — assert the control is enabled first, so the failure names the real
problem.

**Background polling overwrites optimistic local state.**
→ Version-stamp mutations and drop the response of any poll that started before the last one.

---

## Browser test runners

Containerized runners are their own environment, and the accommodations below are the difference
between "the suite works" and "the suite is abandoned".

| Symptom | Cause | Fix |
|---|---|---|
| `Exec: undefined run` at start-up | runner infers the package manager from the CI file | declare `npmClient` in the Jenkinsfile |
| App never starts | workspace `--filter '*' dev` runs dependency-ordered | start each service explicitly and `wait` |
| Every `/api/*` request aborts | the mock loader aborts unmocked API calls by design | add a page route that continues API traffic (page routes beat context routes) |
| Browser dies at page teardown | unconditional JS coverage on an arm64 image | stub `page.coverage.stopJSCoverage` |
| Clicks and fills hang forever | the page stops producing animation frames, and actionability checks poll on them | drive through `page.evaluate`, or use raw mouse/keyboard coordinates — neither waits on frames |
| `getByPlaceholder` never matches | the library renders the placeholder as a `<span>`, not an attribute | use structural selectors |
| A second page in a worker never answers queries | shared browser keeps one page healthy | one journey per file, `workers: 1` |
| Element removal wedges | JS enter/leave transitions | drop them (they ignore reduced-motion anyway) |
| Identity-scoped API calls 401 only in the runner | page-level extra headers are dropped when a route continues | stamp the header inside the route handler — which is what a gateway does anyway |

---

## Containers and deployment

**The container is killed at boot and writes nothing at all** — no stack, no error, not one log line,
just an exit. The signature of an OOM at the memory limit, and it survives every test because the
behaviour is correct: it is the *module graph* that is wrong. On one delivery `db/client.ts` imported
PGlite at module scope so that an entire PostgreSQL compiled to WebAssembly was instantiated at boot
in **every** environment — including the deployed one, which had been handed a real `DATABASE_URL`
and would never touch it. Under a 1 GiB limit that alone was fatal.
→ Load each driver through a dynamic `import()` inside the branch that uses it, and bring its types in
with `import type` so they are erased at runtime. Do **not** reach for a hand-written structural type
instead: typing the shared query surface as `{ select: (...args: never[]) => any, … }` widens every
call site to `any`, the suite still passes, and only `tsc` notices. The same rule generalises past
this one library — an embedded database, a headless browser, a model runtime or any other heavyweight
module costs its memory in every environment that imports it, not only the ones that use it.
→ Reproduce it the cheap way: run the built image with `--memory` set to the platform's limit. A
`Killed` with no output is the whole diagnosis.

**The embedded fallback database cannot write next to the application.**
Pattern 9's non-root `USER` and its `readOnlyRootFilesystem` Pod setting both forbid it, and the
symptom arrives late: the container starts, runs its migrations, and dies with `EACCES` on
`/app/.pglite` — but only once the hardening line is added, so it reads as a hardening bug rather
than a path choice.
→ Put the fallback under `/tmp` (`PGLITE_DIR`, or the engine's equivalent), set it in the Dockerfile
so the default is right unprompted, and declare it in `.env.example`. A hardened Pod mounts an
`emptyDir` there, so it is the one writable path the app can count on.

**A secret ends up in the image.** `.dockerignore` patterns that miss nested paths: `.env` does not
match `backend/.env`.
→ `**/.env`, `**/.env.*`, with `!**/.env.example`.

**The mandated base image ships CRITICAL CVEs, and bumping the tag does not fix them.** On one
delivery the platform's Trivy **image** scan reported `CRITICAL=2, HIGH=13` against a freshly built
image — every finding an OS package in the base, none in application code: `libcrypto3`/`libssl3`
3.5.5-r0 (CVE-2026-31789, critical), `musl` 1.2.5-r10, `zlib` 1.3.1-r2. The newest tag of the same
base shipped the identical versions, so there was nothing to upgrade *to*.
→ Patch inside the image: `RUN apk upgrade --no-cache` in the runtime stage, before dropping to the
non-root user. Verified to lift those three to 3.5.7-r0, 1.2.5-r12 and 1.3.2-r0 and clear all fifteen
findings. Put it in the **first** commit for the same reason as the Sonar exclusions — it turns a
blocked promotion into a non-event. The layer caches until the base changes, so periodic rebuilds are
what keep it clean; that is the same obligation a pinned digest carries, not a substitute for it.
Never ignore-list these: they are real, they have fixes, and CRITICAL blocks production.

**A private registry that allows anonymous reads needs no token.** Verify before adding a build secret;
a tokenless build that fetches the tarball proves it.

**A build on a full disk produces a corrupt image** that fails with a mount error at run time, not at
build time. Prune before blaming the Dockerfile.

**Two boot-time responsibilities are worth the code**: run migrations on start, and seed only when the
store is empty — it makes every environment self-healing, including a fresh reviewer checkout.

---

## The build contract

**A repo whose scripts are named freely costs every later phase a lookup, and one of them a gate.**
Across four apps built on this identical stack the root scripts diverged on every axis that was not
pinned: `itest` against `test:integration`, `check` against `typecheck`, `db:generate` present in
three and absent from the fourth, ports 3000 and 3010. Each choice was locally reasonable. Together
they meant a field note written against one repo did not apply to the next, and CI copied between them
silently ran nothing. The expensive case was the repo with **no `test:coverage` at all**: no command
produced `coverage/lcov.info`, the platform's scanner ran without a report, and the quality gate read
**0.0%** coverage on a suite that passed.
→ Fix the command names as hard as the library names — the phase 1 table in `SKILL.md`. Declare a
command that does not apply rather than omitting it; an absent script and an empty one are
indistinguishable to anything reading the manifest, and only one of them is intended.

**A runner that exits non-zero on a *green* suite turns fail-closed into 0.0% coverage.**
`@electric-sql/pglite` 0.5.x makes the host process exit 99 at teardown while the run reports
`70 pass, 0 fail`; 0.3.12 exits 0 on the identical suite. A correctly written fail-closed
`test:coverage` sees the non-zero status, deletes the report, and the gate reads **0.0% on a suite
where every test passed** — the precise failure this contract exists to prevent, produced by obeying
it.
→ Assert both directions in the runner: no report on failure, **and** a report that exists and is
non-empty on success, exiting non-zero when it is missing. When a suite reports zero failures and the
process still exits non-zero, suspect a dependency's teardown before the tests, pin around it, and
write the reason next to the pin.

**`test:coverage` that writes a report from a red suite is worse than one that writes nothing.** The
gate then reads a number describing code nobody successfully ran, and the stale report stays green
across the exact change that broke the suite.
→ Generate the report only after the suite passes, and let a failure remove it. Verify the guard by
breaking one test on purpose and confirming no `lcov.info` appears.

**`coverage/lcov.info` declared in Sonar and ignored by git reads as 0%, exactly like declaring
nothing.** One delivery pointed `sonar.javascript.lcov.reportPaths` at two per-workspace reports and
then kept `coverage/` in `.gitignore`, so the scanner resolved two paths that contained no tracked
file. The configuration looks correct in review; only the gate's coverage number shows it is not.
→ The path must resolve to a file `git ls-files` lists. Carve the exception explicitly —
`coverage/*` then `!coverage/lcov.info` — and for a workspace repo merge to one root report rather
than declaring several, because one missing report among several fails just as quietly.

**An agent that cannot read how the repo is built will infer it, and the inference is what fails.**
`npm run build` in a Bun workspace, the frontend's `dist/` served instead of the artifact the backend
serves, a container run on the wrong port: all produce failures that read as platform problems. The
app delivered on this pipeline with no `CLAUDE.md` or `AGENTS.md` at all is also the one that shipped
an unpatched image and 0.0% coverage; the ones carrying both cleared the image scan and reported
~90%.
→ Put a `## Build and run` section in `AGENTS.md` with the command table, the `container build` and
`container run` lines, the port, the health paths and the environment variables — `references/build-contract.md`
is written to be pasted. Then keep it accurate at every commit: a contract that was true four commits
ago is a confident wrong answer, and worse than none.

**`CLAUDE.md` and `AGENTS.md` as two regular files are two copies, and copies drift.** Every delivered
app that carried both carried them at mode `100644` with byte-identical 203-line content — agreeing by
coincidence, with nothing preventing the next edit from landing in one and not the other. The failure
would be silent and asymmetric: whichever tool reads the stale name gets a build description that is
quietly wrong, which is worse than the file being absent.
→ One file, two names. `ln -s AGENTS.md CLAUDE.md && git add AGENTS.md CLAUDE.md`, with `AGENTS.md` as
the real file because it is the cross-tool name. Verify the **committed** mode, not the working tree:
`git ls-files -s CLAUDE.md` must report `120000`. A `100644` there means a copy went into the index
even if `ls -l` shows a link — usually a checkout with `core.symlinks=false`, or a tool that resolved
the link while writing. Fix the index: `git rm --cached CLAUDE.md && ln -sf AGENTS.md CLAUDE.md &&
git add CLAUDE.md`.

**Building the image is a contract command, not a deployment step.** The platform builds the same
`Dockerfile`; a break that is only discovered in the platform's image build costs a full pipeline run to learn
what one local minute would have said, and the failure names the file rather than whatever edited it.
→ Build locally before every push that touches the Dockerfile, the lockfile, or anything
`.dockerignore` withholds — and run it once, with memory set to the platform's limit:
`container run --rm -m 1024M <repo>`. A `Killed` with no output is the whole diagnosis.

**`docker` on a company Mac is usually not the engine you think it is.** On the machine this note came
from, `command -v docker` resolved to `~/.rd/bin/docker` — Rancher Desktop's shim — while Apple
Container was installed and running beside it. Nothing errors: the build succeeds, and the resulting
image simply cannot be said to be the one the platform will produce.
→ Use `container` (Apple Container) and nothing else: `container build -t <repo> .`, after
`container system status` confirms the daemon is up — the CLI and the daemon are separate, and a
missing daemon is the usual cause of a first-run failure. If `container` is absent, **skip the local
build and record the skip** rather than reaching for whatever `docker` points at. The four static
Dockerfile checks read the file and run regardless; they are what caught the base image that shipped
3 CRITICAL CVEs, and no daemon was involved.

---

## Static analysis

- **Write the exclusions before the first push, not after the first failure.** This is the single
  cheapest thing in the pipeline: the same app, onboarded once with `sonar-project.properties` and a
  generated-output `.gitignore` already in commit one, cleared the quality gate on its first run —
  where the earlier attempt failed at the Sonar analysis step twice and needed a triage pass first.
- A committed coverage report can produce **thousands** of findings on its own. Ignore generated
  output in `.gitignore` *and* in the analyzer's exclusions, and check what a wildcard actually
  swept in before committing.
- Rules match text, not intent: a "TODO" rule fires on a product genuinely about todos, and
  `Math.random` is a security finding regardless of use — switch to a CSPRNG rather than arguing.
- Exclude build configuration and test code from analysis; they distort the gate without improving the
  product.

---

## Platform and gateway

- **Health endpoints must match the gateway's bypass paths exactly** and read no identity. Serving the
  same handler at both `/health` and `/api/health` costs one line and avoids a rollout failure.
- **The identity header is the app's user key.** Trim and lower-case it, auto-provision on first sight
  with a conflict-tolerant insert, and treat a malformed value as anonymous.
- **Concurrent platform bots push to your repo.** Fetch and rebase before every push; a rejected push
  is normal, not a permissions problem.
- **And they do not only add files — they edit your source.** An onboarding integration commit
  (`feat: integrate <app> with DevOps Platform AI`) landed on `main` between the push and the build
  and rewrote a Vite config line to `process.env.A ?? process.env.B || "*"` — `a ?? b || c`, a real
  JavaScript syntax error — failing the image build on a file that was valid in every local
  checkout. The same commit wrote an Express health route and an axios client into `src/`: dead code
  requiring packages that are not dependencies, against the mandated stack, sitting exactly where
  SonarQube analyses it.
  → **When a build fails on a file that is valid locally, `git fetch` and diff the integration commit before
  forming any theory.** Reasoning from a stale `origin/main` cost thirteen minutes and produced a
  confident, wrong root cause. Then fix defensively — remove the construct rather than parenthesising
  it, so a second integration pass cannot reproduce the error — and diff for dead source the integration commit added
  under `src/` before the next analysis runs.
  → **"Defensively" has a concrete shape.** The rewrite targets an *assignment expression* containing
  `??`. Parenthesising leaves that target in place for the next pass; expressing the value as a
  function removes it entirely — there is no longer an operator pair to splice onto:
  `function resolveDevApiTarget() { const v = process.env.DEV_API_TARGET; if (typeof v === 'string'
  && v.length > 0) return v; return 'http://localhost:3000' }`
  → **A third delivery hit this identically**, and that time a unit test importing the config caught
  it in **21 ms**, before the platform's own build failure arrived. The same commit also wrote a root
  `tsconfig.json` (`"module": "commonjs"`, `"strict": false`, `include: ["**/*.ts"]`) alongside the two
  known `src/` stubs; on a workspace repo it contradicts every per-workspace config and is picked up
  by whatever resolves the nearest tsconfig. Delete all three.
- **Force-push is refused on every branch, not just the default one.** Repositories created under the
  approved org come with that protection on, so "fix the cause and push" cannot mean amend-and-force:
  a rebase means a **new branch and a new PR**.
- **A pipeline's completion status is a claim.** Treat it as one and the app's own health path as
  the evidence — it also reveals whether the platform's database was actually wired in, since an app
  that fell back to its local store says so in the response.
- **A webhook delivery logged as HTTP 500 (`context deadline exceeded`) can still have triggered the
  pipeline** — the receiver answered too slowly for the sender's timeout. Judge by the platform's own
  output (scan branches, image scans, analysis timestamps), never by the delivery log alone.

---

## Triage discipline

The most expensive mistake in this pipeline was theorising about an environment that could have been
measured. When a user reports "it does not work in staging":

1. Get one line of evidence from **their** environment — the API status of the failing action, the
   console error, what element sits under the click.
2. Reproduce against the **production artifact** with the gateway simulated. Green there means the
   fault is above the app.
3. Only then change code — and add the test that would have caught it.

A user's screenshot showing an empty form is ambiguous by construction: it looks identical whether
nothing was typed, typing did not register, or the submit failed and cleared the field. Ask which one
it is before choosing a fix.
