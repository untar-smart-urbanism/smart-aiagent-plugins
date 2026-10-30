#!/usr/bin/env node
/**
 * Check a repository against the delivery pipeline's build contract.
 *
 * Read-only. This script reports; it never writes to the repository, and it
 * never invents a rule that is not in ../data/build-contract.json.
 *
 * Usage:
 *   node check-build-contract.js [--repo <path>] [--stage <stage>] [--json]
 *
 *   --stage   phase-2 | phase-5 | phase-7 | post-onboarding
 *             Omitted: phase-7 when vibe-release.json exists, otherwise the
 *             furthest stage the repo's own files support. The chosen stage is
 *             always printed — a clean report means nothing until the reader
 *             knows what it covered.
 *   --json    Machine-readable result on stdout instead of the table.
 *
 * Exit codes:
 *   0  PASS         nothing failed
 *   2  CONDITIONAL  only Low/Medium failed
 *   1  FAIL         at least one High failed
 *   3  N/A          no root package.json — this contract does not apply
 *   4  usage/internal error
 *
 * Why this exists as a script rather than as prose in the skill: every rule it
 * enforces was already written down, and every one was still missed by at least
 * one delivered app. A check that each caller re-implements from a description
 * is re-implemented with fresh bugs each time — the first hand-rolled version of
 * this logic silently never fired on `FROM oven/bun:latest`, which is precisely
 * the class of miss the contract exists to catch.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const CONTRACT_PATH = path.join(__dirname, '..', 'data', 'build-contract.json')
const STAGES = ['phase-2', 'phase-5', 'phase-7', 'post-onboarding']

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function git(repo, args) {
  try {
    return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function gitOk(repo, args) {
  try {
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Read a file, or null when it is absent. A missing file is never a pass. */
function read(repo, rel) {
  try {
    return fs.readFileSync(path.join(repo, rel), 'utf8')
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const out = { repo: null, stage: null, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--repo') out.repo = argv[++i]
    else if (a === '--stage') out.stage = argv[++i]
    else if (a === '-h' || a === '--help') out.help = true
    else throw new Error(`unknown argument: ${a}`)
  }
  return out
}

// ---------------------------------------------------------------------------
// result accumulator
// ---------------------------------------------------------------------------

class Report {
  constructor(stage) {
    this.stage = stage
    this.findings = []
    this.notes = []
  }

  fail(id, severity, has, fix, failureMode) {
    this.findings.push({ id, severity, has, fix, failureMode: failureMode || null })
  }

  /** Passed, not applicable, and not evaluated are three different results. */
  note(text) {
    this.notes.push(text)
  }

  get verdict() {
    if (this.findings.some((f) => f.severity === 'High')) return 'FAIL'
    return this.findings.length ? 'CONDITIONAL' : 'PASS'
  }

  count(severity) {
    return this.findings.filter((f) => f.severity === severity).length
  }
}

// ---------------------------------------------------------------------------
// 1. scripts — requiredScripts, scriptRules
// ---------------------------------------------------------------------------

function checkScripts(repo, contract, scripts, report) {
  for (const entry of contract.requiredScripts) {
    if (Object.prototype.hasOwnProperty.call(scripts, entry.name)) continue

    const alias = entry.commonAlias
    const aliasPresent = alias && Object.prototype.hasOwnProperty.call(scripts, alias)
    const has = aliasPresent
      ? `absent — \`${alias}\` is present, \`${entry.name}\` is not; the alias is additive, not a substitute`
      : 'absent'
    report.fail(
      `requiredScript:${entry.name}`,
      entry.severity,
      has,
      `declare \`${entry.name}\` in the root scripts — ${entry.must}`,
      entry.failureNote,
    )
  }

  checkCoverageWrittenOnGreen(repo, contract, scripts, report)

  const rule = contract.scriptRules.find((r) => r.id === 'coverage-fails-closed')
  const body = scripts['test:coverage']
  if (rule && typeof body === 'string' && body.length) {
    const delegates = /^(?:sh|bash|node|bun run)\s+\S+/.test(body.trim())
    const chained = body.includes('&&')
    if (delegates) {
      report.note(
        `coverage-fails-closed: delegates to a runner (\`${body.trim()}\`) — PASS with a note. ` +
          'Reading the body proves nothing either way; the author verifies fail-closed once by breaking a test.',
      )
    } else if (!chained) {
      report.fail(
        'coverage-fails-closed',
        'High',
        `\`${body}\` runs the reporter unconditionally`,
        'produce the report only after the suite passes',
        rule.rationale,
      )
    }
  }
}

/**
 * coverage-fails-closed guards a red suite writing a report. This guards the
 * inverse, which produces the same 0.0% the contract exists to prevent: a
 * runner that exits non-zero on a *green* suite makes a correct fail-closed
 * script delete a perfectly good report.
 */
function checkCoverageWrittenOnGreen(repo, contract, scripts, report) {
  const rule = contract.scriptRules.find((r) => r.id === 'coverage-report-written-on-green')
  if (!rule) return
  const body = scripts['test:coverage']
  if (typeof body !== 'string' || !body.length) return

  const delegated = /^(?:sh|bash|node|bun run)\s+(\S+)/.exec(body.trim())
  const source = delegated ? read(repo, delegated[1]) : body
  if (source === null) {
    report.note(
      `coverage-report-written-on-green: cannot be evaluated — \`${delegated[1]}\` is not readable from the repo`,
    )
    return
  }

  // The runner must assert the report exists (and is non-empty) after a green
  // suite, and exit non-zero when it does not.
  const assertsPresence = /(\[\s*!?\s*-[sf]\s|test\s+-[sf]\s|existsSync|statSync|Bun\.file)/.test(source)
  const exitsNonZero = /(exit\s+[1-9]|process\.exit\(\s*[1-9])/.test(source)

  if (assertsPresence && exitsNonZero) {
    report.note('coverage-report-written-on-green: the runner asserts the report exists and exits non-zero if not — PASS')
  } else {
    report.fail(
      'coverage-report-written-on-green',
      'High',
      assertsPresence
        ? 'the runner checks for the report but never exits non-zero when it is missing'
        : 'the runner never asserts the report exists after a passing suite',
      rule.fix,
      rule.rationale,
    )
  }
}

// ---------------------------------------------------------------------------
// 2. the agents file — agentsFile
// ---------------------------------------------------------------------------

function sectionOf(text, heading) {
  const start = text.indexOf(heading)
  if (start < 0) return null
  const rest = text.slice(start + heading.length)
  const next = rest.search(/\n##\s/)
  return next < 0 ? rest : rest.slice(0, next)
}

function severityOf(agentsFile, id) {
  const entry = agentsFile.requiredContent.find((c) => c.id === id)
  return entry ? entry.severity : 'Medium'
}

function checkAgentsFile(repo, contract, scripts, report) {
  const spec = contract.agentsFile
  const present = spec.paths.filter((p) => read(repo, p) !== null)

  if (!present.length) {
    report.fail(
      'agentsFile',
      'High',
      `neither ${spec.paths.join(' nor ')} exists`,
      `add a \`${spec.requiredSection}\` section — references/build-contract.md is written to be pasted`,
      spec.rationale,
    )
    return
  }

  // Both names must exist, and CLAUDE.md must be the *committed* symlink to
  // AGENTS.md. Two regular files are two copies, and copies drift: every
  // delivered app carrying both carried byte-identical 100644 duplicates.
  if (spec.requireBoth) {
    const missing = spec.paths.filter((p) => !present.includes(p))
    if (missing.length) {
      report.fail(
        'agentsFile:both',
        'High',
        `${missing.join(' and ')} missing — both names are required`,
        `ln -s ${spec.canonical} ${missing[0]} && git add ${spec.paths.join(' ')}`,
        spec.symlink ? spec.symlink.direction : spec.rationale,
      )
    }
  }

  if (spec.symlink && spec.canonical) {
    const alias = spec.paths.find((p) => p !== spec.canonical)
    // `git ls-files -s` reports the mode in the index: 120000 symlink, 100644 file.
    const entry = git(repo, ['ls-files', '-s', '--', alias]) || ''
    const mode = entry.trim().split(/\s+/)[0]
    if (mode && mode !== '120000') {
      report.fail(
        'agentsFile:symlink',
        'High',
        `${alias} is committed as a copy (mode ${mode}), not a symlink to ${spec.canonical}`,
        `git rm --cached ${alias} && ln -sf ${spec.canonical} ${alias} && git add ${alias}`,
        spec.symlink.rationale,
      )
    }
  }

  // Read through the canonical file when it exists; the alias resolves to it.
  const file = present.includes(spec.canonical) ? spec.canonical : present[0]
  const text = read(repo, file)
  const section = sectionOf(text, spec.requiredSection)

  if (section === null) {
    report.fail(
      `agentsFile:section`,
      'High',
      `${file} has no \`${spec.requiredSection}\` section`,
      'paste references/build-contract.md and fill in this app’s values',
      spec.rationale,
    )
    return
  }

  // command-table
  const missing = contract.requiredScripts.map((s) => s.name).filter((n) => !section.includes(n))
  if (!section.includes('bun install --frozen-lockfile')) missing.push('bun install --frozen-lockfile')
  if (missing.length) {
    report.fail(
      'agentsFile:command-table',
      severityOf(spec, 'command-table'),
      `the table does not name: ${missing.join(', ')}`,
      'list every contract command, including the install line',
    )
  }

  // image-lines — the sanctioned runtime is Apple Container, not docker. A
  // reader who copies the line must get the engine the platform's build uses.
  const hasContainerLines = section.includes('container build') && section.includes('container run')
  if (!hasContainerLines) {
    const writtenAgainstDocker = /\bdocker (build|run)\b/.test(section)
    report.fail(
      'agentsFile:image-lines',
      severityOf(spec, 'image-lines'),
      writtenAgainstDocker
        ? 'the section gives `docker build` / `docker run` lines'
        : 'no `container build` / `container run` lines',
      'give the exact `container build` and `container run` commands for this app',
      spec.requiredContent.find((c) => c.id === 'image-lines').must,
    )
  }

  // port — must agree with EXPOSE and .env.example PORT
  const dockerfile = read(repo, 'Dockerfile') || ''
  const envExample = read(repo, '.env.example') || ''
  const expose = /^EXPOSE\s+(\d+)/m.exec(dockerfile)
  const envPort = /^PORT=(\d+)/m.exec(envExample)
  const portSeverity = severityOf(spec, 'port')

  if (expose && envPort && expose[1] !== envPort[1]) {
    report.fail(
      'agentsFile:port',
      portSeverity,
      `EXPOSE ${expose[1]} but .env.example PORT=${envPort[1]}`,
      'make the Dockerfile, .env.example and the section agree',
    )
  } else if (expose && !section.includes(expose[1])) {
    report.fail(
      'agentsFile:port',
      portSeverity,
      `the section never states port ${expose[1]}`,
      'state the port the app listens on',
    )
  }

  // health paths
  for (const p of ['/health', '/api/health']) {
    if (!section.includes(p)) {
      report.fail(
        'agentsFile:health-paths',
        severityOf(spec, 'health-paths'),
        `${p} is not named`,
        'name the unauthenticated health paths',
      )
      break
    }
  }

  // environment — minus the keys the platform injects into .env.example
  const injected = new Set((spec.platformInjectedEnvKeys && spec.platformInjectedEnvKeys.keys) || [])
  const keys = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1])
  const undocumented = keys.filter((k) => !injected.has(k) && !section.includes(k))
  if (undocumented.length) {
    report.fail(
      'agentsFile:environment',
      severityOf(spec, 'environment'),
      `not documented: ${undocumented.join(', ')}`,
      'document every variable the app reads, matching .env.example',
    )
  }
  const injectedSeen = keys.filter((k) => injected.has(k))
  if (injectedSeen.length) {
    report.note(
      `agentsFile:environment: ${injectedSeen.join(', ')} are platform-injected and exempt — ` +
        'documenting them as platform-added and unread is better, but their absence is not a finding',
    )
  }

  // stalenessRule — the section must be true at HEAD
  for (const m of section.matchAll(/`bun run ([a-z:]+)`/g)) {
    if (!Object.prototype.hasOwnProperty.call(scripts, m[1])) {
      report.fail(
        'agentsFile:stale',
        'Medium',
        `documents \`bun run ${m[1]}\`, which package.json does not have`,
        'make the section true at HEAD',
        spec.stalenessRule,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// 3. repository checks — repoChecks
// ---------------------------------------------------------------------------

// --- stack-allowed helpers -------------------------------------------------

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

function toPosix(p) {
  return p.split(path.sep).join('/').replace(/^\.\//, '')
}

/**
 * A PROJECT.md section by its heading line, not by the first occurrence of the
 * heading text — prose that quotes "`## Stack Exceptions`" is not the section.
 * Delegates the body extraction to sectionOf, as reviewer-named does.
 */
function headingSection(text, title) {
  const normalised = text.replace(/\r\n/g, '\n')
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`^##[ \\t]+${escaped}[ \\t]*$`, 'm').exec(normalised)
  if (!m) return null
  return sectionOf(normalised.slice(m.index), m[0])
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

function isIsoDate(s) {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Vibe Start from PROJECT.md, else the earliest commit date — the /vibe-check fallback. */
function projectStartDate(repo, project) {
  const section = project === null ? null : headingSection(project, 'Vibe Start')
  if (section !== null) {
    const m = ISO_DATE.exec(stripComments(section))
    if (m && isIsoDate(m[1])) return { date: m[1], source: 'PROJECT.md `## Vibe Start`' }
  }
  const first = (git(repo, ['log', '--reverse', '--format=%cs']) || '').split('\n')[0].trim()
  if (first && isIsoDate(first)) return { date: first, source: 'the earliest git commit (Vibe Start blank)' }
  return null
}

const EMPTY_CELL = /^(?:|-+|—|–|n\/a|na|none|tbd|pending|todo|\?|<[^>]*>)$/i

/**
 * Rows of the `## Stack Exceptions` table, keyed by header name. Column order is
 * not assumed: the header row is located by its `Approved by` cell.
 */
function stackExceptionRows(project) {
  const section = project === null ? null : headingSection(project, 'Stack Exceptions')
  if (section === null) return { present: false, rows: [] }
  const cellsOf = (line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const lines = stripComments(section)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  let header = null
  const rows = []
  for (const line of lines) {
    const cells = cellsOf(line)
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue // separator row
    const lower = cells.map((c) => c.replace(/[*_`]/g, '').toLowerCase())
    if (!header && lower.some((c) => c === 'approved by')) {
      header = lower
      continue
    }
    if (!header) continue
    const col = (name) => {
      const i = header.findIndex((h) => h === name || h.startsWith(name))
      return i >= 0 ? (cells[i] || '').trim() : ''
    }
    rows.push({
      text: line,
      scope: col('scope'),
      deviation: col('deviation'),
      approvedBy: col('approved by'),
      date: col('date'),
      link: col('link'),
      hasDateColumn: header.some((h) => h === 'date' || h.startsWith('date')),
    })
  }
  return { present: true, hasHeader: header !== null, rows }
}

function namesItem(rowText, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![\\w@/.-])${escaped}(?![\\w/-])`, 'i').test(rowText)
}

/** Why a row naming the item does or does not approve it; null when it approves. */
function rowDefect(row) {
  const approver = row.approvedBy.replace(/[*_`]/g, '').trim()
  const dateText = row.hasDateColumn ? row.date : row.text
  const m = ISO_DATE.exec(dateText)
  if (EMPTY_CELL.test(approver)) return 'has no approver'
  if (!m || !isIsoDate(m[1])) return 'has no ISO date'
  return null
}

// Test data is not a workspace: a fixture package.json that declares express
// exists precisely so some other test can see express.
const NOT_A_WORKSPACE = new Set(['node_modules', '__fixtures__', 'fixtures', '__tests__', 'test', 'tests', 'testdata'])

function outsideProduct(file) {
  return file.split('/').slice(0, -1).some((seg) => NOT_A_WORKSPACE.has(seg))
}

/**
 * Root + declared workspaces + every other tracked package.json (a nested app
 * that never made it into `workspaces` is still part of the project), minus
 * node_modules and test-fixture directories.
 */
function packageManifests(repo, ctx) {
  const set = new Set(['package.json'])
  for (const ws of ctx.workspaces) set.add(toPosix(path.join(ws, 'package.json')))
  const skipped = []
  const tracked = git(repo, ['ls-files', '--', 'package.json', '*/package.json'])
  for (const f of (tracked || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    if (path.posix.basename(f) !== 'package.json' || set.has(f)) continue
    if (outsideProduct(f)) {
      if (!f.split('/').includes('node_modules')) skipped.push(f)
      continue
    }
    set.add(f)
  }
  return { files: [...set].filter((f) => read(repo, f) !== null).sort(), skipped }
}

function trackedLockfiles(repo, names) {
  if (!names.length) return []
  const pathspecs = names.flatMap((n) => [n, `*/${n}`])
  const tracked = git(repo, ['ls-files', '--', ...pathspecs])
  if (tracked === null) {
    // Not a git repository — fall back to what is on disk at the root.
    return names.filter((n) => read(repo, n) !== null)
  }
  return tracked
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => names.includes(path.posix.basename(f)) && !outsideProduct(f))
}

const REPO_CHECKS = {
  'stack-allowed': (repo, rule, ctx, report) => {
    const contract = ctx.contract
    const stack = contract.allowedStack || {}
    const blocked = stack.notAllowedWithoutApproval || {}
    const exceptions = contract.stackExceptions || {}
    const cutoff = exceptions.legacyCutoff || stack.effectiveFrom || null

    // 1. What the repo declares.
    const insteadOf = new Map()
    for (const group of blocked.packages || []) for (const name of group.match || []) insteadOf.set(name, group.instead)
    const runtime = (stack.layers || []).find((l) => (l.packages || []).includes('bun')) || (stack.layers || [])[0]
    const lockfileInstead = runtime
      ? `${runtime.stack}${runtime.note ? ` — ${runtime.note.replace(/\.\s*$/, '')}` : ''}`
      : 'the allowed runtime'

    const items = new Map() // name -> { name, kind, instead, where: [] }
    const { files: manifests, skipped } = packageManifests(repo, ctx)
    if (skipped.length) {
      report.note(
        `${rule.id}: ${skipped.length} tracked package.json under a test/fixture directory not treated as a workspace: ` +
          `${skipped.slice(0, 4).join(', ')}${skipped.length > 4 ? ` (+${skipped.length - 4} more)` : ''}`,
      )
    }
    for (const file of manifests) {
      let pkg
      try {
        pkg = JSON.parse(read(repo, file))
      } catch {
        report.note(`${rule.id}: ${file} is not valid JSON — its dependencies cannot be evaluated`)
        continue
      }
      for (const field of DEP_FIELDS) {
        for (const name of Object.keys(pkg[field] || {})) {
          if (!insteadOf.has(name)) continue
          if (!items.has(name)) items.set(name, { name, kind: 'package', instead: insteadOf.get(name), where: [] })
          items.get(name).where.push(`${file} ${field}`)
        }
      }
    }
    for (const lock of trackedLockfiles(repo, blocked.lockfiles || [])) {
      const name = path.posix.basename(lock)
      if (!items.has(name)) items.set(name, { name, kind: 'lockfile', instead: lockfileInstead, where: [] })
      items.get(name).where.push(lock)
    }

    // 2. Which of them carry a recorded approval.
    const project = read(repo, 'PROJECT.md')
    const table = stackExceptionRows(project)
    const approved = []
    const pending = []
    for (const item of items.values()) {
      const naming = table.rows.filter((r) => namesItem(r.text, item.name))
      const good = naming.find((r) => rowDefect(r) === null)
      if (good) {
        approved.push(`${item.name} (approved by ${good.approvedBy}, ${ISO_DATE.exec(good.hasDateColumn ? good.date : good.text)[1]})`)
      } else {
        item.defect = naming.length ? `a \`## Stack Exceptions\` row names it but ${rowDefect(naming[0])}` : null
        pending.push(item)
      }
    }
    if (table.present && !table.hasHeader && items.size) {
      report.note(`${rule.id}: \`## Stack Exceptions\` has no table with an \`Approved by\` column — no row can approve anything. Expected: ${exceptions.record || ''}`)
    }
    if (approved.length) {
      report.note(`${rule.id}: approved in \`## Stack Exceptions\`: ${approved.join('; ')}`)
    }

    // 3. Verdict.
    if (!items.size) {
      report.note(
        `${rule.id}: ${manifests.length} package.json file(s) checked, no dependency outside allowedStack and no foreign lockfile tracked — PASS`,
      )
    } else if (!pending.length) {
      report.note(`${rule.id}: every deviation carries a tech-architect approval row — PASS`)
    } else {
      const start = projectStartDate(repo, project)
      const legacy = Boolean(start && cutoff && start.date < cutoff)
      const describe = (i) => `${i.name} (${i.where.join(', ')}) → instead: ${i.instead}`
      if (legacy) {
        report.note(
          `${rule.id}: legacy project — start ${start.date} from ${start.source}, before the ${cutoff} cutoff. ` +
            `Existing deviations kept without a finding: ${pending.map(describe).join('; ')}. ` +
            `PASS with a legacy note. ${(exceptions.legacy && exceptions.legacy.notCovered) || ''}`.trim(),
        )
      } else {
        const why = start
          ? `start ${start.date} from ${start.source}, not before the ${cutoff} cutoff`
          : 'no start date could be established (no `## Vibe Start` date, no git history) — treated as post-cutoff'
        for (const i of pending) {
          report.fail(
            rule.id,
            rule.severity,
            `${i.kind === 'lockfile' ? `${i.name} is tracked (${i.where.join(', ')})` : `${i.name} in ${i.where.join(', ')}`} — not in allowedStack, ${i.defect || 'no approved `## Stack Exceptions` row'}; ${why}`,
            `use ${i.instead} instead, or record a tech-architect approval (Scope, Deviation, Approved by, Date, Link) in PROJECT.md \`## Stack Exceptions\``,
            rule.failureMode,
          )
        }
      }
    }

    // 4. What the tree cannot show.
    const examples = (exceptions.majorImprovements && exceptions.majorImprovements.examples) || []
    report.note(
      `${rule.id}: reminder — major improvements need a tech-architect approval row in \`## Stack Exceptions\` for every project, ` +
        `legacy or not, allowed stack or not${examples.length ? `: ${examples.join('; ')}` : ''}. The tree cannot show this; the gate and the reviewer confirm the row.`,
    )
    if ((blocked.nonPackage || []).length) {
      report.note(`${rule.id}: not evaluated from package.json — ${blocked.nonPackage.join('; ')}`)
    }
  },

  'coverage-report-tracked': (repo, rule, ctx, report) => {
    const props = read(repo, 'sonar-project.properties')
    if (props === null) {
      report.fail(rule.id, rule.severity, 'no sonar-project.properties', rule.fix, rule.failureMode)
      return
    }
    const declared = new Set()
    for (const m of props.matchAll(/^sonar\.(?:javascript|typescript)\.lcov\.reportPaths=(.+)$/gm)) {
      m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((p) => declared.add(p))
    }
    if (!declared.size) {
      // Zero declared paths is a failure, not a vacuous pass.
      report.fail(rule.id, rule.severity, 'no lcov reportPaths declared', rule.fix, rule.failureMode)
      return
    }
    const untracked = [...declared].filter((p) => !gitOk(repo, ['ls-files', '--error-unmatch', p]))
    if (untracked.length) {
      report.fail(
        rule.id,
        rule.severity,
        `declared but not tracked by git: ${untracked.join(', ')}`,
        rule.fix,
        rule.failureMode,
      )
    } else {
      report.note(`${rule.id}: ${declared.size} path(s) declared, all tracked by git — PASS`)
    }
  },

  'dockerfile-patches-base': (repo, rule, ctx, report) => {
    if (!ctx.dockerfile) return report.fail(rule.id, rule.severity, 'no Dockerfile', 'add one at the repo root')
    if (!/(apk upgrade|apt-get upgrade|apt-get dist-upgrade|dnf upgrade|yum update|microdnf update)/.test(ctx.finalStage)) {
      report.fail(
        rule.id,
        rule.severity,
        'the runtime stage never patches the base image’s OS packages',
        rule.fix,
        rule.failureMode,
      )
    }
  },

  'dockerfile-production-deps': (repo, rule, ctx, report) => {
    if (!ctx.dockerfile) return report.fail(rule.id, rule.severity, 'no Dockerfile', 'add one at the repo root')
    if (/COPY\s+--from=(?:build|builder)[^\n]*node_modules/.test(ctx.finalStage)) {
      report.fail(
        rule.id,
        rule.severity,
        'the runtime stage copies node_modules from the build stage',
        'install with --production in its own stage and copy that tree forward',
        rule.failureMode,
      )
    } else if (!/(--production|--omit=dev|--only=production|--prod\b)/.test(ctx.dockerfile)) {
      report.fail(
        rule.id,
        rule.severity,
        'no production-only install anywhere in the Dockerfile',
        'add a stage that installs from the same lockfile with the production flag',
        rule.failureMode,
      )
    }
  },

  'dockerfile-pinned-base': (repo, rule, ctx, report) => {
    if (!ctx.dockerfile) return report.fail(rule.id, rule.severity, 'no Dockerfile', 'add one at the repo root')
    const stageNames = new Set(
      [...ctx.dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map((m) => m[1].toLowerCase()),
    )
    const bad = []
    for (const m of ctx.dockerfile.matchAll(/^FROM\s+(\S+)/gm)) {
      const ref = m[1]
      if (stageNames.has(ref.toLowerCase())) continue // internal stage reference, not a base image
      if (ref.includes('@sha256:')) continue // digest-pinned
      // A colon before the last '/' is a registry port, not a tag.
      const lastSlash = ref.lastIndexOf('/')
      const nameAndTag = lastSlash >= 0 ? ref.slice(lastSlash + 1) : ref
      const colon = nameAndTag.lastIndexOf(':')
      if (colon < 0) {
        bad.push(`${ref} (no tag — implicitly :latest)`)
        continue
      }
      const tag = nameAndTag.slice(colon + 1)
      if (tag === 'latest' || !/^\d+\.\d+\.\d+/.test(tag)) bad.push(ref)
    }
    if (bad.length) {
      report.fail(
        rule.id,
        rule.severity,
        `unpinned base tag(s): ${[...new Set(bad)].join(', ')}`,
        'pin an exact patch version, and a @sha256: digest for anything promoted to production',
        rule.rule,
      )
    }
  },

  'dockerfile-high-uid': (repo, rule, ctx, report) => {
    if (!ctx.dockerfile) return report.fail(rule.id, rule.severity, 'no Dockerfile', 'add one at the repo root')
    const uids = [...ctx.dockerfile.matchAll(/(?:adduser|useradd)[^\n]*?(?:-u|--uid)\s+(\d+)/g)].map((m) =>
      Number(m[1]),
    )
    if (!uids.length) {
      report.fail(rule.id, rule.severity, 'no user is created in the image', 'create a user with UID and GID >= 10000', rule.rationale)
    } else if (Math.min(...uids) < 10000) {
      report.fail(rule.id, rule.severity, `UID ${Math.min(...uids)} is below 10000`, 'use UID and GID >= 10000', rule.rationale)
    }
    if (!/^USER\s+\S+/m.test(ctx.finalStage)) {
      report.fail(
        `${rule.id}:no-user-directive`,
        'High',
        'the runtime stage has no explicit USER',
        'end the final stage with a non-root USER',
        rule.rationale,
      )
    }
  },

  'frontend-deps-are-build-time': (repo, rule, ctx, report) => {
    // --production drops devDependencies and nothing else, so a bundling
    // workspace that declares its UI library under dependencies ships the whole
    // library into the image even when the Dockerfile is textbook-correct.
    const offenders = []
    let bundling = 0
    for (const ws of ctx.workspaces) {
      const raw = read(repo, path.join(ws, 'package.json'))
      if (raw === null) continue
      let pkg
      try {
        pkg = JSON.parse(raw)
      } catch {
        continue
      }
      const buildScript = (pkg.scripts && pkg.scripts.build) || ''
      const hasBundlerConfig = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'webpack.config.js', 'rollup.config.js', 'rollup.config.ts']
        .some((f) => read(repo, path.join(ws, f)) !== null)
      const bundles = hasBundlerConfig || /\b(vite|webpack|rollup|parcel|esbuild)\b/.test(buildScript)
      if (!bundles) continue
      bundling += 1
      const deps = Object.keys(pkg.dependencies || {})
      if (deps.length) offenders.push({ ws, deps })
    }

    if (!bundling) {
      report.note(`${rule.id}: no workspace builds to a static bundle — not applicable`)
      return
    }
    if (!offenders.length) {
      report.note(`${rule.id}: ${bundling} bundling workspace(s), none declaring runtime dependencies — PASS`)
      return
    }
    for (const o of offenders) {
      report.fail(
        rule.id,
        rule.severity,
        `${o.ws}/package.json declares ${o.deps.length} runtime dependenc${o.deps.length === 1 ? 'y' : 'ies'}: ${o.deps.slice(0, 6).join(', ')}${o.deps.length > 6 ? ` (+${o.deps.length - 6} more)` : ''}`,
        rule.fix,
        rule.failureMode,
      )
    }
  },

  'build-config-has-guard': (repo, rule, ctx, report) => {
    const configs = []
    for (const ws of ['.', ...ctx.workspaces]) {
      for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'webpack.config.js', 'rollup.config.js', 'rollup.config.ts']) {
        const rel = ws === '.' ? f : path.join(ws, f)
        if (read(repo, rel) !== null) configs.push(rel)
      }
    }
    if (!configs.length) {
      report.note(`${rule.id}: no bundler config in this repo — not applicable`)
      return
    }

    const basenames = new Set(configs.map((c) => path.basename(c).replace(/\.(ts|js|mts|mjs)$/, '')))
    let guarded = null
    walk(repo, (file) => {
      if (guarded) return
      if (!/\.(test|spec)\.(ts|tsx|js|jsx|mts|mjs)$/.test(file)) return
      const body = fs.readFileSync(file, 'utf8')
      for (const base of basenames) {
        // an import of the config module, by any relative path
        if (new RegExp(`(?:from|require\\()\\s*['"][^'"]*${base}['"]`).test(body)) {
          guarded = path.relative(repo, file)
          return
        }
      }
    })

    if (guarded) {
      report.note(`${rule.id}: ${guarded} imports the bundler config — PASS`)
    } else {
      report.fail(
        rule.id,
        rule.severity,
        `no test imports ${configs.join(' or ')}`,
        rule.fix,
        rule.failureMode,
      )
    }
  },

  'no-platform-stubs': (repo, rule, ctx, report) => {
    const stubs = ['src/routes/health.js', 'src/services/llm-integration-service.js'].filter((p) =>
      gitOk(repo, ['ls-files', '--error-unmatch', p]),
    )
    if (stubs.length) {
      report.fail(
        rule.id,
        rule.severity,
        `the platform’s injected stubs are tracked: ${stubs.join(', ')}`,
        'delete them — they require express and axios, neither of which is a dependency',
        rule.failureMode,
      )
      return
    }
    // require( only where product code lives. CommonJS outside it is legitimate.
    const offenders = []
    for (const src of ctx.sonarSources) {
      walk(path.join(repo, src), (file) => {
        if (!/\.(ts|tsx|js|jsx|mjs|svelte|vue)$/.test(file)) return
        const body = fs.readFileSync(file, 'utf8')
        if (/(?<![\w.$])require\s*\(/.test(body)) offenders.push(path.relative(repo, file))
      })
    }
    if (offenders.length) {
      report.fail(
        rule.id,
        rule.severity,
        `CommonJS require() under sonar.sources: ${offenders.slice(0, 5).join(', ')}${offenders.length > 5 ? ` (+${offenders.length - 5} more)` : ''}`,
        'use ESM in product code',
        rule.scope,
      )
    } else {
      report.note(
        `${rule.id}: neither stub is tracked, and no require() under sonar.sources ` +
          `(${ctx.sonarSources.join(', ')}) — PASS`,
      )
    }
  },

  'platform-yaml-not-hand-authored': (repo, rule, ctx, report) => {
    const tracked = (git(repo, ['ls-files', '.platform']) || '')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => /\.ya?ml$/.test(s))
    if (!tracked.length) {
      report.note(`${rule.id}: no .platform files — the correct state before onboarding (the platform writes them)`)
      return
    }
    const integration = (git(repo, ['log', '--format=%H', '--grep=integrate .* with DevOps Platform AI']) || '')
      .split('\n')
      .filter(Boolean)
      .pop()
    if (!integration) {
      report.fail(
        rule.id,
        rule.severity,
        `hand-authored before any integration commit: ${tracked.join(', ')}`,
        'delete them and let the onboarding commit write them',
        rule.failureMode,
      )
      return
    }
    const early = []
    for (const file of tracked) {
      const added = (git(repo, ['log', '--diff-filter=A', '--format=%H', '--', file]) || '')
        .split('\n')
        .filter(Boolean)
        .pop()
      if (!added) continue
      if (added !== integration && !gitOk(repo, ['merge-base', '--is-ancestor', integration, added])) early.push(file)
    }
    if (early.length) {
      report.fail(
        rule.id,
        rule.severity,
        `added before the integration commit: ${early.join(', ')}`,
        'delete them — the platform writes only what is absent, so a hand-authored file is one it skipped',
        rule.failureMode,
      )
    } else {
      report.note(`${rule.id}: all ${tracked.length} file(s) arrived with or after the integration commit — PASS`)
    }
  },

  'gate-record-names-head': (repo, rule, ctx, report) => {
    const raw = read(repo, 'vibe-release.json')
    if (raw === null) {
      report.note(`${rule.id}: no vibe-release.json — not applicable, the repo has not reached phase 7`)
      return
    }
    let target = null
    try {
      target = JSON.parse(raw)['target-commit-hash']
    } catch {
      report.fail(rule.id, rule.severity, 'vibe-release.json is not valid JSON', 're-run the gate')
      return
    }
    const head = git(repo, ['rev-parse', 'HEAD'])
    if (!target) {
      report.fail(rule.id, rule.severity, 'target-commit-hash is unset', 're-run the gate')
      return
    }
    if (target === head) {
      report.note(`${rule.id}: the record names HEAD — PASS`)
      return
    }
    const allowed = new Set(rule.freshnessAllowedPaths || ['vibe-release.json', 'PROJECT.md', 'docs/REVIEW-PROOF.md'])
    const changed = git(repo, ['diff', '--name-only', `${target}..HEAD`])
    if (changed === null) {
      report.fail(
        rule.id,
        rule.severity,
        `target-commit-hash ${String(target).slice(0, 7)} is not a commit in this repository`,
        're-run the gate',
      )
      return
    }
    const outside = changed.split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => !allowed.has(f))
    if (outside.length) {
      report.fail(
        rule.id,
        rule.severity,
        `record names ${String(target).slice(0, 7)}, and ${outside.length} file(s) changed since: ${outside.slice(0, 4).join(', ')}`,
        're-run the gate against the commit you are shipping',
        rule.failureMode,
      )
    } else {
      report.note(
        `${rule.id}: record names ${String(target).slice(0, 7)}; only release-handoff files changed since — PASS`,
      )
    }
  },

  'reviewer-named': (repo, rule, ctx, report) => {
    const project = read(repo, 'PROJECT.md')
    if (project === null) {
      report.fail(rule.id, rule.severity, 'no PROJECT.md', 'record the dossier')
      return
    }
    const evidence = sectionOf(project, '## Review Evidence')
    if (evidence === null) {
      report.fail(rule.id, rule.severity, 'PROJECT.md has no `## Review Evidence` section', 'add it')
      return
    }
    const m = /^\s*(?:[-*]\s*)?\*{0,2}Reviewer\*{0,2}\s*:\s*(\S+)/m.exec(evidence)
    if (!m) {
      report.fail(
        rule.id,
        rule.severity,
        'no `Reviewer: <github-login|email>` line in `## Review Evidence`',
        `add one — ${rule.fieldFormat}`,
        rule.failureMode,
      )
      return
    }
    const reviewer = m[1].replace(/^@/, '').replace(/[.,;]$/, '').toLowerCase()
    const owner = (sectionOf(project, '## Project Owner') || '').trim().split('\n').map((s) => s.trim()).filter(Boolean)[0]
    const support = (sectionOf(project, '## Support Contact') || '').trim().split('\n').map((s) => s.trim()).filter(Boolean)[0]
    const clash = [owner, support]
      .filter(Boolean)
      .map((s) => s.replace(/^@/, '').toLowerCase())
      .find((s) => s === reviewer || s.split('@')[0] === reviewer.split('@')[0])
    if (clash) {
      report.fail(
        rule.id,
        rule.severity,
        `the named reviewer (${reviewer}) is the Project Owner or the Support Contact`,
        'the reviewer must be neither — prior commits on the repo do not disqualify anyone else',
        rule.failureMode,
      )
    } else {
      report.note(`${rule.id}: reviewer \`${reviewer}\` named and independent of owner/support — PASS`)
    }
  },
}

function walk(dir, fn) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, fn)
    else if (e.isFile()) fn(full)
  }
}

// ---------------------------------------------------------------------------
// stage selection and orchestration
// ---------------------------------------------------------------------------

function inferStage(repo) {
  if (read(repo, 'vibe-release.json') !== null) {
    const integrated = git(repo, ['log', '--format=%H', '--grep=integrate .* with DevOps Platform AI'])
    return integrated ? 'post-onboarding' : 'phase-7'
  }
  if (read(repo, 'Dockerfile') !== null) return 'phase-5'
  return 'phase-2'
}

function run(repo, stageName, contract) {
  const stage = contract.stages[stageName]
  const report = new Report(stageName)

  const pkgRaw = read(repo, 'package.json')
  if (pkgRaw === null) return { report, notApplicable: true }
  let scripts = {}
  try {
    scripts = JSON.parse(pkgRaw).scripts || {}
  } catch {
    report.fail('package.json', 'High', 'root package.json is not valid JSON', 'fix it')
    return { report }
  }

  if (stage.scriptChecks) checkScripts(repo, contract, scripts, report)
  if (stage.agentsFile) checkAgentsFile(repo, contract, scripts, report)

  const dockerfile = read(repo, 'Dockerfile')
  const stages = dockerfile ? dockerfile.split(/^FROM /m) : []
  const props = read(repo, 'sonar-project.properties') || ''
  const srcMatch = /^sonar\.sources=(.+)$/m.exec(props)
  let workspaces = []
  try {
    const ws = JSON.parse(pkgRaw).workspaces
    workspaces = Array.isArray(ws) ? ws : (ws && ws.packages) || []
    // Expand a single level of globbing (`apps/*`), which is all these repos use.
    workspaces = workspaces.flatMap((w) => {
      if (!w.includes('*')) return [w]
      const base = w.replace(/\/\*.*$/, '')
      try {
        return fs
          .readdirSync(path.join(repo, base), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => path.join(base, e.name))
      } catch {
        return []
      }
    })
  } catch {
    workspaces = []
  }

  const ctx = {
    dockerfile,
    finalStage: stages.length > 1 ? `FROM ${stages[stages.length - 1]}` : dockerfile || '',
    sonarSources: srcMatch
      ? srcMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
      : ['.'],
    workspaces,
    contract,
  }

  const byId = new Map(contract.repoChecks.map((c) => [c.id, c]))
  for (const id of stage.repoChecks || []) {
    const rule = byId.get(id)
    if (!rule) {
      report.note(`${id}: listed in stage \`${stageName}\` but not defined in repoChecks — not evaluated`)
      continue
    }
    if (typeof REPO_CHECKS[id] !== 'function') {
      // A rule the data file names and this script does not implement is a gap,
      // not a pass — and never a traceback that hides every other result.
      report.note(`${id}: defined in the contract but not implemented by this script — not evaluated`)
      continue
    }
    REPO_CHECKS[id](repo, rule, ctx, report)
  }

  return { report }
}

// ---------------------------------------------------------------------------
// output
// ---------------------------------------------------------------------------

function print(report, contract) {
  const lines = []
  lines.push(`check-build-contract — stage \`${report.stage}\`  (contract v${contract.version})`)
  lines.push('')

  if (report.findings.length) {
    const w = Math.max(...report.findings.map((f) => f.id.length), 5)
    lines.push(`${'check'.padEnd(w)}  ${'severity'.padEnd(8)}  what the repo has`)
    lines.push(`${'-'.repeat(w)}  ${'-'.repeat(8)}  ${'-'.repeat(52)}`)
    for (const f of report.findings) {
      lines.push(`${f.id.padEnd(w)}  ${f.severity.padEnd(8)}  ${f.has}`)
      lines.push(`${' '.repeat(w)}  ${' '.repeat(8)}  fix: ${f.fix}`)
      if (f.failureMode) lines.push(`${' '.repeat(w)}  ${' '.repeat(8)}  why: ${f.failureMode}`)
      lines.push('')
    }
  }

  for (const n of report.notes) lines.push(`  · ${n}`)
  if (report.notes.length) lines.push('')

  lines.push(
    `VERDICT: ${report.verdict}   (High ${report.count('High')} · Medium ${report.count('Medium')} · Low ${report.count('Low')})`,
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`${e.message}\n\nUsage: node check-build-contract.js [--repo <path>] [--stage <${STAGES.join('|')}>] [--json]`)
    process.exit(4)
  }
  if (args.help) {
    console.log(`Usage: node check-build-contract.js [--repo <path>] [--stage <${STAGES.join('|')}>] [--json]`)
    process.exit(0)
  }

  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'))

  const start = args.repo ? path.resolve(args.repo) : process.cwd()
  const repo = git(start, ['rev-parse', '--show-toplevel']) || start

  if (args.stage && !STAGES.includes(args.stage)) {
    console.error(`unknown stage "${args.stage}" — expected one of ${STAGES.join(', ')}`)
    process.exit(4)
  }
  const stageName = args.stage || inferStage(repo)

  const { report, notApplicable } = run(repo, stageName, contract)

  if (notApplicable) {
    const msg = 'No root package.json — this contract does not apply to this repository.'
    console.log(args.json ? JSON.stringify({ applicable: false, message: msg }, null, 2) : msg)
    process.exit(3)
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          applicable: true,
          stage: report.stage,
          contractVersion: contract.version,
          verdict: report.verdict,
          findings: report.findings,
          notes: report.notes,
        },
        null,
        2,
      ),
    )
  } else {
    console.log(print(report, contract))
  }

  process.exit(report.verdict === 'FAIL' ? 1 : report.verdict === 'CONDITIONAL' ? 2 : 0)
}

if (require.main === module) main()

module.exports = { run, inferStage, Report }
