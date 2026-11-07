import { createHash } from 'node:crypto'

// Offline candidate reconciliation only. No exclusions, acceptance gate, native
// report conversion, I/O, or automatic fingerprint updates belong in this module.
// Callers must supply complete UTF-8 source/control inventories and unfiltered
// native-report normalization. This module cannot discover omitted inputs or
// establish report provenance, AST/member identity, or test-evidence validity.
// Provenance, input/report completeness and evidence validity are caller duties.
const invalid = () => { throw new TypeError('REVIEW_GUARD_INVALID_SCHEMA') }
const requireValue = (condition) => { if (!condition) invalid() }
const text = (value) => typeof value === 'string' && value.length > 0 && value.trim() === value
const positive = (value) => Number.isSafeInteger(value) && value > 0
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const identifier = (value) => text(value) && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)
const qualified = (value) => text(value) && value.split('.').every(identifier)
const token = (value) => text(value) && /^[A-Za-z0-9_/-]+$/u.test(value)

function path(value) {
  return text(value) && /^[A-Za-z0-9_./-]+$/u.test(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

// Only plain data records; accessors, inherited fields and unknown own keys fail.
function record(value, keys) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value))
  requireValue(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  const result = new Map()
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key)
    requireValue(typeof key === 'string' && keys.includes(key) && property && 'value' in property)
    result.set(key, property.value)
  }
  requireValue(result.size === keys.length)
  return result
}

function list(value, nonempty = false) {
  requireValue(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype
    && (!nonempty || value.length > 0))
  // Also reject sparse arrays and extra properties hidden from array iteration.
  requireValue(Reflect.ownKeys(value).length === value.length + 1)
  for (const key of Reflect.ownKeys(value)) {
    requireValue('value' in Object.getOwnPropertyDescriptor(value, key))
  }
  for (const item of value) requireValue(item !== undefined)
  return value
}

function dataMap(value) {
  requireValue(value instanceof Map && Object.getPrototypeOf(value) === Map.prototype
    && Reflect.ownKeys(value).length === 0 && value.size > 0)
}

function inventory(value, hashes) {
  dataMap(value)
  for (const [file, content] of value) {
    requireValue(path(file) && (hashes ? digest(content)
      : typeof content === 'string' && content.isWellFormed()))
  }
  return value
}

export function hashReviewText(value) {
  requireValue(typeof value === 'string' && value.isWellFormed())
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function span(value, hashed = false) {
  record(value, hashed
    ? ['startLine', 'startColumn', 'endLine', 'endColumn', 'sha256']
    : ['startLine', 'startColumn', 'endLine', 'endColumn'])
  requireValue([value.startLine, value.startColumn, value.endLine, value.endColumn].every(positive))
  requireValue(value.startLine < value.endLine
    || (value.startLine === value.endLine && value.startColumn < value.endColumn))
  if (hashed) requireValue(digest(value.sha256))
  return value
}

// One-based UTF-16 columns; exclusive endpoints, preserving all line endings.
function offsets(source, location) {
  const lines = new Map()
  let start = 0
  let line = 1
  for (const match of source.matchAll(/\r\n|[\n\r\u2028\u2029]/gu)) {
    lines.set(line++, { start, end: match.index })
    start = match.index + match[0].length
  }
  lines.set(line, { start, end: source.length })
  const first = lines.get(location.startLine)
  const last = lines.get(location.endLine)
  if (!first || !last || location.startColumn > first.end - first.start + 1
    || location.endColumn > last.end - last.start + 1) return null
  return { start: first.start + location.startColumn - 1, end: last.start + location.endColumn - 1 }
}

function javaType(value, allowVoid) {
  if (!text(value)) return false
  let base = value
  while (base.endsWith('[]')) base = base.slice(0, -2)
  if (base === 'void') return allowVoid && value === 'void'
  return qualified(base)
}

function javaScope(value) {
  requireValue(token(value.pattern) && qualified(value.className))
  requireValue(identifier(value.member) || value.member === '<init>' || value.member === '<clinit>')
  record(value.signature, ['parameters', 'returns'])
  requireValue(list(value.signature.parameters).every((parameter) => javaType(parameter, false)))
  requireValue(javaType(value.signature.returns, true))
  requireValue(value.field === null || identifier(value.field))
  if (value.member === '<init>' || value.member === '<clinit>') {
    requireValue(value.signature.returns === 'void')
  }
  if (value.member === '<clinit>') requireValue(value.signature.parameters.length === 0)
}

function location(value) {
  requireValue(positive(value.startLine) && positive(value.endLine) && value.endLine >= value.startLine)
}

const commonEntryKeys = ['id', 'toolId', 'kind', 'file', 'expectedCount', 'classification', 'rationale', 'evidence', 'anchor']
const javaKeys = ['pattern', 'className', 'member', 'signature', 'field']
const frontendKeys = ['ruleId', 'span', 'snippetSha256']

function entry(value, tools, sources) {
  requireValue(value !== null && typeof value === 'object')
  const kind = Object.getOwnPropertyDescriptor(value, 'kind')?.value
  record(value, [...commonEntryKeys, ...(kind === 'java' ? [...javaKeys, 'locations'] : frontendKeys)])
  requireValue(token(value.id) && token(value.toolId) && path(value.file) && sources.has(value.file))
  requireValue(tools.get(value.toolId)?.kind === value.kind)
  requireValue(positive(value.expectedCount) && ['false-positive', 'design-choice'].includes(value.classification))
  requireValue(text(value.rationale) && list(value.evidence, true).every(text))
  span(value.anchor, true)
  if (value.kind === 'java') {
    javaScope(value)
    const sites = new Set()
    let count = 0
    for (const site of list(value.locations, true)) {
      record(site, ['startLine', 'endLine', 'count'])
      location(site)
      requireValue(positive(site.count) && site.startLine >= value.anchor.startLine && site.endLine <= value.anchor.endLine)
      const key = JSON.stringify([site.startLine, site.endLine])
      requireValue(!sites.has(key))
      sites.add(key)
      count += site.count
    }
    requireValue(count === value.expectedCount)
  } else {
    requireValue(value.kind === 'frontend' && token(value.ruleId) && value.expectedCount === 1)
    span(value.span)
    requireValue(digest(value.snippetSha256))
  }
}

function scopeKey(value) {
  return JSON.stringify([value.toolId, value.pattern, value.className, value.member,
    value.signature.parameters, value.signature.returns, value.field])
}

function sameSpan(a, b) {
  return a.startLine === b.startLine && a.startColumn === b.startColumn
    && a.endLine === b.endLine && a.endColumn === b.endColumn
}

function comparePosition(lineA, columnA, lineB, columnB) {
  return lineA - lineB || columnA - columnB
}

function spansOverlap(a, b) {
  return comparePosition(a.startLine, a.startColumn, b.endLine, b.endColumn) < 0
    && comparePosition(b.startLine, b.startColumn, a.endLine, a.endColumn) < 0
}

function checkInventories(expected, actual, issues, code) {
  if (expected.size !== actual.size) issues.add(code)
  for (const [file, sha256] of expected) {
    if (!actual.has(file) || hashReviewText(actual.get(file)) !== sha256) issues.add(code)
  }
}

function checkAnchor(source, anchor, issues) {
  const range = offsets(source, anchor)
  if (!range || hashReviewText(source.slice(range.start, range.end)) !== anchor.sha256) {
    issues.add('ANCHOR_DRIFT')
  }
  return range
}

function report(value, tools) {
  record(value, ['toolId', 'version', 'reportPresent', 'complete', 'unfiltered', 'healthy', 'exitCode',
    'analysisErrors', 'missingClasses', 'findings'])
  requireValue(token(value.toolId) && text(value.version) && tools.has(value.toolId))
  requireValue([value.reportPresent, value.complete, value.unfiltered, value.healthy].every((flag) => typeof flag === 'boolean'))
  requireValue(value.exitCode === null || Number.isSafeInteger(value.exitCode))
  requireValue(list(value.analysisErrors).every(text) && list(value.missingClasses).every(text))
  for (const finding of list(value.findings)) {
    const java = tools.get(value.toolId).kind === 'java'
    record(finding, ['kind', 'file', 'severity', ...(java ? [...javaKeys, 'startLine', 'endLine'] : ['ruleId', 'span'])])
    requireValue(finding.kind === (java ? 'java' : 'frontend') && path(finding.file))
    requireValue(['warning', 'error'].includes(finding.severity))
    if (java) {
      javaScope(finding)
      location(finding)
    } else {
      requireValue(token(finding.ruleId))
      span(finding.span)
    }
  }
}

/** Invalid schemas throw; all other discrepancies return an unsuccessful audit.
 * A successful reconciliation proves only consistency of the supplied data.
 * Every raw finding is retained, including errors and unmatched diagnostics.
 */
export function reconcileReviewCandidate(input) {
  record(input, ['candidate', 'sources', 'controls', 'reports'])
  const { candidate, sources, controls, reports } = input
  record(candidate, ['schemaVersion', 'sources', 'controls', 'tools', 'entries'])
  requireValue(candidate.schemaVersion === 1)
  inventory(candidate.sources, true)
  inventory(candidate.controls, true)
  inventory(sources, false)
  inventory(controls, false)
  dataMap(candidate.tools)
  for (const [id, tool] of candidate.tools) {
    record(tool, ['kind', 'version'])
    requireValue(token(id) && ['java', 'frontend'].includes(tool.kind) && text(tool.version))
  }
  const entries = list(candidate.entries, true)
  for (const item of entries) entry(item, candidate.tools, candidate.sources)
  for (const raw of list(reports)) report(raw, candidate.tools)

  const issues = new Set()
  const matches = new Map()
  const ids = new Set()
  for (const item of entries) {
    if (ids.has(item.id)) issues.add('DUPLICATE_ENTRY_ID')
    ids.add(item.id)
    matches.set(item.id, 0)
    const source = sources.get(item.file)
    if (source !== undefined) {
      const anchor = checkAnchor(source, item.anchor, issues)
      if (item.kind === 'frontend') {
        const snippet = checkAnchor(source, { ...item.span, sha256: item.snippetSha256 }, issues)
        if (!anchor || !snippet || snippet.start < anchor.start || snippet.end > anchor.end) {
          issues.add('INVALID_STATEMENT_ANCHOR')
        }
      }
    }
  }
  for (const [index, a] of entries.entries()) {
    for (const b of entries.slice(index + 1)) {
      if (a.toolId !== b.toolId || a.kind !== b.kind) continue
      if ((a.kind === 'java' && scopeKey(a) === scopeKey(b))
        || (a.kind === 'frontend' && a.file === b.file && a.ruleId === b.ruleId && spansOverlap(a.span, b.span))) {
        issues.add('OVERLAPPING_ENTRIES')
      }
    }
  }
  checkInventories(candidate.sources, sources, issues, 'SOURCE_DRIFT')
  checkInventories(candidate.controls, controls, issues, 'CONTROL_DRIFT')

  const reported = new Set()
  const rawExitCodes = new Map()
  for (const raw of reports) {
    if (reported.has(raw.toolId)) issues.add('DUPLICATE_REPORT')
    reported.add(raw.toolId)
    rawExitCodes.set(raw.toolId, raw.exitCode)
    if (candidate.tools.get(raw.toolId).version !== raw.version) issues.add('TOOL_VERSION_DRIFT')
    if (!raw.reportPresent || !raw.complete || !raw.unfiltered || !raw.healthy
      || ![0, 1].includes(raw.exitCode)) issues.add('UNHEALTHY_REPORT')
    // Strict raw gates fail on every warning/error; an inconsistent exit must
    // never be reinterpreted as a clean scan or reconciled known-finding scan.
    if ((raw.exitCode === 0 && raw.findings.length > 0)
      || (raw.exitCode === 1 && raw.findings.length === 0)) issues.add('RAW_EXIT_MISMATCH')
    if (raw.analysisErrors.length > 0) issues.add('ANALYSIS_ERRORS')
    if (raw.missingClasses.length > 0) issues.add('MISSING_CLASSES')
    for (const finding of raw.findings) {
      if (finding.severity === 'error') issues.add('DIAGNOSTIC_ERROR')
      const candidates = entries.filter((item) => item.toolId === raw.toolId && item.kind === finding.kind
        && item.file === finding.file && (item.kind === 'java'
          ? scopeKey(item) === scopeKey({ ...finding, toolId: raw.toolId })
          : item.ruleId === finding.ruleId && sameSpan(item.span, finding.span)))
      if (candidates.length !== 1) {
        issues.add(candidates.length === 0 ? 'UNMATCHED_DIAGNOSTIC' : 'AMBIGUOUS_DIAGNOSTIC')
        continue
      }
      const [matched] = candidates
      matches.set(matched.id, matches.get(matched.id) + 1)
      if (matched.kind === 'java' && !matched.locations.some((site) => site.startLine === finding.startLine
        && site.endLine === finding.endLine)) issues.add('UNEXPECTED_JAVA_LOCATION')
    }
  }
  if (reported.size !== candidate.tools.size) issues.add('MISSING_REPORT')
  for (const item of entries) {
    if (matches.get(item.id) !== item.expectedCount) issues.add('MATCH_COUNT_MISMATCH')
    if (item.kind === 'java') {
      for (const site of item.locations) {
        const count = reports.filter((raw) => raw.toolId === item.toolId).flatMap((raw) => raw.findings)
          .filter((finding) => finding.file === item.file
            && scopeKey({ ...finding, toolId: item.toolId }) === scopeKey(item)
            && finding.startLine === site.startLine && finding.endLine === site.endLine).length
        if (count !== site.count) issues.add('JAVA_LOCATION_COUNT_MISMATCH')
      }
    }
  }
  return {
    candidateReconciled: issues.size === 0,
    exclusionsActive: false,
    issues: [...issues],
    matches,
    rawExitCodes,
    rawReports: structuredClone(reports),
  }
}
