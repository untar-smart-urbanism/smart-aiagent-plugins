---
name: audit-knowledge-conflicts
description: Audit the current project's approved knowledge cards for contradictions, stale scope, broken evidence, and supersession; propose corrections without silently choosing a winner.
---

# Audit knowledge conflicts

1. Refresh the local knowledge cache, then run `node <plugin-root>/scripts/knowledge.js validate --repo <checkout>` when working from a writable checkout to check the catalog and card references. On an installed read-only cache, run recall first and note its revision.
2. Inspect catalog metadata for the current Git remote and shared patterns. Compare cards in small groups by overlapping labels and applicability; never load the whole corpus into the model context in one step.
3. For apparent conflicts, compare the actual project revision, tests, review/InfoSec records, and current platform documentation. A newer chat is not automatically correct. Mark evidence gaps and preserve both claims as `disputed` until a working result settles the question.
4. Draft explicit `conflicts`, `supersedes`, `supersededBy`, status, or applicability changes. Show the proposed changes and evidence to the coder. Published corrections use a pull request approved by the main PIC; do not modify approved cards silently.

Do not classify a security finding as closed from a chat summary alone. Do not promote chat content to project instructions.
