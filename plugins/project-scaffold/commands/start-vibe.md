---
name: start-vibe
description: One-command project start — scaffold the repo, record owner and support contact, create the private GitHub repo, triage and classify the initial risk level, and write docs/REGISTRATION.json for the Alpha Projects Registry, per the Non-Tech Change Management playbook.
---

# Start vibe

The single entry point for an employee starting a **new** AI-assisted tool. (For a project that already exists, use `/adopt-vibe` instead — it audits the existing code and builds a remediation backlog.) Runs seven steps in order; each step degrades gracefully if its plugin is not installed.

## Steps

1. **Scaffold** — run this plugin's `new-repo-init` skill: mirrored CLAUDE.md/AGENTS.md, CONTEXT.md, PROJECT.md go-live dossier skeleton, secure .gitignore, `git init`.
2. **Vibe start** — record **today's date** (ISO `YYYY-MM-DD`) in PROJECT.md `## Vibe Start`. This is the project-start timestamp used to measure time to staging/production, and it flows into `vibe-release.json` `start-vibe` at `/vibe-check`. Idempotent: if the section already holds a date, leave it — never overwrite the original start.
3. **Ownership** — record PROJECT.md `## Project Owner` (GitHub username) and `## Support Contact` (one company email), using the formats and the ask-first rules of `ownership-support-contacts` in `plugins/golive-gate/data/golive-gate.json`. Resolve the running user's login with `gh api user --jq .login` and ask "Is the project owner you (`<login>`)?". Never pick either value for the owner.
4. **Cost labels** — ask the owner for the three GCP cost/budget labels and record them under PROJECT.md `## Label` (Company / Division / Department lines):
   - **Company** — exactly one of: **acme, acme-pay, acme-pa, acme-ventures, acme-retail, acme-travel, acme-an, acme-us, acme-intl, acme-rise, acme-gem**.
   - **Division** — exactly one of: **operations, finance, marketing, commercial**.
   - **Department** — free text (the owning department name), recorded in lowercase: if the owner types capitals, lowercase the value before writing it.

   Authoritative lists: `gcp-label-set.labels` in `plugins/golive-gate/data/golive-gate.json`. All three are owner input — never pick them for the owner. If the owner doesn't know a value yet, leave that line blank and note that `/vibe-check` will not pass until Company and Division are set and Department is non-empty.
5. **Company repo** — run the `ops-github` plugin's `create-github-repo` skill (`/init-github-repo`): private repository under the approved company org (github.com/acme-org-ops), origin configured.
   - If `ops-github` is not installed: tell the user to install it or create the private repo in github.com/acme-org-ops manually — code must live in company-managed storage.
6. **Triage and initial risk classification** — run the `golive-gate` plugin's `assess-risk-level` skill (`/assess-risk`). It asks the three triage questions (inbound, outbound, mass deployment — `triage` in `risk-criteria.json`) and records them in `## Change Triage`, then classifies.
   - **There is no code yet, so there is no evidence** — this is expected. The skill records the classification as **Provisional (intent-based)** with every answer marked "UNVERIFIABLE — no code yet". Tell the user plainly: the provisional tier sets what the playbook will require of them (independent review, approvals), it is re-verified against the actual codebase at `/release-review` and `/vibe-check`, and **BPT confirms the final level** after staging testing (it may go up or down; the agent itself never lowers it).
   - If `golive-gate` is not installed: tell the user to install it; leave the PROJECT.md Risk Level section with a `⚠️ classify before building` placeholder.
7. **Registration file** — write `docs/REGISTRATION.json` per `plugins/golive-gate/data/registration-doc.json`: a flat JSON object with exactly its 21 keys, in order.
   - **PRD first** (`prdRule`): when `docs/PRD.md` exists, read it before asking anything — ideally before step 6 too, so its users, data and integrations sections frame the triage and risk questions. Pre-fill every field whose `prd` hint the PRD answers (summary, related team, impact value, expected live date, deployment target, app integration, and triage/classification prompts), show the drafts to the owner as one list, and record them only once the owner confirms or corrects them.
   - Fill the derived fields from the steps above (project name, repo URL, start date, support contact, labels, triage, assessed risk, data classification). `project-status` is `"exploration"`; `live-date` and `bpt-confirmed-risk-level` are `null`.
   - Ask the owner for the **owner input** fields the PRD did not answer: `related-team` and `project-summary` (background and solution) are required; `expected-live-date`, `project-impact-value` (a number: the estimated annual value in IDR from manpower cost efficiency, revenue generated, or anything else — show the calculation for the owner to confirm), `deployment-target` (one of the listed values) and `app-integration` are optional — `null` when the owner has no answer. Never invent a value.
   - A required field still missing → do not write the file; tell the owner which fields are missing.
   - Tell the owner to upload it to the **Alpha Projects Registry** form before development starts — Power Automate fills the registry from it.

## Report

- What was scaffolded and the repo URL
- Project Owner and Support Contact as recorded
- The chosen GCP cost labels — Company / Division / Department (or a note for any still pending)
- The triage answers, and whether a Tech & Information Security review is required
- The provisional risk tier, its claimed criteria, and what that tier will require before go-live
- `docs/REGISTRATION.json` written — upload it to the Alpha Projects Registry form now
- The rest of the journey: **build by prompting normally** (guardians enforce stack, structure, security, dependencies, versioning) → staging via the deployment platform → BPT risk confirmation → required review (start it at least 2 weeks before the planned production date) → `/vibe-check` → production via the deployment platform
