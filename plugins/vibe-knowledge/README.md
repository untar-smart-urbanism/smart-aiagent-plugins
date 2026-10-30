# Vibe Knowledge plugin

Project-scoped collective knowledge for Alpha vibe coders. The plugin lives in this marketplace; approved cards live in the separate private `acme-org-ops/vibe-knowledge` repository. Raw chat histories stay on each coder's workstation.

## Actions

- `publish-knowledge`: one call captures the current chat, checks evidence and redaction, and opens a PR for the main PIC. Claude Code and Cursor expose `/publish-knowledge`; Codex exposes the `publish-knowledge` skill.
- `capture-project-knowledge`: make local, evidence-linked candidates from the current chat or an explicitly selected export.
- `recall-project-knowledge`: refresh the read-only cache, search a compact topic index, and open at most five relevant cards.
- `audit-knowledge-conflicts`: inspect stale or contradictory cards in small groups.
- `propose-knowledge`: prepare a sanitized card and catalog diff for the main PIC's PR review.

`scripts/knowledge.js` implements remote normalization, catalog generation/validation, cached refresh, deterministic search, limited card loading, and proposal preparation. Run `node scripts/knowledge.js <action>` for usage. The companion repository starter is under `assets/knowledge-repo/`.

The publisher handles a local draft of 1-20 distinct, evidence-backed cards with `node scripts/knowledge.js publish --cwd <project-root> --draft <local-draft.json>`. Twenty is a ceiling, not a goal. It clones the private knowledge repo, creates a branch, validates, commits, pushes, and opens a PR. Invoke the skill or command for the complete capture workflow; coders do not need to run those steps separately. Git and GitHub CLI authentication are required. The main PIC's review is the publication gate.

## Install

- Claude Code: `/plugin install vibe-knowledge@smart-aiagent-plugins`
- Codex: `codex plugin add vibe-knowledge@smart-aiagent-plugins`

First register the private marketplace using the instructions in the root README and authenticate Git access to `acme-org-ops/vibe-knowledge`. The knowledge repository needs read access for recall; opening PRs needs contributor access.
