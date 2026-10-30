# Go-live gate data

Machine-readable policy for the `golive-gate` plugin, encoding the **Non-Tech Change Management with AI Assistance Playbook**. Skills read these files instead of answering from memory.

## Files

| File | Playbook section | Consumed by |
|------|-----------------|-------------|
| `risk-criteria.json` | §1 Choose the Risk Level | Skill `assess-risk-level` |
| `review-checklist.json` | §5 Review Before Release | Skills `review-before-release`, `seal-review-proof` |
| `review-proof.json` | §5 Review Before Release (reviewer-sealed proof) | Skill `seal-review-proof`, read by `check-golive-readiness` |
| `golive-gate.json` | §6 Go-Live Rules | Skill `check-golive-readiness` |
| `never-log.json` | §3 Use AI Safely + §6 Go-Live Rules | All skills, rule `golive-gate-enforcement`, and OWASP code-review workflows |
| `remediation-tiers.json` | Brownfield adoption (BLOCKING vs ADVISORY legacy findings) | Skill `check-golive-readiness` and project-scaffold's `/adopt-vibe` |
| `test-policy.json` | Testing before go-live — severity map (category → High/Medium/Low), test-type expectations, hermetic auto-run policy, bounded High-severity fix loop (maxAttempts, NEEDS-HUMAN on exhaustion) | Skill `generate-test-scenarios`; severity vocabulary read by `check-golive-readiness` and `seal-review-proof` |
| `release-doc.json` | Deployment handoff — spec/contract for the `vibe-release.json` file: our governance + registry record | Skill `check-golive-readiness` (directly via `/vibe-check`, and chained by `seal-review-proof` after sealing a proof) |
| `build-contract.json` | vibe-code-and-deploy phases 1, 2 and 5 — the fixed command names, the repo's own `## Build and run` section in CLAUDE.md/AGENTS.md, and the deployment assets whose absence is silent (untracked coverage report, unpatched base image, the platform's injected CommonJS stubs, a gate record naming a commit already shipped past) | Skill `check-build-contract`, chained automatically — `vibe-code-and-deploy` at the exits of phases 2 and 5, `check-golive-readiness` as prerequisite 0, `golive-gatekeeper` before release-like actions and after the onboarding commit; `stages` defines each subset. `/vibe-conform` is the ad-hoc entry point — a High-severity failure stops the gate, Low/Medium is carried into the record |

## Key rules encoded

- **The contract is executable, not just written down** — `scripts/check-build-contract.js` is the
  implementation and `build-contract.json` is the rule set it reads. Callers run the script; they do
  not re-derive the rules. `scripts/selftest-check-build-contract.js` breaks a conforming fixture one
  rule at a time and asserts each finding fires at its stated severity, because a check that silently
  never fires is worse than no check — the first hand-rolled version of this logic passed
  `FROM oven/bun:latest` without a word.
- **The contract is checked, not recommended** (`build-contract.json`) — every rule in it is already stated in prose in `vibe-code-and-deploy`, and every one was missed by at least one app delivered on that skill. A command name is fixed exactly as hard as a library name: `test:integration` never `itest`, `typecheck` never `check`, and a command that does not apply is declared and exits 0 rather than omitted. Findings are reported, never fixed by weakening the check.
- **Evidence wins** — interview answers are claims; each question carries `codebaseSignals` the agent must scan for. When code contradicts an answer, classification follows the code and the discrepancy is recorded. Answers can raise a tier, never lower it below the evidence. BPT confirms the final level (`bptConfirmation`) and may raise or lower it.
- **Highest tier wins** — evaluate High criteria first; size never lowers risk (a small tool touching sensitive data is not Low).
- **Data classification** (`risk-criteria.json`) — the 2026-07-29 GRC confirmation covered earlier carve-outs; the 2026-09-26 owner update classifies individual customer/seller name, email, and phone as PII, legal-entity names and generic company channels as business data, and daily purchase/sales order items and values as internal operational data even in a database. A named partner representative remains an identifiable person absent documented GRC/InfoSec guidance. Do not claim the owner update was GRC-approved. The October 2026 procedure adds four classification levels (`dataClassification`), UU PDP rules (`pdpRules`), triage (`triage`), and makes customer transaction history, complaints, and feedback Restricted.
- **Registration file** (`registration-doc.json`) — the flat `docs/REGISTRATION.json` (21 keys, pre-filled from `docs/PRD.md` when present) that `/start-vibe` writes for the Alpha Projects Registry form (Power Automate).
- **SRE backup follow-up** (`golive-gate.json` `backup-recovery`) — track the backup pipeline or method with SRE; missing details are advisory, not a blocker by themselves. Application rollback instructions remain separate.
- **Independence** — Medium and High risk require a reviewer who is not the builder. Enforced as a **role exclusion**: the sealing reviewer must be neither the **Project Owner** nor the **Support Contact** recorded for the project (`review-proof.json` `independence`). Appearing among the repo's git commit authors does **not** disqualify a reviewer. An unresolvable owner/support pair is UNDETERMINED → INCOMPLETE, never a default pass. The agent gathers evidence but never self-certifies.
- **Approvals are recorded, not granted** — the agent verifies human sign-offs exist in PROJECT.md Review Evidence; it never grants them.
- **Owner and support contact are typed identities** (`golive-gate.json` item `ownership-support-contacts`, `fields`) — `## Project Owner` is a **GitHub username** that must exist and be a acme-org-ops member; `## Support Contact` is a single **email** with public webmail and shared lab/group accounts rejected. `/vibe-check` owns the ask-and-rewrite (it asks "is the project owner you?" using the running user's `gh` login) and is the only place that edits them; the review skills report violations but never fix them. Exact identifiers are also what makes the independence check strict rather than fuzzy.

## Record of truth

Gate results are written to the project's `PROJECT.md` go-live dossier (scaffolded by the `project-scaffold` plugin) — the gate never creates a new file. For brownfield-adopted projects the gate additionally *reads* the remediation backlog (default `docs/REMEDIATION.md`), which is written and reconciled by project-scaffold's `/adopt-vibe`.

## Updating

Edit the JSON files, bump `plugin.manifest.json` version, run `npm run validate` from repo root.
