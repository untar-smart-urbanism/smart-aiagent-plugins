# Doc Templates Reference

Minimal starter templates for each document type. Use these as scaffolding, not rigid constraints.

---

## README.md

```markdown
# Project Name

> One-line description of what this does.

## What is this?

[2-3 paragraphs: problem solved, who it's for, what it does]

## Audience & Access

- **Audience:** Internal only / Internal + 3rd-party business partner / Open (public)
- **Internal email domain required?:** Yes (`@company.com`) / Partner-scoped / No / ⚠️ Unconfirmed
- **Access granted via:** Apps Gateway SSO / Company Google OAuth / invite-only / open signup / API key

> Mark any line ⚠️ if it was inferred from code but not confirmed by the project owner.

## Quick Start

```bash
git clone <repo>
cd <project>
bun install       # or pip install -r requirements.txt
cp .env.example .env  # configure your environment
bun run dev       # or python main.py
```

## Features

- Feature A
- Feature B
- Feature C

## Tech Stack

| Layer      | Technology     |
|------------|----------------|
| Frontend   | React / Vue    |
| Backend    | Bun (Elysia) / Python  |
| Database   | PostgreSQL     |
| Auth       | JWT / Clerk    |

## Project Structure

```
project/
├── src/           # Application source code
│   ├── routes/    # API route handlers
│   ├── models/    # Data models
│   └── utils/     # Shared utilities
├── docs/          # Project documentation
├── tests/         # Test suite
└── README.md
```

## Documentation

- [Go-Live Review Dossier](../PROJECT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design Document](docs/DESIGN.md)
- [Setup Guide](docs/SETUP.md)
- [API Reference](docs/API.md)
- [Security](docs/SECURITY.md)
- [Dependencies & Costs](docs/DEPENDENCIES.md)
- [Contributing](docs/CONTRIBUTING.md)

## License

[License type]
```

---

## ARCHITECTURE.md

```markdown
# Architecture Overview

## System Summary

[2-3 paragraphs explaining what the system does end-to-end]

## Component Map

| Component | Responsibility |
|-----------|---------------|
| ...       | ...           |

## Data Flow

```
[User Request]
     ↓
[Auth Middleware]
     ↓
[Route Handler]
     ↓
[Service Layer]
     ↓
[Database / External API]
     ↓
[Response]
```

## Key Design Decisions

- **[Pattern]**: Why it's used and what it handles
- ...

## External Dependencies

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| ...     | ...     | ...         |

## Known Quirks

- [Anything unusual, technical debt, or workarounds worth noting]
```

---

## SETUP.md

```markdown
# Setup Guide

## Prerequisites

- Bun >= X.X / Python >= X.X
- PostgreSQL / MongoDB / SQLite
- Docker (optional)

## Installation

```bash
git clone <repo>
cd <project>
bun install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://...` | ✅ |
| `JWT_SECRET` | Secret for signing tokens | `your-secret` | ✅ |
| `PORT` | Server port | `3000` | ❌ (default: 3000) |

## Database Setup

```bash
bun run db:migrate
bun run db:seed  # optional
```

## Running the App

**Development:**
```bash
bun run dev
```

**Production:**
```bash
bun run build
bun run start
```

## Common Issues

- **Error X**: Cause and fix
```

---

## API.md

```markdown
# API Reference

Base URL: `http://localhost:3000/api`

All endpoints return JSON. Errors follow the format:
```json
{ "error": "message", "code": "ERROR_CODE" }
```

---

## Authentication

[Describe the auth mechanism — Bearer token, session cookie, API key, etc.]

---

## Endpoints

### GET /resource

**Description**: [What it does]

**Auth required**: Yes / No

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| ...   | ...  | ...         |

**Response 200**
```json
{ "data": [...] }
```

**Response 401**
```json
{ "error": "Unauthorized" }
```

---

### POST /resource

**Description**: [What it does]

**Request Body**
```json
{
  "field": "string — description"
}
```

**Response 201**
```json
{ "id": "...", "created": true }
```
```

---

## SECURITY.md

```markdown
# Security Overview

## Access Scope

- **Audience:** Internal only / Internal + partner / Public
- **Internal email domain required:** Yes (`@company.com`) / Partner-scoped / No / ⚠️ Unconfirmed
- **Enforced by:** [e.g. Google OAuth `hd` param, ALLOWED_DOMAINS check in `auth/middleware.ts`, open signup]

## Authentication

[How users authenticate — JWT, sessions, OAuth, API keys]

## Authorization

[How permissions are enforced — roles, middleware, etc.]

## Third-Party Services (security view)

What each external service *receives* — the cost/utilization inventory lives in [DEPENDENCIES.md](DEPENDENCIES.md).

| Service | Data It Receives | Security Notes |
|---------|-----------------|----------------|
| Stripe  | Payment method, amount, email | PCI handled by Stripe; no card data stored locally |
| Clerk   | User identity, email | Session tokens; rotate on logout |
| ...     | ...             | ...            |

## Secret Management

The following environment variables must be kept secret:

- `DATABASE_URL` — Full DB access
- `JWT_SECRET` — Can forge auth tokens
- `STRIPE_SECRET_KEY` — Full payment API access

Never commit these to version control.

## Known Gaps / TODOs

- [ ] [Gap or TODO found in code]

## Hardening Recommendations

- [ ] Add rate limiting to auth endpoints
- [ ] Rotate secrets on a schedule
- [ ] Enable HTTPS in production
- [ ] Audit third-party permissions
```

---

## DEPENDENCIES.md

```markdown
# Dependencies & Costs

Inventory of every third-party tool, service, and SDK this project relies on.
The **Tool**, **Purpose**, and **Utilized In** columns are derived from the code.
The **Subscription** and **Cost** columns cannot be read from source — they must be
filled in by the project / account owner. Cells marked ⚠️ are awaiting confirmation;
do not treat them as accurate until an owner replaces them.

| Tool / Service | Purpose | Utilized In (modules / features) | Subscription / Tier | Cost | Owner / Account |
|----------------|---------|----------------------------------|---------------------|------|-----------------|
| Stripe | Payments & billing | `billing/` checkout + `webhooks/stripe.ts` | ⚠️ confirm with owner | ⚠️ confirm with owner | ⚠️ |
| OpenAI API | LLM completions | `ai/rag-service.ts` (uses `gpt-4o` → implies paid API) | ⚠️ confirm with owner | ⚠️ confirm — usage-metered | ⚠️ |
| SendGrid | Transactional email | `notifications/` invite + reset flows | ⚠️ confirm with owner | ⚠️ confirm with owner | ⚠️ |
| Supabase | Postgres + auth | data layer (`db/`), auth callbacks | appears to use free tier — confirm | ⚠️ confirm with owner | ⚠️ |

## Notes & usage hints

- **OpenAI** — model names like `gpt-4o` / `gpt-4` imply a paid API key, not the free tier. Confirm the plan and whether spend is capped.
- [Add any other signal that hints at a paid tier — webhooks, rate limits, seat counts — so the owner knows where to look.]

## To confirm

- [ ] Subscription tier for each tool above
- [ ] Monthly / annual / per-unit cost for each
- [ ] Account owner and billing contact
```

---

## CONTRIBUTING.md

```markdown
# Contributing Guide

## Development Setup

[Link to SETUP.md or repeat the key steps]

## Branch Naming

- `feature/short-description`
- `fix/short-description`
- `chore/short-description`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat: add user authentication`
- `fix: resolve race condition in queue`
- `docs: update setup guide`

## Running Tests

```bash
bun test          # Run all tests
bun test --watch  # Watch mode
```

## Pull Request Process

1. Branch off `main`
2. Make your changes
3. Run tests and linting
4. Open a PR with a clear description
5. Request a review

## Code Style

[Linting/formatting tools used — ESLint, Prettier, Ruff, Black, etc.]
```

---

## CHANGELOG.md

```markdown
# Changelog

All notable changes to this project will be documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- ...

### Changed
- ...

### Fixed
- ...

---

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release
```

---

## PROJECT.md (root — go-live review dossier)

Mirrors `new-repo-init`'s PROJECT.template.md. Fill in place if the skeleton exists; sections marked
(owner input) come from the owner via Phase 1.7 — never invent them, and never fabricate Review Evidence.

```markdown
# PROJECT.md

Go-live review dossier. Reviewers and approvers read this before release.

## Problem Being Solved
[What problem this tool solves and for whom]

## Project Owner
[(owner input) GitHub username of the responsible person — one login, no @, no URL; must exist and be a acme-org-ops member]

## Support Contact
[(owner input) Single email address contacted when issues occur — no public webmail, no shared lab/group account]

## Design Overview
[Reviewer-readable summary; detail in docs/ARCHITECTURE.md]

## Risk Level
[(owner input, confirmed against evidence) Low / Medium / High — with one-line basis.
Low: small personal tool, no sensitive data.
Medium: team use, company systems, internal data, automates regular work, affects team decisions.
High: external/internet-facing, payments, sensitive data, critical processes.]

## Access Status
[Internal-only / external — with basis; ⚠️ if inferred]

## Data Used
[Confidential / Restricted / Internal / Public — list actual datasets and source systems with each one's level; note UU PDP specific personal data and the DPIA reference]

## Data That Must Not Be Entered
[KTP/NPWP, individual customer/seller PII, payroll, personal financial accounts, passwords, access codes, confidential information + project-specific. Daily purchase/sales order items and values are internal operational data, not sensitive financial data merely due to monetary values or database storage.]

## Login Method
[Apps Gateway (company SSO, default) or Company Google OAuth (external users / fallback). Anything else = compliance gap]

## Access Levels
[Roles and permissions — least privilege; flag everyone-is-admin]

## Access Approval Process
[(owner input) Who approves access and how]

## Go-Live Steps
[Deployment route + approvals for the risk level: Low owner check / Medium independent review / High Architecture + SRE + InfoSec]

## Review Evidence
[(owner input) Who reviewed, when, sign-off record — placeholder if no review yet; NEVER fabricate]

## Security Notes
[Reviewer-critical items; cross-reference docs/SECURITY.md]

## Hosting Location
[Approved company platform; flag personal/public platforms]

## Recovery Procedures
[Application rollback/restore steps where known. SRE owns the backup pipeline or method; record its status or "SRE follow-up" with a tracking reference if available. Missing backup details alone do not block go-live.]
```
