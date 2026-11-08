import { describe, expect, it } from 'vitest'
import { hashReviewText, reconcileReviewCandidate } from './review-guard.mjs'
import type {
  FrontendReviewEntry, JavaReviewEntry, ReviewAnchor, ReviewGuardInput, ReviewRawReport,
} from './review-guard.mjs'

// Synthetic text only. Never import live runners or read application/config data.
const frontendFile = 'fixtures/view.js'
const javaFile = 'fixtures/Sample.java'
const frontendSource = 'const first = /fixed/; const second = /other/;\nconst outside = true;\n'
const javaSource = [
  'package fixture;',
  'final class Sample {',
  '  private Object dependency;',
  '  Sample(Object dependency) { this.dependency = dependency; }',
  '  void inspect() {',
  '    readCookie();',
  '    readCookie();',
  '  }',
  '  void outside() {}',
  '}',
  '',
].join('\n')

function anchor(source: string, snippet: string): ReviewAnchor {
  const start = source.indexOf(snippet)
  if (start < 0) throw new Error('Missing synthetic snippet')
  const prefix = source.slice(0, start).split('\n')
  const lines = snippet.split('\n')
  const startColumn = (prefix.at(-1)?.length ?? 0) + 1
  return {
    startLine: prefix.length, startColumn,
    endLine: prefix.length + lines.length - 1,
    endColumn: (lines.length === 1 ? startColumn : 1) + (lines.at(-1)?.length ?? 0),
    sha256: hashReviewText(snippet),
  }
}

function pins(inputs: Map<string, string>) {
  return new Map([...inputs].map(([file, source]) => [file, hashReviewText(source)]))
}

function fixture(): ReviewGuardInput {
  const sources = new Map([
    [frontendFile, frontendSource], [javaFile, javaSource],
    ['fixtures/unreviewed.js', 'export const unreviewed = true;\n'],
  ])
  const controls = new Map([
    ['controls/analyzer.json', 'synthetic analyzer configuration\n'],
    ['controls/parser.json', 'synthetic parser configuration\n'],
    ['controls/lock.json', 'synthetic dependency versions\n'],
  ])
  const frontendEntries: FrontendReviewEntry[] = ['/fixed/', '/other/'].map((snippet, index) => {
    const { sha256, ...span } = anchor(frontendSource, snippet)
    return {
      id: `F-${index + 1}`, toolId: 'frontend-native', kind: 'frontend', file: frontendFile,
      expectedCount: 1, classification: 'false-positive', rationale: 'Synthetic literal fixture',
      evidence: ['synthetic offline assertion'],
      anchor: anchor(frontendSource, frontendSource.split('\n').at(0) ?? ''),
      ruleId: 'security/synthetic-rule', span, snippetSha256: sha256,
    }
  })
  const javaEntries: JavaReviewEntry[] = [{
    id: 'J-field', toolId: 'java-native', kind: 'java', file: javaFile,
    expectedCount: 1, classification: 'false-positive', rationale: 'Synthetic collaborator',
    evidence: ['synthetic field assertion'],
    anchor: anchor(javaSource, '  Sample(Object dependency) { this.dependency = dependency; }'),
    pattern: 'SYNTHETIC_ALIAS', className: 'fixture.Sample', member: '<init>',
    signature: { parameters: ['java.lang.Object'], returns: 'void' }, field: 'dependency',
    locations: [{ startLine: 4, endLine: 4, count: 1 }],
  }, {
    id: 'J-cookie', toolId: 'java-native', kind: 'java', file: javaFile,
    expectedCount: 2, classification: 'design-choice', rationale: 'Synthetic paired reads',
    evidence: ['synthetic pair assertion'],
    anchor: anchor(javaSource, '  void inspect() {\n    readCookie();\n    readCookie();\n  }'),
    pattern: 'SYNTHETIC_COOKIE', className: 'fixture.Sample', member: 'inspect',
    signature: { parameters: [], returns: 'void' }, field: null,
    locations: [{ startLine: 6, endLine: 6, count: 1 }, { startLine: 7, endLine: 7, count: 1 }],
  }]
  const reportBase = {
    reportPresent: true, complete: true, unfiltered: true, healthy: true,
    exitCode: 1, analysisErrors: [], missingClasses: [],
  }
  return {
    candidate: {
      schemaVersion: 1, sources: pins(sources), controls: pins(controls),
      tools: new Map([
        ['frontend-native', { kind: 'frontend', version: 'synthetic-frontend-1' }],
        ['java-native', { kind: 'java', version: 'synthetic-java-1' }],
      ]),
      entries: [...frontendEntries, ...javaEntries],
    },
    sources, controls,
    reports: [{
      ...reportBase, toolId: 'frontend-native', version: 'synthetic-frontend-1',
      findings: frontendEntries.map(({ file, ruleId, span }) => ({
        kind: 'frontend', file, ruleId, span: { ...span }, severity: 'warning',
      })),
    }, {
      ...reportBase, toolId: 'java-native', version: 'synthetic-java-1',
      findings: javaEntries.flatMap(({ file, pattern, className, member, signature, field, locations }) =>
        locations.map(({ startLine, endLine }) => ({
          kind: 'java', file, pattern, className, member, signature: structuredClone(signature), field,
          startLine, endLine, severity: 'warning',
        }))),
    }],
  }
}

function frontendEntry(input: ReviewGuardInput) {
  const found = input.candidate.entries.find((item) => item.kind === 'frontend')
  if (!found || found.kind !== 'frontend') throw new Error('Missing synthetic frontend entry')
  return found
}

function javaEntry(input: ReviewGuardInput) {
  const found = input.candidate.entries.find((item) => item.id === 'J-field')
  if (!found || found.kind !== 'java') throw new Error('Missing synthetic Java entry')
  return found
}

function rawReport(input: ReviewGuardInput, kind: 'java' | 'frontend'): ReviewRawReport {
  const found = input.reports.find((item) => item.toolId === `${kind}-native`)
  if (!found) throw new Error('Missing synthetic report')
  return found
}

function fails(input: ReviewGuardInput, issue: string) {
  const result = reconcileReviewCandidate(input)
  expect(result.candidateReconciled).toBe(false)
  expect(result.exclusionsActive).toBe(false)
  expect(result.issues).toContain(issue)
  expect(result.rawReports).toEqual(input.reports)
  return result
}

describe('review candidate audit (pure, exclusions always inactive)', () => {
  it('reconciles exact per-entry counts while retaining every finding and raw failed-gate exit', () => {
    const input = fixture()
    const original = structuredClone(input)
    const result = reconcileReviewCandidate(input)
    expect(result).toEqual({
      candidateReconciled: true, exclusionsActive: false, issues: [],
      matches: new Map([['F-1', 1], ['F-2', 1], ['J-field', 1], ['J-cookie', 2]]),
      rawExitCodes: new Map([['frontend-native', 1], ['java-native', 1]]), rawReports: input.reports,
    })
    expect(input).toEqual(original)
    expect(reconcileReviewCandidate(input)).toEqual(result)
    result.rawReports.length = 0
    result.matches.clear()
    expect(input).toEqual(original)
    expect(reconcileReviewCandidate(input).candidateReconciled).toBe(true)
  })

  it('uses exact UTF-8 SHA-256 without newline normalization', () => {
    expect(hashReviewText('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashReviewText('a\n')).not.toBe(hashReviewText('a\r\n'))
    expect(() => hashReviewText('\ud800')).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it('does not depend on report, entry or inventory insertion order', () => {
    const input = fixture()
    input.reports.reverse()
    input.candidate.entries.reverse()
    input.sources = new Map([...input.sources].reverse())
    input.controls = new Map([...input.controls].reverse())
    expect(reconcileReviewCandidate(input).candidateReconciled).toBe(true)
  })

  it('handles multiline statement anchors, CRLF and UTF-16 diagnostic columns exactly', () => {
    const source = '// synthetic\r\nconst marker = "😀"; const first =\r\n  /fixed/;\r\n'
    const span = { startLine: 3, startColumn: 3, endLine: 3, endColumn: 10 }
    const statement = 'const marker = "😀"; const first =\r\n  /fixed/;'
    const entry: FrontendReviewEntry = {
      id: 'F-multiline', toolId: 'frontend-native', kind: 'frontend', file: frontendFile,
      expectedCount: 1, classification: 'false-positive', rationale: 'Synthetic multiline fixture',
      evidence: ['synthetic location assertion'], ruleId: 'security/synthetic-rule', span,
      snippetSha256: hashReviewText('/fixed/'),
      anchor: { startLine: 2, startColumn: 1, endLine: 3, endColumn: 11, sha256: hashReviewText(statement) },
    }
    const input = fixture()
    input.sources = new Map([[frontendFile, source]])
    input.candidate.sources = pins(input.sources)
    input.candidate.entries = [entry]
    input.candidate.tools.delete('java-native')
    const report = rawReport(input, 'frontend')
    report.findings = [{ kind: 'frontend', file: frontendFile, ruleId: entry.ruleId, span: { ...span }, severity: 'warning' }]
    input.reports = [report]
    expect(reconcileReviewCandidate(input).candidateReconciled).toBe(true)
    // The emoji consumes two UTF-16 columns; an anchor ending after it must
    // preserve the exact code units even though its UTF-8 digest uses four bytes.
    entry.anchor = { startLine: 2, startColumn: 1, endLine: 2, endColumn: 21,
      sha256: hashReviewText('const marker = "😀";') }
    expect(fails(input, 'INVALID_STATEMENT_ANCHOR').issues).not.toContain('ANCHOR_DRIFT')
    entry.anchor.endColumn = 20
    fails(input, 'ANCHOR_DRIFT')
  })

  it.each([
    [frontendFile, frontendSource.replace('/fixed/', '/other/')],
    [frontendFile, frontendSource.replace('outside = true', 'outside = false')],
    [javaFile, javaSource.replace('this.dependency = dependency', 'this.dependency = null')],
    [javaFile, javaSource.replace('void outside() {}', 'void outside() { readCookie(); }')],
    [javaFile, javaSource.replace('private Object dependency;', 'private Object dependency;\n  private Object newField;')],
    ['fixtures/unreviewed.js', 'export const unreviewed = false;\n'],
  ])('rejects full source drift inside or outside candidate scopes: %s', (file, mutation) => {
    const input = fixture()
    input.sources.set(file, mutation)
    fails(input, 'SOURCE_DRIFT')
  })

  it('checks snippet and enclosing statement hashes independently of full-file hashes', () => {
    const input = fixture()
    frontendEntry(input).snippetSha256 = hashReviewText('different expression')
    fails(input, 'ANCHOR_DRIFT')
    frontendEntry(input).snippetSha256 = anchor(frontendSource, '/fixed/').sha256
    frontendEntry(input).anchor.sha256 = hashReviewText('different enclosing statement')
    fails(input, 'ANCHOR_DRIFT')
  })

  it('requires diagnostic containment within its statement anchor', () => {
    const input = fixture()
    frontendEntry(input).anchor = anchor(frontendSource, '/other/')
    fails(input, 'INVALID_STATEMENT_ANCHOR')
  })

  it.each(['change', 'missing', 'extra'])('rejects %s control inputs', (mode) => {
    const input = fixture()
    if (mode === 'change') input.controls.set('controls/parser.json', 'changed parser\n')
    if (mode === 'missing') input.controls.delete('controls/lock.json')
    if (mode === 'extra') input.controls.set('controls/new.json', 'new configuration\n')
    fails(input, 'CONTROL_DRIFT')
  })

  it.each(['missing', 'extra'])('rejects %s source inventory keys', (mode) => {
    const input = fixture()
    if (mode === 'missing') input.sources.delete(javaFile)
    else input.sources.set('fixtures/new.js', 'new source\n')
    fails(input, 'SOURCE_DRIFT')
  })

  it('rejects duplicate IDs, identical scopes, and partially overlapping frontend scopes', () => {
    const input = fixture()
    const copy = structuredClone(frontendEntry(input))
    input.candidate.entries.push(copy)
    const result = fails(input, 'DUPLICATE_ENTRY_ID')
    expect(result.issues).toContain('OVERLAPPING_ENTRIES')
    expect(result.issues).toContain('AMBIGUOUS_DIAGNOSTIC')
    copy.id = 'F-overlap'
    copy.span.startColumn += 1
    fails(input, 'OVERLAPPING_ENTRIES')
  })

  it('rejects Java scope duplication even when the anchors or locations differ', () => {
    const input = fixture()
    input.candidate.entries.push({ ...structuredClone(javaEntry(input)), id: 'J-overlap' })
    fails(input, 'OVERLAPPING_ENTRIES')
  })

  it('rejects zero, excess and unused candidate entries', () => {
    const input = fixture()
    const report = rawReport(input, 'frontend')
    const saved = structuredClone(report.findings)
    report.findings = []
    fails(input, 'MATCH_COUNT_MISMATCH')
    report.findings = [...saved, ...saved]
    fails(input, 'MATCH_COUNT_MISMATCH')
    report.findings = saved
    input.candidate.entries.push({ ...structuredClone(javaEntry(input)), id: 'J-unused', member: 'newMember' })
    fails(input, 'MATCH_COUNT_MISMATCH')
  })

  it.each(['rule', 'file', 'start', 'end', 'new-same-line'])('rejects unmatched frontend %s', (change) => {
    const input = fixture()
    const report = rawReport(input, 'frontend')
    const finding = report.findings.at(0)
    if (!finding || finding.kind !== 'frontend') throw new Error('Missing fixture')
    const added = structuredClone(finding)
    if (change === 'rule') added.ruleId = 'security/new-rule'
    if (change === 'file') added.file = 'fixtures/unreviewed.js'
    if (change === 'start' || change === 'new-same-line') added.span.startColumn += 1
    if (change === 'end') added.span.endColumn += 1
    report.findings.push(added)
    fails(input, 'UNMATCHED_DIAGNOSTIC')
  })

  it.each(['pattern', 'class', 'member', 'parameters', 'returns', 'field', 'no-field', 'file'])(
    'rejects a new Java %s outside the exact identity', (change) => {
      const input = fixture()
      const report = rawReport(input, 'java')
      const finding = report.findings.at(0)
      if (!finding || finding.kind !== 'java') throw new Error('Missing fixture')
      const added = structuredClone(finding)
      if (change === 'pattern') added.pattern = 'NEW_PATTERN'
      if (change === 'class') added.className = 'fixture.Other'
      if (change === 'member') { added.member = 'outside'; added.signature.returns = 'void' }
      if (change === 'parameters') added.signature.parameters = ['java.lang.String']
      if (change === 'returns') { added.member = 'inspect'; added.signature.returns = 'java.lang.String' }
      if (change === 'field') added.field = 'newField'
      if (change === 'no-field') added.field = null
      if (change === 'file') added.file = 'fixtures/Other.java'
      report.findings.push(added)
      fails(input, 'UNMATCHED_DIAGNOSTIC')
    })

  it('treats null Java field as exact absence, never as a field wildcard', () => {
    const input = fixture()
    const report = rawReport(input, 'java')
    const finding = report.findings.find((item) => item.kind === 'java' && item.field === null)
    if (!finding || finding.kind !== 'java') throw new Error('Missing fixture')
    finding.field = 'newField'
    fails(input, 'UNMATCHED_DIAGNOSTIC')
  })

  it('rejects a replacement Java location or shifted per-location multiplicity despite identical totals', () => {
    const input = fixture()
    const report = rawReport(input, 'java')
    const finding = report.findings.at(-1)
    if (!finding || finding.kind !== 'java') throw new Error('Missing fixture')
    finding.startLine = 6
    finding.endLine = 6
    const result = fails(input, 'JAVA_LOCATION_COUNT_MISMATCH')
    expect(result.matches.get('J-cookie')).toBe(2)
    finding.startLine = 9
    finding.endLine = 9
    fails(input, 'UNEXPECTED_JAVA_LOCATION')
  })

  it.each(['reportPresent', 'complete', 'unfiltered', 'healthy'] as const)('rejects false %s', (flag) => {
    const input = fixture()
    const report = rawReport(input, 'java')
    // Avoid dynamic object reads/writes in the review tooling itself.
    if (flag === 'reportPresent') report.reportPresent = false
    if (flag === 'complete') report.complete = false
    if (flag === 'unfiltered') report.unfiltered = false
    if (flag === 'healthy') report.healthy = false
    fails(input, 'UNHEALTHY_REPORT')
  })

  it.each([null, -1, 2, 124])('rejects tool failure/timeout exit %s', (exitCode) => {
    const input = fixture()
    rawReport(input, 'java').exitCode = exitCode
    fails(input, 'UNHEALTHY_REPORT')
  })

  it.each(['java', 'frontend'] as const)('rejects %s raw exit zero with findings and retains both', (kind) => {
    const input = fixture()
    rawReport(input, kind).exitCode = 0
    const result = fails(input, 'RAW_EXIT_MISMATCH')
    expect(result.rawExitCodes.get(`${kind}-native`)).toBe(0)
    expect(result.rawReports.find((raw) => raw.toolId === `${kind}-native`)?.findings.length).toBeGreaterThan(0)
  })

  it.each(['java', 'frontend'] as const)('rejects %s raw exit one without findings and retains both', (kind) => {
    const input = fixture()
    rawReport(input, kind).findings = []
    const result = fails(input, 'RAW_EXIT_MISMATCH')
    expect(result.rawExitCodes.get(`${kind}-native`)).toBe(1)
    expect(result.rawReports.find((raw) => raw.toolId === `${kind}-native`)?.findings).toEqual([])
  })

  it('allows a healthy empty exit-zero report alongside a reconciled finding-bearing tool', () => {
    const input = fixture()
    input.candidate.entries = input.candidate.entries.filter((item) => item.kind === 'java')
    const report = rawReport(input, 'frontend')
    report.findings = []
    report.exitCode = 0
    const result = reconcileReviewCandidate(input)
    expect(result.candidateReconciled).toBe(true)
    expect(result.exclusionsActive).toBe(false)
    expect(result.rawReports).toEqual(input.reports)
    expect(result.rawExitCodes.get('frontend-native')).toBe(0)
  })

  it('rejects missing, duplicate or version-drifted reports', () => {
    const input = fixture()
    const original = structuredClone(input.reports)
    input.reports = []
    fails(input, 'MISSING_REPORT')
    input.reports = [...original, ...original]
    fails(input, 'DUPLICATE_REPORT')
    input.reports = original
    rawReport(input, 'java').version = 'new-java-version'
    fails(input, 'TOOL_VERSION_DRIFT')
  })

  it('rejects analysis errors, missing classes and even otherwise matched diagnostic errors', () => {
    const input = fixture()
    rawReport(input, 'java').analysisErrors = ['synthetic analysis failure']
    fails(input, 'ANALYSIS_ERRORS')
    rawReport(input, 'java').missingClasses = ['fixture.Missing']
    fails(input, 'MISSING_CLASSES')
    const finding = rawReport(input, 'frontend').findings.at(0)
    if (!finding) throw new Error('Missing fixture')
    finding.severity = 'error'
    fails(input, 'DIAGNOSTIC_ERROR')
  })
})

describe('strict review schema (no broad selectors or activation switch)', () => {
  it.each([null, undefined, {}, [], 'native XML', { candidate: {} }])('rejects malformed input %s', (input) => {
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it.each(['root', 'candidate', 'entry', 'anchor', 'span', 'signature', 'location', 'tool', 'report', 'finding'])(
    'rejects unknown keys at %s', (level) => {
      const input = fixture()
      const field = javaEntry(input)
      const frontend = frontendEntry(input)
      const records = new Map<string, object>([
        ['root', input], ['candidate', input.candidate], ['entry', field], ['anchor', field.anchor],
        ['span', frontend.span], ['signature', field.signature], ['location', field.locations.at(0) ?? {}],
        ['tool', input.candidate.tools.get('java-native') ?? {}], ['report', rawReport(input, 'java')],
        ['finding', rawReport(input, 'java').findings.at(0) ?? {}],
      ])
      Object.defineProperty(records.get(level), 'activate', { value: true, enumerable: true })
      expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    })

  it.each(['field', 'signature', 'anchor', 'locations'])('rejects missing required Java %s', (key) => {
    const input = fixture()
    Reflect.deleteProperty(javaEntry(input), key)
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it.each(['ruleId', 'span', 'snippetSha256'])('rejects missing required frontend %s', (key) => {
    const input = fixture()
    Reflect.deleteProperty(frontendEntry(input), key)
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it.each(['*', '~fixture.*', 'fixture.*', 'fixture.Sample|fixture.Other'])('rejects broad Java class %s', (scope) => {
    const input = fixture()
    javaEntry(input).className = scope
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it.each(['../fixtures/view.js', '/fixtures/view.js', 'fixtures/*.js', 'fixtures/./view.js', 'fixtures\\view.js'])(
    'rejects non-exact path %s', (file) => {
      const input = fixture()
      frontendEntry(input).file = file
      expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    })

  it('rejects wildcards in patterns, members, fields, signatures and rules', () => {
    const mutations: ((input: ReviewGuardInput) => void)[] = [
      (input) => { javaEntry(input).pattern = '*' },
      (input) => { javaEntry(input).member = '*' },
      (input) => { javaEntry(input).field = '*' },
      (input) => { javaEntry(input).signature.parameters = ['java.lang.*'] },
      (input) => { javaEntry(input).signature.returns = '*' },
      (input) => { frontendEntry(input).ruleId = 'security/*' },
    ]
    for (const mutate of mutations) {
      const input = fixture()
      mutate(input)
      expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    }
  })

  it('rejects malformed hashes, unsupported schema, missing controls and non-Map inventories', () => {
    const input = fixture()
    expect(() => reconcileReviewCandidate({ ...input, candidate: { ...input.candidate, schemaVersion: 2 } }))
      .toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    expect(() => reconcileReviewCandidate({ ...input, controls: {} })).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    expect(() => reconcileReviewCandidate({ ...input, controls: new Map() })).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    input.candidate.sources.set(frontendFile, 'bad-hash')
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it('rejects inherited/accessor fields, sparse arrays and properties attached to Maps', () => {
    const input = fixture()
    const inherited = Object.create(input.candidate)
    expect(() => reconcileReviewCandidate({ ...input, candidate: inherited })).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    let getterCalls = 0
    Object.defineProperty(frontendEntry(input), 'kind', { get() { getterCalls += 1; return 'frontend' } })
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    expect(getterCalls).toBe(0)
    const sparse = fixture()
    Reflect.deleteProperty(sparse.candidate.entries, '0')
    expect(() => reconcileReviewCandidate(sparse)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    const attached = fixture()
    Object.defineProperty(attached.candidate.sources, 'activate', { value: true })
    expect(() => reconcileReviewCandidate(attached)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid expected count %s', (count) => {
    const input = fixture()
    javaEntry(input).expectedCount = count
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it('rejects frontend counts above one and Java count/site mismatches', () => {
    const input = fixture()
    frontendEntry(input).expectedCount = 2
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    frontendEntry(input).expectedCount = 1
    javaEntry(input).expectedCount = 2
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })

  it('rejects invalid, empty and out-of-source spans without matching by line alone', () => {
    const input = fixture()
    const span = frontendEntry(input).span
    span.startColumn = 0
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    span.startColumn = span.endColumn
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    span.endColumn += 1
    span.startLine = 100
    span.endLine = 100
    fails(input, 'ANCHOR_DRIFT')
  })

  it('rejects null-rule/fatal/unlocated diagnostics rather than dropping them', () => {
    const input = fixture()
    const report = rawReport(input, 'frontend')
    report.findings.push({ kind: 'frontend', file: frontendFile, severity: 'error', ruleId: 'parser/fatal',
      span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } })
    fails(input, 'UNMATCHED_DIAGNOSTIC')
    Reflect.deleteProperty(report.findings.at(-1) ?? {}, 'span')
    expect(() => reconcileReviewCandidate(input)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    const nullRule = fixture()
    Object.defineProperty(rawReport(nullRule, 'frontend').findings.at(0), 'ruleId', { value: null })
    expect(() => reconcileReviewCandidate(nullRule)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
    const unlocatedJava = fixture()
    Reflect.deleteProperty(rawReport(unlocatedJava, 'java').findings.at(0) ?? {}, 'startLine')
    expect(() => reconcileReviewCandidate(unlocatedJava)).toThrow('REVIEW_GUARD_INVALID_SCHEMA')
  })
})
