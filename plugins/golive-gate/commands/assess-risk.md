---
name: assess-risk
description: Classify this tool Low/Medium/High risk per the Non-Tech Change Management playbook and record the result in PROJECT.md.
---

# Assess risk level

Run the `assess-risk-level` skill from the `golive-gate` plugin.

## Steps

1. Read `plugins/golive-gate/data/risk-criteria.json` (or installed plugin path).
2. Interview the owner with the JSON's questions; skip ones already answered by PROJECT.md or context.
3. **Verify each answer against the codebase** using the question's `codebaseSignals` (deps, imports, configs, schemas, sample data, deploy manifests). Mark CONFIRMED / CONTRADICTED (cite the file) / UNVERIFIABLE. Evidence wins — an answer never lowers the tier below what the code shows.
4. Classify from answers-plus-evidence: High first, then Medium, then Low — highest match wins; size never lowers risk; ambiguous or unresolved contradiction → one tier up + "confirm with Information Security".
5. Record tier, matched criteria, per-answer verification results, date, and classifier in PROJECT.md `## Risk Level`; seed `## Go-Live Steps` with the tier's requirements and approvals.
6. If no PROJECT.md exists, direct the user to `project-scaffold`'s `new-repo-init`, then re-run.

## Report

- Risk level with matched criteria
- Verification result per answer, calling out any contradiction explicitly
- What this tier requires before release and go-live
- Approver roles for the tier
