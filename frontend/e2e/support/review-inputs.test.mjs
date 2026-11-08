import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dir, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { collectReviewInputs, REVIEW_INPUT_LIMITS } from './review-inputs.mjs'

// Synthetic temporary repositories only. Never read environment/real local config.
const created = []
afterEach(() => { for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true }) })
function put(root, name, text) {
  mkdirSync(dirname(join(root, name)), { recursive: true })
  writeFileSync(join(root, name), text)
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'qa-review-inputs-'))
  created.push(root)
  put(root, 'backend/springreactdemo/src/main/java/fixture/Sample.java', 'class Sample {}\r\n')
  put(root, 'frontend/src/sample.tsx', 'export const View = () => null\n')
  put(root, 'frontend/e2e/sample.mjs', 'export const value = 1\n')
  for (const file of ['backend/springreactdemo/pom.xml', 'frontend/package.json', 'frontend/package-lock.json',
    'frontend/eslint.config.js', 'frontend/eslint.security.config.js', 'frontend/tsconfig.json', 'frontend/tsconfig.e2e.json']) {
    put(root, file, '{}\n')
  }
  for (const name of ['eslint', 'eslint-plugin-security', 'typescript-eslint', '@typescript-eslint/parser']) {
    put(root, `frontend/node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.2.3' }))
  }
  return root
}

describe('fixed-scope review input discovery (inactive)', () => {
  it('discovers every source with exact bytes/hashes and fixed controls, without writing a baseline', () => {
    const root = fixture()
    const result = collectReviewInputs(root)
    expect([...result.sources.keys()]).toEqual([
      'backend/springreactdemo/src/main/java/fixture/Sample.java', 'frontend/src/sample.tsx', 'frontend/e2e/sample.mjs',
      'frontend/eslint.config.js', 'frontend/eslint.security.config.js',
    ])
    expect(result.controls.size).toBe(11)
    expect(result.versions.get('@typescript-eslint/parser')).toBe('1.2.3')
    for (const [name, text] of result.sources) {
      expect(result.sourceHashes.get(name)).toBe(createHash('sha256').update(readFileSync(join(root, name))).digest('hex'))
      expect(Buffer.from(text)).toEqual(readFileSync(join(root, name)))
    }
    expect(result.sources.get('backend/springreactdemo/src/main/java/fixture/Sample.java')).toContain('\r\n')
    expect(collectReviewInputs(root)).toEqual(result)
    expect(result).not.toHaveProperty('accepted')
    expect(result).not.toHaveProperty('exclusionsActive')
  })

  it('discovers a newly added source instead of trusting a caller-provided partial list', () => {
    const root = fixture()
    const first = collectReviewInputs(root)
    put(root, 'frontend/src/new/added.ts', 'export const added = true\n')
    const second = collectReviewInputs(root)
    expect(second.sources.size).toBe(first.sources.size + 1)
    expect(second.sources.has('frontend/src/new/added.ts')).toBe(true)
    expect(first.sources.has('frontend/src/new/added.ts')).toBe(false)
  })

  it('never opens hidden/local config, runtime logs, node_modules source or build output', () => {
    const root = fixture()
    // Broken links would throw if traversal tried to open these forbidden paths.
    for (const name of ['.env', 'frontend/.env', 'frontend/src/.env.ts', 'frontend/e2e/.private/input.ts',
      'logs/backend-qa.log', 'frontend/dist/bundle.js', 'frontend/node_modules/private/input.ts',
      'backend/springreactdemo/target/classes/NotSource.java']) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      symlinkSync(join(root, 'missing-synthetic-input'), join(root, name))
    }
    expect(collectReviewInputs(root).sources.size).toBe(5)
  })

  it.each(['file', 'directory', 'control', 'package'])('rejects a symlink in a %s input path', (kind) => {
    const root = fixture()
    const link = kind === 'file' ? 'frontend/src/linked.ts' : kind === 'directory' ? 'frontend/src/linked'
      : kind === 'control' ? 'frontend/eslint.config.js' : 'frontend/node_modules/eslint/package.json'
    if (kind === 'control' || kind === 'package') rmSync(join(root, link))
    symlinkSync(join(root, kind === 'directory' ? 'frontend/e2e' : 'frontend/src/sample.tsx'), join(root, link))
    expect(() => collectReviewInputs(root)).toThrow('REVIEW_INPUTS_BLOCKED')
  })

  it.each(['missing-root', 'missing-source', 'missing-control', 'wrong-package', 'invalid-utf8', 'oversized', 'unsafe-name']) (
    'fails closed for %s rather than returning a partial inventory', (kind) => {
      const root = fixture()
      if (kind === 'missing-source') rmSync(join(root, 'frontend/src'), { recursive: true })
      if (kind === 'missing-control') rmSync(join(root, 'frontend/package-lock.json'))
      if (kind === 'wrong-package') put(root, 'frontend/node_modules/eslint/package.json', '{"name":"other","version":"1.2.3"}')
      if (kind === 'invalid-utf8') put(root, 'frontend/src/invalid.ts', Buffer.from([0xff]))
      if (kind === 'oversized') put(root, 'frontend/src/large.ts', Buffer.alloc(2 * 1024 * 1024 + 1, 32))
      if (kind === 'unsafe-name') put(root, 'frontend/src/new\nline.ts', 'export {}')
      expect(() => collectReviewInputs(kind === 'missing-root' ? join(root, 'absent') : root)).toThrow()
    },
  )

  it('hashes configuration drift and rejects relative or linked repository roots', () => {
    const root = fixture()
    const first = collectReviewInputs(root)
    put(root, 'frontend/eslint.security.config.js', 'changed synthetic configuration\n')
    expect(collectReviewInputs(root).controlHashes.get('frontend/eslint.security.config.js'))
      .not.toBe(first.controlHashes.get('frontend/eslint.security.config.js'))
    expect(() => collectReviewInputs('.')).toThrow('REVIEW_INPUTS_BLOCKED')
    const parent = mkdtempSync(join(tmpdir(), 'qa-review-inputs-link-'))
    created.push(parent)
    symlinkSync(root, join(parent, 'linked'))
    expect(() => collectReviewInputs(join(parent, 'linked'))).toThrow('REVIEW_INPUTS_BLOCKED')
  })

  it('accepts depth 64, including empty directories, and blocks depth 65 without a partial inventory', () => {
    const root = fixture()
    const before = collectReviewInputs(root)
    const deepest = `frontend/src/${Array(REVIEW_INPUT_LIMITS.maxTraversalDepth).fill('d').join('/')}`
    mkdirSync(join(root, deepest), { recursive: true })
    expect(collectReviewInputs(root)).toEqual(before)
    mkdirSync(join(root, deepest, 'too-deep'))
    expect(() => collectReviewInputs(root)).toThrow('REVIEW_INPUTS_BLOCKED')
    // Exhaustion must not contaminate the next invocation's independent budget.
    rmSync(join(root, deepest, 'too-deep'), { recursive: true })
    expect(collectReviewInputs(root)).toEqual(before)
  })

  it('counts directories and nonmatching files globally at 10,000 and blocks 10,001, closing handles', () => {
    const root = fixture()
    // Unmodified fixture visits 13 entries: Java 2, src 1, e2e 1, frontend root 9.
    const baselineEntries = 13
    const emptyDirectories = 64
    for (let index = 0; index < emptyDirectories; index++) {
      mkdirSync(join(root, 'frontend/e2e', `empty-${index}`))
    }
    for (let index = 0; index < REVIEW_INPUT_LIMITS.maxVisitedEntries - baselineEntries - emptyDirectories; index++) {
      writeFileSync(join(root, 'frontend/e2e', `ignored-${index}.txt`), '')
    }
    const close = vi.spyOn(Dir.prototype, 'closeSync')
    try {
      const first = collectReviewInputs(root)
      expect(first.sources.size).toBe(5)
      // Five original directories plus the 64 empty ones, every handle closed.
      expect(close).toHaveBeenCalledTimes(5 + emptyDirectories)
      close.mockClear()
      writeFileSync(join(root, 'frontend/e2e', 'one-more.txt'), '')
      expect(() => collectReviewInputs(root)).toThrow('REVIEW_INPUTS_BLOCKED')
      expect(close).toHaveBeenCalledTimes(5 + emptyDirectories)
      rmSync(join(root, 'frontend/e2e', 'one-more.txt'))
      expect(collectReviewInputs(root)).toEqual(first)
    } finally {
      close.mockRestore()
    }
  }, 20_000)

  it('closes the current directory handle when incremental enumeration throws', () => {
    const root = fixture()
    const read = vi.spyOn(Dir.prototype, 'readSync').mockImplementationOnce(() => {
      throw new Error('qa-synthetic-directory-read-failure')
    })
    const close = vi.spyOn(Dir.prototype, 'closeSync')
    try {
      expect(() => collectReviewInputs(root)).toThrow('qa-synthetic-directory-read-failure')
      expect(close).toHaveBeenCalledOnce()
    } finally {
      read.mockRestore()
      close.mockRestore()
    }
    expect(collectReviewInputs(root).sources.size).toBe(5)
  })

  it('preserves deterministic ordering despite creation order and nested directories', () => {
    const root = fixture()
    put(root, 'frontend/src/z.ts', 'export const z = 1')
    put(root, 'frontend/src/m/b.ts', 'export const b = 1')
    put(root, 'frontend/src/a.ts', 'export const a = 1')
    const result = collectReviewInputs(root)
    expect([...result.sources.keys()].filter(name => name.startsWith('frontend/src/'))).toEqual([
      'frontend/src/a.ts', 'frontend/src/m/b.ts', 'frontend/src/sample.tsx', 'frontend/src/z.ts',
    ])
    expect(collectReviewInputs(root)).toEqual(result)
  })

  it.each(['0.0.0', '1.2.3', '1.2.3-beta.1', '01.002.0003', '1.2.3--']) (
    'preserves the existing version grammar for %s', version => {
      const root = fixture()
      put(root, 'frontend/node_modules/eslint/package.json', JSON.stringify({ name: 'eslint', version }))
      expect(collectReviewInputs(root).versions.get('eslint')).toBe(version)
    },
  )

  it.each(['eslint', 'eslint-plugin-security', 'typescript-eslint', '@typescript-eslint/parser']) (
    'accepts 128 version characters and rejects 129 for %s', name => {
      const root = fixture()
      const version = `1.2.3-${'a'.repeat(REVIEW_INPUT_LIMITS.maxVersionLength - 6)}`
      expect(version).toHaveLength(128)
      put(root, `frontend/node_modules/${name}/package.json`, JSON.stringify({ name, version }))
      expect(collectReviewInputs(root).versions.get(name)).toBe(version)
      put(root, `frontend/node_modules/${name}/package.json`, JSON.stringify({ name, version: `${version}a` }))
      expect(() => collectReviewInputs(root)).toThrow('REVIEW_INPUTS_BLOCKED')
    },
  )

  it.each(['', '1.2', 'v1.2.3', '1.2.3+build', ' 1.2.3', null, 123, {}, ['1.2.3']]) (
    'rejects an empty, malformed or wrong-type version: %j', version => {
      const root = fixture()
      put(root, 'frontend/node_modules/eslint/package.json', JSON.stringify({ name: 'eslint', version }))
      expect(() => collectReviewInputs(root)).toThrow('REVIEW_INPUTS_BLOCKED')
    },
  )

  it('rejects very long versions within the existing manifest-file byte budget', () => {
    const root = fixture()
    put(root, 'frontend/node_modules/eslint/package.json', JSON.stringify({
      name: 'eslint', version: `1.2.3-${'a'.repeat(100_000)}`,
    }))
    expect(() => collectReviewInputs(root)).toThrow('REVIEW_INPUTS_BLOCKED')
  })
})
