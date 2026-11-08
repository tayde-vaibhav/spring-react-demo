import { constants, closeSync, fstatSync, lstatSync, openSync, opendirSync, readSync, realpathSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'

// Preparation only: discovers current inputs, never writes/refreshes an approval
// manifest, runs tools, reads environment variables, or activates a gate.
const sourceRoots = [
  ['backend/springreactdemo/src/main/java', new Set(['.java'])],
  ['frontend/src', new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])],
  ['frontend/e2e', new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])],
]
const fixedControls = [
  'backend/springreactdemo/pom.xml',
  'frontend/package.json', 'frontend/package-lock.json',
  'frontend/eslint.config.js', 'frontend/eslint.security.config.js',
  'frontend/tsconfig.json', 'frontend/tsconfig.e2e.json',
]
const installedPackages = ['eslint', 'eslint-plugin-security', 'typescript-eslint', '@typescript-eslint/parser']
const maxFileBytes = 2 * 1024 * 1024
const maxTotalBytes = 32 * 1024 * 1024
const maxFiles = 5000
// Fixed local-tool budgets, not caller-adjustable acceptance/scan settings.
export const REVIEW_INPUT_LIMITS = Object.freeze({
  maxTraversalDepth: 64,
  maxVisitedEntries: 10_000,
  maxVersionLength: 128,
})
const fail = () => { throw new Error('REVIEW_INPUTS_BLOCKED') }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function safeRelative(file) {
  return typeof file === 'string' && /^[A-Za-z0-9_./@-]+$/u.test(file)
    && !isAbsolute(file) && file.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('.'))
}

function inside(root, file) {
  const name = relative(root, file)
  return name !== '' && name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name)
}

/** Reads only the fixed source/configuration scope above. Root is supplied by
 * a trusted local caller, never HTTP/CLI-controlled production application data.
 * Hashes describe observed inputs, not reviewed baselines or scan provenance.
 * Concurrent hostile filesystem mutation is outside this preparation helper's
 * guarantee; a future runner must bind before/after inventories to a fresh scan.
 */
export function collectReviewInputs(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) fail()
  const root = resolve(repositoryRoot)
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) fail()
  const sources = new Map()
  const controls = new Map()
  const sourceHashes = new Map()
  const controlHashes = new Map()
  const versions = new Map()
  let totalBytes = 0
  let files = 0
  let visitedEntries = 0

  function checkedPath(name) {
    if (!safeRelative(name)) fail()
    const target = join(root, name)
    if (!inside(root, target)) fail()
    // Check each component, including parents, before any file is opened.
    let current = root
    for (const component of name.split('/')) {
      current = join(current, component)
      if (lstatSync(current).isSymbolicLink()) fail()
    }
    if (realpathSync(target) !== target) fail()
    return target
  }

  function read(name, destination, hashes) {
    if (destination.has(name)) fail()
    const target = checkedPath(name)
    const descriptor = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const before = fstatSync(descriptor)
      if (!before.isFile() || before.size > maxFileBytes || ++files > maxFiles) fail()
      totalBytes += before.size
      if (totalBytes > maxTotalBytes) fail()
      const buffer = Buffer.alloc(before.size + 1)
      let length = 0
      while (length < buffer.length) {
        const count = readSync(descriptor, buffer, length, buffer.length - length, length)
        if (count === 0) break
        length += count
      }
      const bytes = buffer.subarray(0, length)
      const after = fstatSync(descriptor)
      if (bytes.length !== before.size || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail()
      const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      if (text.includes('\0') || !text.isWellFormed()) fail()
      destination.set(name, text)
      hashes.set(name, sha256(bytes))
      return text
    } finally {
      closeSync(descriptor)
    }
  }

  function walk(name, extensions, recursive = true, depth = 0) {
    // Each explicit source root starts at depth zero. Reject before opening the
    // next directory, rather than relying on the JavaScript call-stack limit.
    if (depth > REVIEW_INPUT_LIMITS.maxTraversalDepth) fail()
    const directory = checkedPath(name)
    if (!lstatSync(directory).isDirectory()) fail()
    const entries = []
    const handle = opendirSync(directory, { bufferSize: 1 })
    try {
      for (let entry = handle.readSync(); entry !== null; entry = handle.readSync()) {
        // Count every returned entry, including directories, hidden names and
        // ignored extensions, across all walks. Never allocate a full listing.
        if (++visitedEntries > REVIEW_INPUT_LIMITS.maxVisitedEntries) fail()
        entries.push(entry)
      }
    } finally {
      handle.closeSync()
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      // Hidden/local configuration is never opened, regardless of extension.
      if (entry.name.startsWith('.')) continue
      if (entry.isSymbolicLink()) fail()
      const child = `${name}/${entry.name}`
      if (!safeRelative(child)) fail()
      if (entry.isDirectory()) { if (recursive) walk(child, extensions, true, depth + 1) }
      else if (entry.isFile() && extensions.has(extname(entry.name))) read(child, sources, sourceHashes)
      else if (!entry.isFile()) fail()
    }
  }

  for (const [name, extensions] of sourceRoots) walk(name, extensions)
  // ESLint also checks root-level configuration files; do not silently omit
  // them, nor recurse through node_modules/build outputs from this root.
  walk('frontend', new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']), false)
  if (sources.size === 0) fail()
  for (const name of fixedControls) read(name, controls, controlHashes)
  for (const name of installedPackages) {
    const content = read(`frontend/node_modules/${name}/package.json`, controls, controlHashes)
    const manifest = JSON.parse(content)
    if (manifest.name !== name || typeof manifest.version !== 'string'
      || manifest.version.length === 0 || manifest.version.length > REVIEW_INPUT_LIMITS.maxVersionLength
      || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/u.test(manifest.version)) fail()
    versions.set(name, manifest.version)
  }
  return { sources, controls, sourceHashes, controlHashes, versions }
}
