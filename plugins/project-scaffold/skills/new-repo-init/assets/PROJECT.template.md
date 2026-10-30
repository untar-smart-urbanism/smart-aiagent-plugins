# PROJECT.md

Go-live review dossier for this tool. Reviewers and approvers read this file before the tool is released to others. Complete it via the `project-documenter` skill before pushing to GitHub or going live. Fields marked **(owner input)** must come from the project owner; never invent them. Keep this file updated when facts change: a material change to risk level, data used, or access scope may trigger re-review.

## Problem Being Solved

<!-- What problem this tool solves and for whom. One short paragraph. -->

## Project Owner

<!-- (owner input) The GitHub username of the person responsible for the tool — one login, no leading @, no URL.
Must be an existing GitHub account and a member of the acme-org-ops organization. Not a team name, not an email.
/vibe-check asks "is the project owner you (<your-github-login>)?" and records the answer here. -->

## Support Contact

<!-- (owner input) A single email address contacted when issues occur.
No public webmail (gmail, yahoo, hotmail, outlook, ...) and no shared lab/group account (alpha.lab01@..., sandbox@...)
— those leave nobody accountable. A personal company mailbox is preferred; a role/queue mailbox (ops-helpdesk@...)
is accepted with a warning. -->

## Vibe Start

<!-- ISO date (YYYY-MM-DD) the vibe-coding of this project started — used to measure
project-start → staging/production duration. Stamped once by /start-vibe (today's date) for
a new project, or by /adopt-vibe (the first git commit date) for an existing one. Left blank
here; if it stays blank, /vibe-check falls back to the earliest git commit date. Do not
overwrite an existing value. -->

## Stack Exceptions

<!-- Deviations from the allowed stack (`allowedStack` in plugins/golive-gate/data/build-contract.json).
Every row needs approval from a tech architect (Tech Architecture Group). Legacy projects (Vibe Start
before 2026-10-07) may keep their existing stack without a row, but MAJOR IMPROVEMENTS always need an
approved row, even for legacy projects and even on the allowed stack: new module/service/workspace,
DB migrations or schema changes, new frontend app, runtime/framework/ORM/DB swap, major framework
upgrade. The `stack-allowed` check parses the header columns by name; keep them exactly. -->

| Scope | Deviation | Approved by | Date | Link (ADR/ticket) |
|-------|-----------|-------------|------|-------------------|

## Label

<!-- (owner input) GCP labels for cost and budget management. Provide all three below.
- Company: exactly one of acme, acme-pay, acme-pa, acme-ventures, acme-retail, acme-travel, acme-an, acme-us, acme-intl, acme-rise, acme-gem (owning sister company).
- Division: exactly one of operations, finance, marketing, commercial.
- Department: free text — the owning department name (non-empty), recorded in lowercase.
Asked during /start-vibe; /vibe-check will not pass while Company or Division is empty/invalid or Department is empty. -->

- Company:
- Division:
- Department:

## Design Overview

<!-- Simple design overview: main components, data flow, key integrations. Detail lives in docs/ARCHITECTURE.md; the full design-review document (diagrams, transaction flows, database schema, external connections, financial-risk analysis) lives in docs/DESIGN.md. Keep this reviewer-readable. -->

## Change Triage

<!-- (owner input) The three questions that decide the path (risk-criteria.json triage). Answer yes/no.
Any yes → a Tech & Information Security review is required (recorded in Review Evidence), whether or not AI built it.
All no → internal use only; the owner and their manager own the risk and must understand it. The agent lists the applicable risks and how to mitigate them below (risk-criteria.json triage.noneRisks); no manager identity is recorded.
Handles PII or financial data either way → still consult R&D and Information Security. -->

- Inbound (reachable from outside the company):
- Outbound (calls the web or external APIs):
- Mass deployment (on many company devices):
- Risks and mitigations (only when all three are no):

## Risk Level

<!-- (owner input, confirm) Low / Medium / High per the Non-Tech Change Management playbook.
Low: small personal tool, no sensitive data.
Medium: used by a team, connects to company systems, uses internal or Restricted company data, automates regular work, or affects team decisions.
High: accessible outside the company or internet-facing, handles payments or money, uses sensitive personal or company data (Confidential data or specific personal data under UU PDP), is customer-facing, affects other services (e.g. BSC), or supports critical business processes.
An individual customer or seller's name, direct email, or phone is PII even alone. A legal-entity name, generic company channel, company NPWP or NIB is business data; a named partner representative remains identifiable unless GRC/Information Security documents an exception. Daily purchase/sales order items and values not linked to a customer are Internal; customer transaction history, complaints and feedback are Restricted. Coordinates linked to a person are that person's personal data.
A tool is not automatically Low just because it is small. When in doubt, consult Information Security.
BPT confirms the final level after staging testing (one of the BPT confirmers in risk-criteria.json bptConfirmation); it may be higher or lower than the assessment. Record it as:
BPT-confirmed: <low|medium|high> by <github-login> on <YYYY-MM-DD> -->

## Access Status

<!-- Internal-only or external access. State which and why. -->

## Data Used

<!-- Classification: the highest level used — Confidential / Restricted / Internal / Public (risk-criteria.json dataClassification). List the actual datasets and source systems with each one's level.
Confidential: encrypt at rest and in transit, owner and granted users only. Restricted: encrypt, mask or hash. Internal: never leaves company IT.
Specific personal data under UU PDP (health, biometric, genetic, criminal, children's, personal financial, political, sexual life, organization membership, device/browsing, education) → High, and record the DPIA here (link, date, reviewer). -->

## Data That Must Not Be Entered

<!-- e.g. KTP/NIK, personal NPWP, specific personal data under UU PDP (health, biometric, children's, device/browsing, ...), individual customer/seller names, direct emails and phones, home addresses, payroll data, personal financial accounts, passwords, access codes, confidential company information. Use synthetic data in development. Daily purchase/sales order items and values are internal operational data, not sensitive financial data merely because of monetary values or database storage. -->

## Login Method

<!-- Apps Gateway (approved company SSO, default) or Company Google OAuth login (external users without a company account, or fallback while Apps Gateway is not yet configured). No other method is permitted. -->

## Access Levels

<!-- Roles and permissions. Least privilege: users get only the access they need; not everyone is an administrator. Required detail for Medium and High risk. -->

## Access Approval Process

<!-- (owner input) Who approves access requests and how. -->

## Go-Live Steps

<!-- Deployment route and the approvals required for this risk level. Low: owner check. Medium: independent review — the reviewer must be neither the Project Owner nor the Support Contact above. High: the same independent review plus the formal Architecture, SRE, and Information Security review, concluded by a formal approval task approved by one of the formal approvers (risk-criteria.json tiers[high].formalApproval).
Start the review at least 2 weeks before the planned production deployment. -->

- Planned production:
- Review requested:

## AI Usage Record

<!-- Which AI tool was used, what it did, who checked the output, and what was fixed. Required for Medium and High.
Use only company-provided AI tools approved for app development (golive-gate.json ai-usage-recorded approvedAiTools). -->

| AI tool | What it did | Checked by | What was fixed |
|---------|-------------|------------|----------------|

## Review Evidence

<!-- (owner input) Who reviewed, when, and the sign-off record (approval email, review notes). Required before go-live for Medium and High risk.
Add a Tech & Information Security review entry when any Change Triage answer is yes.
High: 'Formal approval: approved by <github-login> on <YYYY-MM-DD> (<task link>)'. -->

## Security Notes

<!-- Key security measures and known gaps. Cross-reference docs/SECURITY.md rather than duplicating it. -->

## Hosting Location

<!-- The approved company platform where the tool runs. Personal or public platforms require formal approval. -->

## Recovery Procedures

<!-- Application rollback/restore steps where known. The backup pipeline or method is SRE-owned; record its status or "SRE follow-up" and a tracking reference if available. Missing backup details alone do not block go-live. -->
