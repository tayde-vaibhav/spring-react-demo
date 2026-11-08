import { createHash } from 'node:crypto'
import { types } from 'node:util'
import { ESLint } from 'eslint'
import * as espree from 'espree'
import tsParser from '@typescript-eslint/parser'
import { visitorKeys as tsVisitorKeys } from '@typescript-eslint/visitor-keys'

// Preparation only: no runner, filesystem, environment, gate or exclusions.
// The caller must establish native-report provenance and discover the complete
// inventory. Consistency of supplied data cannot prove either of those facts.
const invalid = () => { throw new TypeError('FRONTEND_NATIVE_INVALID_SCHEMA') }
const requireValue = (condition) => { if (!condition) invalid() }
const integer = (v) => Number.isSafeInteger(v) && v >= 0
const positive = (v) => integer(v) && v > 0
const text = (v) => typeof v === 'string' && v.length > 0 && v.isWellFormed()
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v)
const filePath = (v) => text(v) && !v.includes('\\') && !v.includes('\0')
  && !v.startsWith('/') && !/^[A-Za-z]:/u.test(v)
  && v.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
const ruleId = (v) => text(v) && /^[A-Za-z0-9_@/-]+$/u.test(v)
const hash = (v) => createHash('sha256').update(v, 'utf8').digest('hex')

/** Shared total budget, including source, control, report and expected text. */
export const FRONTEND_NATIVE_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 100_000,
  maxTextUnits: 8 * 1024 * 1024,
})
const limited = (condition) => {
  if (!condition) throw new TypeError('FRONTEND_NATIVE_INPUT_LIMIT')
}

// Inspect descriptors before reading values, and reject proxies before any
// reflection on them. Clone into plain data so validation cannot invoke getters,
// toJSON, iterators, inherited accessors or user-provided coercion methods.
function plainData(value, state = { ancestors: new Set(), nodes: 0, textUnits: 0 }, depth = 0) {
  limited(depth <= FRONTEND_NATIVE_LIMITS.maxDepth && ++state.nodes <= FRONTEND_NATIVE_LIMITS.maxNodes)
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    state.textUnits += value.length
    limited(state.textUnits <= FRONTEND_NATIVE_LIMITS.maxTextUnits)
    requireValue(value.isWellFormed())
    return value
  }
  if (typeof value === 'number') { requireValue(Number.isFinite(value)); return value }
  requireValue(typeof value === 'object' && !types.isProxy(value) && !state.ancestors.has(value))
  const array = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  requireValue(array ? prototype === Array.prototype
    : prototype === Object.prototype || prototype === null)
  state.ancestors.add(value)
  const entries = []
  const ownKeys = Reflect.ownKeys(value)
  // Stop before copying a container whose children already exceed the budget.
  limited(ownKeys.length <= FRONTEND_NATIVE_LIMITS.maxNodes - state.nodes + (array ? 1 : 0))
  for (const key of ownKeys) {
    const property = Object.getOwnPropertyDescriptor(value, key)
    requireValue(typeof key === 'string' && property && 'value' in property)
    if (array && key === 'length') continue
    requireValue(property.enumerable)
    state.textUnits += key.length
    limited(state.textUnits <= FRONTEND_NATIVE_LIMITS.maxTextUnits)
    entries.push([key, plainData(property.value, state, depth + 1)])
  }
  state.ancestors.delete(value)
  if (!array) return Object.fromEntries(entries)
  requireValue(entries.length === value.length
    && entries.every(([key], index) => key === String(index)))
  return entries.map(([, item]) => item)
}

function record(value, required, optional = []) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value))
  requireValue(required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => required.includes(key) || optional.includes(key)))
}
function list(value) { requireValue(Array.isArray(value)); return value }
function span(value) {
  record(value, ['startLine', 'startColumn', 'endLine', 'endColumn'])
  requireValue(Object.values(value).every(positive))
  requireValue(value.endLine > value.startLine
    || (value.endLine === value.startLine && value.endColumn > value.startColumn))
}
function sameSpan(a, b) {
  return a.startLine === b.startLine && a.startColumn === b.startColumn
    && a.endLine === b.endLine && a.endColumn === b.endColumn
}
function inventory(items, source) {
  const seen = new Set()
  for (const item of list(items)) {
    record(item, source ? ['file', 'sha256', 'parser', 'sourceType', 'jsx'] : ['file', 'sha256'],
      source ? ['reportPath'] : [])
    requireValue(filePath(item.file) && digest(item.sha256))
    if (source) requireValue(['espree', 'typescript-eslint'].includes(item.parser)
      && ['module', 'script'].includes(item.sourceType) && typeof item.jsx === 'boolean')
    if (Object.hasOwn(item, 'reportPath')) requireValue(text(item.reportPath))
    requireValue(!seen.has(item.file))
    seen.add(item.file)
  }
  return seen
}
function contents(items) {
  const files = new Map()
  for (const item of list(items)) {
    record(item, ['file', 'content'])
    requireValue(filePath(item.file) && typeof item.content === 'string' && !files.has(item.file))
    files.set(item.file, item.content)
  }
  return files
}
function fix(value) {
  record(value, ['range', 'text'])
  requireValue(list(value.range).length === 2 && value.range.every(integer)
    && value.range[1] >= value.range[0] && typeof value.text === 'string')
}
function message(value, suppressed) {
  record(value, ['ruleId', 'severity', 'message'], ['messageId', 'nodeType', 'fatal',
    'line', 'column', 'endLine', 'endColumn', 'fix', 'suggestions', 'suppressions'])
  requireValue((value.ruleId === null || ruleId(value.ruleId)) && [0, 1, 2].includes(value.severity)
    && text(value.message))
  for (const key of ['messageId', 'nodeType']) {
    if (Object.hasOwn(value, key)) requireValue(value[key] === null || text(value[key]))
  }
  if (Object.hasOwn(value, 'fatal')) requireValue(typeof value.fatal === 'boolean')
  for (const key of ['line', 'column', 'endLine', 'endColumn']) {
    // Missing/null/zero coordinates are retained, then explicitly blocked.
    if (Object.hasOwn(value, key)) requireValue(value[key] === null || integer(value[key]))
  }
  if (Object.hasOwn(value, 'fix')) fix(value.fix)
  if (Object.hasOwn(value, 'suggestions')) {
    for (const suggestion of list(value.suggestions)) {
      record(suggestion, ['desc', 'fix'], ['messageId', 'data'])
      requireValue(text(suggestion.desc))
      if (Object.hasOwn(suggestion, 'messageId')) requireValue(text(suggestion.messageId))
      if (Object.hasOwn(suggestion, 'data')) {
        record(suggestion.data, [], Object.keys(suggestion.data ?? {}))
        requireValue(Object.values(suggestion.data).every((v) => ['string', 'number'].includes(typeof v)))
      }
      fix(suggestion.fix)
    }
  }
  if (suppressed) requireValue(Object.hasOwn(value, 'suppressions'))
  else requireValue(!Object.hasOwn(value, 'suppressions'))
  if (suppressed) {
    requireValue(list(value.suppressions).length > 0)
    for (const suppression of value.suppressions) {
      record(suppression, ['kind', 'justification'])
      requireValue(text(suppression.kind) && typeof suppression.justification === 'string')
    }
  }
}
function nativeResult(value) {
  record(value, ['filePath', 'messages', 'suppressedMessages', 'errorCount', 'warningCount',
    'fatalErrorCount', 'fixableErrorCount', 'fixableWarningCount'],
  ['source', 'output', 'usedDeprecatedRules'])
  // Native paths are matched to explicit reportPath identities, never guessed.
  requireValue(text(value.filePath))
  for (const key of ['errorCount', 'warningCount', 'fatalErrorCount', 'fixableErrorCount', 'fixableWarningCount']) {
    requireValue(integer(value[key]))
  }
  for (const item of list(value.messages)) message(item, false)
  for (const item of list(value.suppressedMessages)) message(item, true)
  for (const key of ['source', 'output']) {
    if (Object.hasOwn(value, key)) requireValue(typeof value[key] === 'string')
  }
  if (Object.hasOwn(value, 'usedDeprecatedRules')) {
    for (const use of list(value.usedDeprecatedRules)) {
      record(use, ['ruleId', 'replacedBy'], ['info'])
      requireValue(ruleId(use.ruleId) && list(use.replacedBy).every(ruleId))
      // ESLint's versioned deprecation metadata is retained as JSON data.
      if (Object.hasOwn(use, 'info')) record(use.info, [], Object.keys(use.info ?? {}))
    }
  }
}
function validate(input) {
  record(input, ['expected', 'sources', 'controls', 'version', 'exitCode', 'results'])
  const e = input.expected
  record(e, ['toolId', 'version', 'parserVersions', 'sources', 'controls', 'warnings'])
  requireValue(ruleId(e.toolId) && text(e.version) && text(input.version))
  record(e.parserVersions, ['espree', 'typescript-eslint'])
  requireValue(Object.values(e.parserVersions).every(text))
  const files = inventory(e.sources, true)
  requireValue(files.size > 0)
  requireValue(inventory(e.controls, false).size > 0)
  requireValue(input.exitCode === null || integer(input.exitCode))
  for (const warning of list(e.warnings)) {
    record(warning, ['file', 'ruleId', 'span', 'snippetSha256', 'anchor'])
    requireValue(files.has(warning.file) && ruleId(warning.ruleId) && digest(warning.snippetSha256))
    span(warning.span)
    record(warning.anchor, ['nodeType', 'span', 'sha256'])
    requireValue(text(warning.anchor.nodeType) && digest(warning.anchor.sha256))
    span(warning.anchor.span)
  }
  for (const result of list(input.results)) nativeResult(result)
}

function lineTable(source) {
  const lines = []
  let start = 0
  for (const match of source.matchAll(/\r\n|[\n\r\u2028\u2029]/gu)) {
    lines.push({ start, end: match.index })
    start = match.index + match[0].length
  }
  lines.push({ start, end: source.length })
  return lines
}
function offsets(lines, location) {
  const first = lines[location.startLine - 1]
  const last = lines[location.endLine - 1]
  if (!first || !last || location.startColumn > first.end - first.start + 1
    || location.endColumn > last.end - last.start + 1) return null
  const start = first.start + location.startColumn - 1
  const end = last.start + location.endColumn - 1
  return end > start ? { start, end } : null
}
function nativeSpan(item) {
  if (![item.line, item.column, item.endLine, item.endColumn].every(positive)) return null
  if (item.endLine < item.line || (item.endLine === item.line && item.endColumn <= item.column)) return null
  return { startLine: item.line, startColumn: item.column, endLine: item.endLine, endColumn: item.endColumn }
}
function statements(source, spec) {
  const options = { ecmaVersion: 'latest', sourceType: spec.sourceType, loc: true, range: true,
    ecmaFeatures: { jsx: spec.jsx } }
  const ast = spec.parser === 'espree' ? espree.parse(source, options) : tsParser.parse(source, {
    ...options, jsx: spec.jsx, filePath: spec.jsx ? '/virtual/source.tsx' : '/virtual/source.ts',
    tsconfigRootDir: '/virtual', project: false, projectService: false,
    programs: undefined, errorOnUnknownASTType: true, onUnsupportedTypeScriptVersion: 'error',
  })
  const keys = spec.parser === 'espree' ? espree.VisitorKeys : tsVisitorKeys
  const nodes = []
  function walk(node) {
    if (!node || typeof node.type !== 'string') return
    if (/(?:Statement|Declaration)$/u.test(node.type)) nodes.push(node)
    for (const key of keys[node.type] ?? []) {
      const child = node[key]
      if (Array.isArray(child)) child.forEach(walk)
      else walk(child)
    }
  }
  walk(ast)
  return nodes
}

/** Pure offline consistency audit. Never activates exclusions or accepts a gate.
 * Malformed/non-JSON input throws; all well-formed discrepancies are blockers.
 * Every native message, including unsupported locations, remains in diagnostics
 * and rawResults. Do not use the findings-only projection as an acceptance gate.
 */
export function normalizeFrontendNativeReport(value) {
  const input = plainData(value)
  validate(input)
  const { expected, results } = input
  const sources = contents(input.sources)
  const controls = contents(input.controls)
  const blockers = new Set()
  const block = (code) => blockers.add(code)
  function checkInventory(expectedItems, actual, code) {
    if (expectedItems.length !== actual.size) block(code)
    for (const item of expectedItems) {
      if (!actual.has(item.file) || hash(actual.get(item.file)) !== item.sha256) block(code)
    }
  }
  checkInventory(expected.sources, sources, 'SOURCE_DRIFT')
  checkInventory(expected.controls, controls, 'CONTROL_DRIFT')
  if (input.version !== expected.version || input.version !== ESLint.version) block('TOOL_VERSION_DRIFT')
  if (expected.parserVersions.espree !== espree.version
    || expected.parserVersions['typescript-eslint'] !== tsParser.version) block('PARSER_VERSION_DRIFT')
  const expectedFiles = new Map(expected.sources.map((item) => [item.file, item]))
  const reportPaths = new Map()
  for (const item of expected.sources) {
    const path = item.reportPath ?? item.file
    if (reportPaths.has(path)) block('DUPLICATE_REPORT_PATH')
    reportPaths.set(path, item.file)
  }
  const parsed = new Map()
  for (const item of expected.sources) {
    if (!sources.has(item.file)) continue
    const source = sources.get(item.file)
    try { parsed.set(item.file, { source, lines: lineTable(source), nodes: statements(source, item) }) }
    catch { block('SOURCE_PARSE_ERROR') }
  }
  const expectedKeys = new Set()
  const matches = expected.warnings.map(() => 0)
  for (const warning of expected.warnings) {
    const key = JSON.stringify([warning.file, warning.ruleId, warning.span.startLine,
      warning.span.startColumn, warning.span.endLine, warning.span.endColumn])
    if (expectedKeys.has(key)) block('DUPLICATE_EXPECTED_WARNING')
    expectedKeys.add(key)
    const data = parsed.get(warning.file)
    if (!data) { block('UNVERIFIABLE_ANCHOR'); continue }
    const diagnostic = offsets(data.lines, warning.span)
    const anchor = offsets(data.lines, warning.anchor.span)
    if (!diagnostic || hash(data.source.slice(diagnostic.start, diagnostic.end)) !== warning.snippetSha256) {
      block('SNIPPET_DRIFT')
    }
    if (!anchor || hash(data.source.slice(anchor.start, anchor.end)) !== warning.anchor.sha256) block('ANCHOR_DRIFT')
    if (!diagnostic || !anchor) { block('INVALID_STATEMENT_ANCHOR'); continue }
    const enclosing = data.nodes.filter((node) => node.range[0] <= diagnostic.start && node.range[1] >= diagnostic.end)
      .sort((a, b) => (a.range[1] - a.range[0]) - (b.range[1] - b.range[0]))
    const node = enclosing[0]
    if (!node || node.type !== warning.anchor.nodeType || node.range[0] !== anchor.start || node.range[1] !== anchor.end) {
      block('INVALID_STATEMENT_ANCHOR')
    }
  }
  const covered = new Set()
  const diagnostics = []
  const findings = []
  let errors = 0
  let warnings = 0
  for (const result of results) {
    const file = reportPaths.get(result.filePath) ?? result.filePath
    if (!reportPaths.has(result.filePath)) block('UNEXPECTED_REPORT_FILE')
    if (covered.has(file)) block('DUPLICATE_REPORT_FILE')
    covered.add(file)
    const active = result.messages
    const count = (predicate) => active.filter(predicate).length
    const errorCount = count((m) => m.severity === 2)
    const warningCount = count((m) => m.severity === 1)
    const fatalCount = count((m) => m.fatal === true)
    errors += errorCount
    warnings += warningCount
    if (result.errorCount !== errorCount || result.warningCount !== warningCount
      || result.fatalErrorCount !== fatalCount
      || result.fixableErrorCount !== count((m) => m.severity === 2 && Object.hasOwn(m, 'fix'))
      || result.fixableWarningCount !== count((m) => m.severity === 1 && Object.hasOwn(m, 'fix'))) block('NATIVE_COUNT_MISMATCH')
    if (Object.hasOwn(result, 'source') && result.source !== sources.get(file)) block('REPORT_SOURCE_DRIFT')
    if (Object.hasOwn(result, 'output')) block('FIXED_REPORT_UNSUPPORTED')
    const seen = new Set()
    for (const [suppressed, messages] of [[false, active], [true, result.suppressedMessages]]) {
      for (const item of messages) {
        const location = nativeSpan(item)
        const identity = JSON.stringify([item.ruleId, item.severity, location ? null : item.message,
          item.line ?? null, item.column ?? null, item.endLine ?? null, item.endColumn ?? null])
        if (seen.has(identity)) block('DUPLICATE_DIAGNOSTIC')
        seen.add(identity)
        diagnostics.push({ file, suppressed, native: item, span: location })
        if (suppressed) block('SUPPRESSED_DIAGNOSTIC')
        if (suppressed && item.ruleId?.startsWith('security/')) block('SUPPRESSED_SECURITY_DIAGNOSTIC')
        if (item.fatal) block('FATAL_DIAGNOSTIC')
        if (item.ruleId === null) block('NULL_RULE_DIAGNOSTIC')
        if (item.severity !== 1) block('UNEXPECTED_SEVERITY')
        const data = parsed.get(file)
        if (!location || !data || !offsets(data.lines, location)) block('UNLOCATED_DIAGNOSTIC')
        if (location && data && offsets(data.lines, location) && item.ruleId !== null && item.severity > 0) {
          if (!suppressed) findings.push({ kind: 'frontend', file, ruleId: item.ruleId,
            severity: item.severity === 1 ? 'warning' : 'error', span: location })
        }
        if (suppressed) continue
        const candidates = expected.warnings.flatMap((warning, index) => warning.file === file
          && warning.ruleId === item.ruleId && location && sameSpan(warning.span, location) ? [index] : [])
        if (candidates.length !== 1) block(candidates.length ? 'AMBIGUOUS_DIAGNOSTIC' : 'UNEXPECTED_DIAGNOSTIC')
        else matches[candidates[0]]++
      }
    }
  }
  if (covered.size !== expectedFiles.size || [...expectedFiles.keys()].some((file) => !covered.has(file))) block('REPORT_COVERAGE_MISMATCH')
  if (matches.some((count) => count !== 1) || warnings !== expected.warnings.length) block('WARNING_COUNT_MISMATCH')
  // The prepared contract is the strict native CLI (--max-warnings 0).
  // Default ESLint CLI behavior: parser errors also exit 1. An infrastructure
  // exit of 2 always blocks; there is no clean reinterpretation of it here.
  const expectedExit = errors + warnings > 0 ? 1 : 0
  if (input.exitCode !== expectedExit) block('RAW_EXIT_MISMATCH')
  if (![0, 1].includes(input.exitCode)) block('UNHEALTHY_EXIT')
  const issues = [...blockers]
  return {
    adapterConsistent: issues.length === 0, exclusionsActive: false, blockers: issues,
    diagnostics, rawResults: results, matches,
    report: { toolId: expected.toolId, version: input.version, reportPresent: results.length > 0,
      complete: issues.length === 0, unfiltered: !diagnostics.some((d) => d.suppressed),
      healthy: issues.length === 0, exitCode: input.exitCode, analysisErrors: issues,
      missingClasses: [], findings },
  }
}

/** Installed implementation identities, without constructing or running ESLint. */
export function frontendNativeVersions() {
  return { eslint: ESLint.version, espree: espree.version, 'typescript-eslint': tsParser.version }
}
