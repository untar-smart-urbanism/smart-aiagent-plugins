---
name: propose-knowledge
description: Prepare a reviewed, sanitized knowledge card and generated catalog diff in a writable vibe-knowledge checkout, then open a pull request for the main PIC rather than publishing directly.
---

# Propose knowledge publication

This is the manual review path. For a single command that captures the current chat and opens the review PR, use `publish-knowledge`.

1. Use a separate writable clone of `acme-org-ops/vibe-knowledge`, not the read-only recall cache. Work on a new branch; never push directly to the default branch. Confirm the card's target project Git remote and whether `shared` scope is appropriate for every repo reader.
2. Check the draft against current code and durable evidence. Verified cards need a reproduced/reviewed/deployed level and non-chat evidence. `candidate` cards stay local. Inspect the entire JSON for real PII, secrets, internal credentials, confidential review details, and raw transcript excerpts; regex screening is only a backstop.
3. Run `node <plugin-root>/scripts/knowledge.js prepare --repo <writable-clone> --card <local-draft.json> --project <source-remote-url>`. It writes the card and regenerates `catalog.json`. Then run `node <plugin-root>/scripts/knowledge.js validate --repo <writable-clone>` and inspect `git diff` for the complete change.
4. Present the exact proposed card and diff to the coder. Once the coder approves publication, commit and push the branch and create a PR targeting the knowledge repo's default branch. Request review from `acme-org-jane-doe`; the protected branch and CODEOWNERS provide the final approval. Do not merge the PR yourself.

Do not add GitHub Actions just to validate this repo. If GitHub access is unavailable, leave the reviewed local branch ready and report the missing remote step.
