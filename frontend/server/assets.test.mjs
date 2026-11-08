import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadBuild } from './assets.mjs'
import { NONCE_MARKER } from './policy.mjs'

const owned = []
afterEach(() => { for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function build() {
  const directory = mkdtempSync(join(tmpdir(), 'qa-frontend-build-'))
  owned.push(directory)
  mkdirSync(join(directory, 'assets'))
  writeFileSync(join(directory, 'index.html'), `<meta name="app-style-nonce" content="${NONCE_MARKER}">`)
  writeFileSync(join(directory, 'assets', 'app-12345678.js'), 'export {}')
  return directory
}

describe('bounded startup asset indexing (owned temporary fixtures only)', () => {
  it('indexes a generated build, not arbitrary public/source files', () => {
    const directory = build()
    writeFileSync(join(directory, 'private.txt'), 'synthetic fixture')
    const result = loadBuild(directory)
    expect([...result.assets.keys()]).toEqual(['/assets/app-12345678.js'])
    expect(result.assets.get('/assets/app-12345678.js').body.toString()).toBe('export {}')
  })

  it.each(['.hidden', 'app.js.map', 'file.txt'])('rejects forbidden asset type/name: %s', name => {
    const directory = build()
    writeFileSync(join(directory, 'assets', name), 'synthetic fixture')
    expect(() => loadBuild(directory)).toThrow('Invalid frontend asset')
  })

  it('rejects a file symlink instead of following it', () => {
    const directory = build()
    symlinkSync(join(directory, 'index.html'), join(directory, 'assets', 'link.js'))
    expect(() => loadBuild(directory)).toThrow('Invalid frontend build')
  })

  it('rejects a symlink directory before reading its contents', () => {
    const directory = build()
    symlinkSync(join(directory, 'assets'), join(directory, 'assets', 'loop'))
    expect(() => loadBuild(directory)).toThrow('Invalid frontend build')
  })

  it('rejects an invalid/missing production marker', () => {
    const directory = build()
    writeFileSync(join(directory, 'index.html'), '<html></html>')
    expect(() => loadBuild(directory)).toThrow('Invalid frontend HTML build')
  })

  it('rejects oversized HTML', () => {
    const directory = build()
    writeFileSync(join(directory, 'index.html'), Buffer.alloc(256 * 1024 + 1))
    expect(() => loadBuild(directory)).toThrow('Invalid frontend build')
  })

  it('rejects oversized individual assets', () => {
    const directory = build()
    writeFileSync(join(directory, 'assets', 'large.js'), Buffer.alloc(8 * 1024 * 1024 + 1))
    expect(() => loadBuild(directory)).toThrow('Invalid frontend build')
  })

  it('bounds directory nesting', () => {
    const directory = build()
    let parent = join(directory, 'assets')
    for (let i = 0; i < 9; i++) { parent = join(parent, 'nested'); mkdirSync(parent) }
    expect(() => loadBuild(directory)).toThrow('Invalid frontend build')
  })

  it('bounds all visited entries, including empty directories', () => {
    const directory = build()
    for (let i = 0; i < 1024; i++) mkdirSync(join(directory, 'assets', `empty-${i}`))
    expect(() => loadBuild(directory)).toThrow('Invalid frontend build')
  })
})
