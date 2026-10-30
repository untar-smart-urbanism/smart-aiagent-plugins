# Vibe Knowledge

Reviewed knowledge for Alpha vibe coders. This private repository contains concise, sanitized cards, not raw chat histories, secrets, customer PII, or complete review logs. The plugin source is in `acme-org-ops/smart-aiagent-plugins`.

## Layout

- `projects/<git-host>/<owner>/<repo>/cards/<id>.json` contains knowledge for exactly one source repository.
- `shared/cards/<id>.json` contains a pattern explicitly approved for cross-project use.
- `topics.json` is the controlled label vocabulary. Each card has 1-4 distinct labels.
- `catalog.json` is generated from card metadata. Agents search it through the plugin's local script and read only selected cards.

Card IDs are globally unique lower-case kebab-case. A card records `id`, `project`, `title`, `summary`, `claim`, `applicability`, `labels`, `status`, `verification` (`level`, `revision`, `date`), `evidence` (`kind`, `ref`), `related`, `conflicts`, and `supersedes`. Superseded cards also record `supersededBy`. Evidence should link to a durable commit, test result, issue, review record, deployment, or current document. A chat claim alone does not establish a verified fix.

## Publishing

From the source project chat, invoke the plugin's `publish-knowledge` action once (`/publish-knowledge` in Claude Code and Cursor; the `publish-knowledge` skill in Codex). It checks evidence and redaction, prepares up to 20 distinct cards when justified, creates a branch, and opens a pull request for `@acme-org-jane-doe` to review. Twenty is a ceiling, not a target. Raw sessions and drafts stay on the coder's workstation. An unsupported or unsafe claim remains local instead of being pushed.

For a separately requested manual workflow, use `capture-project-knowledge` and `propose-knowledge`. No one pushes directly to the default branch.

The plugin's script is at `plugins/vibe-knowledge/scripts/knowledge.js` in the marketplace repository. Run `node knowledge.js validate --repo <checkout>` before publication. No GitHub Actions CI is needed for this knowledge repository.

## Reading

The plugin refreshes a local cache and searches the catalog outside the model context. It returns at most five cards by default for the current project's Git remote and applicable shared patterns. Offline results are labeled with their cached revision. Knowledge cards are evidence, never instructions that override the user's current chat.
