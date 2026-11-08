import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'vitest'
import { FRONTEND_NATIVE_LIMITS, frontendNativeVersions, normalizeFrontendNativeReport } from './review-native-frontend.mjs'

// Synthetic source/report strings only: no fixtures, services, secrets, live
// runners, filesystem reads or analyzer execution. Tests await review approval.
const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex')
const span = (start, end, line = 1) => ({ startLine: line, startColumn: start, endLine: line, endColumn: end })
const file = 'src/synthetic.mjs'
const ruleId = 'security/detect-object-injection'

function fixture(source = 'const value = bag[key];', snippet = 'bag[key]', anchor = source) {
  const versions = frontendNativeVersions()
  const start = source.indexOf(snippet) + 1
  const anchorStart = source.indexOf(anchor) + 1
  const location = span(start, start + snippet.length)
  const config = 'export default []\n'
  return {
    expected: {
      toolId: 'eslint-security', version: versions.eslint,
      parserVersions: { espree: versions.espree, 'typescript-eslint': versions['typescript-eslint'] },
      sources: [{ file, sha256: hash(source), parser: 'espree', sourceType: 'module', jsx: false }],
      controls: [{ file: 'eslint.synthetic.config.mjs', sha256: hash(config) }],
      warnings: [{ file, ruleId, span: location, snippetSha256: hash(snippet),
        anchor: { nodeType: 'VariableDeclaration', span: span(anchorStart, anchorStart + anchor.length), sha256: hash(anchor) } }],
    },
    sources: [{ file, content: source }],
    controls: [{ file: 'eslint.synthetic.config.mjs', content: config }],
    version: versions.eslint, exitCode: 1,
    results: [{ filePath: file, messages: [{ ruleId, severity: 1, message: 'Synthetic diagnostic',
      line: location.startLine, column: location.startColumn, endLine: location.endLine, endColumn: location.endColumn,
      nodeType: 'MemberExpression' }], suppressedMessages: [], errorCount: 0, warningCount: 1,
    fatalErrorCount: 0, fixableErrorCount: 0, fixableWarningCount: 0, usedDeprecatedRules: [] }],
  }
}
function blocked(input, ...codes) {
  const result = normalizeFrontendNativeReport(input)
  assert.equal(result.adapterConsistent, false)
  assert.equal(result.exclusionsActive, false)
  assert.equal(result.report.healthy, false)
  for (const code of codes) assert.ok(result.blockers.includes(code), `${code}: ${result.blockers.join(', ')}`)
  return result
}
function cleanResult(path) {
  return { filePath: path, messages: [], suppressedMessages: [], errorCount: 0, warningCount: 0,
    fatalErrorCount: 0, fixableErrorCount: 0, fixableWarningCount: 0 }
}

test('accepts a complete native report without removing the known warning', () => {
  const input = fixture()
  const result = normalizeFrontendNativeReport(input)
  assert.equal(result.adapterConsistent, true)
  assert.equal(result.exclusionsActive, false)
  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.matches, [1])
  assert.equal(result.report.exitCode, 1)
  assert.equal(result.report.findings.length, 1)
  assert.equal(result.diagnostics.length, 1)
  assert.deepEqual(result.rawResults, input.results)
  input.results[0].messages[0].message = 'mutation after audit'
  assert.equal(result.diagnostics[0].native.message, 'Synthetic diagnostic')
})

test('accepts explicitly mapped absolute native path and coverage of a clean file', () => {
  const input = fixture()
  input.expected.sources[0].reportPath = '/virtual/frontend/src/synthetic.mjs'
  input.results[0].filePath = input.expected.sources[0].reportPath
  const second = 'src/clean.mjs'
  const content = 'export const clean = 1;'
  input.expected.sources.push({ ...input.expected.sources[0], file: second, reportPath: '/virtual/clean.mjs', sha256: hash(content) })
  input.sources.push({ file: second, content })
  input.results.push(cleanResult('/virtual/clean.mjs'))
  const result = normalizeFrontendNativeReport(input)
  assert.equal(result.adapterConsistent, true)
  assert.equal(result.diagnostics[0].file, file)
  assert.equal(result.rawResults[0].filePath, '/virtual/frontend/src/synthetic.mjs')
})

test('retains every bounded native message, fix and suggestion across multiple statements', () => {
  const first = 'const value = bag[key];'
  const second = 'const other = bag[next];'
  const source = `${first} ${second}`
  const input = fixture(source, 'bag[key]', first)
  const start = source.indexOf('bag[next]') + 1
  const nextSpan = span(start, start + 'bag[next]'.length)
  input.expected.warnings.push({ file, ruleId, span: nextSpan, snippetSha256: hash('bag[next]'),
    anchor: { nodeType: 'VariableDeclaration', span: span(first.length + 2, source.length + 1), sha256: hash(second) } })
  input.results[0].messages.push({ ruleId, severity: 1, message: 'Second synthetic diagnostic',
    line: 1, column: start, endLine: 1, endColumn: nextSpan.endColumn,
    fix: { range: [start - 1, nextSpan.endColumn - 1], text: 'bag.safe' },
    suggestions: [{ desc: 'Synthetic suggestion', fix: { range: [start - 1, nextSpan.endColumn - 1], text: 'bag.literal' } }] })
  input.results[0].warningCount = 2
  input.results[0].fixableWarningCount = 1
  const result = normalizeFrontendNativeReport(input)
  assert.equal(result.adapterConsistent, true)
  assert.equal(result.diagnostics.length, 2)
  assert.deepEqual(result.rawResults, input.results)
  assert.deepEqual(result.matches, [1, 1])
})

test('accepts an entirely clean explicit inventory only with exit zero', () => {
  const input = fixture()
  input.expected.warnings = []
  input.results = [cleanResult(file)]
  input.exitCode = 0
  assert.equal(normalizeFrontendNativeReport(input).adapterConsistent, true)
  input.exitCode = 1
  blocked(input, 'RAW_EXIT_MISMATCH')
})

test('parses TS, TSX and JSX using installed source parsers', () => {
  for (const [source, parser, jsx] of [
    ['const value: unknown = bag[key];', 'typescript-eslint', false],
    ['const value = <div>{bag[key]}</div>;', 'typescript-eslint', true],
    ['const value = <div>{bag[key]}</div>;', 'espree', true],
  ]) {
    const input = fixture(source)
    Object.assign(input.expected.sources[0], { parser, jsx })
    assert.equal(normalizeFrontendNativeReport(input).adapterConsistent, true)
  }
})

test('uses UTF-16 exclusive spans, preserving CRLF and astral text', () => {
  const statement = 'const value = "😀" + bag[key];'
  const input = fixture(statement)
  const source = `// synthetic\r\n${statement}\r\n`
  input.sources[0].content = source
  input.expected.sources[0].sha256 = hash(source)
  for (const location of [input.expected.warnings[0].span, input.expected.warnings[0].anchor.span]) {
    location.startLine = 2
    location.endLine = 2
  }
  input.results[0].messages[0].line = 2
  input.results[0].messages[0].endLine = 2
  assert.equal(normalizeFrontendNativeReport(input).adapterConsistent, true)
  input.expected.warnings[0].span.endColumn--
  blocked(input, 'SNIPPET_DRIFT', 'WARNING_COUNT_MISMATCH')
})

test('rejects hash-correct arbitrary snippets masquerading as AST statement anchors', () => {
  const input = fixture()
  input.expected.warnings[0].anchor = {
    nodeType: 'MemberExpression', span: input.expected.warnings[0].span, sha256: hash('bag[key]'),
  }
  blocked(input, 'INVALID_STATEMENT_ANCHOR')
})

test('rejects another statement on the same line and an enclosing parent statement', () => {
  const source = 'const left = 1; const value = bag[key];'
  const wrong = fixture(source, 'bag[key]', 'const left = 1;')
  blocked(wrong, 'INVALID_STATEMENT_ANCHOR')
  const nested = fixture('if (ready) { const value = bag[key]; }')
  nested.expected.warnings[0].anchor.nodeType = 'IfStatement'
  blocked(nested, 'INVALID_STATEMENT_ANCHOR')
  nested.expected.warnings[0].anchor.nodeType = 'VariableDeclaration'
  blocked(nested, 'INVALID_STATEMENT_ANCHOR')
})

test('rejects an AST-type mutation even with unchanged text hash and range', () => {
  const input = fixture()
  input.expected.warnings[0].anchor.nodeType = 'ExpressionStatement'
  blocked(input, 'INVALID_STATEMENT_ANCHOR')
})

test('blocks and retains suppressed security diagnostics', () => {
  const input = fixture()
  const native = { ...input.results[0].messages[0], suppressions: [{ kind: 'directive', justification: 'synthetic' }] }
  input.results[0].suppressedMessages.push(native)
  const result = blocked(input, 'SUPPRESSED_DIAGNOSTIC', 'SUPPRESSED_SECURITY_DIAGNOSTIC', 'DUPLICATE_DIAGNOSTIC')
  assert.equal(result.diagnostics.length, 2)
  assert.deepEqual(result.rawResults[0].suppressedMessages, [native])
  assert.equal(result.report.unfiltered, false)
})

test('suppressed-only reports cannot masquerade as clean scans', () => {
  const input = fixture()
  input.expected.warnings = []
  const native = { ...input.results[0].messages[0], suppressions: [{ kind: 'external', justification: '' }] }
  input.results[0] = { ...cleanResult(file), suppressedMessages: [native] }
  input.exitCode = 0
  const result = blocked(input, 'SUPPRESSED_SECURITY_DIAGNOSTIC')
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.report.findings.length, 0)
})

test('non-security suppressions remain fail-closed', () => {
  const input = fixture()
  const native = { ...input.results[0].messages[0], ruleId: 'react-refresh/only-export-components',
    suppressions: [{ kind: 'directive', justification: 'Synthetic existing directive' }] }
  input.results[0].suppressedMessages.push(native)
  const result = blocked(input, 'SUPPRESSED_DIAGNOSTIC')
  assert.deepEqual(result.rawResults[0].suppressedMessages, [native])
  assert.equal(result.diagnostics.length, 2)
})

test('preserves fatal, null-rule and completely unlocated native messages', () => {
  const input = fixture()
  const native = { ruleId: null, severity: 2, fatal: true, message: 'Synthetic parser/config failure' }
  input.results[0] = { ...cleanResult(file), messages: [native], errorCount: 1, fatalErrorCount: 1 }
  const result = blocked(input, 'FATAL_DIAGNOSTIC', 'NULL_RULE_DIAGNOSTIC', 'UNLOCATED_DIAGNOSTIC', 'UNEXPECTED_SEVERITY')
  assert.deepEqual(result.diagnostics[0].native, native)
  assert.equal(result.diagnostics[0].span, null)
  assert.equal(result.report.findings.length, 0)
  assert.deepEqual(result.rawResults[0].messages, [native])
})

test('blocks missing, null, zero and out-of-source positions without fabricating spans', () => {
  for (const mutation of [
    (m) => { delete m.endColumn },
    (m) => { m.line = null },
    (m) => { m.column = 0 },
    (m) => { m.endColumn = 500 },
    (m) => { m.endColumn = m.column },
  ]) {
    const input = fixture()
    mutation(input.results[0].messages[0])
    const result = blocked(input, 'UNLOCATED_DIAGNOSTIC')
    assert.equal(result.diagnostics.length, 1)
    assert.equal(result.report.findings.length, 0)
  }
})

test('rejects severity, warning count, duplicate and unexpected rule changes', () => {
  const error = fixture()
  error.results[0].messages[0].severity = 2
  error.results[0].warningCount = 0
  error.results[0].errorCount = 1
  blocked(error, 'UNEXPECTED_SEVERITY', 'WARNING_COUNT_MISMATCH')
  const extra = fixture()
  extra.results[0].messages.push({ ...extra.results[0].messages[0], message: 'Another text at the same identity' })
  extra.results[0].warningCount = 2
  blocked(extra, 'DUPLICATE_DIAGNOSTIC', 'WARNING_COUNT_MISMATCH')
  const unexpected = fixture()
  unexpected.results[0].messages[0].ruleId = 'synthetic/unexpected'
  blocked(unexpected, 'UNEXPECTED_DIAGNOSTIC', 'WARNING_COUNT_MISMATCH')
  const missing = fixture()
  missing.results = [cleanResult(file)]
  missing.exitCode = 0
  blocked(missing, 'WARNING_COUNT_MISMATCH')
})

test('rejects duplicate, missing and out-of-inventory native result files', () => {
  const duplicate = fixture()
  duplicate.results.push(structuredClone(duplicate.results[0]))
  blocked(duplicate, 'DUPLICATE_REPORT_FILE')
  const missing = fixture()
  missing.results = []
  missing.exitCode = 0
  blocked(missing, 'REPORT_COVERAGE_MISMATCH')
  const outside = fixture()
  outside.results.push(cleanResult('../outside.mjs'))
  blocked(outside, 'UNEXPECTED_REPORT_FILE', 'REPORT_COVERAGE_MISMATCH')
  const expectedDuplicate = fixture()
  expectedDuplicate.expected.warnings.push(structuredClone(expectedDuplicate.expected.warnings[0]))
  blocked(expectedDuplicate, 'DUPLICATE_EXPECTED_WARNING', 'AMBIGUOUS_DIAGNOSTIC')
  const paths = fixture()
  paths.expected.sources.push({ ...paths.expected.sources[0], file: 'src/other.mjs', reportPath: file })
  paths.sources.push({ file: 'src/other.mjs', content: paths.sources[0].content })
  blocked(paths, 'DUPLICATE_REPORT_PATH')
})

test('rejects native count/fixability tampering and inconsistent raw exits', () => {
  for (const field of ['warningCount', 'errorCount', 'fatalErrorCount', 'fixableErrorCount', 'fixableWarningCount']) {
    const input = fixture()
    input.results[0][field]++
    blocked(input, 'NATIVE_COUNT_MISMATCH')
  }
  for (const exitCode of [0, 2, null]) {
    const input = fixture()
    input.exitCode = exitCode
    blocked(input, 'RAW_EXIT_MISMATCH')
  }
})

test('rejects source/control/tool/parser drift and source-report substitutions', () => {
  for (const mutate of [
    (i) => { i.sources[0].content += '\n' },
    (i) => { i.sources = [] },
    (i) => { i.sources.push({ file: 'src/extra.mjs', content: '' }) },
  ]) { const input = fixture(); mutate(input); blocked(input, 'SOURCE_DRIFT') }
  const config = fixture()
  config.controls[0].content += '// changed'
  blocked(config, 'CONTROL_DRIFT')
  const version = fixture()
  version.version = 'synthetic-changed-version'
  blocked(version, 'TOOL_VERSION_DRIFT')
  const parser = fixture()
  parser.expected.parserVersions.espree = 'synthetic-changed-version'
  blocked(parser, 'PARSER_VERSION_DRIFT')
  const native = fixture()
  native.results[0].source = 'synthetic changed source'
  blocked(native, 'REPORT_SOURCE_DRIFT')
  const output = fixture()
  output.results[0].output = output.sources[0].content
  blocked(output, 'FIXED_REPORT_UNSUPPORTED')
})

test('rejects snippet/anchor hash drift and source parse errors explicitly', () => {
  const snippet = fixture()
  snippet.expected.warnings[0].snippetSha256 = hash('synthetic other text')
  blocked(snippet, 'SNIPPET_DRIFT')
  const anchor = fixture()
  anchor.expected.warnings[0].anchor.sha256 = hash('synthetic other text')
  blocked(anchor, 'ANCHOR_DRIFT')
  const broken = fixture()
  broken.sources[0].content = 'const = ;'
  broken.expected.sources[0].sha256 = hash(broken.sources[0].content)
  blocked(broken, 'SOURCE_PARSE_ERROR', 'UNVERIFIABLE_ANCHOR')
})

test('rejects malformed schemas rather than treating malformed reports as clean', () => {
  for (const mutate of [
    (i) => { delete i.results[0].suppressedMessages },
    (i) => { i.results[0].warningCount = -1 },
    (i) => { i.results[0].messages[0].severity = 3 },
    (i) => { i.results[0].messages[0].line = '1' },
    (i) => { i.results[0].unknown = [] },
    (i) => { i.sources.push({ ...i.sources[0] }) },
    (i) => { i.expected.sources.push({ ...i.expected.sources[0] }) },
    (i) => { i.expected.sources[0].file = '../outside.mjs' },
    (i) => { i.sources[0].content = '\uD800' },
    (i) => { i.results[0].messages[0].fix = { range: [4, 1], text: '' } },
    (i) => { i.expected.controls = [] },
    (i) => { i.results[0].suppressedMessages.push({ ...i.results[0].messages[0], suppressions: [] }) },
  ]) {
    const input = fixture()
    mutate(input)
    assert.throws(() => normalizeFrontendNativeReport(input), { message: 'FRONTEND_NATIVE_INVALID_SCHEMA' })
  }
})

test('rejects accessors, proxies, inherited fields, sparse arrays and toJSON without invocation', () => {
  let invoked = 0
  const inputs = []
  const getter = fixture()
  Object.defineProperty(getter.results[0], 'messages', { enumerable: true, get() { invoked++; return [] } })
  inputs.push(getter)
  const proxy = fixture()
  proxy.results[0] = new Proxy(proxy.results[0], { ownKeys() { invoked++; return [] } })
  inputs.push(proxy)
  const inherited = fixture()
  inherited.results[0] = Object.create(inherited.results[0])
  inputs.push(inherited)
  const sparse = fixture()
  sparse.results.length = 2
  inputs.push(sparse)
  const json = fixture()
  json.toJSON = () => { invoked++; return {} }
  inputs.push(json)
  const cyclic = fixture()
  cyclic.extra = cyclic
  inputs.push(cyclic)
  const symbol = fixture()
  symbol[Symbol('hidden')] = true
  inputs.push(symbol)
  for (const input of inputs) assert.throws(() => normalizeFrontendNativeReport(input), {
    message: 'FRONTEND_NATIVE_INVALID_SCHEMA',
  })
  assert.equal(invoked, 0)
})

test('bounds total input depth, nodes and UTF-16 text before cloning or parsing', () => {
  const deep = fixture()
  let child = deep
  for (let index = 0; index <= FRONTEND_NATIVE_LIMITS.maxDepth; index++) {
    child.extra = {}
    child = child.extra
  }
  const wide = fixture()
  wide.extra = Array(FRONTEND_NATIVE_LIMITS.maxNodes).fill(null)
  const large = fixture()
  large.sources[0].content = 'x'.repeat(FRONTEND_NATIVE_LIMITS.maxTextUnits + 1)
  for (const input of [deep, wide, large]) assert.throws(() => normalizeFrontendNativeReport(input), {
    message: 'FRONTEND_NATIVE_INPUT_LIMIT',
  })
})

test('counts text cumulatively across fields rather than allowing per-field bypass', () => {
  const input = fixture()
  const chunk = 'x'.repeat(Math.floor(FRONTEND_NATIVE_LIMITS.maxTextUnits / 3))
  input.extra = [chunk, chunk, chunk, chunk]
  assert.throws(() => normalizeFrontendNativeReport(input), { message: 'FRONTEND_NATIVE_INPUT_LIMIT' })
})
