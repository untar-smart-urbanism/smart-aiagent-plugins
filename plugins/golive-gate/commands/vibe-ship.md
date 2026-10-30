---
name: vibe-ship
description: Deliver a tool end to end — requirement or ticket to a governed deployment. Orchestrates stack resolution, repo and dossier scaffolding, implementation with gateway identity, tests a person could have run, deployment assets, the go-live gate, and the platform handoff.
---

# Vibe ship

Run the `vibe-code-and-deploy` skill from the `golive-gate` plugin. It is the **orchestrator** for the
whole delivery pipeline; each phase is executed by the skill that owns it.

## Steps

1. Read the skill and its `references/field-notes.md`. Do not restate the skills it invokes — run them.
2. Work the phases in order, stopping at each exit criterion:
   - **0 Understand** — `jira-issues` for a ticket key; restate scope; ask only what changes the work.
   - **1 Stack + commands** — **fixed and mandatory**, per `allowedStack` in `data/build-contract.json`
     (Bun · TypeScript · Elysia · Drizzle · PostgreSQL · Svelte, `@acme/rnd-svelte.*` for UI, BLUE DLS
     tokens). No substitutions and no exception because a requester asked; exceptions need a tech-architect
     row in PROJECT.md `## Stack Exceptions`, and major improvements need one even for legacy (pre-2026-10-07)
     projects. `tech-radar:query-tech-stack` fills only the gaps (`allowedStack.gapFilling`). The **command contract** is fixed with it — `build`, `start`, `dev`,
     `typecheck`, `test`, `test:coverage`, `test:integration` and `db:generate`, under exactly those
     names, no aliases — plus `container build -t <repo> .` on **Apple Container**, the one contract
     command that is conditional (skip it when `container` is not installed; never substitute
     `docker`).
   - **2 Repo + risk** — `project-scaffold:new-repo-init`, `ops-github:create-github-repo`,
     `golive-gate:assess-risk-level` (classify **before** building — the tier drives everything).
     Put the `## Build and run` contract into `CLAUDE.md`/`AGENTS.md` here — every agent that opens
     the repo later, the platform's included, reads it instead of inferring the build. Then run
     `golive-gate:check-build-contract` at stage `phase-2` before leaving the phase. **You run it; the
     user never asks for it.**
   - **3 Build** — `ui-dev:rnd-svelte-implementor`, plus
     `authn-implementations:use-apps-gateway-authn` from the first commit. No login code, ever.
   - **4 Prove it** — `ui-integration-test` and `golive-gate:generate-test-scenarios`; one journey must
     use a **real pointer and real keystrokes**, and one must run against the **production artifact**
     with the gateway simulated and survive a reload.
   - **5 Assets** — `code-review:apply-security-patterns` for the Dockerfile, then
     `golive-gate:check-build-contract` at stage `phase-5` (untracked coverage report, unpatched base
     image, build-stage dependencies in the runtime layer, the platform's injected stubs — all four are
     single edits here and silent failures later). Build the image only on **Apple Container** —
     `command -v container && container system status`, then `container build -t <repo> .` and one
     `container run`. Not installed → skip it and record the skip; never fall back to `docker`, which
     on a company Mac is usually a Docker Desktop or Rancher Desktop shim. Check the platform inputs
     (health path, `.env.example`, `.platform/*.yaml`, Sonar properties). Put the Sonar exclusions and
     the generated-output `.gitignore` in the **first** commit — that is what makes the quality gate pass first time.
   - **6 Quality** — `sonar-issue-fixer`, `scan-dependency:scan-dependencies`.
   - **7 Governance** — `golive-gate:check-golive-readiness` (`/vibe-check`), which runs the full
     `phase-7` contract check itself as prerequisite 0. A High-severity failure is fixed before the
     gate, never excluded. By this point the contract has already been checked twice, at phases 2 and
     5, so a surprise here means one of those runs was skipped.
   - **8 Watch it land** — follow the platform's pipeline for the push until the app answers. On a
     failure, fix the cause and push (a push rebuilds; do not re-request the deployment): quality-gate
     analysis → real findings, image build → the Dockerfile or build, health-not-ready → env or probes.
     Three attempts per cause, each verified locally first, and never by widening an exclusion or
     deleting a test. A file the log names that is valid in your checkout means the platform edited
     it after you pushed — `git fetch` before theorising. Finish on `/health` returning 200, `/`
     returning 401, **and the image vulnerability scan read** — it can publish after the rollout and
     carry a CRITICAL that blocks production.
   - **9 Triage what users report** — one line of evidence from the failing environment before any
     code change; reproduce against the production artifact.
3. Report what shipped, the gate verdict, what a human must still do, and every assumption made.

**The contract check is chained, never delegated to the user.** It runs three times — phase 2, phase 5,
and inside `/vibe-check` — and `data/build-contract.json` `stages` says which checks apply at each.
`/vibe-conform` is the manual escape hatch for a repo nobody is currently shipping. Telling the user to
run it mid-pipeline is skipping your own step.

## Non-negotiables

- Never deviate from the allowed stack, and never grant a stack exception yourself — that belongs to
  the tech architect (Tech Architecture Group), recorded in PROJECT.md `## Stack Exceptions`. The same applies to the command names: never rename or alias one, and never
  leave `AGENTS.md` describing a build the repo no longer has.
- **Never build the image with anything but Apple Container**, and never install a container runtime
  to satisfy a step. Absent runtime means the local build is skipped and the skip is recorded — the
  Dockerfile is still checked statically and the platform still builds it. An image built through a
  `docker` shim cannot be said to be the platform's image.
- Never self-run `/vibe-review` at Medium/High — the reviewer is neither the owner nor the support
  contact.
- Never register the app with the gateway; never create the platform's deployment repo, manifests or
  Vault paths.
- Never ship the local identity simulation. Never weaken a test to make a suite pass, or widen an
  exclusion to make a quality gate pass — that is silencing the control, not fixing the cause.
- Never claim a deployment happened because a push succeeded — verify it, or say you have not.

## Scope

- **This command:** build it, prove it, prepare it, gate it, hand it over.
- **Governance gate only:** `/vibe-check`.
- **Existing project joining the playbook:** `/adopt-vibe` first, then rejoin at phase 5.
