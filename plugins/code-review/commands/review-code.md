---
name: review-code
description: Manual OWASP review of current changes (git diff or selected files) against the secure coding checklist. Read-only audit — does not modify code unless user asks to fix.
---

# Review code (OWASP) — changed files

Manual audit for **existing projects**. Review **changed or selected** code against the `code-review` plugin OWASP checklist.

## Steps

1. Read skill `owasp-code-review`.
2. Load `data/owasp-checklist.json`.
3. Identify changed files (`git diff`, PR diff, or user selection).
4. Map files to the applicable checklist sections (26 in total — OWASP core, the org's API/PAN/AI sections, and the security-pattern sections).
5. Evaluate each applicable item — pass or fail.
6. Report must-fix issues with file paths and concrete fixes.
7. Confirm: input validation, output encoding, auth, access control, DB parameterization, no secret leaks.

## Scope

- **This command:** changed/selected files only
- **Full repo audit:** use `/audit-security`

## Reference

https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist

Do not approve code with open must-fix OWASP violations. Offer to fix issues if the user wants remediation.
