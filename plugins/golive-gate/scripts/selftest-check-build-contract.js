#!/usr/bin/env node
/**
 * Self-test for check-build-contract.js.
 *
 * Builds a minimal conforming repository in a temp directory, asserts it
 * PASSes, then breaks one thing at a time and asserts that the specific check
 * fires with the expected severity.
 *
 * This exists because the first hand-rolled implementation of these rules had a
 * predicate that silently never fired on `FROM oven/bun:latest` — a check that
 * always passes is worse than no check, and the only way to know the difference
 * is to watch each one fail on purpose.
 *
 * Usage: node selftest-check-build-contract.js
 * Exit:  0 all cases behaved as expected, 1 otherwise.
 */

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const CHECKER = path.join(__dirname, 'check-build-contract.js')

// Fixture commits get a fixed pre-cutoff date. stack-allowed falls back to the earliest
// commit date when PROJECT.md has no Vibe Start, so a wall-clock date made the legacy
// case flip the day the cutoff (2026-10-07) arrived.
const FIXTURE_DATE = '2026-08-15T10:00:00+07:00'

function sh(cwd, cmd, args) {
  execFileSync(cmd, args, {
    cwd,
    stdio: 'ignore',
    env: { ...process.env, GIT_AUTHOR_DATE: FIXTURE_DATE, GIT_COMMITTER_DATE: FIXTURE_DATE },
  })
}

function write(repo, rel, body) {
  const full = path.join(repo, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, body)
}

const AGENTS = `# Agents

## Build and run

| Command | What it does |
|---------|--------------|
| \`bun install --frozen-lockfile\` | Install every workspace from the committed lockfile |
| \`bun run dev\` | Watch mode |
| \`bun run build\` | Build the production artifact |
| \`bun run start\` | Run that artifact |
| \`bun run typecheck\` | Type check |
| \`bun run test\` | Hermetic suite |
| \`bun run test:coverage\` | The suite plus coverage/lcov.info |
| \`bun run test:integration\` | Playwright |
| \`bun run db:generate\` | drizzle-kit generate |

### Container

\`\`\`sh
container build -t demo .
container run --rm -p 3000:3000 -e DATABASE_URL='postgres://u:p@h:5432/d' demo
\`\`\`

- Listens on 3000.
- Health: \`GET /health\` and \`GET /api/health\`.

| Variable | Meaning |
|---|---|
| \`PORT\` | Port |
| \`DATABASE_URL\` | Connection string |
`

const DOCKERFILE = `FROM oven/bun:1.3.10-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN bun install

FROM base AS prod-deps
COPY package.json ./
RUN bun install --production

FROM base AS runtime
RUN apk upgrade --no-cache
RUN addgroup -g 10001 -S app && adduser -u 10001 -S -G app app
COPY --from=prod-deps /app/node_modules ./node_modules
USER 10001:10001
EXPOSE 3000
CMD ["bun", "run", "start"]
`

const PROJECT = `# PROJECT.md

## Project Owner

owner-login

## Support Contact

support.person@example.com

## Review Evidence

Reviewer: independent-person

Reviewed and approved on 2026-08-18.
`

function buildFixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-selftest-'))
  sh(repo, 'git', ['init', '-q', '-b', 'main'])
  sh(repo, 'git', ['config', 'user.email', 'selftest@example.com'])
  sh(repo, 'git', ['config', 'user.name', 'selftest'])

  write(
    repo,
    'package.json',
    JSON.stringify(
      {
        name: 'demo',
        scripts: {
          dev: 'x',
          build: 'x',
          start: 'x',
          typecheck: 'x',
          test: 'x',
          'test:coverage': 'sh scripts/coverage.sh',
          'test:integration': 'x',
          'db:generate': 'x',
        },
      },
      null,
      2,
    ),
  )
  write(repo, 'AGENTS.md', AGENTS)
  // Both names, one file: CLAUDE.md is a symlink, committed as mode 120000.
  try {
    fs.symlinkSync('AGENTS.md', path.join(repo, 'CLAUDE.md'))
  } catch (e) {
    if (e.code !== 'EPERM') throw e
    // Windows without Developer Mode cannot create symlinks. Commit the link
    // the way git itself does with core.symlinks=false: a file holding the
    // target, staged as mode 120000 — the committed mode is what the check reads.
    sh(repo, 'git', ['config', 'core.symlinks', 'false'])
    write(repo, 'CLAUDE.md', 'AGENTS.md')
    const blob = execFileSync('git', ['hash-object', '-w', 'CLAUDE.md'], { cwd: repo, encoding: 'utf8' }).trim()
    sh(repo, 'git', ['update-index', '--add', '--cacheinfo', `120000,${blob},CLAUDE.md`])
  }
  write(repo, 'Dockerfile', DOCKERFILE)
  write(repo, '.env.example', 'PORT=3000\nDATABASE_URL=postgres://u:p@h:5432/d\n')
  write(
    repo,
    'sonar-project.properties',
    'sonar.sources=src\nsonar.javascript.lcov.reportPaths=coverage/lcov.info\n',
  )
  write(repo, 'coverage/lcov.info', 'TN:\nend_of_record\n')
  write(repo, 'src/index.ts', 'export const ok = true\n')
  write(repo, 'PROJECT.md', PROJECT)
  write(
    repo,
    'scripts/coverage.sh',
    '#!/bin/sh\nbun test || exit 1\ncp lcov coverage/lcov.info\n[ -s coverage/lcov.info ] || exit 1\n',
  )

  sh(repo, 'git', ['add', '-A'])
  sh(repo, 'git', ['commit', '-qm', 'fixture'])

  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  write(repo, 'vibe-release.json', JSON.stringify({ 'target-commit-hash': head }, null, 2))
  sh(repo, 'git', ['add', '-A'])
  sh(repo, 'git', ['commit', '-qm', 'chore: record the gate verdict'])

  return repo
}

/**
 * stack-allowed fixtures: a root that declares `apps/*` workspaces, one
 * workspace package.json, and an optional Vibe Start / Stack Exceptions block.
 */
function stackFixture(repo, { deps, vibeStart, exceptions, track }) {
  const root = path.join(repo, 'package.json')
  const d = JSON.parse(fs.readFileSync(root, 'utf8'))
  d.workspaces = ['apps/*']
  fs.writeFileSync(root, JSON.stringify(d, null, 2))
  write(repo, 'apps/api/package.json', JSON.stringify({ name: 'api', dependencies: deps }, null, 2))
  let project = PROJECT
  if (vibeStart !== undefined) project += `\n## Vibe Start\n\n${vibeStart}\n`
  if (exceptions !== undefined) project += `\n## Stack Exceptions\n\n${exceptions}\n`
  write(repo, 'PROJECT.md', project)
  // Tracked means in the index. Staging without committing keeps HEAD where the
  // gate record points, so gate-record-names-head stays out of the result.
  if (track) sh(repo, 'git', ['add', '-A'])
}

const ALLOWED_DEPS = { elysia: '1.4.0', 'drizzle-orm': '0.44.0', postgres: '3.4.7' }

function check(repo, stage) {
  try {
    const out = execFileSync('node', [CHECKER, '--repo', repo, '--stage', stage, '--json'], {
      encoding: 'utf8',
    })
    return JSON.parse(out)
  } catch (e) {
    // Non-zero exit is expected for CONDITIONAL/FAIL; stdout still holds the JSON.
    return JSON.parse(e.stdout)
  }
}

// Each case: mutate the fixture, then expect a finding whose id starts with `expect`.
const CASES = [
  {
    name: 'contract script renamed to its common alias',
    expect: 'requiredScript:test:integration',
    severity: 'High',
    mutate(repo) {
      const p = path.join(repo, 'package.json')
      const d = JSON.parse(fs.readFileSync(p, 'utf8'))
      d.scripts.itest = d.scripts['test:integration']
      delete d.scripts['test:integration']
      fs.writeFileSync(p, JSON.stringify(d, null, 2))
    },
  },
  {
    name: 'CLAUDE.md committed as a copy rather than a symlink',
    expect: 'agentsFile:symlink',
    severity: 'High',
    mutate: (repo) => {
      sh(repo, 'git', ['rm', '-q', '--cached', 'CLAUDE.md'])
      fs.unlinkSync(path.join(repo, 'CLAUDE.md'))
      write(repo, 'CLAUDE.md', AGENTS)
      sh(repo, 'git', ['add', 'CLAUDE.md'])
    },
  },
  {
    name: 'only AGENTS.md exists — the alias name is missing',
    expect: 'agentsFile:both',
    severity: 'High',
    mutate: (repo) => {
      sh(repo, 'git', ['rm', '-q', '--cached', 'CLAUDE.md'])
      fs.unlinkSync(path.join(repo, 'CLAUDE.md'))
    },
  },
  {
    name: 'Build and run section removed',
    expect: 'agentsFile:section',
    severity: 'High',
    mutate: (repo) => write(repo, 'AGENTS.md', '# Agents\n\nNothing here.\n'),
  },
  {
    name: 'port disagrees between Dockerfile and .env.example',
    expect: 'agentsFile:port',
    severity: 'Medium',
    mutate: (repo) => write(repo, '.env.example', 'PORT=3010\nDATABASE_URL=x\n'),
  },
  {
    name: 'an env key the section never documents',
    expect: 'agentsFile:environment',
    severity: 'Medium',
    mutate: (repo) => write(repo, '.env.example', 'PORT=3000\nDATABASE_URL=x\nSECRET_TOKEN=x\n'),
  },
  {
    name: 'platform-injected env keys are NOT a finding',
    expectNone: 'agentsFile:environment',
    mutate: (repo) =>
      write(repo, '.env.example', 'PORT=3000\nDATABASE_URL=x\nAPP_NAME=demo\nLLM_ENGINE_URL=http://x\n'),
  },
  {
    name: 'Build and run written against docker instead of container',
    expect: 'agentsFile:image-lines',
    severity: 'High',
    mutate: (repo) =>
      write(repo, 'AGENTS.md', AGENTS.replace(/container build/g, 'docker build').replace(/container run/g, 'docker run')),
  },
  {
    name: 'coverage runner never asserts the report exists on a green suite',
    expect: 'coverage-report-written-on-green',
    severity: 'High',
    mutate: (repo) => write(repo, 'scripts/coverage.sh', '#!/bin/sh\nbun test && cp lcov coverage/lcov.info\n'),
  },
  {
    name: 'a bundling workspace declares runtime dependencies',
    expect: 'frontend-deps-are-build-time',
    severity: 'High',
    mutate(repo) {
      const root = path.join(repo, 'package.json')
      const d = JSON.parse(fs.readFileSync(root, 'utf8'))
      d.workspaces = ['frontend']
      fs.writeFileSync(root, JSON.stringify(d, null, 2))
      write(
        repo,
        'frontend/package.json',
        JSON.stringify(
          { name: 'frontend', scripts: { build: 'vite build' }, dependencies: { '@acme/rnd-svelte.button': '5.1.1' } },
          null,
          2,
        ),
      )
      write(repo, 'frontend/vite.config.ts', "export default {}\n")
      write(repo, 'frontend/tests/vite-config.test.ts', "import config from '../vite.config'\n")
    },
  },
  {
    name: 'a bundling workspace with only devDependencies is not a finding',
    expectNone: 'frontend-deps-are-build-time',
    mutate(repo) {
      const root = path.join(repo, 'package.json')
      const d = JSON.parse(fs.readFileSync(root, 'utf8'))
      d.workspaces = ['frontend']
      fs.writeFileSync(root, JSON.stringify(d, null, 2))
      write(
        repo,
        'frontend/package.json',
        JSON.stringify(
          { name: 'frontend', scripts: { build: 'vite build' }, devDependencies: { vite: '8.2.1' } },
          null,
          2,
        ),
      )
      write(repo, 'frontend/vite.config.ts', "export default {}\n")
      write(repo, 'frontend/tests/vite-config.test.ts', "import config from '../vite.config'\n")
    },
  },
  {
    name: 'a bundler config that no test imports',
    expect: 'build-config-has-guard',
    severity: 'Medium',
    mutate: (repo) => write(repo, 'vite.config.ts', 'export default { build: { outDir: "dist" } }\n'),
  },
  {
    name: 'a bundler config imported by a test is not a finding',
    expectNone: 'build-config-has-guard',
    mutate(repo) {
      write(repo, 'vite.config.ts', 'export default { build: { outDir: "dist" } }\n')
      write(repo, 'tests/vite-config.test.ts', "import config from '../vite.config'\nexport {}\n")
    },
  },
  {
    name: 'no lcov path declared to Sonar',
    expect: 'coverage-report-tracked',
    severity: 'High',
    mutate: (repo) => write(repo, 'sonar-project.properties', 'sonar.sources=src\n'),
  },
  {
    name: 'lcov path declared but untracked by git',
    expect: 'coverage-report-tracked',
    severity: 'High',
    mutate(repo) {
      sh(repo, 'git', ['rm', '-q', '--cached', 'coverage/lcov.info'])
    },
  },
  {
    name: 'runtime stage never patches the base image',
    expect: 'dockerfile-patches-base',
    severity: 'High',
    mutate: (repo) => write(repo, 'Dockerfile', DOCKERFILE.replace('RUN apk upgrade --no-cache\n', '')),
  },
  {
    name: 'runtime node_modules copied from the build stage',
    expect: 'dockerfile-production-deps',
    severity: 'High',
    mutate: (repo) =>
      write(
        repo,
        'Dockerfile',
        DOCKERFILE.replace('COPY --from=prod-deps /app/node_modules', 'COPY --from=build /app/node_modules'),
      ),
  },
  {
    // The regression this whole self-test exists for.
    name: 'floating :latest base tag',
    expect: 'dockerfile-pinned-base',
    severity: 'Medium',
    mutate: (repo) => write(repo, 'Dockerfile', DOCKERFILE.replace('oven/bun:1.3.10-alpine', 'oven/bun:latest')),
  },
  {
    name: 'base image with no tag at all',
    expect: 'dockerfile-pinned-base',
    severity: 'Medium',
    mutate: (repo) => write(repo, 'Dockerfile', DOCKERFILE.replace('oven/bun:1.3.10-alpine', 'oven/bun')),
  },
  {
    name: 'a registry port is not mistaken for a tag',
    expectNone: 'dockerfile-pinned-base',
    mutate: (repo) =>
      write(repo, 'Dockerfile', DOCKERFILE.replace('oven/bun:1.3.10-alpine', 'registry.internal:5000/bun:1.3.10')),
  },
  {
    name: 'runtime user inherits a low UID',
    expect: 'dockerfile-high-uid',
    severity: 'Medium',
    mutate: (repo) => write(repo, 'Dockerfile', DOCKERFILE.replace(/-u 10001/, '-u 1000')),
  },
  {
    name: 'no USER directive in the runtime stage',
    expect: 'dockerfile-high-uid:no-user-directive',
    severity: 'High',
    mutate: (repo) => write(repo, 'Dockerfile', DOCKERFILE.replace('USER 10001:10001\n', '')),
  },
  {
    name: 'the platform’s injected stubs are tracked',
    expect: 'no-platform-stubs',
    severity: 'High',
    mutate(repo) {
      write(repo, 'src/routes/health.js', "const express = require('express')\n")
      sh(repo, 'git', ['add', '-A'])
      sh(repo, 'git', ['commit', '-qm', 'stub'])
    },
  },
  {
    name: 'hand-authored .platform yaml with no integration commit',
    expect: 'platform-yaml-not-hand-authored',
    severity: 'Medium',
    mutate(repo) {
      write(repo, '.platform/resources.yaml', 'version: 1\n')
      sh(repo, 'git', ['add', '-A'])
      sh(repo, 'git', ['commit', '-qm', 'add platform config'])
    },
  },
  {
    name: 'product code changed after the gate record was written',
    expect: 'gate-record-names-head',
    severity: 'Medium',
    mutate(repo) {
      write(repo, 'src/index.ts', 'export const ok = false\n')
      sh(repo, 'git', ['add', '-A'])
      sh(repo, 'git', ['commit', '-qm', 'feat: change product code after gating'])
    },
  },
  {
    name: 'only release-handoff files changed since the gate record',
    expectNone: 'gate-record-names-head',
    mutate(repo) {
      fs.appendFileSync(path.join(repo, 'PROJECT.md'), '\nA later dossier edit.\n')
      sh(repo, 'git', ['add', '-A'])
      sh(repo, 'git', ['commit', '-qm', 'docs: dossier'])
    },
  },
  {
    name: 'no Reviewer line in Review Evidence',
    expect: 'reviewer-named',
    severity: 'Medium',
    mutate: (repo) =>
      write(repo, 'PROJECT.md', PROJECT.replace('Reviewer: independent-person\n\n', '')),
  },
  {
    // The false PASS that motivated the structured field: the gate record
    // legitimately quotes the owner's login as evidence for another check.
    name: 'owner login present as evidence, but no reviewer named',
    expect: 'reviewer-named',
    severity: 'Medium',
    mutate: (repo) =>
      write(
        repo,
        'PROJECT.md',
        PROJECT.replace(
          'Reviewer: independent-person\n',
          'Gate record: ownership-support-contacts PASS — owner-login confirmed a acme-org-ops member.\n',
        ),
      ),
  },
  {
    name: 'the named reviewer is the project owner',
    expect: 'reviewer-named',
    severity: 'Medium',
    mutate: (repo) => write(repo, 'PROJECT.md', PROJECT.replace('Reviewer: independent-person', 'Reviewer: owner-login')),
  },
  // --- stack-allowed -------------------------------------------------------
  {
    name: 'clean allowed stack, post-cutoff, is not a finding',
    expectNone: 'stack-allowed',
    verdict: 'PASS',
    note: /stack-allowed: .*no dependency outside allowedStack/,
    mutate: (repo) => stackFixture(repo, { deps: ALLOWED_DEPS, vibeStart: '2026-10-09' }),
  },
  {
    name: 'clean allowed stack at phase-2 (the first stage that runs repoChecks there)',
    stage: 'phase-2',
    expectNone: 'stack-allowed',
    verdict: 'PASS',
    note: /stack-allowed: reminder — major improvements/,
    mutate: (repo) => stackFixture(repo, { deps: ALLOWED_DEPS, vibeStart: '2026-10-09' }),
  },
  {
    name: 'post-cutoff project with express in a workspace',
    expect: 'stack-allowed',
    severity: 'High',
    verdict: 'FAIL',
    mutate: (repo) => stackFixture(repo, { deps: { ...ALLOWED_DEPS, express: '5.1.0' }, vibeStart: '2026-10-09' }),
  },
  {
    name: 'post-cutoff express fails at phase-2 as well',
    stage: 'phase-2',
    expect: 'stack-allowed',
    severity: 'High',
    mutate: (repo) => stackFixture(repo, { deps: { express: '5.1.0' }, vibeStart: '2026-10-09' }),
  },
  {
    name: 'pre-cutoff project keeps express and package-lock.json as a legacy note',
    expectNone: 'stack-allowed',
    verdict: 'PASS',
    note: /stack-allowed: legacy project — start 2026-08-01 .*express.*package-lock\.json/,
    mutate(repo) {
      write(repo, 'package-lock.json', '{}\n')
      stackFixture(repo, { deps: { express: '5.1.0' }, vibeStart: '2026-08-01', track: true })
    },
  },
  {
    name: 'post-cutoff project with a tracked package-lock.json',
    expect: 'stack-allowed',
    severity: 'High',
    mutate(repo) {
      write(repo, 'package-lock.json', '{}\n')
      stackFixture(repo, { deps: ALLOWED_DEPS, vibeStart: '2026-10-09', track: true })
    },
  },
  {
    name: 'an untracked package-lock.json is not a finding',
    expectNone: 'stack-allowed',
    mutate(repo) {
      write(repo, 'package-lock.json', '{}\n')
      stackFixture(repo, { deps: ALLOWED_DEPS, vibeStart: '2026-10-09' })
    },
  },
  {
    name: 'a Vibe Start date inside an HTML comment is ignored (falls back to git)',
    expectNone: 'stack-allowed',
    note: /stack-allowed: legacy project — start \d{4}-\d{2}-\d{2} from the earliest git commit/,
    mutate: (repo) =>
      stackFixture(repo, { deps: { express: '5.1.0' }, vibeStart: '<!-- YYYY-MM-DD, e.g. 2026-11-01 -->' }),
  },
  {
    name: 'post-cutoff express with an approved Stack Exceptions row (columns reordered)',
    expectNone: 'stack-allowed',
    verdict: 'PASS',
    note: /stack-allowed: approved in `## Stack Exceptions`: express \(approved by tech-architect-login, 2026-10-08\)/,
    mutate: (repo) =>
      stackFixture(repo, {
        deps: { ...ALLOWED_DEPS, express: '5.1.0' },
        vibeStart: '2026-10-09',
        exceptions:
          '| Deviation | Scope | Date | Approved by | Link (ADR/ticket) |\n' +
          '|---|---|---|---|---|\n' +
          '| express instead of elysia | apps/api | 2026-10-08 | tech-architect-login | ADR-12 |',
      }),
  },
  {
    name: 'a Stack Exceptions row with no approver does not approve',
    expect: 'stack-allowed',
    severity: 'High',
    mutate: (repo) =>
      stackFixture(repo, {
        deps: { ...ALLOWED_DEPS, express: '5.1.0' },
        vibeStart: '2026-10-09',
        exceptions:
          '| Scope | Deviation | Approved by | Date | Link (ADR/ticket) |\n' +
          '|---|---|---|---|---|\n' +
          '| apps/api | express instead of elysia |  | 2026-10-08 | ADR-12 |',
      }),
  },
]

function main() {
  const base = buildFixture()
  let failures = 0

  const clean = check(base, 'phase-7')
  if (clean.verdict !== 'PASS') {
    console.log(`  FAIL  baseline fixture should PASS, got ${clean.verdict}`)
    for (const f of clean.findings) console.log(`          unexpected: ${f.id} — ${f.has}`)
    failures += 1
  } else {
    console.log('  ok    baseline fixture PASSes')
  }

  for (const c of CASES) {
    const repo = buildFixture()
    c.mutate(repo)
    const res = check(repo, c.stage || 'phase-7')
    const hit = res.findings.find((f) => f.id === c.expect || f.id.startsWith(`${c.expect}:`))

    // Optional extra assertions: the overall verdict, and a note that must be printed.
    const extra = []
    if (c.verdict && res.verdict !== c.verdict) {
      extra.push(`verdict ${res.verdict}, expected ${c.verdict} (findings: ${res.findings.map((f) => f.id).join(', ') || 'none'})`)
    }
    if (c.note && !res.notes.some((n) => c.note.test(n))) {
      extra.push(`no note matching ${c.note}; notes: ${res.notes.filter((n) => n.startsWith('stack-allowed')).join(' | ')}`)
    }

    if (extra.length) {
      console.log(`  FAIL  ${c.name}: ${extra.join('; ')}`)
      failures += 1
    } else if (c.expectNone) {
      const unexpected = res.findings.find((f) => f.id.startsWith(c.expectNone))
      if (unexpected) {
        console.log(`  FAIL  ${c.name}: ${c.expectNone} fired but should not have — ${unexpected.has}`)
        failures += 1
      } else {
        console.log(`  ok    ${c.name} (correctly not a finding)`)
      }
    } else if (!hit) {
      console.log(`  FAIL  ${c.name}: expected ${c.expect} to fire, it did not`)
      console.log(`          fired instead: ${res.findings.map((f) => f.id).join(', ') || '(nothing)'}`)
      failures += 1
    } else if (c.severity && hit.severity !== c.severity) {
      console.log(`  FAIL  ${c.name}: ${hit.id} fired at ${hit.severity}, expected ${c.severity}`)
      failures += 1
    } else {
      console.log(`  ok    ${c.name} → ${hit.id} (${hit.severity})`)
    }
    fs.rmSync(repo, { recursive: true, force: true })
  }

  fs.rmSync(base, { recursive: true, force: true })

  console.log('')
  console.log(`${CASES.length + 1} case(s), ${failures} unexpected`)
  process.exit(failures ? 1 : 0)
}

main()
