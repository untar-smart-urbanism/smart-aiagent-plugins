---
name: assess-risk-level
description: Classify an AI-assisted tool as Low, Medium, or High risk per the Non-Tech Change Management playbook by interviewing the owner against data/risk-criteria.json, verifying every answer against the actual codebase, then recording the result in PROJECT.md. Use when starting a new tool, before the first share or deploy, when PROJECT.md Risk Level is empty, or when a material change occurs (new data source, external access, payments, new user group). Trigger on "assess risk", "what risk level is this", or "can I share/release this". Read the data file rather than classifying from memory; never classify from interview answers alone.
---

# Assess risk level

**Source of truth** for risk classification. Read `data/risk-criteria.json` (relative to the installed `golive-gate` plugin) — never classify from memory.

## When to use (do not wait for the user to ask)

1. A new tool or project is being started
2. The user is about to share, deploy, push, or release a tool for the first time
3. `PROJECT.md` exists but its `## Risk Level` section is empty
4. A material change matches an `escalationTriggers` entry (new data source, external access, payments, new user group, critical process)
5. The user asks "what risk level is this" or "can I share this"

## Steps

1. **Load** `data/risk-criteria.json`.
2. **Interview** the owner using the `interview` questions from the JSON — this is a **required** step, not optional. Ask in plain language. You may skip a question **only** if PROJECT.md already records an explicit owner answer for it; a code signal is **never** a substitute for the owner's answer. For **owner-confirmed** questions (`exposure`, `criticality`, and any data sensitivity the code cannot settle) you **must** obtain the owner's answer before classifying — surface any `codebaseSignals` you found as part of the question, and keep asking until each is answered or the owner **explicitly defers** it (record the deferral and classify one tier up). Where a question carries `followUps`, ask them too — for the `data` question they are what decides whether an email is PII, whether an operational report is High, and whether position data matters at all (see step 4's carve-out rules).
3. **Verify every answer against the codebase — never trust the interview alone** (the JSON's `evidenceRule`):
   - For each question, scan the repository for its `codebaseSignals`: dependencies in package.json/lockfiles, imports, configs, `.env.example`, schemas/migrations, sample data, deploy manifests, CI workflows.
   - Mark each answer **CONFIRMED** (evidence agrees), **CONTRADICTED** (evidence disagrees — cite the file), or **UNVERIFIABLE** (human-judgment or **owner-confirmed** question — e.g. `criticality`, `exposure`).
   - **Evidence wins.** If the owner says "no payments" but a payment SDK is in the code, classify as if the answer were "yes". An answer can raise the tier but never lower it below what the code shows. Only a BPT confirmation (`bptConfirmation`) can lower a level — never lower it yourself. **Exception — owner-confirmed criteria** (`exposure`, `criticality`; the JSON's `exposureRule`): code signals **prompt the question** but do not set the tier by themselves; the owner's confirmation governs, and unresolved `exposure` is classified one tier up.
   - **No code yet?** (fresh scaffold, pre-build — the JSON's `provisionalRule`): there is nothing to verify. Mark every answer "UNVERIFIABLE — no code yet", classify from the claimed answers, and record the result as **PROVISIONAL (intent-based)**. Do not fail or block: a provisional classification is the expected outcome at project start. It is re-verified automatically by `review-before-release` and `check-golive-readiness` once code exists.
4. **Classify** from the combined answers-plus-evidence:
   - Evaluate **High** criteria first, then **Medium**, then **Low**. High and Medium match on **any** criterion; Low requires **all** of its criteria. The highest matching tier wins.
   - State the escalation rule verbatim: *a tool is not automatically Low just because it is small — if it uses sensitive data or connects to important systems, it is Medium or High.*
   - Apply `triage`: record the inbound / outbound / mass-deployment answers in PROJECT.md `## Change Triage`. Any yes → note that a Tech & Information Security review is required (any tier); all no → the owner and their manager own the risk: tell the owner which `triage.noneRisks` apply and how to mitigate each, so they can share it with their manager. Never ask for the manager's name or GitHub account.
   - Apply `dataClassification` (record the highest of Confidential / Restricted / Internal / Public in `## Data Used`) and `pdpRules` (any specific personal data → High and a DPIA).
   - Apply the JSON's five carve-out rules — read them, do not classify from memory:
     - **`exposureRule`** — internet/public exposure must be **owner-confirmed**, never inferred from code.
     - **`financialDataRule`** — daily purchase/sales order values not linked to a customer are internal operational data, even in a database; customer transaction history, complaints, and feedback are Restricted; payments, payouts, settlement, personal financial accounts, and other money-determining uses are assessed separately.
     - **`personalDataRule`** — an individual customer or seller's name, direct email, or phone is PII even alone. A legal-entity name or generic company channel is business data. A named business-partner person remains identifiable absent a documented GRC/Information Security exception. An internal access-control email alone does not automatically make an app High.
     - **`locationDataRule`** — position data linked to no person is not personal data and never High on its own; coordinates linked to an identified individual are that person's personal data under UU PDP — classify on the personal data present, including the location.
     - **`operationalDataRule`** — daily purchase/sales order items and values, reports, and stock counts are internal, not sensitive financial data solely due to monetary values or database storage; internal data still makes a tool at least Medium. High can arise from payment or money-determining functions, other sensitive data, exposure, or criticality.
   - `policyExceptions` distinguishes the 2026-07-29 GRC-confirmed historical exceptions from the 2026-09-26 owner update. Never describe the new business-contact or daily-transaction rules as already approved by GRC. If a named partner person's status is disputed, record the question for GRC/Information Security; do not silently exempt them.
   - If answers are ambiguous or contradicted evidence cannot be resolved with the owner, classify **one tier up** and note "confirm with Information Security".
5. **Record in PROJECT.md**:
   - Fill `## Risk Level` with: the tier, the matched criteria, **the verification result per answer (with contradicting file paths)**, the date, and who classified it. For a no-code-yet classification, prefix the tier with **"Provisional (intent-based)"** and note "re-verify against codebase before release".
   - Seed `## Go-Live Steps` with the tier's `requirements` and `approvals` from the JSON, and state that BPT confirms the final level after staging (`bptConfirmation`). Never write a `BPT-confirmed:` line yourself — BPT records it.
   - Fill `## Change Triage` with the triage answers and, when all are no, the applicable risks and mitigations.
   - Fill `## Data Used` and `## Access Status` from **verified** findings **only if empty**.
   - Never overwrite existing `(owner input)` content — confirm with the owner or append.
6. **No PROJECT.md?** Do not invent a file — direct the user to the `project-scaffold` plugin's `new-repo-init` skill to create the dossier, then re-run this skill.

## Output

A classification summary:

| Field | Value |
|-------|-------|
| Risk level | Low / Medium / High |
| Matched criteria | ... |
| Answer verification | per question: CONFIRMED / CONTRADICTED (file) / UNVERIFIABLE |
| Required next | tier `requirements` from the JSON |
| Approvals needed | tier `approvals` from the JSON |

If any answer was CONTRADICTED, state it explicitly to the owner — the classification used the evidence, not the answer.

Then state what the tier requires before release (see `review-before-release`) and go-live (see `check-golive-readiness`).
