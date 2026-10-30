# Project Scaffold

Bootstraps and documents projects — from an empty folder to a review-ready, well-documented repo.

Three skills that work together across the project lifecycle: `new-repo-init` lays down the
`PROJECT.md` go-live dossier skeleton at init time, `project-documenter` completes it (and
generates the rest of the docs) before release, and `design-document` produces the IT
design-review document (`docs/DESIGN.md`). The `/start-vibe` command chains project start
into a single step.

## Components

| Component | What it does |
|-----------|--------------|
| Skill `new-repo-init` | Scaffolds a new repo: mirrored `CLAUDE.md`/`AGENTS.md` (single template so they can't drift), `CONTEXT.md` (living project state), `PROJECT.md` (go-live review dossier skeleton), a baseline secure `.gitignore`, then `git init`. |
| Skill `project-documenter` | Explores any codebase and generates a full `docs/` folder (`ARCHITECTURE`, `SETUP`, `API`, `SECURITY`, and more) + `README.md`, adds inline code comments, and completes the `PROJECT.md` go-live dossier (owner, risk level with file-path evidence, review evidence). Delegates risk classification to `golive-gate` when installed. |
| Skill `design-document` | Produces `docs/DESIGN.md`, the IT / Tech Architecture design-review document: product overview & objectives, a business-workflow diagram, component/deployment/sequence/transaction diagrams (**inline Mermaid**, rendered natively on GitHub), a database schema (field types & descriptions), an external-connections inventory, a financial-risk analysis, and a review checklist — then exports a distributable, on-demand `docs/DESIGN.pdf` (links resolved to the repo on GitHub; not committed). Approvals are handled in the go-live gate / Teams approval flow, not in this document. |
| Command `/start-vibe` | One-command project start: `new-repo-init` → private company repo via `ops-github` → provisional risk classification via `golive-gate` (intent-based — no code exists yet; re-verified against the codebase at review and gate time). |
| Command `/adopt-vibe` | One-command **brownfield onboarding** of an existing project: scaffold missing governance files → read-only baseline audits (`/audit-security`, `/scan-deps`, `/check-stack`, `/check-structure`, plus BLUE UI audit when the separate BLUE marketplace is installed) persisted to a tiered remediation backlog (`docs/REMEDIATION.md`: BLOCKING blocks `/vibe-check`, ADVISORY = legacy migration notes) → repo migration to the approved org via `ops-github` → evidence-based risk classification. Idempotent — re-run anytime to reconcile. |

## The two project files (do not confuse them)

- **`CONTEXT.md`** — living project state (overview, structure, plan, key decisions, progress).
  Agents read and maintain it continuously.
- **`PROJECT.md`** — go-live review dossier (owner, risk level, data classification, login
  method, approvals, review evidence, hosting, recovery). Scaffolded by `new-repo-init`,
  completed by `project-documenter` before release.

## Typical flow (the employee journey)

**New project (greenfield):**

```text
/start-vibe                    →   build by prompting            →   /vibe-check (golive-gate)
(scaffold + company repo +         (guardians enforce stack,         (chains project-documenter,
 provisional risk level)            structure, security, deps,        risk re-verification, and
                                    versioning automatically)         release review automatically)
```

**Existing project (brownfield):**

```text
/adopt-vibe                                    →   fix BLOCKING items   →   /vibe-check
(scaffold missing files + migrate repo to org      (advisory items get       (fails while BLOCKING
 + baseline audits into docs/REMEDIATION.md        migration notes; new      backlog items are open)
 + evidence-based risk level)                      code must comply now)
```

## Install

```text
/plugin install project-scaffold@smart-aiagent-plugins
```

## Skills detail

See `skills/new-repo-init/SKILL.md`, `skills/project-documenter/SKILL.md`, and
`skills/design-document/SKILL.md`. The `new-repo-init` templates live in
`skills/new-repo-init/assets/`; the `design-document` scaffold and Mermaid guide live in
`skills/design-document/references/`.
